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

const items = [
  'CHART:CS.D.EURGBP.CFD.IP:1MINUTE', 'CHART:CS.D.BITCOIN.CFD.IP:1MINUTE', 'CHART:CS.D.EURUSD.CFD.IP:1MINUTE', 'CHART:CS.D.GBPUSD.CFD.IP:1MINUTE',
  'CHART:CS.D.AUDUSD.CFD.IP:1MINUTE', 'CHART:CS.D.EURJPY.CFD.IP:1MINUTE', 'CHART:CS.D.USDCAD.CFD.IP:1MINUTE', 'CHART:CS.D.USDCHF.CFD.IP:1MINUTE',
  'CHART:CS.D.EURCHF.CFD.IP:1MINUTE', 'CHART:CS.D.GBPJPY.CFD.IP:1MINUTE', 'CHART:CS.D.EURCAD.CFD.IP:1MINUTE', 'CHART:CS.D.CADJPY.CFD.IP:1MINUTE',
  'CHART:CS.D.GBPCHF.CFD.IP:1MINUTE', 'CHART:CS.D.CHFJPY.CFD.IP:1MINUTE', 'CHART:CS.D.GBPCAD.CFD.IP:1MINUTE', 'CHART:CS.D.CADCHF.CFD.IP:1MINUTE',
  'CHART:CS.D.EURAUD.CFD.IP:1MINUTE', 'CHART:CS.D.AUDJPY.CFD.IP:1MINUTE', 'CHART:CS.D.AUDCAD.CFD.IP:1MINUTE', 'CHART:CS.D.AUDCHF.CFD.IP:1MINUTE',
  'CHART:CS.D.NZDUSD.CFD.IP:1MINUTE', 'CHART:CS.D.GBPNZD.CFD.IP:1MINUTE', 'CHART:CS.D.GBPAUD.CFD.IP:1MINUTE', 'CHART:CS.D.AUDNZD.CFD.IP:1MINUTE'];
//const items = ['CHART:CS.D.EURGBP.CFD.IP:1MINUTE'];

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
      ig.subscribeToLightstreamer('MERGE', items, ['BID_OPEN', 'BID_HIGH', 'BID_LOW', 'BID_CLOSE', 'CONS_END', 'OFR_OPEN', 'OFR_HIGH', 'OFR_LOW', 'OFR_CLOSE',], 2);
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
    let rr: number;
    const data = allData[currentCandle.tickerTf].ohlc;
    const i = allData[currentCandle.tickerTf].ohlc.length - 1;
    const inLong = allData[currentCandle.tickerTf].inLong;
    const inShort = allData[currentCandle.tickerTf].inShort;
    const entryPrice_Long = allData[currentCandle.tickerTf].entryPrice_Long;
    const entryPrice_Short = allData[currentCandle.tickerTf].entryPrice_Short;
    const initialStopLoss_Long = allData[currentCandle.tickerTf].initialStopLoss_Long;
    const initialStopLoss_Short = allData[currentCandle.tickerTf].initialStopLoss_Short;
    const takeProfit_Long = allData[currentCandle.tickerTf].takeProfit_Long;
    const takeProfit_Short = allData[currentCandle.tickerTf].takeProfit_Short;
    const trigger_Long = allData[currentCandle.tickerTf].trigger_Long;
    const trigger_Short = allData[currentCandle.tickerTf].trigger_Short;

    if (inLong) {
      rr = this.stratService.getFixedTakeProfitAndStopLoss('LONG', data, i, entryPrice_Long, initialStopLoss_Long, takeProfit_Long, currentCandle);
      this.updateResults('LONG', rr, currentCandle);
    } else {
      const res = this.stratService.strategy_EngulfingRetested_Long(data, i, trigger_Long, currentCandle);
      allData[currentCandle.tickerTf].trigger_Long = res.trigger;
      if (res.startTrade) {
        allData[currentCandle.tickerTf].inLong = true;
        allData[currentCandle.tickerTf].entryPrice_Long = this.utils.round(res.entryPrice, 5);
        allData[currentCandle.tickerTf].initialStopLoss_Long = allData[currentCandle.tickerTf].updatedStopLoss_Long = this.utils.round(res.stopLoss, 5);
        allData[currentCandle.tickerTf].takeProfit_Long = this.utils.round(res.entryPrice + (res.entryPrice - res.stopLoss) * 2, 5);
        if (this.logEnable) {
          console.log('--------');
          console.log('Long', data[i].tickerTf, data[i].date);
          console.log('entryPrice', allData[currentCandle.tickerTf].entryPrice_Long);
          console.log('stopLoss', allData[currentCandle.tickerTf].initialStopLoss_Long);
          console.log('takeProfit', allData[currentCandle.tickerTf].takeProfit_Long);
        }
      }
    }

    if (inShort) {
      rr = this.stratService.getFixedTakeProfitAndStopLoss('SHORT', data, i, entryPrice_Short, initialStopLoss_Short, takeProfit_Short, currentCandle);
      this.updateResults('SHORT', rr, currentCandle);
    } else {
      const res = this.stratService.strategy_EngulfingRetested_Short(data, i, trigger_Short, currentCandle);
      allData[currentCandle.tickerTf].trigger_Short = res.trigger;
      if (res.startTrade) {
        allData[currentCandle.tickerTf].inShort = true;
        allData[currentCandle.tickerTf].entryPrice_Short = this.utils.round(res.entryPrice, 5);
        allData[currentCandle.tickerTf].initialStopLoss_Short = allData[currentCandle.tickerTf].updatedStopLoss_Short = this.utils.round(res.stopLoss, 5);
        allData[currentCandle.tickerTf].takeProfit_Short = this.utils.round(res.entryPrice + (res.entryPrice - res.stopLoss) * 2, 5);
        if (this.logEnable) {
          console.log('--------');
          console.log('Short', data[i].tickerTf, data[i].date);
          console.log('entryPrice', allData[currentCandle.tickerTf].entryPrice_Short);
          console.log('stopLoss', allData[currentCandle.tickerTf].initialStopLoss_Short);
          console.log('takeProfit', allData[currentCandle.tickerTf].takeProfit_Short);
        }
      }
    }
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
      console.log('-------------------------');
      console.log('---- UPDATED RESULTS ----');
      console.log('-------------------------');
      console.log('Last R:R', rr);
      console.log(direction, currentCandle.tickerTf, new Date());
      console.log('Trades : Gagnes / Perdus / Total', winTrades.length, loseTrades.length, winTrades.length + loseTrades.length);
      console.log('Total R:R', this.utils.round(loseTrades.reduce((a, b) => a + b, 0) + winTrades.reduce((a, b) => a + b, 0), 2));
      console.log('Avg R:R', this.utils.round(allTrades.reduce((a, b) => a + b, 0) / allTrades.length, 2));
      console.log('Winrate ' + this.utils.round((winTrades.length / (loseTrades.length + winTrades.length)) * 100, 2) + '%');
    }
  }
}

const utilsService = new UtilsService();
new App(utilsService, new StrategiesService(utilsService));
