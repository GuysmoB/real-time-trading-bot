// https://www.digitalocean.com/community/tutorials/setting-up-a-node-project-with-typescript
// https://github.com/nikvdp/pidcrypt/issues/5#issuecomment-511383690
// https://github.com/Microsoft/TypeScript/issues/17645#issuecomment-320556012

import IG from 'ig-api'

const isDemo = true;
const apiKey = '7371473764e015d5c0af7a19451bf58a96eba73e';
const username = 'guysmalerie_demo';
const password = 'Guysmo92*';

const ig = new IG(apiKey, isDemo)

class App {

    constructor() {
        this.init();
        console.log('hello world')
    }

    async init(): Promise<void> {
        try {
            await ig.login(username, password);
            //const positions = await ig.get('positions')
            //console.log('positions:', positions)
          } catch (error) {
            console.error(error)
          }
    }
}

new App();