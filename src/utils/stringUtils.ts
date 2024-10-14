import qs from "querystring";
export const createWechatUrl = (redirectUrl: string) => {
  return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=wwd56c5091f4258911&redirect_uri=${qs.escape(
    redirectUrl
  )}&response_type=code&scope=snsapi_base&state=STATE&agentid=1000061#wechat_redirect`;
};
