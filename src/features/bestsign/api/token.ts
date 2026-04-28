import axios from "axios";

class Token {
  private accessToken: string = "";
  private expireAtMs: number = 0;

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

  public invalidateToken() {
    this.accessToken = "";
    this.expireAtMs = 0;
  }

  public async get_token(forceRefresh = false): Promise<any> {
    // Refresh a bit early to avoid edge-of-expiry requests.
    const now = Date.now();
    const refreshSkewMs = 60 * 1000;
    if (!forceRefresh && this.accessToken && now < this.expireAtMs - refreshSkewMs) {
      return this.accessToken;
    }

    const { accessToken, expiration, tokenType } = await this._get_token();
    this.accessToken = `${tokenType} ${accessToken}`;

    // BestSign may return `expiration` as:
    // - unix seconds timestamp, or
    // - unix ms timestamp, or
    // - TTL seconds.
    const exp = Number(expiration);
    if (!Number.isFinite(exp) || exp <= 0) {
      // Conservative fallback: 10 minutes
      this.expireAtMs = now + 10 * 60 * 1000;
    } else if (exp > 1e12) {
      // likely ms timestamp
      this.expireAtMs = exp;
    } else if (exp > 1e9) {
      // likely seconds timestamp
      this.expireAtMs = exp * 1000;
    } else {
      // likely TTL seconds
      this.expireAtMs = now + exp * 1000;
    }

    return this.accessToken;
  }
}
export const bestSignToken = new Token();
