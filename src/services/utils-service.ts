import fs from "fs";
import { promisify } from "util";
import ig from "node-ig-api";

export class UtilsService {
  constructor() {}

  /**
   * Parse et push les donnees CSV.
   */
  async getDataFromFile(): Promise<any> {
    const result = [];
    const content = await promisify(fs.readFile)("src\\assets\\EURUSD60.csv", "UTF-8");
    const csvToRowArray = content.split("\r\n");
    for (let index = 1; index < csvToRowArray.length - 1; index++) {
      const element = csvToRowArray[index].split("\t"); // d, o, h, l, c, v
      result.push({
        date: element[0],
        open: parseFloat(element[1]),
        high: parseFloat(element[2]),
        low: parseFloat(element[3]),
        close: parseFloat(element[4]),
        volume: parseFloat(element[5]),
      });
    }
    return result;
  }

  /**
   * Parse les données depuis IG.
   */
  async parseData(ticker: string, resolution: string, max: number) {
    const result = [];
    const res = await ig.get('/prices/CS.D.' +ticker +'.CFD.IP?resolution=' + resolution + '&max=' + max + '&pageSize=0', 3);
    for (let i = 0; i < res.body.prices.length; i++) {
      result.push({ open: res.body.prices[i].openPrice.bid, 
                        close: res.body.prices[i].closePrice.bid,
                        high: res.body.prices[i].highPrice.bid,
                        low: res.body.prices[i].lowPrice.bid});  
    }   
    return result;
  }

  /**
   * Permet de retourner le R:R
   */
  getRiskReward(entryPrice: number, initialStopLoss: number, closedPrice: number): number {
    return this.round((closedPrice - entryPrice) / (entryPrice - initialStopLoss), 2);
  }

  /**
   * Retourne la valeur maximale en fonction de la source et de lookback
   */
  highest(data: any, index: number, source: string, lookback: number): number {
    let max: number;

    for (let k = 0; k < lookback; k++) {
      if (k === 0) {
        max = data[index - k][source];
      }

      if (data[index - k][source] > max) {
        max = data[index - k][source];
      }
    }
    return max;
  }

  /**
   * Retourne la valeur minimale en fonction de la source et de lookback
   */
  lowest(data: any, index: number, source: string, lookback: number): number {
    let min: number;

    for (let k = 0; k < lookback; k++) {
      if (k === 0) {
        min = data[index - k][source];
      }

      if (data[index - k][source] < min) {
        min = data[index - k][source];
      }
    }
    return min;
  }

  /**
   * Arrondi un nombre avec une certaine précision.
   */
  round(value: number, precision: number): number {
    const multiplier = Math.pow(10, precision || 0);
    return Math.round(value * multiplier) / multiplier;
  }

  /**
   * Retourne l'équivalent HeikenAshi
   */
  setHeikenAshiData(source: any): any {
    const result = [];

    for (let j = 0; j < source.length; j++) {
      if (j === 0) {
        result.push({
          close: this.round((source[j].open + source[j].high + source[j].low + source[j].close) / 4, 5),
          open: this.round((source[j].open + source[j].close) / 2, 5),
          low: source[j].low,
          high: source[j].high,
        });
      } else {
        const haCloseVar = (source[j].open + source[j].high + source[j].low + source[j].close) / 4;
        const haOpenVar = (result[result.length - 1].open + result[result.length - 1].close) / 2;
        result.push({
          close: this.round(haCloseVar, 5),
          open: this.round(haOpenVar, 5),
          low: this.round(Math.min(source[j].low, Math.max(haOpenVar, haCloseVar)), 5),
          high: this.round(Math.max(source[j].high, Math.max(haOpenVar, haCloseVar)), 5),
        });
      }
    }
    return result;
  }

  sma(data: any, index: number, periode: number): number {
    const result = [];
    const dataStart = index - periode;

    if (dataStart > 0) {
      for (let i = dataStart; i < index; i++) {
        result.push(data[i].close);
      }
      return this.round(result.reduce((a, b) => a + b, 0) / result.length, 5);
    } else {
      return 0;
    }
  }


  candlestickBuilder(streamData: any) {
    const _open = streamData[2];
    const _high = streamData[3];
    const _low = streamData[4];
    const _close = streamData[5];
    const endCandle = streamData[6];

    console.log(_open, _high, _low, _close, endCandle)
    if (endCandle === '1') {
      return { open: _open, 
              close: _close,
              high: _high,
              low: _low};
    }
  }

  
}

export default new UtilsService();


