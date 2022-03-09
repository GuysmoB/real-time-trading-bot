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
}
