import firebase from "firebase";

export class UtilsService {
  constructor() {}

  /**
   * Permet de retourner le pourcentage profit
   */
  getPercentageResult(entryPrice: number, closedPrice: number): number {
    return this.round((closedPrice - entryPrice) / entryPrice - 0.0007, 4);
  }

  /**
   * Mets en forme le msg telegram
   */
  formatTelegramMsg(loseTrades: any, winTrades: any, balance: number) {
    return (
      "Total trades : " +
      (winTrades.length + loseTrades.length) +
      "\n" +
      "Balance : " +
      balance +
      "\n" +
      "Winrate : " +
      (this.round((winTrades.length / (loseTrades.length + winTrades.length)) * 100, 2) + "%")
    );
  }

  /**
   * Permet d'arrêter le processus.
   */
  stopProcess(msg: string) {
    console.error(msg);
    process.exit(1);
  }

  /**
   * Check la validité des arguments passés à l'app.
   */
  checkArg(ticker: string, tf: number, allTicker: any, allTf: any) {
    if (!allTicker.includes(ticker) || !allTf.includes(tf)) {
      this.stopProcess("Argument error: " + ticker + " " + tf);
    }
  }

  /**
   * Fait la somme des nombres d'un tableau
   */
  arraySum(array: any) {
    return array.reduce((a, b) => a + b, 0);
  }

  transformToBiggerTimeframe(data: any, tf: any) {
    let result = [];
    let isModulo = false;
    let index = 0;

    for (let i = 0; i < data.length; i++) {
      if (Math.trunc(data[i].time / 60000) % tf === 0) {
        isModulo = true;
        index = i;
        break;
      }
    }

    if (isModulo) {
      for (let i = index; i < data.length; i += tf) {
        const tmpArray = data.slice(i, i + tf);
        const highArray = tmpArray.map((a) => a.high);
        const lowArray = tmpArray.map((a) => a.low);

        result.push({
          open: tmpArray[0].open,
          high: Math.max(...highArray),
          low: Math.min(...lowArray),
          close: tmpArray[tmpArray.length - 1].close,
          time: tmpArray[0].time,
          startTime: tmpArray[0].startTime,
        });
      }
    }
    return result;
  }

  /**
   * Retourne la valeur maximale en fonction de la source et de lookback
   */
  highest(data: any, index: number, source: string, lookback: number): number {
    let max: number;

    for (let k = 0; k < lookback; k++) {
      if (k === 0) {
        max = data[index - k][source];
      }

      if (data[index - k][source] > max) {
        max = data[index - k][source];
      }
    }
    return max;
  }

  /**
   * Retourne la valeur minimale en fonction de la source et de lookback
   */
  lowest(data: any, index: number, source: string, lookback: number): number {
    let min: number;

    for (let k = 0; k < lookback; k++) {
      if (k === 0) {
        min = data[index - k][source];
      }

      if (data[index - k][source] < min) {
        min = data[index - k][source];
      }
    }
    return min;
  }

  /**
   * Arrondi un nombre avec une certaine précision.
   */
  round(value: number, precision: number): number {
    const multiplier = Math.pow(10, precision || 0);
    return Math.round(value * multiplier) / multiplier;
  }

  /**
   * Retourne l'équivalent HeikenAshi
   */
  setHeikenAshiData(source: any): any {
    const result = [];

    for (let j = 0; j < source.length; j++) {
      if (j === 0) {
        const _close = this.round((source[j].open + source[j].high + source[j].low + source[j].close) / 4, 8);
        const _open = this.round((source[j].open + source[j].close) / 2, 8);
        result.push({
          close: _close,
          open: _open,
          low: source[j].low,
          high: source[j].high,
          bull: _close > _open,
          bear: _close < _open,
        });
      } else {
        const haCloseVar = (source[j].open + source[j].high + source[j].low + source[j].close) / 4;
        const haOpenVar = (result[result.length - 1].open + result[result.length - 1].close) / 2;
        result.push({
          close: this.round(haCloseVar, 8),
          open: this.round(haOpenVar, 8),
          low: this.round(Math.min(source[j].low, Math.max(haOpenVar, haCloseVar)), 8),
          high: this.round(Math.max(source[j].high, Math.max(haOpenVar, haCloseVar)), 8),
          bull: haCloseVar > haOpenVar,
          bear: haCloseVar < haOpenVar,
        });
      }
    }
    return result;
  }

  mean(series: Array<number>): any {
    let sum = 0;
    for (let i = 0; i < series.length; i++) {
      sum += series[i];
    }
    return sum / series.length;
  }

  ema(series: Array<number>, window: number, start?: number): any {
    const weight = 2 / (window + 1);
    const ema = [start ? start : this.mean(series.slice(0, window))];
    for (let i = 1, len = series.length; i < len; i++) {
      ema.push(series[i] * weight + (1 - weight) * ema[i - 1]);
    }
    return ema;
  }

  /**
   * Retourne la date avec décalage horaire.
   */
  getDate(ts?: any): any {
    let date = ts ? new Date(ts) : new Date();
    const year = date.getFullYear();
    const month = "0" + (date.getMonth() + 1);
    const day = "0" + date.getDate();
    const hours = "0" + date.getHours();
    const minutes = "0" + date.getMinutes();
    const second = "0" + date.getSeconds();
    return (
      day.substr(-2) + "/" + month.substr(-2) + "/" + year + " " + hours.substr(-2) + ":" + minutes.substr(-2) + ":" + second.substr(-2)
    );
  }

  /**
   * Insert chaque trade dans Firebase.
   */
  async updateFirebaseResults($rr: any, $balance: number, databasePath: string) {
    try {
      const res = await this.getFirebaseResults(databasePath);
      if (res) {
        const $winTrades = $rr > 0 ? res.winTrades + 1 : res.winTrades;
        const $loseTrades = $rr < 0 ? res.loseTrades + 1 : res.loseTrades;
        const $winrate = this.round(($winTrades / ($loseTrades + $winTrades)) * 100, 2);
        await firebase.database().ref(databasePath).remove();
        await firebase
          .database()
          .ref(databasePath)
          .push({
            winTrades: $winTrades,
            loseTrades: $loseTrades,
            totalTrades: res.totalTrades + 1,
            balance: $balance,
            "winrate%": $winrate ? $winrate : 0,
          });
      }
    } catch (error) {
      throw new Error("Error updateFirebaseResults()" + error);
    }
  }

  /**
   * Récupère les resultats depuis Firebase.
   */
  async getFirebaseResults(databasePath: string) {
    try {
      let snapshot = await firebase.database().ref(databasePath).once("value");
      if (snapshot.exists()) {
        const id = Object.keys(snapshot.val())[0];
        return snapshot.child(id).val();
      }
    } catch (error) {
      console.error(error);
    }
    return undefined;
  }

  /**
   * Initialise Firebase si la rerf n'existe pas.
   */
  async getBalance(toDataBase: boolean, databasePath: string) {
    let balance = 1000;
    if (toDataBase) {
      try {
        const res = await this.getFirebaseResults(databasePath);
        if (!res) {
          await firebase.database().ref(databasePath).push({
            winTrades: 0,
            loseTrades: 0,
            totalTrades: 0,
            balance: 1000,
            "winrate%": 0,
          });
        } else {
          balance = res.balance;
        }
      } catch (error) {
        throw new Error("Error initFirebase()" + error);
      }
    }

    return balance;
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

  async getBigTimeframeHA(ticker: string, tf: number, ftxApi: any) {
    try {
      let data: any;
      if (tf < 15) {
        data = await ftxApi.getHistoricalPrices({ market_name: `${ticker}/USD`, resolution: 14400 }); //4h
      } else {
        data = await ftxApi.getHistoricalPrices({ market_name: `${ticker}/USD`, resolution: 86400 }); //1D
      }

      return Promise.resolve(this.setHeikenAshiData(data.result));
    } catch (error) {
      console.error("Erreur", error);
    }
  }
}

export default new UtilsService();
