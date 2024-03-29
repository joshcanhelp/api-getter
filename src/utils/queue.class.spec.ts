import type { Mock } from "vitest";

import getConfig from "./config.js";
import { ONE_DAY_IN_SEC, ONE_HOUR_IN_SEC } from "./date-time.js";
import { runDateUtc } from "./date-time.js";
import { pathExists, readFile, writeFile, ensureOutputPath } from "./fs.js";
import logger from "./logger.js";

vi.mock("./fs.js", () => ({
  __dirname: "",
  ensureOutputPath: vi.fn(),
  pathExists: vi.fn(() => true),
  readFile: vi.fn(() => "[]"),
  writeFile: vi.fn(),
}));

import Queue, { QueueEntry } from "./queue.class.js";
import { ApiHandler, ApiSnapshotEndpoint } from "./types.js";

const outputDir = getConfig().outputDir;
const queueFilePath = `${outputDir}/API_NAME/_queue.json`;

const mockApiHandler: ApiHandler = {
  getApiName: vi.fn(() => "API_NAME"),
  getApiBaseUrl: vi.fn(() => "API_BASE_URL"),
  getApiAuthHeaders: vi.fn(async () => ({})),
  getHistoricDelay: vi.fn(() => ONE_HOUR_IN_SEC),
  endpointsPrimary: [
    {
      isHistoric: vi.fn(() => false),
      getEndpoint: vi.fn(() => "API_ENDPOINT"),
      getDirName: () => "API_DIRECTORY",
      getDelay: () => ONE_DAY_IN_SEC,
    } as ApiSnapshotEndpoint,
  ],
  endpointsSecondary: [],
};

const missingEndpoint: QueueEntry = {
  endpoint: "API_ENDPOINT",
  runAfter: ONE_DAY_IN_SEC + runDateUtc().seconds,
  historic: false,
  params: {},
};

const mockHistoricEntry = {
  endpoint: "this/endpoint",
  runAfter: 1234567890,
  historic: true,
  params: {
    params1: "value1",
  },
};

const mockStandardEntry = {
  endpoint: "this/endpoint",
  runAfter: 1234567890,
  historic: false,
  params: {},
};

const mockOtherEntry = {
  endpoint: "this/endpoint",
  runAfter: 1234567890,
  historic: false,
  params: {
    params1: "value1",
  },
};

describe("Class: Queue", () => {
  it("looks for a queue file when a new instance is created", () => {
    new Queue(mockApiHandler);
    expect(pathExists).toHaveBeenCalledWith(queueFilePath);
  });

  describe("queue file does not exist", () => {
    let queue: Queue;

    beforeAll(() => {
      (pathExists as Mock).mockImplementation(() => false);
      queue = new Queue(mockApiHandler);
    });

    it("checks the write path", () => {
      expect(ensureOutputPath).toHaveBeenCalledWith(["API_NAME"]);
    });

    it("creates the queue file", () => {
      expect(writeFile).toHaveBeenCalledWith(queueFilePath, "[]");
    });

    it("returns an empty queue", () => {
      expect(queue.getQueue()).toEqual([]);
    });
  });

  describe("queue file exists", () => {
    let queue: Queue;

    beforeAll(() => {
      (pathExists as Mock).mockImplementation(() => true);
      (readFile as Mock).mockImplementation(() => '[{"test": true}]');
      queue = new Queue(mockApiHandler);
    });

    it("reads the existing queue file", () => {
      expect(readFile).toHaveBeenCalledWith(queueFilePath);
    });

    it("returns the queue contents", () => {
      expect(queue.getQueue()).toEqual([{ test: true }]);
    });
  });

  describe("queue management", () => {
    let queue: Queue;

    beforeEach(() => {
      (readFile as Mock).mockImplementation(() => "[]");
      queue = new Queue(mockApiHandler);
    });

    it("is initiated as an empty queue", () => {
      expect(queue.getQueue()).toEqual([]);
    });

    it("entries are added and retrieved as expected", () => {
      queue.addEntry(mockHistoricEntry);
      queue.addEntry(mockStandardEntry);
      expect(queue.getQueue()).toEqual([
        mockHistoricEntry,
        { ...mockStandardEntry, historic: false, params: {} },
      ]);
    });
  });

  describe("queue processing", () => {
    let queue: Queue;

    beforeEach(() => {
      (readFile as Mock).mockImplementation(() => "[]");
      queue = new Queue(mockApiHandler);
    });

    it("adds handled endpoints to the queue", () => {
      queue.processQueue(logger);
      expect(queue.getQueue()).toEqual([missingEndpoint]);
    });

    it("returns added endpoints", () => {
      const runQueue = queue.processQueue(logger);
      expect(runQueue).toEqual([
        {
          endpoint: missingEndpoint.endpoint,
          historic: missingEndpoint.historic,
          params: missingEndpoint.params,
        },
      ]);
    });

    it("does not return endpoints scheduled for the future", () => {
      // First call returns the missing endpoint
      queue.processQueue(logger);
      // Second call skips the existing endpoint
      const runQueue = queue.processQueue(logger);
      expect(runQueue).toEqual([]);
    });

    it("removes unknown endpoints", () => {
      queue.addEntry({
        endpoint: "UNKNOWN_ENDPOINT",
        runAfter: 1234567890,
      });
      queue.processQueue(logger);
      expect(queue.getQueue()).toEqual([missingEndpoint]);
    });
  });

  describe("entry management", () => {
    let queue: Queue;

    beforeEach(() => {
      (readFile as Mock).mockImplementation(() => "[]");
      queue = new Queue(mockApiHandler);
    });

    it("finds no standard entries in an empty queue", () => {
      expect(queue.hasStandardEntryFor("this/endpoint")).toEqual(false);
    });

    it("finds no historic entries in an empty queue", () => {
      expect(queue.hasHistoricEntryFor("this/endpoint")).toEqual(false);
    });

    describe("finds standard entries", () => {
      beforeEach(() => {
        queue.addEntry(mockStandardEntry);
      });

      it("finds a standard entry", () => {
        expect(queue.hasStandardEntryFor("this/endpoint")).toEqual(true);
      });
    });

    describe("finds historic entries", () => {
      beforeEach(() => {
        queue.addEntry(mockHistoricEntry);
      });

      it("finds a historic entry", () => {
        expect(queue.hasHistoricEntryFor("this/endpoint")).toEqual(true);
      });
    });

    describe("no standard or historic entries", () => {
      beforeEach(() => {
        queue.addEntry(mockOtherEntry);
        queue.addEntry(mockOtherEntry);
        queue.addEntry(mockOtherEntry);
      });

      it("does not find a standard entry", () => {
        expect(queue.hasStandardEntryFor("this/endpoint")).toEqual(false);
      });

      it("does not find a historic entry", () => {
        expect(queue.hasHistoricEntryFor("this/endpoint")).toEqual(false);
      });
    });
  });
});
