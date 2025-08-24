import axios from 'axios';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36';

function randIP(): string {
  const arr1 = ['218','218','66','66','218','218','60','60','202','204','66','66','66','59','61','60','222','221','66','59','60','60','66','218','218','62','63','64','66','66','122','211'];
  const ip1id = arr1[Math.floor(Math.random()*arr1.length)];
  const rand = () => Math.round((Math.floor(Math.random()* (2550000-600000+1)+600000))/10000);
  return `${ip1id}.${rand()}.${rand()}.${rand()}`;
}

async function curlGet(url: string, ua: string = USER_AGENT): Promise<string> {
  const headers = {
    'User-Agent': ua,
    'X-FORWARDED-FOR': randIP(),
    'CLIENT-IP': randIP(),
  };
  const res = await axios.get(url, { headers });
  return res.data;
}

async function curlPost(data: any, url: string, referer?: string, ua: string = USER_AGENT): Promise<any> {
  const headers: any = {
    'User-Agent': ua,
    'X-FORWARDED-FOR': randIP(),
    'CLIENT-IP': randIP(),
  };
  if (referer) headers['Referer'] = referer;
  const res = await axios.post(url, data, { headers });
  return res.data;
}

async function curlHead(url: string, referer: string, ua: string, cookie: string): Promise<string> {
  const headers = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Pragma': 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': ua,
    'Referer': referer,
    'Cookie': cookie,
  };
  try {
    const res = await axios.get(url, { headers, maxRedirects: 0, validateStatus: status => status >= 200 && status < 400 });
    return res.headers['location'] || res.request?.res?.responseUrl || '';
  } catch (e:any) {
    if (e.response?.headers?.location) {
      return e.response.headers.location;
    }
    return '';
  }
}

export async function getLanzouLink(options: {url: string, pwd?: string, type?: string, n?: string}): Promise<{code: number; msg: string; name?: string; filesize?: string; downUrl?: string}> {
  const { url: rawUrl, pwd = '', type = '', n } = options;
  if (!rawUrl) {
    return { code: 400, msg: '请输入URL' };
  }
  let url = 'https://www.lanzoup.com/' + rawUrl.split('.com/')[1];
  let softInfo = await curlGet(url);
  if (softInfo.includes('文件取消分享了')) {
    return { code: 400, msg: '文件取消分享了' };
  }
  let softName: string | undefined;
  let softFilesize: string | undefined;
  const nameRegexes = [
    /style="font-size: 30px;text-align: center;padding: 56px 0px 20px 0px;">(.*?)<\/div>/,
    /<div class="n_box_3fn".*?>(.*?)<\/div>/,
    /var filename = '(.*?)';/,
    /div class="b"><span>(.*?)<\/span><\/div>/
  ];
  for (const reg of nameRegexes) {
    const match = softInfo.match(reg);
    if (match) { softName = match[1]; break; }
  }
  const sizeRegexes = [
    /<div class="n_filesize".*?>大小：(.*?)<\/div>/,
    /<span class="p7">文件大小：<\/span>(.*?)<br>/
  ];
  for (const reg of sizeRegexes) {
    const match = softInfo.match(reg);
    if (match) { softFilesize = match[1]; break; }
  }
  let jsonInfo: any;
  if (softInfo.includes('function down_p(){')) {
    if (!pwd) {
      return { code: 400, msg: '请输入分享密码' };
    }
    const segments = [...softInfo.matchAll(/'sign':'(.*?)',/g)];
    const signs = [...softInfo.matchAll(/ajaxdata = '(.*?)'/g)];
    const ajaxm = [...softInfo.matchAll(/ajaxm\.php\?file=(\d+)/g)];
    const postData = new URLSearchParams({ action: 'downprocess', sign: segments?.[1]?.[1] || '', p: pwd, kd: '1' });
    const postRes = await curlPost(postData, `https://www.lanzoup.com/${ajaxm?.[0]?.[0]}`, url);
    jsonInfo = typeof postRes === 'string' ? JSON.parse(postRes) : postRes;
    softName = jsonInfo.inf;
  } else {
    let linkMatch = softInfo.match(/\n<iframe.*?name="[\s\S]*?"\ssrc="\/(.*?)"/) || softInfo.match(/<iframe.*?name="[\s\S]*?"\ssrc="\/(.*?)"/);
    const ifurl = `https://www.lanzoup.com/${linkMatch?.[1]}`;
    softInfo = await curlGet(ifurl);
    const segment = softInfo.match(/wp_sign = '(.*?)'/);
    const signs = softInfo.match(/ajaxdata = '(.*?)'/);
    const ajaxm = [...softInfo.matchAll(/ajaxm\.php\?file=(\d+)/g)];
    const postData = new URLSearchParams({
      action: 'downprocess',
      websignkey: signs?.[1] || '',
      signs: signs?.[1] || '',
      sign: segment?.[1] || '',
      websign: '',
      kd: '1',
      ves: '1'
    });
    const postRes = await curlPost(postData, `https://www.lanzoup.com/${ajaxm?.[1]?.[0]}`, ifurl);
    jsonInfo = typeof postRes === 'string' ? JSON.parse(postRes) : postRes;
  }
  if (jsonInfo?.zt !== 1) {
    return { code: 400, msg: jsonInfo?.inf };
  }
  const downUrl1 = `${jsonInfo.dom}/file/${jsonInfo.url}`;
  const downUrl2 = await curlHead(downUrl1, 'https://developer.lanzoug.com', USER_AGENT, 'down_ip=1; expires=Sat, 16-Nov-2019 11:42:54 GMT; path=/; domain=.baidupan.com');
  let downUrl = downUrl2 && downUrl2.includes('http') ? downUrl2 : downUrl1;
  if (n) {
    const rename = downUrl2.match(/(.*?)\?fn=(.*?)\./);
    if (rename) {
      downUrl = `${rename[1]}?fn=${n}`;
    }
  }
  downUrl = downUrl.replace(/pid=(.*?).&/, '');
  if (type === 'down') {
    return { code: 200, msg: '解析成功', downUrl };
  }
  return { code: 200, msg: '解析成功', name: softName, filesize: softFilesize, downUrl };
}

