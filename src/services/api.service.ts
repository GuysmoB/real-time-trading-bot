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

  async sendOrder(symbol: string, orderType: string, orderAmount: Number, side: string) {
    const xApiTimestamp = Date.now();
    const queryString = 'symbol=' + symbol + '&order_type=' + orderType + '&order_amount=' + orderAmount + '&side=' + side + '|' + xApiTimestamp;

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-api-key': this.config.xApiKey,
      'x-api-signature': cryptoJS.HmacSHA256(queryString, this.config.xApiSecret).toString(),
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

    /* try {
      const res = await axios.post(this.config.baseUrl +'/v1/order', data, headers);  
      console.log('response', res);
      return res;
    } catch (error) {
      throw new Error('Error with sendOrder : ' +error +'\n' + 'queryString : ' +queryString)
    } */
  }


  async getAccountInfo() {
    const xApiTimestamp = Date.now();
    const queryString = '|' + xApiTimestamp;

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-api-key': this.config.xApiKey,
      //'x-api-signature': cryptoJS.HmacSHA256('order_price=9000&order_quantity=0.11&order_type=LIMIT&side=BUY&symbol=SPOT_BTC_USDT|1578565539808', 'QHKRXHPAW1MC9YGZMAT8YDJG2HPR').toString(),
      'x-api-signature': cryptoJS.HmacSHA256(queryString, this.config.xApiSecret).toString(),
      'x-api-timestamp': xApiTimestamp,
      'cache-control': 'no-cache'
    };

    try {
      const res = await axios.get(this.config.baseUrl + '/v1/client/info', { headers: headers });
      //console.log('response', res);
      return res.data;
    } catch (error) {
      throw new Error('Error with getAccountInfo : ' + error + '\n' + 'queryString : ' + queryString)
    }
  }







}
