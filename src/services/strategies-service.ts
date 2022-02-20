import { CandleAbstract } from "../abstract/candleAbstract";
import { UtilsService } from "./utils-service";

export class StrategiesService extends CandleAbstract {

  lookback = 1;

  constructor(private utils: UtilsService) {
    super();
  }


  bullStrategy(haOhlc: any, data: any, i: number, ratio: any): any {
    let cond = true;
    for (let j = (i - 1); j >= (i - this.lookback); j--) {
      if (haOhlc[j].bull) {
        cond = false;
        break;
      }
    }

    return {
      startTrade: cond && haOhlc[i].bull  /* && ratio >= 0 */,
      stopLoss: this.utils.lowest(data, i - 1, 'low', 1) + 5,
      entryPrice: this.close(data, i, 0) + 5
    };
  }


  bearStrategy(haOhlc: any, data: any, i: number, ratio: any): any {
    let cond = true;
    for (let j = (i - 1); j >= (i - this.lookback); j--) {
      if (haOhlc[j].bear) {
        cond = false;
        break;
      }
    }

    return {
      startTrade: cond && haOhlc[i].bear/*  && ratio < 0 */,
      stopLoss: this.utils.highest(data, i - 1, 'high', 1) - 5,
      entryPrice: this.close(data, i, 0) - 5
    };
  }
}

export default new StrategiesService(new UtilsService());
