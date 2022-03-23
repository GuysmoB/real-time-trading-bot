import { CandleAbstract } from "../abstract/candleAbstract";
import { UtilsService } from "./utils-service";

export class StrategiesService extends CandleAbstract {
  constructor(private utils: UtilsService) {
    super();
  }

  async bullStrategy(haOhlc: any, i: number, ticker: string, ratios: any) {
    const lookback = 1;
    let cond = true;
    for (let j = i - 1; j >= i - lookback; j--) {
      if (haOhlc[j]?.bull) {
        cond = false;
        break;
      }
    }

    const ratioLookback = 6;
    let cond2 = false;
    if (ratios.length >= ratioLookback) {
      for (let j = ratios.length - 1; j > ratios.length - 1 - ratioLookback; j--) {
        if ((ticker === "BULL" && ratios[j] >= 25) || (ticker === "BEAR" && ratios[j] <= -25)) {
          cond2 = true;
          break;
        }
      }
    }

    return {
      startTrade: cond && haOhlc[i].bull && cond2,
      stopLoss: this.utils.lowest(haOhlc, i, "low", 5), //haOhlc[i - 1].low
    };
  }
}

export default new StrategiesService(new UtilsService());
