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
  allTf = ["1", "5"];
  ticker: string;
  tf: string;
  snapshot: any;
  tmpBuffer = [];
  ratio2p5: any;
  entryPrice: number;
  stoploss: number;
  ohlc = [];
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
    firebase.initializeApp(config.firebaseConfig);
    this.ticker = process.argv.slice(2)[0];
    this.tf = process.argv.slice(2)[1];
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
    const allData = await this.apiService.getKline();
    allData.rows.map((x) => {
      x.temps_debut = this.utils.getDate(x.start_timestamp);
      x.temps_fin = this.utils.getDate(x.end_timestamp);
    });
    this.ohlc = allData.rows.reverse();
    this.haOhlc = this.utils.setHeikenAshiData(this.ohlc);
    this.bullOrBear();
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
        topic: "SPOT_BTC_USDT@bbo",
        event: "subscribe",
      };
      ws.send(JSON.stringify(msg));

      setInterval(async () => {
        ws.send(JSON.stringify({ event: "ping" }));
      }, 10 * 1000);
    };

    ws.onmessage = (event: any) => {
      const res = JSON.parse(event.data);
      /* if (res.topic === "SPOT_BTC_USDT@bbo") {
        this.ask = res.data.ask;
        this.bid = res.data.bid;
        if ((this.inLong && this.bid <= this.stoploss) || (this.inShort && this.ask >= this.stoploss)) {
          console.log("Stoploss hit");
          this.onTradeClosed();
        }
      } */
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
  checkTradeResult(i: number) {
    let rr: number;
    let closedPrice: Number;

    if ((this.inLong && this.ohlc[i].low <= this.stoploss) || (this.inShort && this.ohlc[i].high >= this.stoploss)) {
      rr = -1;
      this.inLong = false;
      this.inShort = false;
      closedPrice = this.stoploss;
      console.log("Stoploss hit");
    } else {
      if (this.inLong && this.haOhlc[i].bear) {
        this.inLong = false;
        closedPrice = this.ohlc[i].close - 5;
        rr = this.utils.getRiskReward(this.entryPrice, this.stoploss, this.ohlc[i].close - 5);
      } else if (this.inShort && this.haOhlc[i].bull) {
        this.inShort = false;
        closedPrice = this.ohlc[i].close + 5;
        rr = this.utils.getRiskReward(this.entryPrice, this.stoploss, this.ohlc[i].close + 5);
      }
    }

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
    const i = this.ohlc.length - 2; // derniere candle cloturée
    /* console.log('candle cloturée', this.ohlc[i])
    console.log('candle cloturée ha', this.haOhlc[i]) */
    if (this.inLong || this.inShort) {
      this.checkTradeResult(i);
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
