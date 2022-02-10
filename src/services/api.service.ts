import { UtilsService } from './utils-service';

export class ApiService {

  constructor(private utils: UtilsService) { }

  getDataFromApi(url: string): Promise<any> {
    return new Promise<any>(async (resolve, reject) => {
      const axios = require('axios').default;
      const res = await axios.get(url);
      if (res) {
        resolve(res.data);
      } else {
        reject();
      }
    });
  }

}
