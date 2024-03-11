import { config as dotenvConfig } from "dotenv";
dotenvConfig();

import { AxiosError, AxiosResponse } from "axios";

import Stats, { StatsRunData } from "../utils/stats.class.js";
import {
  ensureOutputPath,
  writeOutputFile,
  makeOutputPath,
  readDirectory,
} from "../utils/fs.js";
import { runDateUtc } from "../utils/date.js";
import { ApiHandler, ApiPrimaryEndpoint, DailyData } from "../utils/types.js";
import { getApiData, MockAxiosResponse } from "../utils/data.js";
import Queue, { QueueEntry } from "../utils/queue.class.js";

////
/// Types
//

interface RunEntry extends Omit<QueueEntry, "runAfter" | "historic"> {
  historic: boolean;
}

////
/// Startup
//

const apisSupported = readDirectory("src/apis");
const apiName = process.argv[2];

if (!apiName) {
  console.log(`❌ No API name included`);
  process.exit();
}

if (!apisSupported.includes(apiName)) {
  console.log(`❌ Unsupported API "${apiName}"`);
  process.exit();
}

const runStats = new Stats(apiName);
const runDate = runDateUtc();

const apiHandler = (await import(`../apis/${apiName}/index.js`)) as ApiHandler;

// TODO: Should this be the shape of the endpoint handler collection?
const handlerDict: { [key: string]: ApiPrimaryEndpoint } = {};
const handledEndpoints: string[] = [];
for (const endpointHandler of apiHandler.endpointsPrimary) {
  handledEndpoints.push(endpointHandler.getEndpoint());
  handlerDict[endpointHandler.getEndpoint()] = endpointHandler;
}

////
/// Queue management
//

// TODO: Consider whether this logic should go in the queue class
const queueInstance = new Queue(apiName);
const runQueue: RunEntry[] = queueInstance
  .getQueue()
  .filter((entry) => {
    // If an endpoint was removed from the handler, remove from the queue
    if (!handledEndpoints.includes(entry.endpoint)) {
      console.log(`❓ Removing unhandled endpoint ${entry.endpoint} from queue`);
      return false;
    }

    // If we're too early for an entry to run, add back as-is
    if (entry.runAfter > runDate.seconds) {
      const waitMinutes = Math.ceil((entry.runAfter - runDate.seconds) / 60);
      console.log(`🤖 Skipping ${entry.endpoint} for ${waitMinutes} seconds`);
      queueInstance.addEntry(entry);
      return false;
    }

    return true;
  })
  .map((entry) => {
    const entryHasParams = Queue.entryHasParams(entry);
    const newEntry: RunEntry = {
      endpoint: entry.endpoint,
      params: entryHasParams ? entry.params : undefined,
      historic: !entryHasParams ? false : !!entry.historic,
    };
    return newEntry;
  });

for (const handledEndpoint of handledEndpoints) {
  if (!queueInstance.hasStandardEntryFor(handledEndpoint)) {
    console.log(`🤖 Adding STANDARD queue entry for ${handledEndpoint}`);
    queueInstance.addEntry({
      endpoint: handledEndpoint,
      runAfter: handlerDict[handledEndpoint].getDelay() + runDate.seconds,
    });
    runQueue.push({ endpoint: handledEndpoint, historic: false });
  }
}

if (!runQueue.length) {
  console.log(`🤖 Empty run queue ... stopping`);
  runStats.shutdown();
  process.exit();
}

////
/// Endpoints: Primary
//

const perEndpointData: { [key: string]: [] } = {};

for (const runEntry of runQueue) {
  const endpointName = runEntry.endpoint;
  const endpointHandler = Object.assign({}, handlerDict[endpointName]);

  if (typeof runEntry.params === "object") {
    endpointHandler.getParams = () => runEntry.params as object;
  }

  const runMetadata: StatsRunData = {
    dateTime: runDate.dateTime,
    filesWritten: 0,
    filesSkipped: 0,
  };

  let apiResponse: AxiosResponse | MockAxiosResponse;
  try {
    apiResponse = await getApiData(apiHandler, endpointHandler);
  } catch (error) {
    runStats.addError(endpointName, {
      type: "http",
      message: error instanceof Error ? error.message : "Unknown error for getApiData",
      data: (error as AxiosError)["response"]!["data"] || {},
    });
    continue;
  }

  const savePath = [apiName, endpointHandler.getDirName()];
  ensureOutputPath(savePath);

  const apiResponseData =
    typeof endpointHandler.transformResponseData === "function"
      ? endpointHandler.transformResponseData(apiResponse)
      : apiResponse.data;

  // Store all the entity data for the endpoint for secondary endpoints
  perEndpointData[endpointName] = apiResponseData;

  if (typeof endpointHandler.parseDayFromEntity === "function") {
    // Need to parse returned to days if not a snapshot
    const dailyData: DailyData = {};
    const entities = apiResponseData;

    if (!Array.isArray(entities)) {
      runStats.addError(endpointName, {
        type: "parsing_response",
        message: `Cannot iterate through data from ${endpointName}.`,
      });
      continue;
    }

    try {
      for (const entity of entities) {
        entity.day = endpointHandler.parseDayFromEntity(entity);
        if (!dailyData[entity.day]) {
          dailyData[entity.day] = [];
        }
        dailyData[entity.day].push(entity);
      }
    } catch (error) {
      runStats.addError(endpointName, {
        type: "http",
        message: `Cannot parse data from ${endpointName} into days: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        data: (error as Record<string, unknown>)["data"] || {},
      });
      continue;
    }

    runMetadata.total = entities.length;
    runMetadata.days = Object.keys(dailyData).length;

    for (const day in dailyData) {
      const outputPath = makeOutputPath(savePath, day, runDate.fileName);
      writeOutputFile(outputPath, dailyData[day])
        ? runMetadata.filesWritten++
        : runMetadata.filesSkipped++;
    }
  } else {
    // Snapshot data, not time-bound
    runMetadata.total = 1;
    const outputPath = makeOutputPath(savePath, null, runDate.fileName);
    writeOutputFile(outputPath, apiResponseData)
      ? runMetadata.filesWritten++
      : runMetadata.filesSkipped++;
  }

  runStats.addRun(endpointName, runMetadata);

  if (
    runEntry.historic &&
    runEntry.params &&
    typeof endpointHandler.getNextParams === "function"
  ) {
    const newQueueEntry: QueueEntry = {
      endpoint: endpointName,
      historic: true,
      runAfter: runDate.seconds,
    };

    if (Object.keys(apiResponseData).length) {
      // Potentially more historic entries to get if data was returned
      newQueueEntry.params = endpointHandler.getNextParams(runEntry.params);
      newQueueEntry.runAfter =
        runDate.seconds +
        (typeof endpointHandler.getHistoricDelay === "function"
          ? endpointHandler.getHistoricDelay()
          : endpointHandler.getDelay());
    } else {
      // Schedule next historic run for this endpoint
      newQueueEntry.runAfter = runDate.seconds + apiHandler.getHistoricDelay();
      newQueueEntry.params =
        typeof endpointHandler.getHistoricParams === "function"
          ? endpointHandler.getHistoricParams()
          : typeof endpointHandler.getParams === "function"
            ? endpointHandler.getParams()
            : {};
    }
    console.log(`🤖 Adding HISTORIC queue entry for ${endpointName}`);
    queueInstance.addEntry(newQueueEntry);
  }
} // END endpointsPrimary

////
/// Endpoints: Secondary
//
for (const endpointHandler of apiHandler.endpointsSecondary) {
  const entities = perEndpointData[endpointHandler.getPrimary()] || [];
  const savePath = [apiName, endpointHandler.getDirName()];
  ensureOutputPath(savePath);

  for (const entity of entities) {
    const runMetadata: StatsRunData = {
      dateTime: runDate.dateTime,
      filesWritten: 0,
      filesSkipped: 0,
    };

    let apiResponse;
    try {
      apiResponse = await getApiData(apiHandler, endpointHandler, entity);
    } catch (error: any) {
      runStats.addError(endpointHandler.getEndpoint(entity), {
        type: "http",
        message: error.message,
        data: error.data || {},
      });
      continue;
    }

    const apiResponseData =
      typeof endpointHandler.transformResponseData === "function"
        ? endpointHandler.transformResponseData(apiResponse)
        : apiResponse.data;

    runMetadata.total = 1;
    const outputPath = makeOutputPath(
      savePath,
      endpointHandler.getIdentifier(entity),
      runDate.fileName
    );
    writeOutputFile(outputPath, apiResponseData)
      ? runMetadata.filesWritten++
      : runMetadata.filesSkipped++;

    runStats.addRun(endpointHandler.getEndpoint(entity), runMetadata);
  }
} // END endpointsSecondary

runStats.shutdown();
