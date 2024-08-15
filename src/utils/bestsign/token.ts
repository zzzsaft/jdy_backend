import axios from "axios";

class Token {
  private accessToken: string = "";
  private expire: number = 0;

  constructor() {}

  private async _get_token(): Promise<any> {
    let result = {};
    await axios
      .post(
        `${process.env.BESTSIGN_SERVER_HOST}/api/oa2/client-credentials/token`,
        {
          clientId: process.env.BESTSIGN_CLIENT_ID,
          clientSecret: process.env.BESTSIGN_CLIENT_SECRET,
        }
      )
      .then((res) => {
        result = res.data;
      })
      .catch((err) => {
        const { errno, errmsg } = err.response.data;
        console.log(
          `getToken ssq response: { errno: ${errno}  error: ${errmsg} }`
        );
      });
    return result["data"];
  }

  public async get_token(): Promise<any> {
    if (Date.now() < this.expire * 1000) {
      return this.accessToken;
    } else {
      const { accessToken, expiration, tokenType } = await this._get_token();
      this.accessToken = accessToken;
      this.expire = expiration;
      return `${tokenType} ${accessToken}`;
    }
  }
}
export const bestSignToken = new Token();
