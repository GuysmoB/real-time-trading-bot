import { ApiService } from './services/api.service';
// https://www.digitalocean.com/community/tutorials/setting-up-a-node-project-with-typescript
// https://github.com/nikvdp/pidcrypt/issues/5#issuecomment-511383690
// https://github.com/Microsoft/TypeScript/issues/17645#issuecomment-320556012

process.env.NTBA_FIX_319 = "1"; // disable Telegram error
import { IndicatorsService } from "./services/indicators.service";
import { CandleAbstract } from "./abstract/candleAbstract";
import { StrategiesService } from "./services/strategies-service";
import { UtilsService } from "./services/utils-service";
import { Config } from "./config";
import firebase from "firebase";
import TelegramBot from "node-telegram-bot-api";
//import WebSocket from "ws";

class App extends CandleAbstract {

  winTrades = [];
  loseTrades = [];
  inLong = false;
  inShort = false;
  allTickers = ['BTC', 'ETH', 'BNB'];
  allTf = ['1', '5'];
  urlPath: string;
  urlBase = 'https://api.staging.woo.org/';
  countdown: any;
  ticker: string;
  tf: string;
  ohlc = [];
  haOhlc = [];
  telegramBot: any;
  databasePath: string;
  toDataBase = false;
  isCountDown55 = false;
  token = 'b15346f6544b4d289139b2feba668b20';

  constructor(private utils: UtilsService, private stratService: StrategiesService, private config: Config,
    private indicators: IndicatorsService, private apiService: ApiService) {
    super();
    firebase.initializeApp(config.firebaseConfig);
    this.telegramBot = new TelegramBot(config.token, { polling: false });
    this.ticker = process.argv.slice(2)[0];
    this.tf = process.argv.slice(2)[1];
    this.urlPath = 'https://' + this.ticker + '.history.hxro.io/' + this.tf + 'm';
    this.databasePath = '/' + this.ticker + this.tf;
    this.initApp();


    let lastTime: number;
    setInterval(async () => {
      let second = new Date().getSeconds();
      let minute = new Date().getMinutes();

      if (this.tf == '1') {
        if (second == 55 && second != lastTime) {
          this.main();
        }
      } else if (this.tf == '5') {
        if (second == 55 && (minute.toString().substr(-1) == '4' || minute.toString().substr(-1) == '9') && second != lastTime) {
          this.main();
        }
      }

      lastTime = second;
    }, 500);
  }


  /**
   * Initialisation de l'app
   */
  async initApp() {
    console.log('App started |', this.utils.getDate());
    process.title = 'main';
    this.utils.checkArg(this.ticker, this.tf, this.allTickers, this.allTf);
    this.toDataBase ? this.utils.initFirebase(this.databasePath) : '';
    this.telegramBot = new TelegramBot(this.config.token, { polling: false });
  }

  /**
   * Gère la création des candles et de la logique principale..
   */
  async main() {
    const allData = await this.apiService.getDataFromApi(this.urlPath);
    this.ohlc = allData.data.slice();
    this.haOhlc = this.utils.setHeikenAshiData(this.ohlc);
    this.bullOrBear();
  }



  /**
   * Mets à jour les resultats de trade.
   */
  async getResult(direction: string) {
    try {
      const allData = await this.apiService.getDataFromApi(this.urlPath);
      this.ohlc = allData.data.slice();
      const i = this.ohlc.length - 2; // candle avant la candle en cour
      this.haOhlc = this.utils.setHeikenAshiData(this.ohlc);

      if (direction == 'long') {
        if (this.isUp(this.ohlc, i, 0)) {
          this.toDataBase ? this.utils.updateFirebaseResults(1, this.databasePath) : '';
        } else {
          this.loseTrades.push(-1);
          this.toDataBase ? this.utils.updateFirebaseResults(-1, this.databasePath) : '';
          console.log('-- | Total ', this.utils.round(this.utils.arraySum(this.winTrades.concat(this.loseTrades)), 2), '|', this.utils.getDate(this.ohlc[i].time));
        }
        this.sendTelegramMsg(this.telegramBot, this.config.chatId, this.formatTelegramMsg());
      }

      else if (direction == 'short') {
        if (!this.isUp(this.ohlc, i, 0)) {
          console.log('++ | Total ', this.utils.round(this.utils.arraySum(this.winTrades.concat(this.loseTrades)), 2), '|', this.utils.getDate(this.ohlc[i].time));
        } else {
          this.loseTrades.push(-1);
          console.log('-- | Total ', this.utils.round(this.utils.arraySum(this.winTrades.concat(this.loseTrades)), 2), '|', this.utils.getDate(this.ohlc[i].time));
        }
        this.sendTelegramMsg(this.telegramBot, this.config.chatId, this.formatTelegramMsg());
      }
    } catch (error) {
      console.error(error);
    }
  }


  /**
   * Attend la prochaine candle pour update les résultats.
   */
  waitingNextCandle(direction: string) {
    setTimeout(async () => {
      this.getResult(direction);
    }, 90000); // 1min 30s
  }


  /**
   * Check for setup on closed candles
   */
  bullOrBear() {
    const i = this.ohlc.length - 1; // candle en construction
    const rsiValues = this.indicators.rsi(this.ohlc, 14);

    if (this.inLong) {
      if (this.stopConditions(i)) {
        this.inLong = false;
        console.log('Exit long setup', this.utils.getDate());
      } else {
        this.waitingNextCandle('long');
      }
    } else if (this.inShort) {
      if (this.stopConditions(i)) {
        this.inShort = false;
        console.log('Exit short setup', this.utils.getDate());
      } else {
        this.waitingNextCandle('short');
      }
    } else {
      if (this.stratService.bullStrategy(this.haOhlc, i, rsiValues)) {
        this.inLong = true;
        this.waitingNextCandle('long');
      } else if (this.stratService.bearStrategy(this.haOhlc, i, rsiValues)) {
        this.inShort = true;
        this.waitingNextCandle('short');
      }
    }

  }

  /**
   * Envoie une notification à Télégram.
   */
  sendTelegramMsg(telegramBotObject: any, chatId: string, msg: string) {
    try {
      telegramBotObject.sendMessage(chatId, msg);
    } catch (err) {
      console.log("Something went wrong when trying to send a Telegram notification", err);
    }
  }

  formatTelegramMsg() {
    return 'Total trades : ' + (this.winTrades.length + this.loseTrades.length) + '\n' +
      'Total R:R : ' + (this.utils.round(this.loseTrades.reduce((a, b) => a + b, 0) + this.winTrades.reduce((a, b) => a + b, 0), 2)) + '\n' +
      'Winrate : ' + (this.utils.round((this.winTrades.length / (this.loseTrades.length + this.winTrades.length)) * 100, 2) + '%');
  }

  stopConditions(i: number): boolean {
    return (
      (this.inLong && this.haOhlc[i].bear) ||
      (this.inShort && this.haOhlc[i].bull) ||
      Math.abs(this.high(this.ohlc, i, 0) - this.low(this.ohlc, i, 0)) > 80
    ) ? true : false;
  }
}

const utilsService = new UtilsService();
new App(
  utilsService,
  new StrategiesService(utilsService),
  new Config(),
  new IndicatorsService(utilsService),
  new ApiService(utilsService)
);
