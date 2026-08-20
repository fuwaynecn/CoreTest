# 家庭数学训练（Phase 2B）

孩子首次登录后先完成三部分、每部分 15 题的初始诊断；诊断可以暂停、刷新和继续，完成后家长能查看暂定六领域报告。家长可以从报告页发起下一版本复测；孩子继续复测时，上一版已完成报告与版本记录仍会保留。已有的每日 3 题训练继续用于小数计算、带单位读题和方程验收；家长页进一步显示五级能力状态、到期复习、算力/方程剂量和可修正的错因证据链。

## 学习证据规则

- 每个正式题位只有最早一次提交进入掌握度首答证据；订正答案保留在作答记录中，但不会把原来的错误改写成首答正确。
- 能力状态只由服务端根据不可变证据推导。家长页同时显示状态原因、门槛、相关日期和原题/首答下钻入口，不能直接修改能力状态。
- 错因汇总的有效值按“家长修正 → 孩子自评 → 系统候选”取值。家长修正会追加一条带操作者和时间的记录，系统候选与孩子原始选择继续可见。
- 活跃作答用时只作为题目上下文展示，不参与判分，也不用于给孩子贴速度标签。
- 到期复习按上海自然日保留；低准确率或复习失败调整支持与难度，不通过增加题量惩罚。算力和方程页面会同时显示每次目标、每周目标、上限和调整原因。

## 运行要求

- Node.js 24.x 与随 Node 安装的 npm。
- 一个可写、可持久化的本地目录，用于 SQLite 数据库。
- 生产环境只运行一个应用实例；Phase 1 不支持多个实例共享 SQLite。

先确认版本，再安装锁定依赖：

```powershell
node --version
npm --version
npm ci
```

`node --version` 应显示 `v24.x`。

## 环境变量与数据库初始化

| 变量 | 用途 |
| --- | --- |
| `DB_FILE_NAME` | SQLite 文件路径；默认 `data/math-trainer.sqlite`。必须位于可写且重启后仍保留的磁盘。 |
| `PARENT_PASSWORD` | `npm run db:seed` 使用的家长密码，长度必须为 4–128 个字符。 |
| `CHILD_PIN` | `npm run db:seed` 使用的孩子 PIN，长度必须为 4–128 个字符。 |
| `SESSION_COOKIE_SECURE` | 本地 HTTP 开发设为 `false`；HTTPS 环境可设为 `true`。生产构建始终发送 Secure 会话 Cookie。 |

不要把真实凭据提交到仓库。PowerShell 本地初始化示例：

```powershell
$env:DB_FILE_NAME = "data/math-trainer.sqlite"
$env:PARENT_PASSWORD = "<4-128 character password>"
$env:CHILD_PIN = "<4-128 character PIN>"
$env:SESSION_COOKIE_SECURE = "false"
npm run db:seed
npm run dev
```

`npm run db:seed` 会先执行 `drizzle/` 中尚未应用的迁移，再幂等更新一个家长、一个孩子、72 道诊断题，以及不会被诊断题库排序影响的固定 Phase 1 每日三题（小数计算、带单位读题、方程）。题目来源、许可、常见错误和读题卡标记都会写入数据库；旧题迁移时未知信息保持 `NULL` 或 `unknown`。对已有数据库执行前应先备份数据库文件。应用默认位于 [http://localhost:3000](http://localhost:3000)。

## 浏览器端到端依赖

Playwright 只安装在开发电脑或 CI 上，用于自动验收网页。孩子实际使用的 iPad 或安卓平板不需要安装 Playwright，只需使用平板自带的 Safari 或 Chrome 打开部署后的网址。

Playwright 配置保留两个平板浏览器项目：`tablet-webkit` 使用 Playwright WebKit，`tablet-chromium` 明确设置 `channel: "chrome"`，因此后者需要稳定版 Google Chrome，而不是 Playwright 自带的 Chromium。

本地安装所需浏览器：

```powershell
npx playwright install webkit
npx playwright install chrome
npx playwright install --list
```

`npx playwright install --list` 应列出本项目版本对应的 WebKit。稳定版 Chrome 也可通过系统安装；可直接确认其版本：

```powershell
& "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" --version
```

如果 Chrome 安装在用户目录，请改用 `$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe`。Linux CI 可使用：

```bash
npx playwright install --with-deps webkit chrome
google-chrome --version
```

## 验证

```powershell
npm run verify
npm run test:e2e
git diff --check
```

`npm run verify` 依次运行 ESLint、TypeScript、全部 Vitest 测试和生产构建。`npm run test:e2e` 使用与生产相同的 seed 和选题规则，在 WebKit 和稳定版 Chrome 中完成三段诊断、刷新恢复、选择题与数值题提交、家长页面发起第 2 版、孩子继续复测、旧报告保留，以及固定顺序的每日训练；每日训练验收还覆盖漏单位首答、正确订正、孩子自评、家长错因修正、证据下钻、到期日期和剂量展示，同时检查平板和 390px 宽度没有水平溢出。E2E 会且只会重建 `.tmp/e2e.sqlite`，不会插入生产中不存在的负数难度夹具题。

也可以分别运行浏览器项目：

```powershell
npm run test:e2e:webkit
npm run test:e2e:chromium
```

## HTTPS 与部署边界

本地 `npm run dev` 使用 HTTP 时保持 `SESSION_COOKIE_SECURE=false`。在 `NODE_ENV=production` 下，会话 Cookie 无论该变量取值如何都带 `Secure`；浏览器必须通过 HTTPS 访问站点，否则不会回传 Cookie。不要为了绕过此要求关闭 TLS 或降低 Cookie 安全属性。

SQLite 文件必须放在单个长期运行的 Node.js 实例所挂载的持久化磁盘上，并在部署与重启之间保留同一路径。临时文件系统、无状态 Serverless、横向扩容和多个应用实例同时使用本地 SQLite 均不受支持；因此本阶段不适合部署到使用临时磁盘的 Vercel/Serverless 运行时。生产部署应使用单实例、持久卷和常规数据库备份。三段诊断、每题快照、提交幂等记录、首答证据、错因审计、复习日期和剂量状态都保存在该 SQLite 文件中，备份时必须一并保留。当前文档只说明受支持的部署边界，不代表已经完成公网发布、监控或灾难恢复演练。
