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

  async sendOrder(symbol: string, orderType: string, orderAmount: Number, side: string) {
    const xApiTimestamp = Date.now();
    const queryString =
      "symbol=" + symbol + "&order_type=" + orderType + "&order_amount=" + orderAmount + "&side=" + side + "|" + xApiTimestamp;

    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-api-key": this.config.xApiKey,
      "x-api-signature": cryptoJS.HmacSHA256(queryString, this.config.xApiSecret).toString(),
      "x-api-timestamp": xApiTimestamp,
      "cache-control": "no-cache",
    };

    const data = {
      symbol,
      orderType,
      orderAmount,
      side,
    };

    console.log("queryString", queryString);
    console.log("header", headers);
    console.log("data", data);

    /* try {
      const res = await axios.post(this.config.baseUrl +'/v1/order', data, headers);  
      console.log('response', res);
      return res;
    } catch (error) {
      throw new Error('Error with sendOrder : ' +error +'\n' + 'queryString : ' +queryString)
    } */
  }

  getKlineBinance() {
    return new Promise<any>(async (resolve, reject) => {
      const fetch = require("node-fetch");

      const url = "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=6m"; //spot
      const options = { method: "GET", headers: { Accept: "text/plain" } };

      fetch(url, options)
        .then((res) => res.json())
        .then((json) => resolve(json))
        .catch((err) => reject("error:" + err));
    });
  }

  async getAccountInfo() {
    const xApiTimestamp = Date.now();
    const queryString = "|" + xApiTimestamp;

    const config = {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-api-key": this.config.xApiKey,
        "x-api-signature": cryptoJS.HmacSHA256(queryString, this.config.xApiSecret).toString(),
        "x-api-timestamp": xApiTimestamp,
        "cache-control": "no-cache",
      },
    };

    try {
      const res = await axios.get(this.config.baseUrl + "/v1/client/info", config);
      //console.log('response', res);
      return res.data;
    } catch (error) {
      throw new Error("Error with getAccountInfo : " + error + "\n" + "queryString : " + queryString);
    }
  }

  async getKline() {
    const xApiTimestamp = Date.now();
    const queryString = "symbol=SPOT_BTC_USDT&type=1m|" + xApiTimestamp;

    const config = {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-api-key": this.config.xApiKey,
        "x-api-signature": cryptoJS.HmacSHA256(queryString, this.config.xApiSecret).toString(),
        "x-api-timestamp": xApiTimestamp,
        "cache-control": "no-cache",
      },
      params: {
        symbol: "SPOT_BTC_USDT",
        type: "1m",
      },
    };

    try {
      const res = await axios.get(this.config.baseUrl + "/v1/kline", config);
      return res.data;
    } catch (error) {
      throw new Error("Error with getKline : " + error + "\n" + "queryString : " + queryString);
    }
  }
}
