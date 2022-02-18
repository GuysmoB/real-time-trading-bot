import { ApiService } from "./services/api.service";
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
  allTickers = ["BTC"];
  allTf = ["1", "5"];
  urlPath: string;
  countdown: any;
  ticker: string;
  accountInfo: any;
  snapshot: any;
  tmpBuffer = [];
  ratio2p5: any;
  entryPrice: number;
  stoploss: number;
  tf: string;
  ohlc = [];
  haOhlc = [];
  telegramBot: any;
  databasePath: string;
  toDataBase = false;

  constructor(
    private utils: UtilsService,
    private stratService: StrategiesService,
    private config: Config,
    private indicators: IndicatorsService,
    private apiService: ApiService
  ) {
    super();
    firebase.initializeApp(config.firebaseConfig);
    this.telegramBot = new TelegramBot(config.token, { polling: false });
    this.ticker = process.argv.slice(2)[0];
    this.tf = process.argv.slice(2)[1];
    this.urlPath = "https://" + this.ticker + ".history.hxro.io/" + this.tf + "m";
    this.databasePath = "/woo-" + this.ticker + this.tf;
    this.initApp();

    let lastTime: number;
    setInterval(async () => {
      let second = new Date().getSeconds();
      let minute = new Date().getMinutes();

      if (this.tf == "1") {
        if (second == 5 && second != lastTime) {
          this.main();
        }
      } else if (this.tf == "5") {
        if (second == 5 && (minute.toString().substr(-1) == "5" || minute.toString().substr(-1) == "0") && second != lastTime) {
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
    console.log("App started |", this.utils.getDate());
    process.title = "main";
    this.utils.checkArg(this.ticker, this.tf, this.allTickers, this.allTf);
    this.toDataBase ? this.utils.initFirebase(this.databasePath) : "";
    this.telegramBot = new TelegramBot(this.config.token, { polling: false });
    this.getWebSocketData("wss://fstream.binance.com/stream?streams=btcusdt@depth/btcusdt@kline_1m"); //futurs
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
   * Ecoute le WS.
   */
  async getWebSocketData(url: string) {
    this.snapshot = await this.apiService.getObSnapshot();
    this.snapshot.bids = this.utils.convertArrayToNumber(this.snapshot.bids);
    this.snapshot.asks = this.utils.convertArrayToNumber(this.snapshot.asks);
    let ws = new WebSocket(url);

    ws.onopen = () => {
      console.log("Socket is connected. Listenning data ...");
    };

    ws.onmessage = (event: any) => {
      const res = JSON.parse(event.data);
      if (res.stream === "btcusdt@depth") {
        this.tmpBuffer.push(res);
      } /* else if (res.stream === "btcusdt@kline_1m") {
        const price = res.data.k.c;
        if (this.inLong && price <= this.stoploss) {
          this.inLong = false;
          this.onStoplossHit(price);
        } else if (this.inShort && price >= this.stoploss) {
          this.inShort = false;
          this.onStoplossHit(price);
        }
      } */
    };

    ws.onclose = (e) => {
      console.log("Socket is closed. Reconnect will be attempted in 1 second.", e.reason);
      setTimeout(() => {
        this.getWebSocketData(url);
      }, 1000);
      this.sendTelegramMsg(this.telegramBot, this.config.chatId, "Reconnecting ...");
    };

    ws.onerror = (err: any) => {
      console.error("Socket encountered error: ", err.message, "Closing socket");
      ws.close();
    };
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
   * Update si stoploss touché
   */
  onStoplossHit(price: number) {
    const rr = this.utils.getRiskReward(this.entryPrice, this.stoploss, price);
    this.loseTrades.push(rr);
    this.toDataBase ? this.utils.updateFirebaseResults(rr, this.databasePath) : "";
    /*this.sendTelegramMsg(this.telegramBot, this.config.chatId, this.utils.formatTelegramMsg()); */
    console.log("Stoploss hit | Price : " + price);
    console.log(
      "RR : " + rr + " | Total ",
      this.utils.round(this.utils.arraySum(this.winTrades.concat(this.loseTrades)), 2),
      "|",
      this.utils.getDate()
    );
    console.log("------------");
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

      this.inLong ? (this.inLong = false) : this.inLong;
      this.inShort ? (this.inShort = false) : this.inShort;
      this.toDataBase ? this.utils.updateFirebaseResults(rr, this.databasePath) : "";
      /*this.sendTelegramMsg(this.telegramBot, this.config.chatId, this.formatTelegramMsg()); */
      console.log("Cloture", this.ohlc[i].open);
      console.log(
        "RR : " + rr + " | Total ",
        this.utils.round(this.utils.arraySum(this.winTrades.concat(this.loseTrades)), 2),
        "|",
        this.utils.getDate()
      );
      console.log("------------");
    }

    if (!this.inLong && !this.inShort) {
      const resLong = this.stratService.bullStrategy(this.haOhlc, this.ohlc, i, this.ratio2p5);
      if (resLong.startTrade) {
        this.inLong = true;
        this.entryPrice = resLong.entryPrice;
        this.stoploss = resLong.stopLoss;
        console.log("Entry long setup", this.utils.getDate());
        console.log("EntryPrice", this.entryPrice);
        console.log("StopLoss", this.stoploss);
      } else {
        const resShort = this.stratService.bearStrategy(this.haOhlc, this.ohlc, i, this.ratio2p5);
        if (resShort.startTrade) {
          this.inShort = true;
          this.entryPrice = resShort.entryPrice;
          this.stoploss = resShort.stopLoss;
          console.log("Entry short setup", this.utils.getDate());
          console.log("EntryPrice", this.entryPrice);
          console.log("StopLoss", this.stoploss);
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

  stopConditions(i: number): boolean {
    return (this.inLong && this.haOhlc[i].bear) || (this.inShort && this.haOhlc[i].bull) ? true : false;
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
