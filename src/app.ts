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
import { RestClient } from "ftx-api/lib/rest-client";

class App extends CandleAbstract {
  winTrades = [];
  loseTrades = [];
  inLong = false;
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
  ftxApi: any;
  lastMinute: number;

  constructor(
    private utils: UtilsService,
    private stratService: StrategiesService,
    private config: Config,
    private apiService: ApiService
  ) {
    super();
    this.initApp();
    //this.main();
    let lastTime: number;
    setInterval(async () => {
      let date = Date.now();
      let second = new Date().getSeconds();
      let minute = new Date().getMinutes();

      if (this.tf == "1") {
        if (second == 5 && second != lastTime) {
          this.lastMinute = Math.floor(Date.now() / 1000 / 60) - 1;
          console.log("minute TS", this.lastMinute);
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
    this.databasePath = "/ftx-" + this.ticker + this.tf;
    this.toDataBase ? this.utils.initFirebase(this.databasePath) : "";
    this.telegramBot = new TelegramBot(this.config.token, { polling: false });
    this.ftxApi = new RestClient(config.xApiKey, config.xApiSecret);
    this.getBinanceStreamData("wss://fstream.binance.com/stream?streams=btcusdt@depth"); //futurs
  }

  /**
   * Gère la logique principale
   */
  async main() {
    try {
      //this.manageOb();
      //const allData = await this.apiService.getDataFromApi("https://BTC.history.hxro.io/1m");
      //console.log(await this.ftxApi.getLeveragedTokenInfo("BULL"));
      const allData = await this.ftxApi.getHistoricalPrices({ market_name: "BULL/USDT", resolution: "60" });
      this.ohlc = allData.result;
      //this.ohlc = allData.data.slice();
      this.haOhlc = this.utils.setHeikenAshiData(this.ohlc);
      this.bullOrBear();
    } catch (e) {
      console.error("Main erreur: ", e);
    }
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
      this.utils.sendTelegramMsg(this.telegramBot, this.config.chatId, "Reconnecting ...");
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

    this.snapshot.bids = this.utils.obUpdate(obRes.bids, this.snapshot.bids, 2.5);
    this.snapshot.asks = this.utils.obUpdate(obRes.asks, this.snapshot.asks, 2.5);
    this.snapshot.bids.sort((a, b) => b[0] - a[0]);
    this.snapshot.asks.sort((a, b) => a[0] - b[0]);

    const res2p5 = this.utils.getVolumeDepth(this.snapshot, 2.5);
    const delta2p5 = this.utils.round(res2p5.bidVolume - res2p5.askVolume, 2);
    this.ratio2p5 = this.utils.round((delta2p5 / (res2p5.bidVolume + res2p5.askVolume)) * 100, 2);
  }

  /**
   * Fin de trade
   */
  checkTradeResult(i: number) {
    let rr: number;
    let closedPrice: Number;

    if (this.inLong && this.ohlc[i].low <= this.stoploss) {
      rr = -1;
      this.inLong = false;
      closedPrice = this.stoploss;
      console.log("Stoploss hit");
    } else {
      if (this.inLong && this.haOhlc[i].bear) {
        this.inLong = false;
        closedPrice = this.ohlc[i].close - 5;
        rr = this.utils.getRiskReward(this.entryPrice, this.stoploss, this.ohlc[i].close - 5);
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
    for (let i = this.ohlc.length - 1; i >= 0; i--) {
      if (this.lastMinute && this.ohlc[i].time / 1000 / 60 > this.lastMinute) {
        console.log("candle remove", this.ohlc[i]);
        this.ohlc.splice(i, 1);
      } else {
        break;
      }
    }
    const i = this.ohlc.length - 1; // derniere candle cloturée
    console.log("candle cloturée", this.ohlc[i]);

    if (this.inLong) this.checkTradeResult(i);

    if (!this.inLong) {
      const resLong = this.stratService.bullStrategy(this.haOhlc, this.ohlc, i, this.ratio2p5);
      if (resLong.startTrade) {
        this.inLong = true;
        this.entryPrice = resLong.entryPrice;
        this.stoploss = resLong.stopLoss;
        console.log("Entry long setup", this.utils.getDate());
        console.log("EntryPrice", this.entryPrice);
        console.log("StopLoss", this.stoploss);
      }
    }
  }

  isStopConditions(i: number): boolean {
    return (this.inLong && this.ohlc[i].low <= this.stoploss) || (this.inLong && this.haOhlc[i].bear) ? true : false;
  }
}

const utilsService = new UtilsService();
const config = new Config();
new App(utilsService, new StrategiesService(utilsService), config, new ApiService(utilsService, config));
