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
import WebSocket from "ws";

class App extends CandleAbstract {

  winTrades = [];
  loseTrades = [];
  inLong = false;
  inShort = false;
  allTickers = ['BTC'];
  allTf = ['1', '5'];
  urlPath: string;
  countdown: any;
  ticker: string;
  accountInfo: any;
  orderInfo: any;
  kline: any;
  stoploss: number;
  tf: string;
  ohlc = [];
  haOhlc = [];
  telegramBot: any;
  databasePath: string;
  toDataBase = false;

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
        if (second == 5 && second != lastTime) {
          this.main();
        }
      } else if (this.tf == '5') {
        if (second == 5 && (minute.toString().substr(-1) == '5' || minute.toString().substr(-1) == '0') && second != lastTime) {
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
    try {
      this.accountInfo = await this.apiService.getAccountInfo();
      //this.getCandleStreamData(this.config.wsMarketDataUrl + this.config.appId);
      //this.getPrivateUserData(this.config.wsUserDataUrl + this.config.appId);
      //this.getCandleStreamData(this.config.wsBaseUrl +this.accountInfo.application.application_id +'/subscribe/' +'SPOT_BTC_USDT@kline_1m');
      //const res = this.apiService.sendOrder('BTC', 'MARKET', 0.11, 'BUY');  
    } catch (error) {
      console.error(error);
    }

    console.log('App started |', this.utils.getDate());
    process.title = 'main';
    this.utils.checkArg(this.ticker, this.tf, this.allTickers, this.allTf);
    this.toDataBase ? this.utils.initFirebase(this.databasePath) : '';
    this.telegramBot = new TelegramBot(this.config.token, { polling: false });
  }


  /**
  * Ecoute le WS et récupère les valeurs OHLC.
  */
  async getCandleStreamData(url: string) {
    let ws = new WebSocket(url);
    const _this = this;

    ws.onopen = function () {
      console.log("Socket is connected. Listenning data ...");
      const msg = {
        "event": "ping"
      };
      ws.send(JSON.stringify(msg));
    }

    ws.onmessage = function (event: any) {
      console.log(event.data);
      /* if (this.inLong) {
        if (this.kline.close <= this.stoploss) {
          try {
            //const res = this.apiService.cancelOrder(this.orderInfo.order_id,'BTC');  
          } catch (error) {
            console.error(error);
          }
        }
      } */
    };

    ws.onclose = function (e) {
      console.log('Socket for kline data is closed. Reconnect will be attempted in 1 second.', e.reason);
      setTimeout(function () {
        _this.getCandleStreamData(url);
      }, 1000);
      _this.sendTelegramMsg(_this.telegramBot, _this.config.chatId, 'Reconnecting ...');
    };

    ws.onerror = function (err: any) {
      console.error('Socket encountered error: ', err.message, 'Closing socket');
      ws.close();
    };
  }


  /**
   * Ecoute le WS et récupère les données privées du user.
   */
  async getPrivateUserData(url: string) {
    let ws = new WebSocket(url);
    const _this = this;

    ws.onopen = function () {
      console.log("Socket for private user data is connected. Listenning data ...");
    }

    ws.onmessage = function (event: any) {
      const data = JSON.parse(event.data)
      console.log(data);
      if (data) { // Si le trade a bien été annulé
        this.inLong = false;
      }
    };

    ws.onclose = function (e) {
      console.log('Socket for private user data is closed. Reconnect will be attempted in 1 second.', e.reason);
      setTimeout(function () {
        _this.getPrivateUserData(url);
      }, 1000);
      _this.sendTelegramMsg(_this.telegramBot, _this.config.chatId, 'Reconnecting ...');
    };

    ws.onerror = function (err: any) {
      console.error('Socket encountered error: ', err.message, 'Closing socket');
      ws.close();
    };
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
      if (this.stratService.bullStrategy(this.haOhlc, i)) {
        try {
          //this.orderInfo = this.apiService.sendOrder(this.baseUrl +'url' ,'BTC', 'MARKET', 0.11, 'BUY');  
          this.inLong = true;
          this.waitingNextCandle('long');
        } catch (error) {
          console.error(error);
        }
      } else if (this.stratService.bearStrategy(this.haOhlc, i)) {
        try {
          //this.orderInfo = this.apiService.sendOrder(this.baseUrl +'url' ,'BTC', 'MARKET', 0.11, 'SELL');  
          this.inShort = true;
          this.waitingNextCandle('short');
        } catch (error) {
          console.error(error);
        }
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
const config = new Config();
new App(
  utilsService,
  new StrategiesService(utilsService),
  config,
  new IndicatorsService(utilsService),
  new ApiService(utilsService, config)
);
