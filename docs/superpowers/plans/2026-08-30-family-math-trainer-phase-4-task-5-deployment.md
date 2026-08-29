# Phase 4 Task 5 测试部署实施计划

**目标：** 将单体 Next.js 数学训练器部署到现有 Linux 云服务器，并通过 `math.fubee.cn` 提供隔离的 HTTPS 测试入口。

**架构：** 应用使用独立 Docker Compose 项目和独立 SQLite 数据目录，加入现有 `fuword_default` Docker 网络。现有 Caddy 保持占用 `80/443`，只新增一个域名反向代理到应用容器的 `3000` 端口。

**范围：** 只做测试部署、域名转发和基础验收；不实现备份、导出、恢复或运行监控。

## 步骤

- [x] 在 `web/` 添加 Docker 构建文件、忽略文件和部署 Compose 配置。
- [x] 上传代码到服务器 `/opt/math-trainer`，生成服务器端环境变量和独立数据目录，构建并启动 `math-trainer` 容器。
- [x] 在现有 `/opt/fuword/Caddyfile` 增加 `math.fubee.cn` 转发，重新加载 Caddy，不重启其他应用。
- [x] 验证容器健康状态、HTTPS 响应、登录流程和基本页面访问；记录测试账号，不提交任何密钥。

## 已验证结果

- `math-trainer` 容器状态为 `healthy`。
- `https://math.fubee.cn/login`、家长登录、孩子登录、`/parent`、`/child`、`/manifest.webmanifest` 和 `/sw.js` 返回成功。
- 现有 `word.fubee.cn/healthz` 和 `st.fubee.cn` 仍可访问。
