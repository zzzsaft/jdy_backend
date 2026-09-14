## 2026-09-14 — OA授权修复独立复核与合同范围澄清

- 本任务独立核验生产Connect0.4.66/dd1e2cf9ddd7，OA模块9项具名grant已齐；OA生产env合并后的token存在且与Connect一致，base已配置。无效请求已到达Provider参数/路径验证（不再是模块FORBIDDEN）；精确发布提交的JDY invoke/call/upload已使用jiandaoyun-api。因此前次两项P1已解决。
- 用户明确OA合同模块已弃用：上上签扩展及旧附件事务并发问题不再作为OA上线阻塞，也不代表独立合同服务有相同问题，不继续修复废弃流程。
- 本轮只读，远端预期build位置仍无Connect客户端文件；OA部署、容器配置加载与实际网络链路仍待验证，不能把Connect发布视为OA已更新。未部署或重启。


以下为前次审查的历史记录，以以上复核状态为准。

# OA Connect 迁移发布前审查（2026-09-14）

结论：本地类型检查与16项测试通过，但当前OA候选不能按完整Connect迁移直接发布。本轮未修改代码、生产配置、服务或业务数据。

## 已验证问题

1. P1：生产Connect模块jdy-backend只有fenbeitong-api(read/invoke)，使用其现有令牌实际请求XFT/大华/停车/JDY/DeepSeek/高德均403。OA生产.env与.env.prod未找到CONNECTOR_JDY_BACKEND_TOKEN或CONNECTOR_BASE_URL；新客户端缺token会直接报错。容器Docker inspect权限不足，无法证明运行时未额外注入，不能把文件检查等同完整运行时检查。远端预期build路径尚无Connect客户端文件，也未验证OA此次已部署。
2. P1：线上version.json实测0.4.65/1c121b0cb4f1；检查该确切Git提交，JDY invoke/call/upload仍要求*:invoke，providerCapabilities未包含jiandaoyun-api。本地主树的专属权限改造未进入Release。因此只加预期jiandaoyun-api授权不足，还必须补正式Connect实现；不得用广泛通配权限掩盖发布遗漏。
3. P2：上述Release未包含上上签oss-policy路由（线上POST空请求404）及templates/{id}/approve白名单。OA已按这些入口写好适配，调用时会失败；当前未找到两方法实际业务调用点，不能宣称现有主合同流程已经因此中断。
4. P2：已存在的合同附件并发隐患仍未消除。JDY单例uploadBuffers写this.transaction_id，合同服务await后读取该共享属性回写记录。两个模拟上传交错时稳定复现A结果与当前transaction_id不一致；建议返回{results,transactionId}并让消费方使用批次局部ID。不是本轮新增问题，迁移后仍存在。

## 验证与边界

- npx tsc --noEmit --pretty false通过；Provider、大华停车、XFT SSO/轮休假/任务状态、CRM身份等现有16项测试通过。
- 仅SSH读取生产配置/版本并发送不能进入业务写入的空请求权限探测；无真实车牌、人员、门禁、合同写入，没有打印凭据或个人数据。
- 当前PERSONNEL_SYNC_OWNER生产文件未启用；发布版本也不含人员迁移候选。CRM候选未因此切换。分贝通回调路由删除有独立用户任务，未当作本次意外回归。
- 对事务串用的拟修复命令被自动审批以“blocked by policy”拒绝，未提供具体原因，文件未修改；本轮未尝试绕过，后续保持只读检查。未创建原拟发布前检查脚本。
- 部署入口仍Connect scripts/deploy-static-release.ps1与OA scripts/deploy.ps1；应先补Connect缺失实现与OA最小授权，再对齐生产OA令牌/网络，最后隔离发布OA。实际容器网络及运行时注入仍待具备读取权限后验证。

## 2026-09-14 — OA Provider生产授权与配置P1修复（运行时待验）

- 实测确认生产jdy-backend仅FBT授权，OA .env/.env.prod无Connect token/base。以上轮开发身份验收不能代表OA授权已齐全。
- 以实测线上0.4.65/1c121b0隔离发布Connect0.4.66/dd1e2cf9ddd7：注册jiandaoyun-api并把invoke/call/upload的*:invoke改为专属授权；未加入上上签P2或OA其他候选。go test ./.../vet通过，Provider越权负例通过。发布44秒，Release connector-0.4.66-dd1e2cf9ddd7-f2b430ca，旧0.4.65 Release保留。
- 生产jdy-backend补8项最小grant：XFT/JDY/高德/DeepSeek/上上签/天眼查/大华/停车；保留FBT、所有其他模块和Connect既有令牌，无通配授权，不给OA独立SSO权限。只将既有OA token及内网base补到/volume1/docker/backend/.env.prod，Connect env未改，原非空配置保留。
- 备份前缀/volume1/docker/integration-connector/.deploy-backup/oa-grants-20260914-113658（env.production/modules.json/oa.env.prod）；Connect受控config-reload成功，镜像/Release不变，OA文件令牌逐值相等，二次预检零补项。
- 使用OA生产文件中的令牌（非developer）实测MCP：XFT字段、大华组织、停车过滤单页、高德公共坐标均业务成功；JDY invoke和app.list具名HTTP200；DeepSeek空参数400证明已过鉴权；ERP403、XFT独立SSO403。没有真实业务写入。
- 局部完成：Connect授权/简道云实现及OA生产配置文件已修复；OA容器读取/重载受sudo Docker权限限制，现有助手无OA入口，未绕过/重启/发布OA，不能宣称运行进程配置、容器网络及完整OA业务已验收。P2上上签扩展/附件事务问题及同步迁移仍属独立待办。
