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
  getApiAuthHeaders: () => {};
  endpointsPrimary: ApiPrimaryEndpoint[];
  endpointsSecondary: ApiSecondaryEndpoint[];
  authorizeEndpoint?: string;
  tokenEndpoint?: string;
}

export interface ApiPrimaryEndpoint {
  getDirName: () => string;
  getEndpoint: () => string;
  method?: string;
  getParams?: () => {};
  transformResponseData?: (response: AxiosResponse | MockAxiosResponse) => any[];
  parseDayFromEntity?: (entity: any) => string;
}

export interface ApiSecondaryEndpoint extends Omit<ApiPrimaryEndpoint, "getEndpoint"> {
  getEndpoint: (entity: any) => string;
  getPrimary: () => string;
  getIdentifier: (entity: any) => string;
}