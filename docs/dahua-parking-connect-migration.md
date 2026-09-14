# 大华与停车场 API 迁入 Connect（2026-09-14）

状态：本地 API 层、配置和验证完成，未提交/部署，未切换人员同步执行者。不得据此标记整体人员同步已迁完。

## 开发与上线契约

- OA：`D:/jdy_backend1/jdy_backend`；仅修改 `features/dahua/api/{api_client,file,token}.ts`、`features/vehicle/api/api_client.ts`，现有服务层、事件、数据库回写、照片压缩、门禁设备列表、车牌有效期与离职禁车规则保持。登录任务继续负责人员同步与 CRM，不覆盖其候选。
- Connect：`C:/Users/云创联动/Documents/ChatGPT/简道云连接微服务`；新增 `access_providers.go`、`dahua_upload.go`，注册路由和 OA 最小模块授权。
- 运行：OA 使用 `CONNECTOR_BASE_URL`、`CONNECTOR_JDY_BACKEND_TOKEN`；Connect 持有 `DAHUA_CLIENT_ID`、`DAHUA_CLIENT_SECRET`、`PARKING_SECRET`。缺失三项已从 OA `.env`/`.env.prod`补到本地 Connect `.env`，已有非空值保持；回读和二次 dry-run 零变更通过。生产 `.env.production` 未改。
- 可选地址：`DAHUA_API_BASE_URL`、`PARKING_API_BASE_URL`，默认原供应商地址；拒绝调用方控制 host/header/token。停车场原 HTTP 端点仅固定兼容，其他非本机自定义地址须 HTTPS。大华 OSS 默认允许 HTTPS 的 `*.aliyuncs.com`，其他目标需部署配置 `DAHUA_OSS_ALLOWED_HOSTS` 精确 host；调用者不能传上传地址。
- 发布顺序：Connect `scripts/deploy-static-release.ps1` 的隔离制品、生产配置及 `dahua-api:invoke`/`parking-api:invoke` → OA `scripts/deploy.ps1` 的隔离制品及网络联通。OA 原只上传/不自动重启约定仍保持；当前 CRM/OA 部署权限问题没有由本任务解决。

## API 契约

`POST /v1/providers/dahua/invoke` 和 `/v1/providers/parking/invoke`：输入 `{method,path,query?,payload?}`，原始 JSON 业务响应透传，不把 `success:false` 变为成功，不丢失供应商大整数。GET/DELETE 的 query 仅 id；POST/PUT 使用 payload。未知方法/路径或 host/header 等附加输入拒绝。

| Provider | 原操作 |
| --- | --- |
| 大华 | POST/PUT `/gateway/person/api/personFile`；POST `/gateway/membership/api/org/list`、`/gateway/person/api/personFile/page`、`/gateway/dsc-owner/api/authAsync`；DELETE `/gateway/dsc-owner/api/deletePerson/{id}` |
| 停车场 | POST `/openApi/addCarInfo`、`/openApi/updateById`、`/openApi/list`、`/openApi/visitorAppoint`；DELETE `/openApi/deleteById`；GET `/openApi/queryById` |

`POST /v1/providers/dahua/files/upload`：原始二进制正文，`X-File-Name` 为 UTF-8 文件名的 base64url（无 padding），返回 `{path}`。Connect 自行取 OAuth、OSS policy、multipart 上传，只有成功才返回路径，原策略 key=`dir + '/' + filename` 保持。策略的 `code` 兼容真实字符串 `"0"` 及数字 `0`；不向 OA 返回临时凭据。原 token.ts 只保留明确报错的兼容导出。

OAuth token 按凭据与地址缓存到过期前 60 秒并合并刷新；业务数据、照片及停车决策不缓存/不落盘。两个 Provider 共用 2 并发槽，超出立即 429；JSON 请求 1MiB、响应 8MiB，文件 8MiB，JSON 总调用 10 秒、上传上游流程 25 秒。无写入重试或重定向；日志不记凭据/车牌/照片/正文，删除人员的审计路径隐藏 id。停车场沿用原排序 JSON+secret 的大写 MD5，兼容 JS HTML 字符、Unicode 分隔符、数字键及数值格式；时间戳固定 Asia/Shanghai。现有停车客户端的传输失败返回 undefined 行为保留。

## 验证证据

- OA `tsc --noEmit`，13 项 Provider/SSO 回归断言通过；新测试覆盖负例、字段/设备配置保持、流上传、中文文件名、体积限制和不重试。
- Connect `go test ./...`、`go vet ./...`、Linux amd64 静态构建通过。新增签名输入与实际 Node `JSON.stringify` 比对，OAuth 缓存/重定向、跨模块权限、操作白名单、上传策略/SSRF/失败/大小/并发测试。
- 真实只读：隔离内存 Connect HTTP handler 读取大华组织及停车场无匹配过滤查询成功；实际 OA TS → 模块鉴权 Connect HTTP → 两家真实查询成功；真实大华 policy 读取成功且 OSS 目标通过允许规则。仅输出聚合结果。
- 合成 TLS OSS：验证 multipart 凭据字段、中文文件名、字节及路径；上传失败不返回路径/不重试。未上传真实照片、创建/修改/删除车牌、建档或下发门禁。
- 实测入口：`access_providers_live_test.go`，仅显式 `ACCESS_PROVIDERS_LIVE=1`运行；可加 `ACCESS_TEST_OA_ROOT` 使用真实 OA 适配器。普通测试不访问真实供应商。

## 仍待完成

- 发布后的网络/最小授权/生产配置与真实受控写入和文件验收；源码和只读成功不代表线上已切换。
- 大华人员同步执行/映射迁入 Connect 属于另一任务，尚未完成。原入职 helper 的 dahua_id guard 与建档 guard 组合疑点保留，不能在本批 API 迁移中悄悄改变现有行为；员工档案银行资料回写及照片压缩仍在原业务链路。
