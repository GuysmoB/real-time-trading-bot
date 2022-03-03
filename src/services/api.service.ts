import { UtilsService } from "./utils-service";
import { Config } from "../config";
const axios = require("axios").default;
const cryptoJS = require("crypto-js");

export class ApiService {
  constructor(private utils: UtilsService, private config: Config) {}

  getDataFromApi(url: string): Promise<any> {
    return new Promise<any>(async (resolve, reject) => {
      const res = await axios.get(url);
      if (res) {
        resolve(res.data);
      } else {
        reject();
      }
    });
  }

  getObSnapshot() {
    return new Promise<any>(async (resolve, reject) => {
      const fetch = require("node-fetch");

      //const url = 'https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=5000'; //spot
      const url = " https://fapi.binance.com/fapi/v1/depth?symbol=BTCUSDT&limit=1000"; //futurs
      const options = { method: "GET", headers: { Accept: "text/plain" } };

      fetch(url, options)
        .then((res) => res.json())
        .then((json) => resolve(json))
        .catch((err) => reject("error:" + err));
    });
  }
}
