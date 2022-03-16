// https://www.digitalocean.com/community/tutorials/setting-up-a-node-project-with-typescript
// https://github.com/nikvdp/pidcrypt/issues/5#issuecomment-511383690
// https://github.com/Microsoft/TypeScript/issues/17645#issuecomment-320556012

process.env.NTBA_FIX_319 = "1"; // disable Telegram error
import { ApiService } from "./services/api.service";
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
  allTf = [1, 5];
  ticker: string;
  tf: number;
  snapshot: any;
  bid: number;
  ask: number;
  spread: number;
  price: number;
  tmpBuffer = [];
  isHistoricalDataCalled: boolean = false;
  ratio2p5: any;
  entryPrice: number;
  stoploss: number;
  ohlc = [];
  ohlc_tmp: any;
  haOhlc = [];
  telegramBot: any;
  databasePath: string;
  toDataBase = false;

  constructor(
    private utils: UtilsService,
    private stratService: StrategiesService,
    private config: Config,
    private apiService: ApiService
  ) {
    super();
    this.initApp();

    let lastTime: number;
    setInterval(async () => {
      let second = new Date().getSeconds();
      let minute = new Date().getMinutes();

      if (minute % this.tf === 0 && second === 0 && second !== lastTime && this.price) {
        this.main();
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
    firebase.initializeApp(config.firebaseConfig);
    this.ticker = process.argv.slice(2)[0];
    this.tf = +process.argv.slice(2)[1];
    this.utils.checkArg(this.ticker, this.tf, this.allTickers, this.allTf);
    this.databasePath = "/woo-" + this.ticker + this.tf;
    this.toDataBase ? this.utils.initFirebase(this.databasePath) : "";
    this.telegramBot = new TelegramBot(this.config.token, { polling: false });
    this.getWootradeStreamData(this.config.wsMarketDataUrl + this.config.appId);
  }

  /**
   * Gère la logique principale
   */
  async main() {
    try {
      if (this.ohlc_tmp) {
        this.ohlc_tmp.close = this.price;
        this.ohlc.push(this.ohlc_tmp);
      }

      if (!this.isHistoricalDataCalled && this.tf === 1) {
        const data = await this.apiService.getKline(); // Pour TEST
        this.ohlc = data.rows.reverse();
        this.isHistoricalDataCalled = true;
      }

      const date = Date.now();
      this.ohlc_tmp = {
        time: date,
        date: this.utils.getDate(date),
        open: this.price,
        high: this.price,
        low: this.price,
      };

      if (this.ohlc.length >= 5) {
        this.haOhlc = this.utils.setHeikenAshiData(this.ohlc); //lookback condition avec OHLC length
        this.bullOrBear();
      }
    } catch (e) {
      console.error("Main erreur: ", e);
    }
  }

  /**
   * Ecoute le WS Wootrade.
   */
  async getWootradeStreamData(url: string) {
    let ws = new WebSocket(url);

    ws.onopen = () => {
      console.log("Socket is connected to Wootrade. Listenning data ...");
      const bbo = {
        id: "clientID6",
        topic: "SPOT_BTC_USDT@bbo",
        event: "subscribe",
      };
      const trade = {
        id: "clientID6",
        topic: "SPOT_BTC_USDT@trade",
        event: "subscribe",
      };

      ws.send(JSON.stringify(bbo));
      ws.send(JSON.stringify(trade));
      setInterval(async () => {
        ws.send(JSON.stringify({ event: "ping" }));
      }, 10 * 1000);
    };

    ws.onmessage = (event: any) => {
      const res = JSON.parse(event.data);

      if (res.topic === "SPOT_BTC_USDT@bbo") {
        /* console.log(res); */
        this.ask = res.data.ask;
        this.bid = res.data.bid;
        this.spread = this.utils.round(this.ask - this.bid, 2);
      } else if (res.topic === "SPOT_BTC_USDT@trade") {
        this.price = res.data.price;
        if (this.inLong || this.inShort) this.checkStoploss();
        if (this.ohlc_tmp) {
          if (this.price > this.ohlc_tmp.high) this.ohlc_tmp.high = this.price;
          if (this.price < this.ohlc_tmp.low) this.ohlc_tmp.low = this.price;
        }
      }
    };

    ws.onclose = (e) => {
      console.log("Socket is closed. Reconnect will be attempted in 1 second.", e.reason);
      setTimeout(() => {
        this.getWootradeStreamData(url);
      }, 1000);
      this.utils.sendTelegramMsg(this.telegramBot, this.config.chatId, "Reconnecting ...");
    };

    ws.onerror = (err: any) => {
      console.error("Socket encountered error: ", err.message, "Closing socket");
      ws.close();
    };
  }

  /**
   * Fin de trade
   */
  checkStoploss() {
    let rr: number;
    let closedPrice: number;

    if (this.inLong && this.price <= this.stoploss) {
      rr = this.utils.getRiskReward(this.entryPrice, this.stoploss, this.bid);
      this.inLong = false;
      closedPrice = this.bid;
      console.log("Stoploss hit");
    } else if (this.inShort && this.price >= this.stoploss) {
      rr = this.utils.getRiskReward(this.entryPrice, this.stoploss, this.ask);
      this.inShort = false;
      closedPrice = this.ask;
      console.log("Stoploss hit");
    }
    this.updateTradeResult(rr, closedPrice);
  }

  updateTradeResult(rr: number, closedPrice: number) {
    if (rr && closedPrice) {
      if (rr >= 0) {
        this.winTrades.push(rr);
      } else if (rr < 0) {
        this.loseTrades.push(rr);
      }

      if (this.toDataBase) this.utils.updateFirebaseResults(rr, this.databasePath);
      /*this.sendTelegramMsg(this.telegramBot, this.config.chatId, this.formatTelegramMsg()); */
      console.log("Cloture", closedPrice);
      console.log(
        "RR : " + rr + " | Total ",
        this.utils.round(this.utils.arraySum(this.winTrades.concat(this.loseTrades)), 2),
        "|",
        this.utils.getDate()
      );
      console.log("------------");
    }
  }

  /**
   * Check for setup on closed candles
   */
  bullOrBear() {
    let rr: number;
    let closedPrice: number;
    const i = this.ohlc.length - 1; // derniere candle cloturée
    /* console.log('candle cloturée', this.ohlc[i])
    console.log('candle cloturée ha', this.haOhlc[i]) */

    if (this.inLong && this.haOhlc[i].bear) {
      this.inLong = false;
      closedPrice = this.bid;
      rr = this.utils.getRiskReward(this.entryPrice, this.stoploss, this.bid);
      this.updateTradeResult(rr, closedPrice);
    } else if (this.inShort && this.haOhlc[i].bull) {
      this.inShort = false;
      closedPrice = this.ask;
      rr = this.utils.getRiskReward(this.entryPrice, this.stoploss, this.ask);
      this.updateTradeResult(rr, closedPrice);
    }

    if (!this.inLong && !this.inShort) {
      const resLong = this.stratService.bullStrategy(this.haOhlc, i, this.ratio2p5);
      if (resLong.startTrade) {
        this.inLong = true;
        this.entryPrice = this.ask;
        this.stoploss = this.utils.round(resLong.stopLoss - this.spread, 2);
        console.log("Entry long setup", this.utils.getDate());
        console.log("EntryPrice", this.entryPrice);
        console.log("StopLoss", this.stoploss);
        console.log("Spread", this.spread);
      } else {
        const resShort = this.stratService.bearStrategy(this.haOhlc, i, this.ratio2p5);
        if (resShort.startTrade) {
          this.inShort = true;
          this.entryPrice = this.bid;
          this.stoploss = this.utils.round(resShort.stopLoss + this.spread, 2);
          console.log("Entry short setup", this.utils.getDate());
          console.log("EntryPrice", this.entryPrice);
          console.log("StopLoss", this.stoploss);
          console.log("Spread", this.spread);
        }
      }
    }
  }

  isStopConditions(i: number): boolean {
    return (this.inLong && this.ohlc[i].low <= this.stoploss) ||
      (this.inShort && this.ohlc[i].high >= this.stoploss) ||
      (this.inLong && this.haOhlc[i].bear) ||
      (this.inShort && this.haOhlc[i].bull)
      ? true
      : false;
  }
}

const utilsService = new UtilsService();
const config = new Config();
new App(utilsService, new StrategiesService(utilsService), config, new ApiService(utilsService, config));
