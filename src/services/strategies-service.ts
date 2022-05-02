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

    const ratioLookback = 10;
    let isBigRatio = false;
    let isBigEcart = false;

    if (ratios.length > 0) {
      for (let j = ratios.length - 1; j > ratios.length - 1 - ratioLookback; j--) {
        if ((ticker === "BULL" && ratios[j]?.ratio >= 5) || (ticker === "BEAR" && ratios[j]?.ratio <= -5)) {
          isBigRatio = true;
          break;
        }
      }

      for (let j = ratios.length - 1; j > ratios.length - 1 - ratioLookback; j--) {
        if ((ticker === "BULL" && ratios[j]?.ecart >= 10) || (ticker === "BEAR" && ratios[j]?.ecart <= -10)) {
          isBigEcart = true;
          break;
        }
      }
    }

    if (isBigEcart && isBigRatio) console.log(ratios[ratios.length - 1]);
    return {
      startTrade: cond && haOhlc[i].bull && isBigRatio && isBigEcart,
      stopLoss: this.utils.lowest(haOhlc, i, "low", 5), //haOhlc[i - 1].low
    };
  }
}

export default new StrategiesService(new UtilsService());
