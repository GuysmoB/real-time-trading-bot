import fs from "fs";
import { promisify } from "util";
import ig from "node-ig-api";

export class UtilsService {
  constructor() { }


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
    const res = await ig.get('/prices/CS.D.' + ticker + '.CFD.IP?resolution=' + resolution + '&max=' + max + '&pageSize=0', 3);
    for (let i = 0; i < res.body.prices.length; i++) {
      result.push({
        open: res.body.prices[i].openPrice.bid,
        close: res.body.prices[i].closePrice.bid,
        high: res.body.prices[i].highPrice.bid,
        low: res.body.prices[i].lowPrice.bid
      });
    }
    return result;
  }


  /**
   * Permet de retourner le R:R
   */
  getRiskReward(entryPrice: number, initialStopLoss: number, closedPrice: number): number {
    return this.round(Math.abs(closedPrice - entryPrice) / Math.abs(entryPrice - initialStopLoss), 2);
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
        const _close = this.round((source[j].open + source[j].high + source[j].low + source[j].close) / 4, 5);
        const _open = this.round((source[j].open + source[j].close) / 2, 5);
        result.push({
          close: _close,
          open: _open,
          low: source[j].low,
          high: source[j].high,
          bull: _close > _open,
          bear: _close < _open,
        });
      } else {
        const haCloseVar = (source[j].open + source[j].high + source[j].low + source[j].close) / 4;
        const haOpenVar = (result[result.length - 1].open + result[result.length - 1].close) / 2;
        result.push({
          close: this.round(haCloseVar, 5),
          open: this.round(haOpenVar, 5),
          low: this.round(Math.min(source[j].low, Math.max(haOpenVar, haCloseVar)), 5),
          high: this.round(Math.max(source[j].high, Math.max(haOpenVar, haCloseVar)), 5),
          bull: haCloseVar > haOpenVar,
          bear: haCloseVar < haOpenVar,
        });
      }
    }
    return result;
  }


  /**
   * Retourne une moving average en fonction de la période.
   */
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


  /**
   * Initialise le tableaux de référence.
   */
  dataArrayBuilder(array: any, allData: any) {
    for (let i = 0; i < array.length; i++) {
      const tickerTf = this.getTickerTimeframe(array[i]);
      allData[tickerTf] = [];
      allData[tickerTf].ohlc = [];
      allData[tickerTf].snapshot_Long = undefined;
      allData[tickerTf].snapshot_Short = undefined;
      allData[tickerTf].inLong = false;
      allData[tickerTf].inShort = false;
      allData[tickerTf].entryPrice_Long = 0;
      allData[tickerTf].entryPrice_Short = 0;
      allData[tickerTf].initialStopLoss_Long = 0;
      allData[tickerTf].initialStopLoss_Short = 0;
      allData[tickerTf].updatedStopLoss_Long = 0;
      allData[tickerTf].updatedStopLoss_Short = 0;
      allData[tickerTf].takeProfit_Long = 0;
      allData[tickerTf].takeProfit_Short = 0;
    }
    return allData;
  }


  timeProcessedArrayBuilder(array: any, timeProcessed: any, timeFrame: any) {
    for (let i = 0; i < array.length; i++) {
      for (let j = 0; j < timeFrame.length; j++) {
        const tickerTf = this.getTicker(array[i]) + '_' + timeFrame[j] + 'MINUTE';
        timeProcessed[tickerTf] = [];
      }
    }
    return timeProcessed;
  }


  dataArrayBuilderTest(epic: any, allData: any, timeFrame: any) {
    for (let i = 0; i < epic.length; i++) {
      for (let j = 0; j < timeFrame.length; j++) {
        const tickerTf = this.getTicker(epic[i]) + '_' + timeFrame[j] + 'MINUTE';
        allData[tickerTf] = [];
        allData[tickerTf].ohlc = [];
        allData[tickerTf].timeProcessed = [];
        allData[tickerTf].snapshot_Long = undefined;
        allData[tickerTf].snapshot_Short = undefined;
        allData[tickerTf].inLong = false;
        allData[tickerTf].inShort = false;
        allData[tickerTf].entryPrice_Long = 0;
        allData[tickerTf].entryPrice_Short = 0;
        allData[tickerTf].initialStopLoss_Long = 0;
        allData[tickerTf].initialStopLoss_Short = 0;
        allData[tickerTf].updatedStopLoss_Long = 0;
        allData[tickerTf].updatedStopLoss_Short = 0;
        allData[tickerTf].takeProfit_Long = 0;
        allData[tickerTf].takeProfit_Short = 0;
      }
    }
    return allData;
  }

  /**
   * Retourne le ticker timeframe.
   */
  getTickerTimeframe(string: string) {
    const str = string.split('.');
    const tf = str[4].split(':');
    return this.getTicker(string) + '_' + tf[1];
  }

  /**
   * Retourne le ticker.
   */
  getTicker(string: string) {
    const str = string.split('.');
    return str[2];
  }


  /**
   * Permet d'arrêter le processus.
   */
  stopProcess() {
    console.log('Process is about to stop');
    process.exit();
  }


  isTimeFrameMultiple(timeFrame: any, time: any): boolean {
    const minuteTimestamp = this.round(time / 60000, 0);
    if (minuteTimestamp % timeFrame === 0) {
      return true;
    } else {
      return false;
    }
  }
}

export default new UtilsService();


