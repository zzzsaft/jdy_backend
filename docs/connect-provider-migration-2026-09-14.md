# OA 外部 API 迁移到 Connect（2026-09-14）

状态：本地实现、配置复制和限定验证完成；未提交或发布本次改造，未修改生产配置或重启服务。

## 开发、运行与部署边界

- 业务开发：`D:/jdy_backend1/jdy_backend`，认证、业务授权、考勤/请假规则、持久化和流程处理留在 OA。
- Provider 开发：`C:/Users/云创联动/Documents/ChatGPT/简道云连接微服务`。OA 使用独立 `CONNECTOR_JDY_BACKEND_TOKEN`，不再读取所迁移 Provider 的签名私钥/API Key。
- Connect 部署入口：`scripts/deploy-static-release.ps1`；OA：`scripts/deploy.ps1`。原工作区既有变更未回退、未代为提交。
- 运行依赖：Connect HTTP、Provider、原 OA 数据库与企微代理。默认 OA 地址为 `http://integration-connector:4180`；开发环境须用可达的 `CONNECTOR_BASE_URL`。NAS Connect 加入 `business-platform`，OA 网络可达性尚未在本次生产验证。
- 发布次序：Connect 代码与最小权限配置 → 受保护生产环境配置 → OA 制品。Connect 生产读取 `.env.production`，本次只补了本地 `.env`；发布脚本不会因此自动载入新凭据。旧 OA 曾约定只上传、不自动重启，本次未调用部署入口。

## 迁移矩阵

| Provider | OA 迁移内容 | Connect 契约 |
| --- | --- | --- |
| 薪福通 | 组织、人员、考勤、请假、加班、外出、出差、薪酬、OA、消息/待办 JSON API | `POST /v1/providers/xft/invoke`，54 个精确 method/path/profile 组合 |
| 简道云 | 原 JSON API 与文件上传 | 复用 `/providers/jiandaoyun/invoke`、`/providers/jiandaoyun/files/upload`；保留版本及上传 transaction_id |
| 分贝通 | 部门、员工、表单、差旅列表/详情、通用审批详情、SSO | 复用已有具名接口，在 OA 还原 code/data、employees/applies、total_pages；SSO 直接使用 Connect 返回的 URL |
| 高德 | OA 逆地理编码 | 新增 `/providers/amap/reverse-geocode`，保留 status/regeocode |
| 上上签 | 合同、模板、下载、签名及令牌 | 复用二进制代理；增加模板审批精确白名单和 oss-policy 入口；保留大整数 ID 字符串和文件 base64 返回 |
| DeepSeek | 两处官方非流式聊天客户端 | 复用 OpenAI 兼容 `/providers/deepseek/chat/completions`，独立模块凭据，无 SDK 自动重试或重定向 |
| 天眼查 | 原先已迁移 | 保持已有 Connect 查询/缓存；本次回归通过 |

按用户明确选择，未使用的薪福通 `uploadFile` 占位方法不加入 Connect。旧 FormData→JSON 调用现在明确报不支持，不能悄悄发送空文件。Connect 精确白名单拒绝该路径。

仍保留原链路：企业微信/内部 jctimes 代理、InferAI/XH/本地模型、公开/临时附件 URL 下载和上上签临时 OSS 地址上传；现有 Connect 没有等价接口。这些不通过宽泛任意 URL 代理绕过边界。薪福通入站事件解密仍留在现有回调模块；SSO跳转生成已迁移，见下方补充。

## 薪福通兼容与边界

- `profile=app` 使用 `XFT_APP_APPID/XFT_APP_AUTHORITY_SECRET`；`profile=connect` 使用 `XFT_APPID/XFT_AUTHORITY_SECRET`。组织连接流只能使用对应 profile，不开放调用者传入 host 或签名 headers。
- 保留默认业务用户和平台用户，以及调用方指定身份。Connect 注入 CSC 认证参数，拒绝覆盖；不能把业务授权责任转移给这两个默认身份。
- SM2/SM3 与旧 sm-crypto 兼容：标准 16 字节 UID，原始 r||s 十六进制签名；秒级头、毫秒级查询；签名和实际发送正文一致。兼容旧私钥的前导零字节。
- 原样返回薪福通 JSON，包括历史数据集返回、不统一包装的业务错误及大整数。拒绝非 JSON/过大响应；不打印员工、工资、请求/响应正文或凭据。
- 请求 4 MiB、响应 16 MiB、默认 100 秒、最多 2 个并发，超额 429；不自动重试业务写入，不跟随上游重定向。
- 本批实时业务 API 不设数据缓存：TTL/旧数据上限均 0，无持久化业务响应，无缓存命中权限绕过。暂不把薪资/请假/审批决策放入公共目录缓存；公共目录已有统一能力保持独立。
- 加密实现参考库文档： https://github.com/emmansun/gmsm/blob/develop/docs/sm2.md 。已用旧 OA 的 sm-crypto 实际验证 Go 发出的 GET/POST 签名；不是只比较两段新实现。

## 配置复制

`node scripts/sync-connect-provider-env.mjs --connect-dir <Connect目录> --write` 按 OA `.env` 优先、`.env.prod` 补充的真实加载顺序复制，仅填目标缺失/空项。无 `--write` 为 dry-run。

本轮本地 Connect 补齐 18 项配置（含 Provider 地址/标识/密钥及独立 OA 模块令牌），OA 补齐同一独立令牌；`GAODE_KEY` 映射到 `AMAP_API_KEY`，简道云地址转换为 Connect 的版本化基址。既有非空项保留，复制后逐值回读验证且不输出值，再次 dry-run 为 0 项。

本地 `config/modules.json` 及示例模块增加 xft-api、jiandaoyun-api、amap-geocoding、deepseek-chat、bestsign-api 权限；保留分贝通、天眼查既有授权。简道云调用改为独立 Provider grant，兼容原 developer wildcard，但不给 OA 全 Provider wildcard。所有真实 `.env` 和本地模块文件保持 Git 忽略；原 OA 供应商密钥未删除，供生产切换前保留恢复依据。

## 验证证据

- OA `npx tsc --noEmit` 通过；新增客户端套件 10 项通过，覆盖返回格式、分页/SSO、文件、DeepSeek SDK、禁止重定向/重试、缺配置和未使用的 XFT 文件方法。既有天眼查 2 项、XFT SSO/轮休假及任务状态回归通过。
- Connect `go test ./...`、`go vet ./...` 通过。新增 XFT 签名/前导零/参数/身份/错误响应、越权、路径及 profile 白名单、重定向、取消、并发上限测试；高德参数与 Provider grant 隔离、上上签路径负例通过。
- Linux amd64、CGO 关闭静态构建通过（约 13.6 MB，未作为生产 Release）。
- 使用复制后的本地凭据、内存数据库和隔离 Connect HTTP handler，真实只读薪福通字段目录、简道云应用目录、分贝通单页员工查询、高德公共坐标逆地理编码均成功；上上签真实取令牌认证通过。输出只有状态，不保存业务正文。
- 薪福通 live 探针曾因前导零私钥被 Go 拒绝，已修复并复验成功；字段接口本身返回 HRSCMFLDY 数据集，探针据此判断，未伪造 returnCode。
- 以上不等于生产 OA→Connect 网络、真实薪资/请假写入、签署/文件写入、DeepSeek 实际推理或全量接口验收。本次未创建、审批、发送或修改真实业务单据。

## 下一步

按两仓已有发布机制同步生产代码、最小权限和缺失配置（不要用本地新令牌覆盖线上已有非空令牌），确认 OA 与 Connect 网络可达，再按既有 OA 重启约定切换。先验证只读链路和权限负例，随后在明确测试单据上验证写入/文件/SSO 端到端。

## 2026-09-14 补充：薪福通 SSO 已迁移

- 新增 `POST /v1/providers/xft/sso-link`，入参 `userId`、可选 `todoId/pageId`，返回 `{url}`；专属 `xft-sso:invoke` 权限，普通 `xft-api:invoke` 不能生成登录链接。OA本地模块与示例已补该grant。
- OA 正式 OAuth 回调先向企微核验身份、保留原用户ID截取规则，再调用 Connect；原测试回调/链接助手也复用同一客户端，测试链接助手现在是异步返回。移除无调用者的旧 `testRSA` 演示，薪福通模块不再自行读取 RSA 私钥或加密登录数据。
- Connect 使用 RSA PKCS#1 v1.5 加密 `{userid,timestamp}`，毫秒时间戳，页面参数优先于待办，否则默认workbench；标准URL编码保护base64中的加号、斜杠和等号。固定薪福通HTTPS origin，调用者不能指定host/连接流/密钥/时间戳。响应与OA成功跳转均no-store，不缓存登录凭证，不输出登录链接或用户明文。
- 按已有授权只补缺失配置：从OA旧RSA配置提取公钥，保存本地Connect `XFT_SSO_PUBLIC_KEY`，并补`XFT_SSO_CONNECTOR_ID/XFT_SSO_FLOW_ID`。原非空值保留，二次dry-run零改动，公钥与原OA密钥配对校验通过。RSA私钥仍供其他既有内部代理签名使用，未删除、未复制到Connect。
- 验证：OA类型检查、SSO客户端/回调/轮休假及原Provider回归通过；Connect全测/vet通过。实际OA TypeScript客户端→Connect鉴权HTTP→Node RSA解密联调通过（合成密钥/身份），验证旧格式和待办参数。使用实际本地配置及独立OA模块令牌生成合成身份链接HTTP200，未打开该链接、未发起真实用户登录。
- 生产尚未发布或重启。发布还须同步Connect生产`.env.production`公钥/入口及`xft-sso:invoke`，再按原OA部署约定切换客户端；真实企业微信扫码/点击到薪福通、待办落地验收待部署后完成。分贝通SSO保持上一批已迁移状态。

## 统一入口后续状态（2026-09-14，实施任务回执）
Connect0.4.63/24ae12d及SSO0.3.21/7f72cb8已由登录任务上线，658条分贝通精确身份映射已导入Connect；统一SSO入口不再依赖OA。本文件较早的OA回调迁移方案为本地历史候选，生产登录以SSO→Connect为准。旧OA人员同步和业务流程仍保留；完整同步迁移及真实用户免登尚待该任务完成。已清理导入后的本地DPAPI临时导出。

## 2026-09-14 — 大华与停车场 API 后续迁移

两套 API 及大华二进制上传已补充本地迁移，缺失三项配置已补齐；真实只读 OA→Connect→上游及上传策略通过，未部署/真实写入。人员同步单写者迁移仍由另一任务推进。完整契约与验证见 `dahua-parking-connect-migration.md`。
