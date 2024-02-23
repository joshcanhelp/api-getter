import { existsSync, readFileSync, readdirSync } from "fs";
import { parse } from "csv-parse/sync";

import { fileNameDateTime } from "../utils/date.js";
import { makeOutputPath, writeOutputFile, ensureOutputPath } from "../utils/fs.js";
import Stats, { StatsRunData } from "../utils/stats.js";
import { DailyData } from "../utils/types.js";

////
/// Helpers
//

const importsSupported = readdirSync("src/imports");

const importName = process.argv[2];
const importType = process.argv[3] || "";
const importFile = process.argv[4];

if (!importName) {
  console.log(`❌ No import name included`);
  process.exit();
}

if (!importsSupported.includes(importName)) {
  console.log(`❌ Unsupported import "${importName}"`);
  process.exit();
}

const importHandler = await import(`../imports/${importName}/index.js`);
const allImportTypes = Object.keys(importHandler.importTypes);

if (!importType && !allImportTypes.includes(importType)) {
  console.log(`❌ Unsupported import type "${importType}" for import "${importName}"`);
  process.exit();
}

if (!importFile || !existsSync(importFile)) {
  console.log(`❌ Import file "${importFile}" not found`);
  process.exit();
}

const fileContents = readFileSync(importFile, "utf8");
const runDateTime = fileNameDateTime();
const runStats = new Stats(importName);

(async () => {
  const entities = await parse(fileContents, { columns: true, bom: true });
  const thisHandler = importHandler.importTypes[importType];

  const savePath = [importName, thisHandler.getDirName()];
  ensureOutputPath(savePath);

  const dailyData: DailyData = {};
  const runMetadata: StatsRunData = {
    dateTime: runDateTime,
    filesWritten: 0,
    filesSkipped: 0,
    importFile,
  };

  for (const entity of entities) {
    const transformedEntity = thisHandler.transformEntity(entity);

    if (!transformedEntity) {
      continue;
    }

    if (!dailyData[transformedEntity.day]) {
      dailyData[transformedEntity.day] = [];
    }
    dailyData[transformedEntity.day]!.push(entity);
  }

  runMetadata.total = entities.length;
  runMetadata.days = Object.keys(dailyData).length;
  for (const day in dailyData) {
    const outputPath = makeOutputPath(savePath, day, runDateTime);
    writeOutputFile(outputPath, dailyData[day])
      ? runMetadata.filesWritten++
      : runMetadata.filesSkipped++;
  }

  runStats.addRun(importType, runMetadata);
  runStats.shutdown();
})();