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
  snapshot: any;
  tmpBuffer = [];
  ratio2p5: any
  orderInfo: any;
  kline: any;
  entryPrice: number;
  stoploss: number;
  tf: string;
  ohlc = [];
  haOhlc = [];
  telegramBot: any;
  databasePath: string;
  toDataBase = true;

  constructor(private utils: UtilsService, private stratService: StrategiesService, private config: Config,
    private indicators: IndicatorsService, private apiService: ApiService) {
    super();
    firebase.initializeApp(config.firebaseConfig);
    this.telegramBot = new TelegramBot(config.token, { polling: false });
    this.ticker = process.argv.slice(2)[0];
    this.tf = process.argv.slice(2)[1];
    this.urlPath = 'https://' + this.ticker + '.history.hxro.io/' + this.tf + 'm';
    this.databasePath = '/woo-' + this.ticker + this.tf;
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
    console.log('App started |', this.utils.getDate());
    process.title = 'main';
    this.utils.checkArg(this.ticker, this.tf, this.allTickers, this.allTf);
    this.toDataBase ? this.utils.initFirebase(this.databasePath) : '';
    this.telegramBot = new TelegramBot(this.config.token, { polling: false });
    this.getObStreamData('wss://fstream.binance.com/stream?streams=btcusdt@depth'); //futurs
  }


  /**
   * Gère la logique principale
   */
  async main() {
    this.manageOb();
    const allData = await this.apiService.getDataFromApi(this.urlPath);
    this.ohlc = allData.data.slice();
    this.haOhlc = this.utils.setHeikenAshiData(this.ohlc);
    this.bullOrBear();
  }

  /**
  * MAJ de l'ob.
  */
  async manageOb() {
  const obRes = this.utils.getBidAskFromBuffer(this.tmpBuffer);
  this.tmpBuffer = [];

  this.snapshot.bids = this.utils.obUpdate(obRes.bids, this.snapshot.bids);
  this.snapshot.asks = this.utils.obUpdate(obRes.asks, this.snapshot.asks);
  this.snapshot.bids.sort((a, b) => b[0] - a[0]);
  this.snapshot.asks.sort((a, b) => a[0] - b[0]);

  const res2p5 = this.utils.getVolumeDepth(this.snapshot, 2.5);
  const delta2p5 = this.utils.round(res2p5.bidVolume - res2p5.askVolume, 2);
  this.ratio2p5 = this.utils.round((delta2p5 / (res2p5.bidVolume + res2p5.askVolume)) * 100, 2);
}


/**
 * Ecoute le WS.
 */
 async getObStreamData(url: string) {
  this.snapshot = await this.apiService.getObSnapshot();
  this.snapshot.bids = this.utils.convertArrayToNumber(this.snapshot.bids);
  this.snapshot.asks = this.utils.convertArrayToNumber(this.snapshot.asks);
  let ws = new WebSocket(url);
  const _this = this;

  ws.onopen = function () {
    console.log("Socket is connected. Listenning data ...");
  }

  ws.onmessage = function (event: any) {
    _this.tmpBuffer.push(JSON.parse(event.data));
  };

  ws.onclose = function (e) {
    console.log('Socket is closed. Reconnect will be attempted in 1 second.', e.reason);
    setTimeout(function () {
      _this.getObStreamData(url);
    }, 1000);
    _this.sendTelegramMsg(_this.telegramBot, _this.config.chatId, 'Reconnecting ...');
  };

  ws.onerror = function (err: any) {
    console.error('Socket encountered error: ', err.message, 'Closing socket');
    ws.close();
  };
}

  /**
   * Check for setup on closed candles
   */
  bullOrBear() {
    const i = this.ohlc.length - 2; // derniere candle cloturée

    if (this.stopConditions(i)) {
      const rr = this.utils.getRiskReward(this.entryPrice, this.stoploss, this.ohlc[i].close);
      if (rr >= 0) {
        this.winTrades.push(rr);
      } else if (rr < 0) {
        this.loseTrades.push(rr);
      }

      this.inLong ? this.inLong = false : this.inLong;
      this.inShort ? this.inShort = false : this.inShort;
      this.toDataBase ?? this.utils.updateFirebaseResults(rr, this.databasePath);
      /*this.sendTelegramMsg(this.telegramBot, this.config.chatId, this.formatTelegramMsg()); */
      console.log('Cloture', this.ohlc[i].open);
      console.log('RR : ' +rr +' | Total ', this.utils.round(this.utils.arraySum(this.winTrades.concat(this.loseTrades)), 2), '|', this.utils.getDate());
      console.log('------------');
    }  

    if (!this.inLong && !this.inShort) {
      const resLong = this.stratService.bullStrategy(this.haOhlc, this.ohlc, i, this.ratio2p5)
      if (resLong.startTrade) {
        this.inLong = true;
        this.entryPrice = resLong.entryPrice;
        this.stoploss = resLong.stopLoss;
        console.log('Entry long setup', this.utils.getDate());
        console.log('EntryPrice', this.entryPrice);
        console.log('StopLoss', this.stoploss);
      } else {
        const resShort = this.stratService.bearStrategy(this.haOhlc, this.ohlc, i, this.ratio2p5)
        if (resShort.startTrade) {
          this.inShort = true;
          this.entryPrice = resShort.entryPrice;
          this.stoploss = resShort.stopLoss;
          console.log('Entry short setup', this.utils.getDate());
          console.log('EntryPrice', this.entryPrice);
          console.log('StopLoss', this.stoploss);
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
      (this.inShort && this.haOhlc[i].bull) 
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
