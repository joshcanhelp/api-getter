require("dotenv").config();
const http = require("http");

const { authorizeEndpoint, tokenEndpoint } = require("./index.js");
const { serverPort, serverCallback } = require("../../utils/authorizeApp.js");

const {
  WAHOO_AUTHORIZE_CLIENT_ID,
  WAHOO_AUTHORIZE_CLIENT_SECRET,
  WAHOO_REFRESH_TOKEN,
} = process.env;

http
  .createServer(serverCallback({
    checkState: true,
    clientId: WAHOO_AUTHORIZE_CLIENT_ID,
    clientSecret: WAHOO_AUTHORIZE_CLIENT_SECRET,
    refreshToken: WAHOO_REFRESH_TOKEN,
    refreshTokenEnvKey: "WAHOO_REFRESH_TOKEN",
    scope: "workouts_read plans_read power_zones_read offline_data user_read",
    authorizeEndpoint,
    tokenEndpoint
  }))
  .listen(serverPort);