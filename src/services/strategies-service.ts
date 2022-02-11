import { CandleAbstract } from "../abstract/candleAbstract";
import { UtilsService } from "./utils-service";

export class StrategiesService extends CandleAbstract {

  lookback = 4;

  constructor(private utils: UtilsService) {
    super();
  }


  bullStrategy(haOhlc: any, i: number): any {
    let cond = true;
    for (let j = (i - 1); j >= (i - this.lookback); j--) {
      const ha = haOhlc[j];
      if (ha.bull) {
        cond = false;
        break;
      }
    }

    if (cond && haOhlc[i].bull) {
      console.log('Entry bull setup', this.utils.getDate());
      return true;
    } else {
      return false;
    }
  }


  bearStrategy(haOhlc: any, i: number): any {
    let cond = true;
    for (let j = (i - 1); j >= (i - this.lookback); j--) {
      const ha = haOhlc[j];
      if (ha.bear) {
        cond = false;
        break;
      }
    }

    if (cond && haOhlc[i].bear) {
      console.log('Entry bear setup', this.utils.getDate());
      return true;
    } else {
      return false;
    }
  }
}

export default new StrategiesService(new UtilsService());
