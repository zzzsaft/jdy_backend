# WeChat 多企业同步配置与验证

## 环境变量示例

`WECHAT_CORP_CONFIGS` 支持同时配置多个企业微信的 `corpId`、`corpSecret`、`encodingAESKey`。在生产环境不要提交 `.env`，本地可参考下述格式：

```env
# 多企业配置，数组字符串格式
WECHAT_CORP_CONFIGS=[
  {"corpId":"wx123","corpSecret":"secret1","encodingAESKey":"aesKey1","name":"集团总部"},
  {"corpId":"wx456","corpSecret":"secret2","encodingAESKey":"aesKey2","name":"分公司A"},
  {"corpId":"wx789","corpSecret":"secret3","encodingAESKey":"aesKey3","name":"分公司B"}
]

# 兼容旧版单企业配置（未提供 WECHAT_CORP_CONFIGS 时生效）
CORP_ID=wx_single
CORP_SECRET=legacy_secret
WECHAT_ENCODING_AES_KEY=legacy_aes_key
```

> **说明**：`WECHAT_CORP_CONFIGS` 中的字段名需要和示例保持一致；`name` 为可选的备注，方便日志中识别企业。

## 验证配置（不连接生产数据库）

为避免直接操作生产数据，提供了仅校验配置合法性的脚本，不会触发数据库读写或同步逻辑：

```bash
# 使用实际的环境变量运行
npm run test:wechat-config

# 或者临时传入示例数据
WECHAT_CORP_CONFIGS='[{"corpId":"demo","corpSecret":"demo_secret","encodingAESKey":"demo_aes"}]' npm run test:wechat-config
```

脚本会检测是否存在有效的企业配置，并在日志中输出已加载的企业 ID 和名称，校验失败时会返回非 0 状态码方便在 CI 中阻断。
