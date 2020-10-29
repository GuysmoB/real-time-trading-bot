// https://www.digitalocean.com/community/tutorials/setting-up-a-node-project-with-typescript
// https://github.com/nikvdp/pidcrypt/issues/5#issuecomment-511383690
// https://github.com/Microsoft/TypeScript/issues/17645#issuecomment-320556012
// https://github.com/gfiocco/node-ig-api#login
// cp custom-ig-index.js node_modules/node-ig-api/index.js

import { CandleAbstract } from "./abstract/candleAbstract";
import { StrategiesService } from "./services/strategies-service";
import { UtilsService } from "./services/utils-service";
import ig from "node-ig-api";

// VARIABLES
let allData = [];
let haData = [];
let winTrades = [];
let loseTrades = [];
let allTrades = [];


class App extends CandleAbstract {
  constructor(private utils: UtilsService, private stratService: StrategiesService) {
    super();
    this.init(allData);
  }

  /**
   * Point d'entrée.
   */
  async init(data: any): Promise<void> {
    try {
      await ig.login(true);
      //await ig.logout();
      //data = await this.utils.parseData('EURUSD', 'DAY', 5);

      const items = [
        'CHART:CS.D.EURGBP.CFD.IP:1MINUTE', 'CHART:CS.D.BITCOIN.CFD.IP:HOUR', 'CHART:CS.D.EURUSD.CFD.IP:1MINUTE', 'CHART:CS.D.GBPUSD.CFD.IP:1MINUTE',
        'CHART:CS.D.AUDUSD.CFD.IP:1MINUTE', 'CHART:CS.D.EURJPY.CFD.IP:1MINUTE', 'CHART:CS.D.USDCAD.CFD.IP:1MINUTE', 'CHART:CS.D.USDCHF.CFD.IP:1MINUTE',
        'CHART:CS.D.EURCHF.CFD.IP:1MINUTE', 'CHART:CS.D.GBPJPY.CFD.IP:1MINUTE', 'CHART:CS.D.EURCAD.CFD.IP:1MINUTE', 'CHART:CS.D.CADJPY.CFD.IP:1MINUTE',
        'CHART:CS.D.GBPCHF.CFD.IP:1MINUTE', 'CHART:CS.D.CHFJPY.CFD.IP:1MINUTE', 'CHART:CS.D.GBPCAD.CFD.IP:1MINUTE', 'CHART:CS.D.CADCHF.CFD.IP:1MINUTE',
        'CHART:CS.D.EURAUD.CFD.IP:1MINUTE', 'CHART:CS.D.AUDJPY.CFD.IP:1MINUTE', 'CHART:CS.D.AUDCAD.CFD.IP:1MINUTE', 'CHART:CS.D.AUDCHF.CFD.IP:1MINUTE',
        'CHART:CS.D.NZDUSD.CFD.IP:1MINUTE', 'CHART:CS.D.GBPNZD.CFD.IP:1MINUTE', 'CHART:CS.D.GBPAUD.CFD.IP:1MINUTE', 'CHART:CS.D.AUDNZD.CFD.IP:1MINUTE'];
      //const items = ['CHART:CS.D.EURGBP.CFD.IP:1MINUTE'];
      allData = this.utils.dataArrayBuilder(items, allData);

      ig.connectToLightstreamer();
      ig.subscribeToLightstreamer("MERGE", items, ['BID_OPEN', 'BID_HIGH', 'BID_LOW', 'BID_CLOSE', 'CONS_END'], 0.5);
      ig.lsEmitter.on("update", (streamData: any) => {
        const currentCandle = {
          open: parseFloat(streamData[2]),
          high: parseFloat(streamData[3]),
          low: parseFloat(streamData[4]),
          close: parseFloat(streamData[5]),
          date: new Date(),
          tickerTf: this.utils.getTickerTimeframe(streamData[1])
        };

        if (streamData[6] === '1') { // CONS_END
          allData[currentCandle.tickerTf].ohlc.push(currentCandle);
        }

        if (allData[currentCandle.tickerTf].ohlc.length > 0) {
          const res = this.runStrategy(currentCandle);
        }
      });
    } catch (error) {
      console.error(error);
    }
  }


  /**
   * Execution de la stratégie principale.
   */
  runStrategy(currentCandle: any) {
    // ATTENTION variable locales !!
    const data = allData[currentCandle.tickerTf].ohlc;
    const inLong = allData[currentCandle.tickerTf].inLong;
    const inShort = allData[currentCandle.tickerTf].inShort;
    const entryPrice_Long = allData[currentCandle.tickerTf].entryPrice_Long;
    const entryPrice_Short = allData[currentCandle.tickerTf].entryPrice_Short;
    const initialStopLoss_Long = allData[currentCandle.tickerTf].initialStopLoss_Long;
    const initialStopLoss_Short = allData[currentCandle.tickerTf].initialStopLoss_Short;
    const takeProfit_Long = allData[currentCandle.tickerTf].takeProfit_Long;
    const takeProfit_Short = allData[currentCandle.tickerTf].takeProfit_Short;
    const i = data.length - 1;
    haData = this.utils.setHeikenAshiData(data); // promise ? A optimiser

    let rr: number;
    if (inLong) {
      //rr = this.stratService.getHeikenAshi(haData, data, i, tickerTf.entryPrice_Long, tickerTf.initialStopLoss_Long, currentCandle);
      rr = this.stratService.getFixedTakeProfitAndStopLoss('LONG', data, i, entryPrice_Long, initialStopLoss_Long, takeProfit_Long, currentCandle);
      this.updateResults('LONG', rr, currentCandle);
    }
    if (inShort) {
      rr = this.stratService.getFixedTakeProfitAndStopLoss('SHORT', data, i, entryPrice_Short, initialStopLoss_Short, takeProfit_Short, currentCandle);
      this.updateResults('SHORT', rr, currentCandle);
    }

    

    if (!inLong) {
      //const res = this.stratService.strategy_LSD_Long(data, i);
      const res = this.stratService.strategy_live_test_Long(data, i, currentCandle);
      if (res.startTrade) {
        allData[currentCandle.tickerTf].inLong = true;
        allData[currentCandle.tickerTf].entryPrice_Long = res.entryPrice;
        allData[currentCandle.tickerTf].initialStopLoss_Long = allData[currentCandle.tickerTf].updatedStopLoss_Long = res.stopLoss;
        allData[currentCandle.tickerTf].takeProfit_Long = this.utils.round(res.entryPrice + (res.entryPrice - res.stopLoss) * 2, 5);

        if (this.logEnable) {
          console.log("--------");
          console.log("Long", data[i].tickerTf, data[i].date);
          console.log("entryPrice", allData[currentCandle.tickerTf].entryPrice_Long);
          console.log("stopLoss", allData[currentCandle.tickerTf].initialStopLoss_Long);
          console.log("takeProfit", allData[currentCandle.tickerTf].takeProfit_Long);
        }
      }
    } 
    
    if (!inShort) {
      const res = this.stratService.strategy_live_test_Short(data, i, currentCandle);
      if (res.startTrade) {
        allData[currentCandle.tickerTf].inShort = true;
        allData[currentCandle.tickerTf].entryPrice_Short = res.entryPrice;
        allData[currentCandle.tickerTf].initialStopLoss_Short = allData[currentCandle.tickerTf].updatedStopLoss_Short = res.stopLoss;
        allData[currentCandle.tickerTf].takeProfit_Short = this.utils.round(res.entryPrice + (res.entryPrice - res.stopLoss) * 2, 5);

        if (this.logEnable) {
          console.log("--------");
          console.log("Short", data[i].tickerTf, data[i].date);
          console.log("entryPrice", allData[currentCandle.tickerTf].entryPrice_Short);
          console.log("stopLoss", allData[currentCandle.tickerTf].initialStopLoss_Short);
          console.log("takeProfit", allData[currentCandle.tickerTf].takeProfit_Short);
        }
      }
    }
  }


  /**
   * Boucle principale avec itération de chaque bougie.
   */
  async runBacktest(data: any, arg: number) {
    let inLong = false;
    let trigger = [];
    let entryPrice: any;
    let initialStopLoss: any;
    let updatedStopLoss: any;
    let takeProfit: any;
    data = await this.utils.getDataFromFile();
    haData = this.utils.setHeikenAshiData(data); // promise ?

    const isTrailingStopLoss = false;
    const isFixedTakeProfitAndTrailingStopLoss = false;
    const isFixedTakeProfitAndStopLoss = false;
    const isFixedTakeProfitAndBreakEvenStopLoss = false;
    const isHeikenAshi = true;

    for (let i = 10; i < data.length; i++) { // for (let i = 3809; i < 4101; i++) {
      if (i === data.length - 1) {
        inLong = false;
      }

      let rr: number;
      if (inLong) {
        if (isFixedTakeProfitAndStopLoss) {
          //rr = this.stratService.getFixedTakeProfitAndStopLoss(data, i, entryPrice, initialStopLoss, takeProfit);
        } else if (isFixedTakeProfitAndBreakEvenStopLoss) {
          rr = this.stratService.getFixedTakeProfitpAndBreakEvenStopLoss(data, i, entryPrice, initialStopLoss, updatedStopLoss, takeProfit, arg);
        } else if (isTrailingStopLoss) {
          updatedStopLoss = this.stratService.updateStopLoss(data, i, entryPrice, initialStopLoss, updatedStopLoss, arg);
          rr = this.stratService.getTrailingStopLoss(data, i, entryPrice, initialStopLoss, updatedStopLoss);
        } else if (isFixedTakeProfitAndTrailingStopLoss) {
          updatedStopLoss = this.stratService.updateStopLoss(data, i, entryPrice, initialStopLoss, updatedStopLoss, 0.7);
          rr = this.stratService.getFixeTakeProfitAndTrailingStopLoss(data, i, entryPrice, initialStopLoss, updatedStopLoss, takeProfit);
        } else if (isHeikenAshi) {
          //rr = this.stratService.getHeikenAshi(haData, data, i, entryPrice, initialStopLoss, );
        }
      }

      if (rr !== undefined) {
        inLong = false;
        allTrades.push(rr);

        if (rr >= 0) {
          winTrades.push(rr);
        } else if (rr < 0) {
          loseTrades.push(rr);
        }
      }

      if (!inLong) {
        const res = this.stratService.strategy_LSD_Long(data, i);
        if (res.startTrade) {
          inLong = true;
          entryPrice = res.entryPrice;
          trigger = res.trigger;
          initialStopLoss = updatedStopLoss = res.stopLoss;
          takeProfit = this.utils.round(entryPrice + (entryPrice - initialStopLoss) * arg, 5);

          if (this.logEnable) {
            console.log("---");
            console.log("Open number", i);
            console.log("Entry data", data[i]);
            console.log("Candle number", i);
            console.log("entryPrice", entryPrice);
            console.log("init stopLoss", initialStopLoss);
            console.log("takeProfit", this.utils.round(takeProfit, 5));
          }
        }
      }
    } // Fin i array
    console.log("-------------");
    console.log("Trades : Gagnes / Perdus / Total", winTrades.length, loseTrades.length, winTrades.length + loseTrades.length);
    console.log("Total R:R", this.utils.round(loseTrades.reduce((a, b) => a + b, 0) + winTrades.reduce((a, b) => a + b, 0), 2));
    console.log("Avg R:R", this.utils.round(allTrades.reduce((a, b) => a + b, 0) / allTrades.length, 2));
    console.log("Winrate " + this.utils.round((winTrades.length / (loseTrades.length + winTrades.length)) * 100, 2) + "%");
  }


  /**
   * Update trades's state, global R:R and log.
   */
  updateResults(direction: string, rr: number, currentCandle: any) {
    if (rr !== undefined) {
      if (direction === 'LONG') {
        allData[currentCandle.tickerTf].inLong = false;
      } else if (direction === 'SHORT') {
        allData[currentCandle.tickerTf].inShort = false;
      } else {
        console.error('Long or short ?')
      }

      allTrades.push(rr);
      if (rr >= 0) {
        winTrades.push(rr);
      } else if (rr < 0) {
        loseTrades.push(rr);
      }
      console.log("---- UPDATED RESULTS ----");
      console.log("Last R:R", rr);
      console.log(direction, currentCandle.tickerTf);
      console.log("Trades : Gagnes / Perdus / Total", winTrades.length, loseTrades.length, winTrades.length + loseTrades.length);
      console.log("Total R:R", this.utils.round(loseTrades.reduce((a, b) => a + b, 0) + winTrades.reduce((a, b) => a + b, 0), 2));
      console.log("Avg R:R", this.utils.round(allTrades.reduce((a, b) => a + b, 0) / allTrades.length, 2));
      console.log("Winrate " + this.utils.round((winTrades.length / (loseTrades.length + winTrades.length)) * 100, 2) + "%");
    }
  }
}

const utilsService = new UtilsService();
new App(utilsService, new StrategiesService(utilsService));
