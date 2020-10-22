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
  async parseData(resolution: string, max: number) {
    const result = [];
    //const res = await nodeIg.histPrc('CC.D.LCO.USS.IP', 'HOUR_4', '2012-03-01T00:00:00', '2012-03-01T20:00:00');
    const res = await ig.get("/prices/CS.D.EURGBP.CFD.IP?resolution=" + resolution + "&max=" + max + "&pageSize=0", 3);
    console.log(res.body);
    /* for (let i = 0; i < res.prices.length; i++) {
      result.push({ open: res.prices[i].openPrice.bid, 
                        close: res.prices[i].closePrice.bid,
                        high: res.prices[i].highPrice.bid,
                        low: res.prices[i].lowPrice.bid});  
    }   */
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
}

export default new UtilsService();

/*
minutesProcessed = [];
minutesCandlesticks = [];
currentTick = none
previousTick = none

streamData(data => {
  previousTick = currentTick;
  currentTick = data;
  printf('Received tick', currentTick.time, currentTick.price);
  tcikDatetimeObject = dateutils.parse(currentTick.time)
  tick_dt = tickDatetimeObject.strftime('%m/%d/%Y %H:%M')
  print(tick_dt, tcikDatetimeObject.minute);

  if (not tick_dt in minutesProcessed) {}
    print('starting new candlestick')
    minutesProcessed.tick_dt = true
    print(minutesProcessed).


    if len(minuteCandlestick) > 0 {
      minuteCandlestick[-1].close = previousTick.price
    }

    minuteCandlesticks.append({
      minute: tick_dt,
      open: currentTick.price,
      high: currentTick.price,
      low: currentTick.price,
    })
  }

  if (len(minuteCandlestick)) > 0 {
    currentCandlestick = minuteCandletick[-1]
    if (currentTick.price > currentCandlestick.high) {
      currentCandlestick.high = currentTick.price; 
    }
    if (currentTick.price < currentCandlestick.low) {
      currentCandlestick.low = currentTick.price; 
    }

    printf('Candlestick')
    for (candlestick in minuteCandlestick) {
      print(candlestick)
    }
  }






})

 */
