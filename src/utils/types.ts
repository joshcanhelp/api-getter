import { AxiosResponse } from "axios";

import { MockAxiosResponse } from "./data.js";

export interface DailyEntity {
  day: string;
}

export interface DailyData {
  [key: string]: DailyEntity[];
}

export interface ApiHandler {
  getApiName: () => string;
  getApiBaseUrl: () => string;
  getApiAuthHeaders: () => Promise<object>;
  getHistoricDelay: () => number;
  endpointsPrimary: ApiPrimaryEndpoint[];
  endpointsSecondary: ApiSecondaryEndpoint[];
  authorizeEndpoint?: string;
  tokenEndpoint?: string;
}

export interface ApiPrimaryEndpoint {
  getDirName: () => string;
  getEndpoint: () => string;
  getDelay: () => number;
  getMethod?: () => string;
  getParams?: () => object;
  getHistoricParams?: () => object;
  getHistoricDelay?: () => number;
  getNextParams?: (currentParams: object) => object;
  transformResponseData?: (response: AxiosResponse | MockAxiosResponse) => unknown;
  parseDayFromEntity?: (entity: any) => string;
}

export interface ApiSecondaryEndpoint
  extends Omit<ApiPrimaryEndpoint, "getEndpoint" | "getDelay" | "getHistoricParams"> {
  getEndpoint: (entity: any) => string;
  getPrimary: () => string;
  getIdentifier: (entity: any) => string;
}

export interface EndpointRecord {
  endpoint: string;
  params: object;
}
