# WeChat 多企业同步配置与验证

## 天眼查通过 Connect 调用

CRM 企业搜索和工商基本信息不再读取 `TIANYANCHA` 或直连天眼查。运行环境只配置：

- `CONNECTOR_BASE_URL`：Connect 服务地址，Docker 私网默认 `http://integration-connector:4180`。
- `CONNECTOR_JDY_BACKEND_TOKEN`：仅具备 `tianyancha-company:invoke` 权限的模块令牌。

天眼查供应商 Token、地址和超时由 Connect 统一管理。两侧只记录供应商、操作、状态和耗时，不记录查询关键词、Token 或响应正文。

Connect 会先查询自身 bbolt 天眼查缓存，相同参数缓存未过期时不会再次计费调用。首次上线缓存版本后，可在仅能访问 Connect 管理接口的受控环境执行一次旧库迁移：

```bash
CONNECTOR_ADMIN_BASE_URL=http://integration-connector:4180 \
CONNECTOR_ADMIN_TOKEN=<受保护的管理令牌> \
npm run migrate:tianyancha-cache
```

脚本只读取 `crm_customer_info` 和 `crm_search`，按最多 100 条一批重建天眼查成功响应并导入 Connect；不会删除或修改旧表，也不会输出企业查询正文、管理令牌或完整响应。迁移可重复执行，Connect 已有的同键数据会保留，旧数据不会覆盖较新的 API 缓存。

## 环境变量示例

`WECHAT_CORP_CONFIGS` 支持同时配置多个企业微信的 `corpId`、`corpSecret`、`encodingAESKey`，并在同一企业下为不同应用提供独立的 `agentId` 与 `corpSecret`。在生产环境不要提交 `.env`，本地可参考下述格式：

```env
# 多企业配置，数组字符串格式
WECHAT_CORP_CONFIGS=[
  {
    "corpId":"wx123",
    "corpSecret":"corpDefaultSecret1",
    "encodingAESKey":"aesKey1",
    "name":"集团总部",
    "apps":[
      {"agentId":1000001,"corpSecret":"oaAppSecret","name":"OA"},
      {"agentId":2000001,"corpSecret":"crmAppSecret","name":"CRM"}
    ]
  },
  {"corpId":"wx456","corpSecret":"secret2","encodingAESKey":"aesKey2","name":"分公司A"}
]

# 兼容旧版单企业配置（未提供 WECHAT_CORP_CONFIGS 时生效）
CORP_ID=wx_single
CORP_SECRET=legacy_secret
WECHAT_ENCODING_AES_KEY=legacy_aes_key
# 默认应用 agentId 与 secret（会作为 apps 的回退）
CORP_AGENTID=1000002
CORP_AGENTID_CRM=1000003
CORP_SECRET_CRM=legacy_crm_secret
```

> **说明**：`WECHAT_CORP_CONFIGS` 中的字段名需要和示例保持一致；`name` 为可选的备注，方便日志中识别企业。`apps` 用于按 `agentId` 指定不同应用的 `corpSecret`，未匹配到时会回退到企业级 `corpSecret`。

## 验证配置（不连接生产数据库）

为避免直接操作生产数据，提供了仅校验配置合法性的脚本，不会触发数据库读写或同步逻辑：

```bash
# 使用实际的环境变量运行
npm run test:wechat-config

# 或者临时传入示例数据
WECHAT_CORP_CONFIGS='[{"corpId":"demo","corpSecret":"demo_secret","encodingAESKey":"demo_aes"}]' npm run test:wechat-config
```

脚本会检测是否存在有效的企业配置，并在日志中输出已加载的企业 ID 和名称，校验失败时会返回非 0 状态码方便在 CI 中阻断。

## 一键同步所有公司部门/员工

系统提供了用于手动触发“同步全部企业微信公司”的 HTTP 接口，便于一次性拉取所有企业的部门与员工数据：

```bash
# 同步所有企业的部门
curl -X POST http://<host>:<port>/wechat/sync/departments/all

# 同步所有企业的员工
curl -X POST http://<host>:<port>/wechat/sync/users/all
```

> **权限限制**：以上接口当前未内置鉴权逻辑，会直接触发全量同步。请务必通过内网访问、网关白名单或反向代理鉴权进行保护，仅向管理员或可信任务开放。

> **备注**：内部同步逻辑支持使用企业配置中的 `name` 作为公司标识（如通过 webhook/脚本传入 `corpName`），系统会自动解析为对应的 `corpId` 并写入数据库。
# productConfigAgent

Product configuration agent architecture and naming rules are documented in
`src/features/productConfigAgent/README.md`.

The documentation index is `docs/README.md`, and the productConfigAgent
documentation map is `docs/productConfigAgent/README.md`.

The implementation now lives under `src/features/productConfigAgent`.
`src/features/quoteAgent` is only a legacy compatibility facade.

Concept Layer candidate resolve commands are documented in
`docs/productConfigAgent/concept-layer-candidate-resolve.md`.

Normalization rerun commands are documented in
`src/features/productConfigAgent/scripts/normalization.README.md`.

Production detail Excel batch parse commands are documented in
`src/features/productConfigAgent/scripts/parseProductionDetailExcels.README.md`.
