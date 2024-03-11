import axios, { AxiosResponse } from "axios";

import { envWrite } from "../../utils/fs.js";
import { ApiPrimaryEndpoint, ApiSecondaryEndpoint } from "../../utils/types.js";
import { MockAxiosResponse } from "../../utils/data.js";
import {
  ONE_DAY_IN_SEC,
  ONE_HOUR_IN_SEC,
  ONE_QUATER_IN_SEC,
} from "../../utils/constants.js";

const { WAHOO_AUTHORIZE_CLIENT_ID, WAHOO_AUTHORIZE_CLIENT_SECRET, WAHOO_REFRESH_TOKEN } =
  process.env;

////
/// Types
//

interface WahooWorkoutEntity {
  day: string;
}

////
/// Exports
//

const authorizeEndpoint = "https://api.wahooligan.com/oauth/authorize";
const tokenEndpoint = "https://api.wahooligan.com/oauth/token";

const getApiName = () => "wahoo";
const getApiBaseUrl = () => "https://api.wahooligan.com/v1/";
const getHistoricDelay = () => ONE_QUATER_IN_SEC;

let accessToken = "";
const getApiAuthHeaders = async () => {
  if (!WAHOO_REFRESH_TOKEN) {
    console.log("❌ No Wahoo refresh token stored. See README for more information.");
    process.exit();
  }

  let tokenResponse: AxiosResponse;
  if (!accessToken) {
    tokenResponse = await axios.post(tokenEndpoint, {
      client_id: WAHOO_AUTHORIZE_CLIENT_ID,
      client_secret: WAHOO_AUTHORIZE_CLIENT_SECRET,
      refresh_token: WAHOO_REFRESH_TOKEN,
      grant_type: "refresh_token",
    });
    accessToken = tokenResponse.data.access_token;
    const newRefreshToken = tokenResponse.data.refresh_token;
    envWrite("WAHOO_REFRESH_TOKEN", WAHOO_REFRESH_TOKEN, newRefreshToken);
  }

  return {
    Authorization: `Bearer ${accessToken}`,
  };
};

const endpointsPrimary: ApiPrimaryEndpoint[] = [
  {
    getEndpoint: () => "user",
    getDirName: () => "user",
    getDelay: () => ONE_DAY_IN_SEC,
    getHistoricDelay: () => ONE_HOUR_IN_SEC,
  },
  {
    getEndpoint: () => "workouts",
    getDirName: () => "workouts",
    getParams: () => ({
      page: 1,
      per_page: 50,
    }),
    getDelay: () => ONE_DAY_IN_SEC,
    getHistoricDelay: () => ONE_HOUR_IN_SEC,
    parseDayFromEntity: (entity: WahooWorkoutEntity) => entity.day,
    transformResponseData: (response: AxiosResponse | MockAxiosResponse): unknown =>
      response.data.workouts,
  },
];

const endpointsSecondary: ApiSecondaryEndpoint[] = [];
export {
  authorizeEndpoint,
  tokenEndpoint,
  getApiName,
  getApiBaseUrl,
  getApiAuthHeaders,
  getHistoricDelay,
  endpointsPrimary,
  endpointsSecondary,
};
