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
  currentPrice: number;
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
    this.getBinanceStreamData("wss://fstream.binance.com/stream?streams=btcusdt@depth"); //futurs
    this.getWootradeStreamData(this.config.wsMarketDataUrl + this.config.appId);
  }

  /**
   * Gère la logique principale
   */
  async main() {
    this.manageOb();
    const allData = await this.apiService.getKline(); //this.apiService.getDataFromApi(this.urlPath);
    //const allData = await this.apiService.getDataFromApi(this.urlPath);
    this.ohlc = allData.rows.reverse();
    this.haOhlc = this.utils.setHeikenAshiData(this.ohlc);
    this.bullOrBear();
  }

  /**
   * Ecoute le WS Binance.
   */
  async getBinanceStreamData(url: string) {
    this.snapshot = await this.apiService.getObSnapshot();
    this.snapshot.bids = this.utils.convertArrayToNumber(this.snapshot.bids);
    this.snapshot.asks = this.utils.convertArrayToNumber(this.snapshot.asks);
    let ws = new WebSocket(url);

    ws.onopen = () => {
      console.log("Socket is connected to Binance. Listenning data ...");
    };

    ws.onmessage = (event: any) => {
      const res = JSON.parse(event.data);
      if (res.stream === "btcusdt@depth") {
        this.tmpBuffer.push(res);
      }
    };

    ws.onclose = (e) => {
      console.log("Socket is closed. Reconnect will be attempted in 1 second.", e.reason);
      setTimeout(() => {
        this.getBinanceStreamData(url);
      }, 1000);
      this.sendTelegramMsg(this.telegramBot, this.config.chatId, "Reconnecting ...");
    };

    ws.onerror = (err: any) => {
      console.error("Socket encountered error: ", err.message, "Closing socket");
      ws.close();
    };
  }

  /**
   * Ecoute le WS Wootrade.
   */
  async getWootradeStreamData(url: string) {
    let ws = new WebSocket(url);

    ws.onopen = () => {
      console.log("Socket is connected to Wootrade. Listenning data ...");
      const msg = {
        id: "clientID6",
        topic: "SPOT_BTC_USDT@kline_1m",
        event: "subscribe",
      };
      ws.send(JSON.stringify(msg));
    };

    ws.onmessage = (event: any) => {
      const res = JSON.parse(event.data);
      //console.log("res", res);
      if (res.topic === "SPOT_BTC_USDT@kline_1m") {
        this.currentPrice = res.data.close;
        if (this.inLong && this.currentPrice <= this.stoploss) {
          this.inLong = false;
          this.onStoplossHit(this.currentPrice);
        } else if (this.inShort && this.currentPrice >= this.stoploss) {
          this.inShort = false;
          this.onStoplossHit(this.currentPrice);
        }
      }
    };

    ws.onclose = (e) => {
      console.log("Socket is closed. Reconnect will be attempted in 1 second.", e.reason);
      setTimeout(() => {
        this.getWootradeStreamData(url);
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
    //console.log("bull bear candle", this.ohlc[i]);
    if (this.stopConditions(i)) {
      const rr = this.utils.getRiskReward(this.entryPrice, this.stoploss, this.currentPrice);
      if (rr >= 0) {
        this.winTrades.push(rr);
      } else if (rr < 0) {
        this.loseTrades.push(rr);
      }

      if (this.inLong) this.inLong = false;
      if (this.inShort) this.inShort = false;
      if (this.toDataBase) this.utils.updateFirebaseResults(rr, this.databasePath);
      /*this.sendTelegramMsg(this.telegramBot, this.config.chatId, this.formatTelegramMsg()); */
      console.log("Cloture", this.currentPrice);
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
        this.entryPrice = this.currentPrice;
        this.stoploss = resLong.stopLoss;
        console.log("Entry long setup", this.utils.getDate());
        console.log("EntryPrice", this.entryPrice);
        console.log("StopLoss", this.stoploss);
      } else {
        const resShort = this.stratService.bearStrategy(this.haOhlc, this.ohlc, i, this.ratio2p5);
        if (resShort.startTrade) {
          this.inShort = true;
          this.entryPrice = this.currentPrice;
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
