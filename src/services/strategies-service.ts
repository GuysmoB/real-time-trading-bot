import { CandleAbstract } from "../abstract/candleAbstract";
import { UtilsService } from "./utils-service";

export class StrategiesService extends CandleAbstract {
  
  constructor(private utils: UtilsService) {
    super();
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

  getFixedTakeProfitAndStopLoss(data: any, i: number, entryPrice: number, initialStopLoss: number, takeProfit: number): number {
    let result: number;

    if (this.low(data, i, 0) <= initialStopLoss) {
      result = -1;
      this.logEnable ? console.log("SL", data[i]) : NaN;
    } else if (this.high(data, i, 0) >= takeProfit) {
      result = this.utils.getRiskReward(entryPrice, initialStopLoss, takeProfit);
      this.logEnable ? console.log("TP", data[i]) : NaN;
    }

    return result;
  }

  getFixedTakeProfitpAndBreakEvenStopLoss(data: any, i: number, entryPrice: number, initialStopLoss: number, updatedStopLoss: number, takeProfit: number, targetRR: number): number {
    let result: number;
    const minTarget = 2;
    const step1 = entryPrice + (entryPrice - initialStopLoss) * minTarget;

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

  getHeikenAshi(haData: any, data: any, i: number, entryPrice: number, initialStopLoss: number): number {
    let result: number;
    const bull1 = haData[i - 1].close > haData[i - 1].open ? true : false;
    const bear = haData[i].close < haData[i].open ? true : false;

    if (this.low(data, i, 0) <= initialStopLoss) {
      result = -1;
    } else if (bull1 && bear) {
      result = this.utils.getRiskReward(entryPrice, initialStopLoss, this.close(data, i, 0));
    }

    return result;
  }

  updateStopLoss(data: any, i: number, entryPrice: number, initialStopLoss: number, updatedStopLoss: number, trailingNumber: number): number {
    if (trailingNumber > 1) {
      console.error("trailingNumber too big");
    }

    const step1 = entryPrice + (entryPrice - initialStopLoss) * 2;
    const step2 = entryPrice + (entryPrice - initialStopLoss) * 3;

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
}

export default new StrategiesService(new UtilsService());
