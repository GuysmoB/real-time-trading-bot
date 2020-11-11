// https://www.digitalocean.com/community/tutorials/setting-up-a-node-project-with-typescript
// https://github.com/nikvdp/pidcrypt/issues/5#issuecomment-511383690
// https://github.com/Microsoft/TypeScript/issues/17645#issuecomment-320556012
// https://github.com/gfiocco/node-ig-api#login
// cp custom-ig-index.js node_modules/node-ig-api/index.js

import { CandleAbstract } from './abstract/candleAbstract';
import { StrategiesService } from './services/strategies-service';
import { UtilsService } from './services/utils-service';
import ig from 'node-ig-api';

// VARIABLES
let allData = [];
let winTrades = [];
let loseTrades = [];
let allTrades = [];
let haData = [];

/*const items = [
  'CHART:CS.D.EURGBP.CFD.IP:1MINUTE', 'CHART:CS.D.BITCOIN.CFD.IP:1MINUTE', 'CHART:CS.D.EURUSD.CFD.IP:1MINUTE', 'CHART:CS.D.GBPUSD.CFD.IP:1MINUTE',
  'CHART:CS.D.AUDUSD.CFD.IP:1MINUTE', 'CHART:CS.D.EURJPY.CFD.IP:1MINUTE', 'CHART:CS.D.USDCAD.CFD.IP:1MINUTE', 'CHART:CS.D.USDCHF.CFD.IP:1MINUTE',
  'CHART:CS.D.EURCHF.CFD.IP:1MINUTE', 'CHART:CS.D.GBPJPY.CFD.IP:1MINUTE', 'CHART:CS.D.EURCAD.CFD.IP:1MINUTE', 'CHART:CS.D.CADJPY.CFD.IP:1MINUTE',
  'CHART:CS.D.GBPCHF.CFD.IP:1MINUTE', 'CHART:CS.D.CHFJPY.CFD.IP:1MINUTE', 'CHART:CS.D.GBPCAD.CFD.IP:1MINUTE', 'CHART:CS.D.CADCHF.CFD.IP:1MINUTE',
  'CHART:CS.D.EURAUD.CFD.IP:1MINUTE', 'CHART:CS.D.AUDJPY.CFD.IP:1MINUTE', 'CHART:CS.D.AUDCAD.CFD.IP:1MINUTE', 'CHART:CS.D.AUDCHF.CFD.IP:1MINUTE',
  'CHART:CS.D.NZDUSD.CFD.IP:1MINUTE', 'CHART:CS.D.GBPNZD.CFD.IP:1MINUTE', 'CHART:CS.D.GBPAUD.CFD.IP:1MINUTE', 'CHART:CS.D.AUDNZD.CFD.IP:1MINUTE'];*/
const items = ['MARKET:CS.D.EURGBP.CFD.IP', 'MARKET:CS.D.USDGBP.CFD.IP'];

class App extends CandleAbstract {
  constructor(private utils: UtilsService, private stratService: StrategiesService) {
    super();
    allData = this.utils.dataArrayBuilder(items, allData);
    this.init();
  }


  /**
   * Point d'entrée.
   */
  async init(): Promise<void> {
    try {
      await ig.login(true);
      //await ig.logout();

      ig.connectToLightstreamer();
      ig.subscribeToLightstreamer('MERGE', items, ['BID_OPEN', 'BID_HIGH', 'BID_LOW', 'BID_CLOSE', 'CONS_END', 'OFR_OPEN', 'OFR_HIGH', 'OFR_LOW', 'OFR_CLOSE',], 1);
      ig.lsEmitter.on('update', (streamData: any) => {
        const currentCandle = {
          date: new Date(),
          tickerTf: this.utils.getTickerTimeframe(streamData[1]),
          open: this.utils.round(parseFloat(streamData[2]) + (parseFloat(streamData[7]) - parseFloat(streamData[2])) / 2, 5),
          high: this.utils.round(parseFloat(streamData[3]) + (parseFloat(streamData[8]) - parseFloat(streamData[3])) / 2, 5),
          low: this.utils.round(parseFloat(streamData[4]) + (parseFloat(streamData[9]) - parseFloat(streamData[4])) / 2, 5),
          close: this.utils.round(parseFloat(streamData[5]) + (parseFloat(streamData[10]) - parseFloat(streamData[5])) / 2, 5)
        };

        if (streamData[6] === '1') { // CONS_END
          allData[currentCandle.tickerTf].ohlc.push(currentCandle);
        }

        if (allData[currentCandle.tickerTf].ohlc.length > 0) {
          //const res = this.runStrategy(currentCandle);
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
    let rr: number;
    const rrTarget = 2;
    const tickerTf = currentCandle.tickerTf;
    const data = allData[tickerTf].ohlc;
    const i = allData[tickerTf].ohlc.length - 1;
    const inLong = this.getDirection_Long(tickerTf);
    const inShort = this.getDirection_Short(tickerTf);

    if (inLong) {
      rr = this.stratService.getFixedTakeProfitAndStopLoss('LONG', this.getTickerTfData(tickerTf), currentCandle);
      this.updateResults('LONG', rr, tickerTf);
    } else {
      const isSetup = this.stratService.strategy_EngulfingRetested_Long(data, i, this.getSnapshot_Long(tickerTf));
      if (isSetup) {
        this.setSnapshot_Long(tickerTf, isSetup);
      }

      const res = this.stratService.trigger_EngulfingRetested_Long(this.getSnapshot_Long(tickerTf), currentCandle);
      if (res) {
        this.setDirection_Long(tickerTf, true);
        this.setTriggerCanceled_Long(tickerTf, true);
        this.setEntryPrice_Long(tickerTf, this.utils.round(res.entryPrice, 5));
        this.setStopLoss_Long(tickerTf, this.utils.round(res.stopLoss, 5));
        this.setTakeProfit_Long(tickerTf, this.utils.round(res.entryPrice + (res.entryPrice - res.stopLoss) * rrTarget, 5));

        if (this.logEnable) {
          console.log('--------');
          console.log('Bullish Engulfing', data[this.getSnapshot_Long(tickerTf).time].date);
          console.log('Long', tickerTf, currentCandle.date);
          console.log('entryPrice', this.getEntryPrice_Long(tickerTf));
          console.log('stopLoss', this.getStopLoss_Long(tickerTf));
          console.log('takeProfit', this.getTakeProfit_Long(tickerTf));
        }
      }
    }

    if (inShort) {
      rr = this.stratService.getFixedTakeProfitAndStopLoss('SHORT', this.getTickerTfData(tickerTf), currentCandle);
      this.updateResults('SHORT', rr, tickerTf);
    } else {
      const isSetup = this.stratService.strategy_EngulfingRetested_Short(data, i, this.getSnapshot_Short(tickerTf));
      if (isSetup) {
        this.setSnapshot_Short(tickerTf, isSetup);
      }

      const res = this.stratService.trigger_EngulfingRetested_Short(this.getSnapshot_Short(tickerTf), currentCandle);
      if (res) {
        this.setDirection_Short(tickerTf, true);
        this.setTriggerCanceled_Short(tickerTf, true);
        this.setEntryPrice_Short(tickerTf, this.utils.round(res.entryPrice, 5));
        this.setStopLoss_Short(tickerTf, this.utils.round(res.stopLoss, 5));
        this.setTakeProfit_Short(tickerTf, this.utils.round(res.entryPrice + (res.entryPrice - res.stopLoss) * rrTarget, 5));

        if (this.logEnable) {
          console.log('--------');
          console.log('Bearish Engulfing', data[this.getSnapshot_Short(tickerTf).time].date);
          console.log('Short', tickerTf, currentCandle.date);
          console.log('entryPrice', this.getEntryPrice_Short(tickerTf));
          console.log('stopLoss', this.getStopLoss_Short(tickerTf));
          console.log('takeProfit', this.getTakeProfit_Short(tickerTf));
        }
      }
    }
  }


  /**
   * Update trades's state, global R:R and log.
   */
  updateResults(direction: string, rr: number, tickerTf: any) {
    if (rr !== undefined) {
      if (direction === 'LONG') {
        allData[tickerTf].inLong = false;
      } else if (direction === 'SHORT') {
        allData[tickerTf].inShort = false;
      } else {
        console.error('Long or short ?')
      }

      allTrades.push(rr);
      if (rr >= 0) {
        winTrades.push(rr);
      } else if (rr < 0) {
        loseTrades.push(rr);
      }
      console.log('-------------------------');
      console.log('---- UPDATED RESULTS ----');
      console.log('-------------------------');
      console.log('Last R:R', rr);
      console.log(direction, tickerTf, new Date());
      console.log('Trades : Gagnes / Perdus / Total', winTrades.length, loseTrades.length, winTrades.length + loseTrades.length);
      console.log('Total R:R', this.utils.round(loseTrades.reduce((a, b) => a + b, 0) + winTrades.reduce((a, b) => a + b, 0), 2));
      console.log('Avg R:R', this.utils.round(allTrades.reduce((a, b) => a + b, 0) / allTrades.length, 2));
      console.log('Winrate ' + this.utils.round((winTrades.length / (loseTrades.length + winTrades.length)) * 100, 2) + '%');
    }
  }



  getTickerTfData(tickerTf: any) {
    return allData[tickerTf];
  }


  getDirection_Long(tickerTf: any) {
    return allData[tickerTf].inLong;
  }
  getEntryPrice_Long(tickerTf: any) {
    return allData[tickerTf].entryPrice_Long;
  }
  getStopLoss_Long(tickerTf: any) {
    return allData[tickerTf].initialStopLoss_Long;
  }
  getTakeProfit_Long(tickerTf: any) {
    return allData[tickerTf].takeProfit_Long;
  }
  getSnapshot_Long(tickerTf: any) {
    return allData[tickerTf].snapshot_Long;
  }

  setSnapshot_Long(tickerTf: any, value: any) {
    allData[tickerTf].snapshot_Long = value;
  }
  setTriggerCanceled_Long(tickerTf: any, value: boolean) {
    allData[tickerTf].snapshot_Long.canceled = value;
  }
  setDirection_Long(tickerTf: any, value: boolean) {
    allData[tickerTf].inLong = value;
  }
  setEntryPrice_Long(tickerTf: any, value: number) {
    allData[tickerTf].entryPrice_Long = value;
  }
  setStopLoss_Long(tickerTf: any, value: number) {
    allData[tickerTf].initialStopLoss_Long = value;
  }
  setTakeProfit_Long(tickerTf: any, value: number) {
    allData[tickerTf].takeProfit_Long = value;
  }






  getDirection_Short(tickerTf: any) {
    return allData[tickerTf].inShort;
  }
  getEntryPrice_Short(tickerTf: any) {
    return allData[tickerTf].entryPrice_Short;
  }
  getStopLoss_Short(tickerTf: any) {
    return allData[tickerTf].initialStopLoss_Short;
  }
  getTakeProfit_Short(tickerTf: any) {
    return allData[tickerTf].takeProfit_Short;
  }
  getSnapshot_Short(tickerTf: any) {
    return allData[tickerTf].snapshot_Short;
  }

  setSnapshot_Short(tickerTf: any, value: any) {
    allData[tickerTf].snapshot_Short = value;
  }
  setTriggerCanceled_Short(tickerTf: any, value: boolean) {
    allData[tickerTf].snapshot_Short.canceled = value;
  }
  setDirection_Short(tickerTf: any, value: boolean) {
    allData[tickerTf].inShort = value;
  }
  setEntryPrice_Short(tickerTf: any, value: number) {
    allData[tickerTf].entryPrice_Short = value;
  }
  setStopLoss_Short(tickerTf: any, value: number) {
    allData[tickerTf].initialStopLoss_Short = value;
  }
  setTakeProfit_Short(tickerTf: any, value: number) {
    allData[tickerTf].takeProfit_Short = value;
  }
}

const utilsService = new UtilsService();
new App(utilsService, new StrategiesService(utilsService));
