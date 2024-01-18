require("dotenv").config();

const axios = require("axios");
const { readdirSync, readFileSync } = require("fs");
const path = require("path");

const Logger = require("./src/utils/logger");
const {
  ensureOutputPath,
  writeOutputFile,
} = require("./src/utils/fs");
const { fileNameDateTime } = require("./src/utils/date");

const apisSupported = readdirSync("src/apis");

const apiName = process.argv[2];
const runEndpoint = process.argv[3];

if (!apiName) {
  console.log(`❌ No API name included`);
  process.exit();
}

if (!apisSupported.includes(apiName)) {
  console.log(`❌ Unsupported API "${apiName}"`);
  process.exit();
}

const apiHandler = require(`./src/apis/${apiName}/index.js`);
const runLogger = new Logger();

(async () => {
  const axiosBaseConfig = {
    baseURL: apiHandler.getApiBaseUrl(),
    headers: await apiHandler.getApiAuthHeaders(),
  };

  for (const endpoint in apiHandler.endpoints) {
    if (runEndpoint && runEndpoint !== endpoint) {
      continue;
    }

    const runDateTime = fileNameDateTime();
    const axiosConfig = {
      ...axiosBaseConfig,
      url: endpoint,
      method: apiHandler.endpoints[endpoint].method || "get",
      params: apiHandler.endpoints[endpoint].getParams(),
    };

    let apiResponse;
    try {
      apiResponse = await axios(axiosConfig);
    } catch (error) {
      runLogger.addError(apiName, endpoint, {
        type: "http",
        message: error.message,
        data: error.data || {},
      });
      continue;
    }

    let handlerOutput;
    let runMetadata;
    try {
      [handlerOutput, runMetadata] =
        apiHandler.endpoints[endpoint].successHandler(apiResponse);
    } catch (error) {
      runLogger.addError(apiName, endpoint, {
        type: "handler",
        message: error.message,
      });
      continue;
    }

    const apiPath = apiHandler.endpoints[endpoint].getDirName();
    ensureOutputPath(apiPath);

    runMetadata.filesWritten = 0;
    runMetadata.filesSkipped = 0;

    if (typeof runMetadata.days === "undefined") {
      // Point-in-time snapshot
      const fileName = runDateTime + ".json";
      writeOutputFile(path.join(apiPath, fileName), handlerOutput, {
        checkDuplicate: true,
      }) ? runMetadata.filesWritten++ : runMetadata.filesSkipped++;
    } else if (runMetadata.days > 0) {
      // Per-day output
      for (const day in handlerOutput) {
        const fileName = day + "--run-" + runDateTime + ".json";
        writeOutputFile(path.join(apiPath, fileName), handlerOutput[day], {
          checkDuplicate: true,
        }) ? runMetadata.filesWritten++ : runMetadata.filesSkipped++;
      }
    }

    runMetadata.dateTime = runDateTime;
    runLogger.addRun(apiName, endpoint, runMetadata);
  }

  runLogger.shutdown();
})();