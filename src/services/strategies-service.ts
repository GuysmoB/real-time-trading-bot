import { CandleAbstract } from "../abstract/candleAbstract";
import { UtilsService } from "./utils-service";

export class StrategiesService extends CandleAbstract {

  constructor(private utils: UtilsService) {
    super();
  }

  strategy_test(data: any, i: number): any {
    return {
      startTrade: this.isUp(data, i, 1) && this.isUp(data, i, 0),
      stopLoss: this.low(data, i, 1),
      entryPrice: this.close(data, i, 0)
    };
  }


  strategy_live_test2_Long(data: any, i: number, currentCandle: any): any {
    return {
      startTrade: !this.isUp(data, i, 0) && currentCandle.close > this.high(data, i, 0),
      stopLoss: this.low(data, i, 0),
      entryPrice: currentCandle.close
    };
  }


  strategy_live_test2_Short(data: any, i: number, currentCandle: any): any {
    return {
      startTrade: this.isUp(data, i, 0) && currentCandle.close < this.low(data, i, 0),
      stopLoss: this.high(data, i, 0),
      entryPrice: currentCandle.close
    };
  }

  strategy_live_test_Long(data: any, i: number, currentCandle: any): any {
    return {
      startTrade: !this.isUp(data, i, 0) && currentCandle.low < this.low(data, i, 0) && currentCandle.close > this.high(data, i, 0),
      stopLoss: currentCandle.low,
      entryPrice: currentCandle.close
    };
  }

  strategy_live_test_Short(data: any, i: number, currentCandle: any): any {
    return {
      startTrade: this.isUp(data, i, 0) && currentCandle.high > this.high(data, i, 0) && currentCandle.close < this.low(data, i, 0),
      stopLoss: currentCandle.high,
      entryPrice: currentCandle.close
    };
  }

  strategy_LSD_Long(data: any, i: number): any {
    const lookback = 3;
    const swingHigh1 = this.utils.highest(data, i - 1, "high", lookback);
    const swingHigh2 = this.utils.highest(data, i - 2, "high", lookback);
    const swingLow1 = this.utils.lowest(data, i - 1, "low", lookback);
    const swingLow2 = this.utils.lowest(data, i - 2, "low", lookback);
    const smallRange1 = swingHigh1 - swingLow1 < 0.005;
    const smallRange2 = swingHigh2 - swingLow2 < 0.01;
    const liquidityPips = 0; // (swingHigh1 - swingLow1) / 5;
    const smallerLow1 = this.low(data, i, 3) > this.low(data, i, 2) && this.low(data, i, 2) > this.low(data, i, 1);
    const smallerLow2 = this.low(data, i, 4) > this.low(data, i, 3) && this.low(data, i, 3) > this.low(data, i, 2);

    const liquidityLow_OneCandle = !smallerLow1 && this.isUp(data, i, 0) && swingLow1 - this.low(data, i, 0) > liquidityPips;
    const liquidityLow_TwoCandlesDownUp = !smallerLow2 && smallRange2 && !this.isUp(data, i, 1) && this.isUp(data, i, 0) && swingLow2 - this.low(data, i, 1) > liquidityPips;
    const liquidityLow_TwoCandlesUp = !smallerLow2 && smallRange2 && this.isUp(data, i, 1) && swingLow2 - this.low(data, i, 1) > liquidityPips && this.isUp(data, i, 0);
    const breakoutUp = this.close(data, i, 0) > swingHigh1;

    const stopLossVar = liquidityLow_TwoCandlesDownUp || liquidityLow_TwoCandlesUp ? swingLow2 : liquidityLow_OneCandle ? swingLow1 : NaN;
    const sma = this.close(data, i, 0) > this.utils.sma(data, i, 50);

    return {
      startTrade: (liquidityLow_OneCandle || liquidityLow_TwoCandlesDownUp || liquidityLow_TwoCandlesUp) && breakoutUp && sma,
      stopLoss: stopLossVar,
      entryPrice: swingHigh1,
    };
  }

  getFixedTakeProfitAndStopLoss(direction: string, data: any, i: number, entryPrice: number, initialStopLoss: number, takeProfit: number, currentCandle: any): number {
    let result: number;

    if (direction === 'LONG') {
      if (currentCandle.close >= takeProfit) {
        result = this.utils.getRiskReward(entryPrice, initialStopLoss, takeProfit);
      } else if (currentCandle.close <= initialStopLoss) {
        result = -1;
      }
    } else if (direction === 'SHORT') {
      if (currentCandle.close <= takeProfit) {
        result = this.utils.getRiskReward(entryPrice, initialStopLoss, takeProfit);
      } else if (currentCandle.close >= initialStopLoss) {
        result = -1;
      }
    } else {
      console.error('Long or Short ?');
    }

    return result;
  }

  getFixedTakeProfitpAndBreakEvenStopLoss(data: any, i: number, entryPrice: number, initialStopLoss: number, updatedStopLoss: number, takeProfit: number, targetRR: number): number {
    let result: number;
    const minTarget = 2;
    const step1 = entryPrice + (Math.abs(entryPrice - initialStopLoss)) * minTarget;

    if (updatedStopLoss < entryPrice && this.high(data, i, 0) >= step1 && targetRR > minTarget) {
      updatedStopLoss = entryPrice;
    }

    if (this.high(data, i, 0) >= takeProfit) {
      result = this.utils.getRiskReward(entryPrice, initialStopLoss, takeProfit);
      this.logEnable ? console.log("TP", data[i]) : NaN;
    } else if (this.low(data, i, 0) <= updatedStopLoss && updatedStopLoss === entryPrice) {
      result = 0;
      this.logEnable ? console.log("BE", data[i]) : NaN;
    } else if (this.low(data, i, 0) <= initialStopLoss) {
      result = -1;
      this.logEnable ? console.log("SL", data[i]) : NaN;
    }

    return result;
  }

  getTrailingStopLoss(data: any, i: number, entryPrice: number, initialStopLoss: number, updatedStopLoss: number): number {
    let result: number;

    if (this.low(data, i, 0) <= updatedStopLoss) {
      result = this.utils.getRiskReward(entryPrice, initialStopLoss, updatedStopLoss);
      this.logEnable ? console.log("SL", data[i]) : NaN;
    }

    return result;
  }

  getFixeTakeProfitAndTrailingStopLoss(data: any, i: number, entryPrice: number, initialStopLoss: number, updatedStopLoss: number, takeProfit: number): number {
    let result: number;

    if (this.high(data, i, 0) >= takeProfit) {
      result = this.utils.getRiskReward(entryPrice, initialStopLoss, takeProfit);
      this.logEnable ? console.log("TP", data[i]) : NaN;
    } else if (this.low(data, i, 0) <= updatedStopLoss) {
      result = this.utils.getRiskReward(entryPrice, initialStopLoss, updatedStopLoss);
      this.logEnable ? console.log("SL", data[i]) : NaN;
    }

    return result;
  }

  getHeikenAshi_Long(haData: any, data: any, i: number, entryPrice: number, initialStopLoss: number, currentCandle: any): number {
    let result: number;
    const step1 = entryPrice + (Math.abs(entryPrice - initialStopLoss)) * 2;
    const bull1 = haData[i - 1].close > haData[i - 1].open ? true : false; // A CHANGER
    const bear = haData[i].close < haData[i].open ? true : false;

    if (currentCandle.close <= initialStopLoss) {
      result = -1;
    } else if (currentCandle.close >= step1 && bull1 && bear) {
      result = this.utils.getRiskReward(entryPrice, initialStopLoss, currentCandle.close);
    }

    return result;
  }


  getHeikenAshi_Short(haData: any, data: any, i: number, entryPrice: number, initialStopLoss: number, currentCandle: any): number {
    let result: number;
    const step1 = entryPrice - (Math.abs(entryPrice - initialStopLoss)) * 2;
    const bear1 = haData[i - 1].close < haData[i - 1].open ? true : false;
    const bull = haData[i].close > haData[i].open ? true : false;

    if (currentCandle.close >= initialStopLoss) {
      result = -1;
    } else if (currentCandle.close <= step1 && bear1 && bull) {
      result = this.utils.getRiskReward(entryPrice, initialStopLoss, currentCandle.close);
    }

    return result;
  }

  updateStopLoss(data: any, i: number, entryPrice: number, initialStopLoss: number, updatedStopLoss: number, trailingNumber: number): number {
    if (trailingNumber > 1) {
      console.error("trailingNumber too big");
    }

    const step1 = entryPrice + (Math.abs(entryPrice - initialStopLoss)) * 2;
    const step2 = entryPrice + (Math.abs(entryPrice - initialStopLoss)) * 3;

    if (this.high(data, i, 0) >= step1 && updatedStopLoss < entryPrice) {
      updatedStopLoss = entryPrice;
      this.logEnable ? console.log("To BE", this.date(data, i, 0)) : NaN;
    }

    if (this.high(data, i, 0) >= step2 && entryPrice + (this.high(data, i, 0) - entryPrice) * trailingNumber > updatedStopLoss) {
      updatedStopLoss = entryPrice + (this.high(data, i, 0) - entryPrice) * trailingNumber;
      this.logEnable ? console.log("Trailing", this.date(data, i, 0)) : NaN;
    }

    return updatedStopLoss;
  }


  strategy_EngulfingRetested_Long(data: any, i: number, trigger: any, currentCandle: any): any {
    let sl: number;
    let entryPrice: number;
    let startTrade = false;
    const maxTimeSpent = 20;
    const lastTrigger = trigger[trigger.length - 1]; // VARIABLE LOCALE
    const candle0Size = Math.abs(this.close(data, i, 0) - this.open(data, i, 0));
    const candle1Size = Math.abs(this.close(data, i, 1) - this.open(data, i, 1));
    const liquidity = this.low(data, i, 0) < this.low(data, i, 1);
    const breakout = this.close(data, i, 0) > this.high(data, i, 1);
    const setup1 = !this.isUp(data, i, 1) && this.isUp(data, i, 0) && (candle0Size >= candle1Size * 2) /*&& liquidity*/ && breakout;

    if (lastTrigger && !lastTrigger.canceled) {
      const timeSpent = i - lastTrigger.time;
      if (timeSpent <= maxTimeSpent && currentCandle.close <= lastTrigger.candle1.open) {
        startTrade = true;
        sl = lastTrigger.candle1.low;
        entryPrice = lastTrigger.candle1.open;
        trigger[trigger.length - 1].canceled = true;
      } else if (timeSpent > maxTimeSpent) {
        trigger[trigger.length - 1].canceled = true;
      }
    } else if (setup1 && (lastTrigger === undefined || (lastTrigger.canceled && i !== lastTrigger.time))) {
      console.log('Bull engulfing', currentCandle.date, currentCandle.tickerTf);
      trigger.push({ time: i, canceled: false, candle1: data[i - 1], candle0: data[i] });
    }

    return {
      startTrade: startTrade,
      stopLoss: sl,
      entryPrice: entryPrice,
      trigger: trigger
    };
  }


  strategy_EngulfingRetested_Short(data: any, i: number, trigger: any, currentCandle: any): any {
    let sl: number;
    let entryPrice: number;
    let startTrade = false;
    const maxTimeSpent = 20;
    const lastTrigger = trigger[trigger.length - 1];
    const candle0Size = Math.abs(this.close(data, i, 0) - this.open(data, i, 0));
    const candle1Size = Math.abs(this.close(data, i, 1) - this.open(data, i, 1));
    const liquidity = this.high(data, i, 0) > this.high(data, i, 1);
    const breakout = this.close(data, i, 0) < this.low(data, i, 1);
    const setup1 = this.isUp(data, i, 1) && !this.isUp(data, i, 0) && (candle0Size >= candle1Size * 2) /*&& liquidity*/ && breakout;

    if (lastTrigger && !lastTrigger.canceled) {
      const timeSpent = i - lastTrigger.time;
      if (timeSpent <= maxTimeSpent && currentCandle.close >= lastTrigger.candle1.open) {
        startTrade = true;
        sl = lastTrigger.candle1.high;
        entryPrice = lastTrigger.candle1.open;
        trigger[trigger.length - 1].canceled = true;
      } else if (timeSpent > maxTimeSpent) {
        trigger[trigger.length - 1].canceled = true;
      }
    } else if (setup1 && (lastTrigger === undefined || (lastTrigger.canceled && i !== lastTrigger.time))) {
      console.log('Short engulfing', currentCandle.date, currentCandle.tickerTf);
      trigger.push({ time: i, canceled: false, candle1: data[i - 1], candle0: data[i] });
    }

    return {
      startTrade: startTrade,
      stopLoss: sl,
      entryPrice: entryPrice,
      trigger: trigger
    };
  }
}

export default new StrategiesService(new UtilsService());
