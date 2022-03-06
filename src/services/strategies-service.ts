import { CandleAbstract } from "../abstract/candleAbstract";
import { UtilsService } from "./utils-service";

export class StrategiesService extends CandleAbstract {
  lookback = 1;

  constructor(private utils: UtilsService) {
    super();
  }

  bullStrategy(haOhlc: any, data: any, i: number, ratio: any): any {
    let cond = true;
    for (let j = i - 1; j >= i - this.lookback; j--) {
      if (haOhlc[j].bull) {
        cond = false;
        break;
      }
    }

    return {
      startTrade: cond && haOhlc[i].bull /* && ratio >= 0 */,
      stopLoss: haOhlc[i].low,
      entryPrice: this.close(data, i, 0),
    };
  }

  bearStrategy(haOhlc: any, data: any, i: number, ratio: any): any {
    let cond = true;
    for (let j = i - 1; j >= i - this.lookback; j--) {
      if (haOhlc[j].bear) {
        cond = false;
        break;
      }
    }

    return {
      startTrade: cond && haOhlc[i].bear /*  && ratio < 0 */,
      stopLoss: haOhlc[i].high,
      entryPrice: this.close(data, i, 0),
    };
  }
}

export default new StrategiesService(new UtilsService());
