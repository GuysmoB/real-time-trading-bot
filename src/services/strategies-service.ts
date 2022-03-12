import { CandleAbstract } from "../abstract/candleAbstract";
import { UtilsService } from "./utils-service";

export class StrategiesService extends CandleAbstract {
  lookback = 1;

  constructor(private utils: UtilsService) {
    super();
  }

  async bullStrategy(haOhlc: any, i: number, ticker: string, tf: number, ftxApi: any, ratio: any) {
    let cond = true;
    for (let j = i - 1; j >= i - this.lookback; j--) {
      if (haOhlc[j]?.bull) {
        cond = false;
        break;
      }
    }

    const bigHaOhlc = await this.utils.getBigTimeframeHA(ticker, tf, ftxApi);

    return {
      startTrade: cond && bigHaOhlc[bigHaOhlc.length - 1].bull && haOhlc[i].bull /* && ratio >= 0 */,
      stopLoss: haOhlc[i - 1].low,
    };
  }
}

export default new StrategiesService(new UtilsService());
