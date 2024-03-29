import path from "path";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import axiosRetry, { exponentialDelay } from "axios-retry";

import getConfig from "./config.js";
import {
  ApiHandler,
  ApiHistoricEndpoint,
  ApiSecondaryEndpoint,
  ApiSnapshotEndpoint,
} from "./types.js";
import { __dirname, readFile, writeFile } from "./fs.js";

////
/// Types
//

export interface MockAxiosResponse extends Omit<AxiosResponse, "config"> {}

////
/// Helpers
//

axiosRetry(axios, { retries: 3, retryDelay: exponentialDelay });

const makeMockPath = (apiName: string, endpointDir: string) =>
  path.join(
    __dirname,
    "..",
    "..",
    "__mocks__",
    "api-data",
    apiName,
    `${endpointDir}.json`
  );

// TODO: Make MockAxiosResponse === AxiosResponse or mock with interceptors
const getMockApiData = (
  apiName: string,
  endpointDir: string
): MockAxiosResponse | null => {
  const mockPath = makeMockPath(apiName, endpointDir);

  try {
    const mockJson = readFile(mockPath);
    return {
      data: JSON.parse(mockJson) as unknown,
      headers: {},
      status: 200,
      statusText: "OK",
    };
  } catch (error) {
    return null;
  }
};

////
/// Exports
//

export const getApiData = async (
  apiHandler: ApiHandler,
  handler: ApiHistoricEndpoint | ApiSnapshotEndpoint | ApiSecondaryEndpoint,
  entity?: object
): Promise<AxiosResponse | MockAxiosResponse> => {
  const isEnriching = typeof entity !== "undefined";
  const endpoint = isEnriching
    ? (handler as ApiSecondaryEndpoint).getEndpoint(entity)
    : (handler as ApiHistoricEndpoint | ApiSnapshotEndpoint).getEndpoint();

  const mockFilename = isEnriching
    ? endpoint.replaceAll("/", "--")
    : handler.getDirName();
  if (getConfig().debugUseMocks) {
    const apiData = getMockApiData(apiHandler.getApiName(), mockFilename);

    if (apiData === null) {
      throw new Error(`No mock data found for ${endpoint}`);
    }

    return apiData;
  }

  const axiosConfig: AxiosRequestConfig = {
    url: endpoint,
    baseURL: apiHandler.getApiBaseUrl(),
    headers: await apiHandler.getApiAuthHeaders(),
    method:
      typeof handler.getMethod === "function" ? handler.getMethod().toLowerCase() : "get",
    params: typeof handler.getParams === "function" ? handler.getParams() : {},
  };

  if (typeof handler.getRequestData === "function" && axiosConfig.method === "post") {
    axiosConfig.data = handler.getRequestData();
  }

  if (getConfig().debugLogOutput) {
    console.log(axiosConfig);
  }

  const response = await axios(axiosConfig);

  if (getConfig().debugSaveMocks) {
    writeFile(
      makeMockPath(apiHandler.getApiName(), mockFilename),
      JSON.stringify(response.data)
    );
  }

  return response;
};
