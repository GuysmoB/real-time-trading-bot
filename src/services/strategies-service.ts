import { CandleAbstract } from "../abstract/candleAbstract";
import { UtilsService } from "./utils-service";

export class StrategiesService extends CandleAbstract {

  constructor(private utils: UtilsService) {
    super();
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



  getFixedTakeProfitAndStopLoss(direction: string, tickerTfData: any, currentCandle: any): number {
    let result: number;

    if (direction === 'LONG') {
      const entryPrice = tickerTfData.entryPrice_Long;
      const initialStopLoss = tickerTfData.initialStopLoss_Long;
      const takeProfit = tickerTfData.takeProfit_Long;

      if (currentCandle.close >= takeProfit) {
        result = this.utils.getRiskReward(entryPrice, initialStopLoss, takeProfit);
      } else if (currentCandle.close <= initialStopLoss) {
        result = -1;
      }
    } else if (direction === 'SHORT') {
      const entryPrice = tickerTfData.entryPrice_Short;
      const initialStopLoss = tickerTfData.initialStopLoss_Short;
      const takeProfit = tickerTfData.takeProfit_Short;

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


  trigger_EngulfingRetested_Long(snapshot: any, currentCandle: any): any {
    if (snapshot && !snapshot.canceled && currentCandle.close <= snapshot.candle1.open) {
      return {
        stopLoss: snapshot.candle1.low,
        entryPrice: snapshot.candle1.open,
      };
    }
  }

  strategy_EngulfingRetested_Long(data: any, i: number, snapshot: any): any {
    if (data.length >= 2) {
      const candle0Size = Math.abs(this.close(data, i, 0) - this.open(data, i, 0));
      const candle1Size = Math.abs(this.close(data, i, 1) - this.open(data, i, 1));
      const isHigherHigh = this.high(data, i, 1) < this.high(data, i, 0); // anti gap
      //const isLongEnough0 = (candle0Size / atr[i]) > 0.6;
      //const isLongEnough1 = (candle1Size / atr[i]) > 0.1;
      const setup = !this.isUp(data, i, 1) && this.isUp(data, i, 0) && (candle0Size >= candle1Size * 3) && isHigherHigh;

      if (setup && (snapshot === undefined || (i !== snapshot.time))) {
        return {
          time: i,
          canceled: false,
          candle1: data[i - 1],
          candle0: data[i]
        };
      }
    }
  }


  strategy_EngulfingRetested_Short(data: any, i: number, snapshot: any): any {
    if (data.length >= 2) {
      const candle0Size = Math.abs(this.close(data, i, 0) - this.open(data, i, 0));
      const candle1Size = Math.abs(this.close(data, i, 1) - this.open(data, i, 1));
      const isLowerLow = this.low(data, i, 1) > this.low(data, i, 0); // anti gap
      //const isLongEnough0 = (candle0Size / atr[i]) > 0.6;
      //const isLongEnough1 = (candle1Size / atr[i]) > 0.1;
      const setup = this.isUp(data, i, 1) && !this.isUp(data, i, 0) && (candle0Size >= candle1Size * 3) && isLowerLow;

      if (setup && (snapshot === undefined || (i !== snapshot.time))) {
        return {
          time: i,
          canceled: false,
          candle1: data[i - 1],
          candle0: data[i]
        };
      }
    }
  }

  trigger_EngulfingRetested_Short(snapshot: any, currentCandle: any): any {
    if (snapshot && !snapshot.canceled && currentCandle.close >= snapshot.candle1.open) {
      return {
        stopLoss: snapshot.candle1.high,
        entryPrice: snapshot.candle1.open,
      };
    }
  }




}

export default new StrategiesService(new UtilsService());
