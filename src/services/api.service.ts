import { UtilsService } from './utils-service';
import { Config } from "../config";
const axios = require('axios').default;
const cryptoJS = require("crypto-js");


export class ApiService {

  constructor(private utils: UtilsService, private config: Config) { }

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

  async sendOrder(url: string, symbol: string, orderType: string, orderAmount: Number, side: string) {
    const xApiTimestamp = Date.now();
    const queryString = 'symbol=' +symbol +'&order_type=' +orderType +'&order_amount=' +orderAmount +'&side=' +side +'|' +xApiTimestamp;

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-api-key': this.config.xApiKey,
      'x-api-signature': cryptoJS.HmacSHA256(this.config.xApiSecret, queryString).toString(),
      'x-api-timestamp': xApiTimestamp,
      'cache-control': 'no-cache'
    };

    const data = {
      symbol,
      orderType,
      orderAmount,
      side
    };

    console.log('queryString', queryString)
    console.log('header', headers)
    console.log('data', data)

    try {
      const res = await axios.post(url, data, headers);  
      console.log('response', res);
      return res;
    } catch (error) {
      throw new Error('Error with sendOrder : ' +error +'\n' + 'queryString : ' +queryString)
    }
  }







}
