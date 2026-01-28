# WeChat 多企业同步配置与验证

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
