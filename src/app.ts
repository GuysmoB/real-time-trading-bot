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
import { WebsocketClient } from "ftx-api/lib/websocket-client";
import { DefaultLogger } from "ftx-api/lib/logger";
import { isWsTradesEvent } from "ftx-api/lib/util/typeGuards";


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
  ohlc_tmp: any;
  haOhlc = [];
  streamData: any /* { ts: 0, price: 0 } */;
  telegramBot: any;
  databasePath: string;
  toDataBase = false;
  ftxApi: any;
  ftxWs: any;
  lastMinute: number;

  constructor(
    private utils: UtilsService,
    private stratService: StrategiesService,
    private config: Config,
    private apiService: ApiService
  ) {
    super();
    this.initApp();
    this.main();

    let lastTime: number;
    setInterval(async () => {
      let second = new Date().getSeconds();
      let minute = new Date().getMinutes();

      if (this.tf == "1") {
        if (second == 0 && second != lastTime && this.streamData.price) {
          if (this.ohlc_tmp) {
            this.ohlc_tmp.close = this.streamData.price;
            this.ohlc.push(this.ohlc_tmp);
            console.log("ohlc pushed", this.ohlc[this.ohlc.length - 1], this.ohlc.length);
          }

          this.ohlc_tmp = {
            time: Date.now(),
            date: utils.getDate(Date.now()),
            open: this.streamData.price,
            high: this.streamData.price,
            low: this.streamData.price,
          };

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
    DefaultLogger.info = () => { };
    DefaultLogger.debug = () => { };
    this.ftxWs = new WebsocketClient({ key: config.xApiKey, secret: config.xApiSecret }, DefaultLogger);
    //this.getBinanceStreamData("wss://fstream.binance.com/stream?streams=btcusdt@depth"); //futurs
    this.getFtxStreamData();
    const data = await this.ftxApi.getHistoricalPrices({ market_name: "BULL/USDT", resolution: "60" });
    this.ohlc = data.result;
  }

  /**
   * Gère la logique principale
   */
  async main() {
    try {
      //this.manageOb();


      this.haOhlc = this.utils.setHeikenAshiData(this.ohlc);
      //this.bullOrBear();
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

  getFtxStreamData() {
    this.ftxWs.subscribe({ channel: 'trades', market: 'BULL/USD' });
    this.ftxWs.on('response', msg => console.log('response: ', msg));
    this.ftxWs.on('error', msg => console.log('err: ', msg));
    this.ftxWs.on('update', msg => {
      if (isWsTradesEvent(msg)) {
        this.streamData = msg.data[0];
        if (this.ohlc_tmp) {
          if (this.streamData.price > this.ohlc_tmp.high) { this.ohlc_tmp.high = this.streamData.price; }
          if (this.streamData.price < this.ohlc_tmp.low) { this.ohlc_tmp.low = this.streamData.price; }
        }
      }
    });
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
    const i = this.ohlc.length - 1; // derniere candle cloturée
    //console.log("candle cloturée", this.ohlc[i]);

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
