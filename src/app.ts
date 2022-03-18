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
import { RestClient } from "ftx-api/lib/rest-client";
import { WebsocketClient } from "ftx-api/lib/websocket-client";
import { DefaultLogger } from "ftx-api/lib/logger";
import { isWsTradesEvent } from "ftx-api/lib/util/typeGuards";

class App extends CandleAbstract {
  winTrades = [];
  loseTrades = [];
  inLong = false;
  allTickers = ["BULL", "BEAR"];
  allTf = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]; //15, 60, 300, 900, 3600, 14400,
  ticker: string;
  tf: number;
  ratio2p5: any;
  entryPrice: number;
  stoploss: number;
  ohlc = [];
  ohlc_tmp: any;
  haOhlc = [];
  streamData: any;
  telegramBot: any;
  databasePath: string;
  ftxApi: any;
  ftxWs: any;
  isHistoricalDataCalled: boolean = false;
  balance: any;
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
      const second = new Date().getSeconds();
      const minute = Math.trunc(Date.now() / 60000);

      if (minute % this.tf === 0 && second === 0 && second !== lastTime && this.streamData) {
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
    /* this.utils.sendTelegramMsg(this.telegramBot, this.config.chatId, `App started ${this.ticker} ${this.tf}`); */
    process.title = "main";
    firebase.initializeApp(config.firebaseConfig);
    this.ticker = process.argv.slice(2)[0];
    this.tf = +process.argv.slice(2)[1];
    this.utils.checkArg(this.ticker, this.tf, this.allTickers, this.allTf);
    this.databasePath = "/ftx-" + this.ticker + this.tf;
    this.telegramBot = new TelegramBot(this.config.token, { polling: false });
    this.ftxApi = new RestClient(config.xApiKey, config.xApiSecret);
    this.ftxWs = new WebsocketClient({ key: config.xApiKey, secret: config.xApiSecret }, DefaultLogger);
    this.balance = await this.utils.getBalance(this.toDataBase, this.databasePath);
    this.getFtxStreamData();
  }

  /**
   * Gère la logique principale
   */
  async main() {
    try {
      if (this.ohlc_tmp) {
        this.ohlc_tmp.close = this.streamData.price;
        this.ohlc.push(this.ohlc_tmp);
      }

      if (!this.isHistoricalDataCalled && this.tf === 1) {
        const data = await this.ftxApi.getHistoricalPrices({ market_name: `${this.ticker}/USD`, resolution: `${this.tf * 60}` }); // Pour TEST
        this.ohlc = data.result;
        this.isHistoricalDataCalled = true;
      }

      const date = Date.now();
      this.ohlc_tmp = {
        time: date,
        date: this.utils.getDate(date),
        open: this.streamData.price,
        high: this.streamData.price,
        low: this.streamData.price,
      };

      if (this.ohlc.length >= 5) {
        this.haOhlc = this.utils.setHeikenAshiData(this.ohlc); //lookback condition avec OHLC length
        this.bullOrBear();
      }
    } catch (e) {
      console.error("Main erreur: ", e);
    }
  }

  async getFtxStreamData() {
    DefaultLogger.info = () => { };
    DefaultLogger.debug = () => { };
    this.ftxWs.subscribe({ channel: "trades", market: `${this.ticker}/USD` });
    this.ftxWs.on("open", () => {
      console.log("Socket is connected to FTX. Listenning data ...");
    });
    this.ftxWs.on("response", (msg) => console.log("response: ", msg));
    this.ftxWs.on("error", (msg) => console.log("err: ", msg));
    this.ftxWs.on("update", (msg) => {
      if (isWsTradesEvent(msg)) {
        this.streamData = msg.data[0];
        if (this.ohlc_tmp) {
          if (this.streamData.price > this.ohlc_tmp.high) this.ohlc_tmp.high = this.streamData.price;
          if (this.streamData.price < this.ohlc_tmp.low) this.ohlc_tmp.low = this.streamData.price;
        }

        if (this.inLong) this.checkTradeResult();
      }
    });
  }

  /**
   * Fin de trade
   */
  checkTradeResult() {
    let result: number;

    if (this.streamData.price <= this.stoploss || this.haOhlc[this.haOhlc.length - 1].bear) {
      this.inLong = false;
      result = this.utils.getPercentageResult(this.entryPrice, this.streamData.price);
      if (this.streamData.price <= this.stoploss) console.log("Stoploss hit");
    }

    if (result) {
      if (result >= 0) {
        this.winTrades.push(result);
      } else if (result < 0) {
        this.loseTrades.push(result);
      }

      this.balance = this.utils.round(this.balance + this.balance * result, 2);
      if (this.toDataBase) this.utils.updateFirebaseResults(result, this.balance, this.databasePath);
      /* this.utils.sendTelegramMsg(this.telegramBot, this.config.chatId, this.utils.formatTelegramMsg(this.loseTrades, this.winTrades, this.balance)); */
      console.log("Cloture", this.streamData.price);
      console.log(`Result : ${this.utils.round(result * 100, 2)}% | Balance : ${this.balance}$ | ${this.utils.getDate()}`);
      console.log("------------");
    }
  }

  /**
   * Check for setup on closed candles
   */
  async bullOrBear() {
    const i = this.ohlc.length - 1; // derniere candle cloturée
    //console.log("candle cloturée", this.ohlc[i]);

    if (!this.inLong) {
      const resLong = await this.stratService.bullStrategy(this.haOhlc, i, this.ticker, this.tf, this.ftxApi, this.ratio2p5);
      if (resLong.startTrade) {
        this.inLong = true;
        this.entryPrice = this.streamData.price;
        this.stoploss = resLong.stopLoss;
        console.log(`Entry long setup ${this.ticker} ${this.tf} min`, this.utils.getDate());
        console.log("EntryPrice", this.entryPrice);
        console.log("StopLoss", this.stoploss);
      }
    }
  }
}

const utilsService = new UtilsService();
const config = new Config();
new App(utilsService, new StrategiesService(utilsService), config, new ApiService(utilsService, config));
