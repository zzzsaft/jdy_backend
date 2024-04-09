import _ from "lodash";
import axios from "axios";
import qs from "querystring";
import { jdyLimiter } from "../../config/limiter";
import dotenv from "dotenv";
export class ApiClient {
    host;
    apiKey;
    version;
    /**
     * 构造方法
     * @param { String } apiKey - apiKey
     * @param { String } host - host
     * @param { String } version - version
     */
    constructor(version) {
        dotenv.config();
        this.host = process.env.JDY_HOST;
        this.apiKey = process.env.JDY_API_KEY;
        this.version = version;
    }
    /**
     * 发送http请求
     * @param { Object } options - 请求参数
     * @param { String } options.version - 版本
     * @param { String } options.method - HTTP动词 (GET|POST)
     * @param { String } options.path - 请求path
     * @param { Object } options.query - url参数,可选
     * @param { Object } options.payload - 请求参数,可选
     */
    async doRequest(options, limitOption) {
        const httpMethod = _.toUpper(options.method);
        const query = options.query ? `?${qs.stringify(options.query)}` : "";
        const axiosRequestConfig = {
            method: httpMethod,
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "Content-type": "application/json;charset=utf-8",
            },
            url: `${this.host}/${options.version ?? this.version}/${options.path}${query}`,
            data: options.payload,
            timeout: 5000,
        };
        let response;
        try {
            await jdyLimiter.tryBeforeRun(limitOption);
            response = await axios(axiosRequestConfig);
            return response.data;
        }
        catch (e) {
            // console.log(e);
            response = e.response;
            if (response) {
                const { status, data } = response;
                if (status && status > 200 && data.code && data.msg) {
                    throw new Error(`请求错误！Error Code: ${data.code}, Error Msg: ${data.msg}`);
                }
            }
            throw e;
        }
    }
}
//# sourceMappingURL=api_client.js.map