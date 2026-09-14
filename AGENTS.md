# Agent Notes

- Keep `entity` directories limited to TypeORM entity modules and entity barrel exports only.
- Do not put tests, scripts, fixtures, generated artifacts, `.DS_Store`, or other side-effectful files under any `entity` directory; TypeORM imports entity globs during data-source initialization.
- Place tests under `test/` or the relevant feature test location outside `entity` directories.

## 人员与部门同步归属（2026-09-14 用户最新约定）

- 各外部系统已存在的人员、部门同步及精确跨系统身份映射统一由 Connect 执行与持久维护；迁移保持既有主数据来源、同步方向、字段转换、过滤条件、触发方式及回写语义，不因迁移自动增加新同步方向。
- 此范围包含相应定时/事件/人工触发、差异比对、同步记录及可控重试。OA保留考勤、请假、审批、差旅等业务流程及消费端所需数据；不得将与人员状态关联的业务副作用直接删除。
- 登录服务负责身份认证、会话及SSO回调，Connect负责第三方免登链接与精确身份映射；禁止用模糊姓名或猜测手机号授予身份。
- 按系统单写者切换；源代码迁移和本地验证不代表已部署或旧触发器已停止。只有新执行链路、旧触发器停用、消费方兼容与真实验证通过，才能标记该同步已迁移。
