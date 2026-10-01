# 多家庭结构上线部署手册（2026-10-01）

> 本文档仅记录未来上线步骤。**2026-10-01 的实现工作未部署、未 SSH、未改动生产数据。**
> 执行本手册前需 Wayne 明确授权，并确认现有孩子的正式登录名。

## 变更内容（对应分支 master，fc80bdf 之后）

- users 新增 `login_name`（唯一索引）、`parent_id`（自引用外键）、`grade`、`edition`、`is_admin`。
- skills 新增 `grade`、`semester`、`expected_week`（人教版 40 个知识点的编排数据）。
- 新表 `child_skill_settings`（auto/on/off 三态覆盖）、`academic_calendar`（校历）。
- 家长端：孩子列表首页、单孩子详情、孩子开户/改名/重置密码、知识点三态开关、校历与系统设置（管理员）。
- 每日组题与诊断只从「有效启用」的知识点出题。

## 前置确认

- [ ] Wayne 提供现有孩子的正式登录名（小写，匹配 `^[a-z][a-z0-9_.]{1,31}$`）。
- [ ] 确认孩子年级（迁移时为六年级）。
- [ ] 确认维护窗口：迁移期间应用应短暂停服或只读。

## 上线步骤

### 1. 备份（必做）

```bash
ssh -i ~/.ssh/fuword_deploy_ed25519 ubuntu@106.53.172.63
mkdir -p /opt/math-trainer/backups
docker cp math-trainer:/app/data/math-trainer.sqlite \
  /opt/math-trainer/backups/math-trainer-$(date +%Y%m%d-%H%M%S).sqlite
# 同时保留应用代码当前版本标识，便于回滚（git 当前 HEAD）。
```

### 2. 拉取并构建新镜像/代码

- 在服务器更新代码到包含全部多家庭提交的 master。
- 按现有 Docker 方式重新构建镜像（容器名 `math-trainer`，Node 24）。
- **先不切流量**。可用临时容器挂同一数据卷做构建验证。

### 3. 执行数据迁移（一次性）

迁移函数为事务式，失败自动回滚：

```bash
docker exec math-trainer node scripts/migrate-multi-family.ts \
  --child-login-name=<Wayne提供的登录名> --child-grade=6
```

预期输出：`多家庭结构升级完成：孩子登录名 <name>，年级 6`。

迁移内容：
- 家长置为 `login_name='admin'`、管理员；
- 孩子补登录名、归属 parent、年级；
- 40 个 skills 按 pepSkillSchedule 回填年级/学期/周序；
- 写入默认校历 2026-2027（2026-09-01 / 2027-02-22）。

重复执行会报「数据已经升级过」，不会重复写入。

### 4. 切到新版本并重启

- 用新镜像重建/重启 `math-trainer` 容器。
- 确认数据卷仍挂载 `/opt/math-trainer/data` → `/app/data`。

### 5. 线上验收

- [ ] `https://math.fubee.cn/login`：家长用 `admin` + 家长密码登录，看到孩子列表。
- [ ] 点「学习情况」看到原仪表盘全部历史数据（证据、周报、诊断、计划）。
- [ ] 点「题库设置」看到分组知识点与三态开关；试一次「关闭 → 恢复自动」。
- [ ] 孩子用新登录名 + PIN 登录，训练与诊断正常出题。
- [ ] 被关闭的知识点不出现在当天出题中。
- [ ] 管理员页：`/parent/calendar`、`/parent/settings` 可访问。

## 回滚方案

- 若迁移失败：事务自动回滚，数据不变；重建旧版本容器即可。
- 若上线后发现问题：停止新容器，用备份 SQLite 替换数据文件，启动旧版本镜像。
- 迁移本身不删列、不删表，旧版本应用可直接读取升级后的库（新列对旧代码无影响）。

## 备注

- 题库内容建设（13 个新知识点、80–120 个模板、小数/分数/百分数跨学期拆分）为独立的 Plan 2，不在本次结构升级范围内，后续单独实现与验收。
