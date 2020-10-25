// https://www.digitalocean.com/community/tutorials/setting-up-a-node-project-with-typescript
// https://github.com/nikvdp/pidcrypt/issues/5#issuecomment-511383690
// https://github.com/Microsoft/TypeScript/issues/17645#issuecomment-320556012
// https://github.com/wagerfield/ig-api#api-constructor
// https://www.youtube.com/watch?v=Uv0jcZNYh5Q    candlestick builder
// https://github.com/gfiocco/node-ig-api#login

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
let inLong = false;
let entryPrice: any;
let initialStopLoss: any;
let updatedStopLoss: any;

// CANDLESTICK BUILDER
const minutesProcessed = [];
let minutesCandlesticks = [];
let currentTick: number;
let previousTick: number;

class App extends CandleAbstract {
  constructor(private utils: UtilsService, private stratService: StrategiesService) {
    super();
    this.init(allData);
  }

  formatDate(date: Date) {
    const hours = date.getHours();
    const minutes = "0" + date.getMinutes();
    const second = "0" + date.getSeconds();
    return hours + ':' + minutes.substr(-2)/* + ':' + second.substr(-2)*/; 
  }

  async init(data: any): Promise<void> {
    try {
      await ig.login(true);
      //await ig.logout();
      //data = await this.utils.parseData('EURUSD', 'DAY', 5);
      //console.log(data)

      const items = ["CHART:CS.D.BITCOIN.CFD.IP:1MINUTE"];

      // Received tick [ 1603457557675, 'CS.D.EURGBP.CFD.IP', '0.90538' ]
      ig.connectToLightstreamer();
      ig.subscribeToLightstreamer("MERGE", items, ['BID_OPEN', 'BID_HIGH', 'BID_LOW', 'BID_CLOSE', 'CONS_END'], 0.5);
      ig.lsEmitter.on("update", (streamData: any) => {
        const currentCandle = this.utils.candlestickBuilder(streamData);
        if (currentCandle) {
          data.push(currentCandle);
          console.log(currentCandle, data.length)
        }
        
        //this.runStrategy(data);

        
        /*const time = streamData[0];
        const ticker = streamData[1];
        const price = streamData[2];
        previousTick = currentTick;
        currentTick = price;

        if (time instanceof Date) { // avoid first line [ 'RUN_TIME', 'EPIC', 'BID' ] CS.D.EURGBP.CFD.IP
          console.log('Received tick', time, price);
          let tickDate = this.formatDate(time);

          if (!minutesProcessed.find(element => element === tickDate)) {
            minutesProcessed.push(tickDate);

            if (minutesCandlesticks.length > 0) {
              minutesCandlesticks[minutesCandlesticks.length - 1].close = price;
              console.log('Candlestick', minutesCandlesticks)
            } 

            minutesCandlesticks.push({
              date: tickDate,
              open: price,
              high: price,
              low: price,
            });
          }
          
          if (minutesCandlesticks.length > 0) {
            let currentCandlestick = minutesCandlesticks[minutesCandlesticks.length - 1];
            if (price > currentCandlestick.high) {
              currentCandlestick.high = price; 
            }
            if (price < currentCandlestick.low) {
              currentCandlestick.low = price; 
            }
          }
        }*/
        
      });
    } catch (error) {
      console.error(error);
    }
  }


  /**
   * Execution de la stratégie principale.
   */
  runStrategy(data: any) {
    const i = data.length - 1;
    haData = this.utils.setHeikenAshiData(data); // promise ? A optimiser

    let rr: number;
    if (inLong) {
      rr = this.stratService.getHeikenAshi(haData, data, i, entryPrice, initialStopLoss);
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
        initialStopLoss = updatedStopLoss = res.stopLoss;

        if (this.logEnable) {
          console.log("--------");
          console.log("Entry data", data[i]);
          console.log("entryPrice", entryPrice);
          console.log("init stopLoss", initialStopLoss);
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
}

const utilsService = new UtilsService();
new App(utilsService, new StrategiesService(utilsService));
