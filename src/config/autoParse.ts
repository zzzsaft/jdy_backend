import bodyParser from "body-parser";
import xmlparser from "body-parser-xml";

// 自定义中间件来根据请求主体的Content-Type自动选择解析器
export const autoParse = (req, res, next) => {
  //   console.log("Request is ", req.get("Content-Type"), req.is("xml"), req);
  if (req.is("text/xml")) {
    // 如果是XML格式，使用XML解析器
    xmlparser(bodyParser);
    bodyParser.xml()(req, res, next);
  } else {
    bodyParser.json()(req, res, next);
  }
};
