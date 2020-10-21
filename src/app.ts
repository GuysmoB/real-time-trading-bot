// https://www.digitalocean.com/community/tutorials/setting-up-a-node-project-with-typescript
// https://github.com/nikvdp/pidcrypt/issues/5#issuecomment-511383690
// https://github.com/Microsoft/TypeScript/issues/17645#issuecomment-320556012
// https://github.com/wagerfield/ig-api#api-constructor
import IG from 'ig-api';
import { CandleAbstract } from './abstract/candleAbstract';
import { StrategiesService } from './services/strategies-service';
import { UtilsService } from './services/utils-service';

// CONNECTION
const isDemo = false;
const apiKey = 'f20188c382a95fee986b38bc2f40b5c94aebbea9';
const username = 'guysmalerie';
const password = 'lQxTyEbfn73fgbwKMQ1a';

// VARIABLES
let data = [];
let haData = [];
let winTrades = [];
let loseTrades = [];
let allTrades = [];
const ig = new IG(apiKey, isDemo)

class App extends CandleAbstract {

    constructor(private utils: UtilsService, private stratService: StrategiesService) {
      super();
      this.init();  
    }

    async init(): Promise<void> {
        try {
            await ig.login(username, password);
            //data = await this.parseData(ig, 'DAY', 200);

            

          } catch (error) {
            console.error(error)
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

    for (let i = 10; i < data.length; i++) {       // for (let i = 3809; i < 4101; i++) {
      if (i === (data.length - 1)) {
        inLong = false;
      }

      let rr: number;
      if (inLong) {
        if (isFixedTakeProfitAndStopLoss) {
          rr = this.stratService.getFixedTakeProfitAndStopLoss(data, i, entryPrice, initialStopLoss, takeProfit);
        } else if (isFixedTakeProfitAndBreakEvenStopLoss) {
          rr = this.stratService.getFixedTakeProfitpAndBreakEvenStopLoss(data, i, entryPrice, initialStopLoss, updatedStopLoss, takeProfit, arg);
        } else if (isTrailingStopLoss) {
          updatedStopLoss = this.stratService.updateStopLoss(data, i, entryPrice, initialStopLoss, updatedStopLoss, arg);
          rr = this.stratService.getTrailingStopLoss(data, i, entryPrice, initialStopLoss, updatedStopLoss);
        } else if (isFixedTakeProfitAndTrailingStopLoss) {
          updatedStopLoss = this.stratService.updateStopLoss(data, i, entryPrice, initialStopLoss, updatedStopLoss, 0.7);
          rr = this.stratService.getFixeTakeProfitAndTrailingStopLoss(data, i, entryPrice, initialStopLoss, updatedStopLoss, takeProfit);
        } else if (isHeikenAshi) {
          rr = this.stratService.getHeikenAshi(haData, data, i, entryPrice, initialStopLoss);
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
            console.log('---');
            console.log('Open number', i);
            console.log('Entry data', data[i]);
            console.log('Candle number', i);
            console.log('entryPrice', entryPrice);
            console.log('init stopLoss', initialStopLoss);
            console.log('takeProfit', this.utils.round(takeProfit, 5));
          }
        }
      }
    } // Fin i array
    console.log('-------------');
    console.log('Trades : Gagnes / Perdus / Total', winTrades.length, loseTrades.length, winTrades.length + loseTrades.length);
    console.log('Total R:R', this.utils.round(loseTrades.reduce((a, b) => a + b, 0) + winTrades.reduce((a, b) => a + b, 0), 2));
    console.log('Avg R:R', this.utils.round(allTrades.reduce((a, b) => a + b, 0) / allTrades.length, 2));
    console.log('Winrate ' + this.utils.round((winTrades.length / (loseTrades.length + winTrades.length)) * 100, 2) + '%');
  }

    
}

const utilsService = new UtilsService();
new App(utilsService, new StrategiesService(utilsService));