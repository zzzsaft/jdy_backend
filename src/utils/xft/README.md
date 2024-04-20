## README- SDK（C#）

### 当前版本

版本：1.0.1

### SDK使用方式（maven引入本地依赖）

1） 将 dll 放置在项目路径\bin\Debug 下

2）在项目中引用刚加入的四个 dll

### 调用代码示例

这里我们提供了以下几种常见的请求接口的调用示例。

对于大部分，只需要设置租户号、应用相关 appId 和 authoritySecret等信息构建公共信息，设置请求路径和接口名称；构造请求体采用字符串形式，具体请求体内容需要参考具体的接口文档。

#### 1. POST请求（不带其他queryParam）

```c#
   /* 1.基本信息内容 */   
    /* 薪福通租户号 */
    string companyId = "xxxxxxx";
    /* 开放平台 appId*/
    string appId = "xxxxxxxxxxxxxxxxxxxxx";
    /* 开放平台 authoritySecret*/
    string authoritySecret = "xxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    /* 请求路径（以测试环境为例） */
    string url = "https://api.cmburl.cn:8065/apm/apmst1/apm/EAIDTCHK";
    /* 2.公共信息构建 */
    BaseReqInf baseReqInf = new BaseReqInf(companyId, appId, authoritySecret);
    /* 3. 请求报文构建：字符串形式(推荐使用方式)*/
    String requestBody = "{\"USSTNCODY\":[{\"STNATB\":\"0\",\"CLTNBR\":\"U0000\",\"STNCOD\":\"S0001\"}]}";
	/* 4.调用接口 */
	XftOpenClient xftOpenClient = new XftOpenClient();
    string result = xftOpenClient.doCommonPostReq(baseReqInf, url, null, requestBody);
```

#### 2. POST请求（带其他queryParam）

```c#
    /* 1.基本信息内容 */   
    /* 薪福通租户号 */
    string companyId = "xxxxxxx";
    /* 开放平台 appId*/
    string appId = "xxxxxxxxxxxxxx";
    /* 开放平台 authoritySecret*/
    string authoritySecret = "xxxxxxxxxxxxxxxxxxxxx";
    /* 请求路径（以测试环境为例） */
    string url = "https://api.cmburl.cn:8065/itrip/xft-api/uat1/v1/bills/queryDetails";
	/* 2.公共信息构建 */
    BaseReqInf baseReqInf = new BaseReqInf(companyId, appId, authoritySecret);
	/* 3. 请求报文、queryParam构建：字符串形式(推荐使用方式)*/
	string requestBody = "{\"applyTimStart\":\"2022-4-11\",\"applyTimEnd\":\"2022-4-12 15:00:00\",\"limit\":20}";
    Dictionary<string, object> queryParam = new Dictionary<string, object>();
    queryParam.Add("OPAUID", companyId);
	/* 4.调用接口 */
    XftOpenClient xftOpenClient = new XftOpenClient();
    string result = xftOpenClient.doCommonPostReq(baseReqInf, url, queryParam, requestBody);
```

#### 3.GET请求

```c#
    /* 1.基本信息内容 */  
    /* 薪福通租户号 */
    String companyId = "xxxxxxx";
    /* 开放平台 appId*/
    String appId = "xxxxxxxxxxxxxx";
    /* 开放平台 authoritySecret*/
    String authoritySecret = "xxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    /* 请求路径（以测试环境为例） */
    String url = "https://api.cmburl.cn:8065/itrip/xft-api/uat1/v1/bills/detail/2022011900579603";
    /* 2.公共信息构建 */
    BaseReqInf baseReqInf = new BaseReqInf(companyId, appId, authoritySecret);
	/* 3.queryParam构建：字符串形式(推荐使用方式)*/
    Dictionary<string, object> queryParam = new Dictionary<string, object>();
    queryParam.Add("OPAUID", companyId);
	/* 4.调用接口 */
    XftOpenClient xftOpenClient = new XftOpenClient();
    string result = xftOpenClient.doCommonGetReq(baseReqInf,url, queryParam);
```

#### 