# P2-1 交付：人教版知识点目录与 G6 进度表（定稿）

> 日期：2026-10-06
> 依据：`docs/Plan2-内容工作清单.md`、规格 `2026-09-29-multi-family-multi-child-design.md` §4
> 状态：G6 闸门文档。Wayne 已授权 G6 包连续执行（2026-10-06）；本文件可供随时审阅。

## 1. G6 包完成后的六年级技能全表（13 个：六上 8 + 六下 5）

### 1.1 六上（11 个）

| skill code | 名称 | 周序 | 来源 |
|-----------|------|------|------|
| `position-direction` | 位置与方向（二） | 4 | 新增 |
| `fraction-ops` | 分数乘除与分数应用题 | 7（乘 1–3 周、除 5–7 周） | fraction 拆分新片 |
| `work-model` | 工程模型 | **7**（由 9 修正） | 现有，补模板 |
| `ratio-model` | 比与分配 | **8**（由 11 修正） | 现有，补模板 |
| `circle` | 圆 | 9–11（认识 9、周长 10、面积 11） | 新增 |
| `pie-chart` | 扇形统计图 | 16 | 新增 |
| `percent-model` | 百分数的认识 | 15 | 现有片，补模板 |
| `number-shape` | 数与形 | 17 | 新增 |

> 说明：六上共 8 个知识点，其中 4 新增、3 现有、1 拆分新片。

### 1.2 六下（6 个）

| skill code | 名称 | 周序 | 来源 |
|-----------|------|------|------|
| `negative-numbers` | 负数 | 1 | 新增 |
| `percent-apply` | 百分数应用（折扣/成数/税率/利率） | 3 | percent 拆分新片 |
| `cylinder-cone` | 圆柱与圆锥 | 4–7（圆柱 4–6、圆锥 7） | 新增 |
| `proportion-scale` | 比例（正反比例与比例尺） | 8–12 | 新增 |
| `pigeonhole` | 鸽巢问题 | 13 | 新增 |

## 2. 跨年级拆分片（非六年级片，随 G6 定稿，模板在对应年级包补足）

| skill code | 归属 | 周序 | 说明 |
|-----------|------|------|------|
| `fraction`（保留 ID） | 五下 | 15 | 分数意义、性质、加减；模板在 G5 包补意义性质题型 |

`decimal`/`decimal-ops` 随 G4 包处理，不在本文件。

## 3. 存量模板重指向映射（模板 ID 永不变）

### 3.1 fraction → fraction / fraction-ops

| 模板 ID | 现 skill | 目标 skill | 处理 |
|---------|---------|-----------|------|
| num-fraction-01 | fraction | fraction | 不动 |
| num-fraction-02 | fraction | fraction | 不动 |
| num-fraction-03 | fraction | **fraction-ops** | 改 skillCode |
| num-fraction-04 | fraction | **fraction-ops** | 改 skillCode，且变量改为纯乘法实例（现有加减实例由五下新模板顶替，G5 包补） |

重指向后缺口：fraction-ops 有 2 模板，需新增 5 个达 7；fraction 保持 2 模板（01/02），G5 包补到 7。

### 3.2 percent-model → percent-model / percent-apply

| 模板 ID | 现 skill | 目标 skill | 处理 |
|---------|---------|-----------|------|
| app-percent-01 | percent-model | **percent-apply** | 改 skillCode（折扣） |
| app-percent-02 | percent-model | percent-model | 不动（认识/百分率） |
| app-percent-03 | percent-model | **percent-apply** | 改 skillCode（折扣） |

重指向后缺口：percent-apply 有 2 模板，需新增 5（成数、税率、利率、折扣变式）；percent-model 有 1 模板，需新增 6 达 7。

## 4. G6 新模板锚定规则需求（formal-template-validation 扩展点）

每个新题干形式必须在验证器新增对应正则规则 + 单测：

| 技能 | 题干形式（示例） | 锚定计算 |
|------|----------------|---------|
| position-direction | 方位描述定位/路线 | 填空或选择，规则匹配方向与距离 |
| fraction-ops | 分数乘除计算、求一个数的几分之几、已知几分之几求总量 | 扩展 arithmeticValue 支持分数直接量 |
| circle | 周长 C=2πr/πd、面积 πr²、圆环 | π 取 3.14 显式写题干；新增圆规则 |
| pie-chart | 扇形百分率读图 | 总量×百分率 |
| negative-numbers | 数轴、温差、海拔差 | 带符号减法 |
| percent-apply | 折扣、成数、税率、利率、本息 | 比率四则；扩展现有折后价规则 |
| cylinder-cone | 侧面积、表面积、圆柱体积、圆锥 V=⅓Sh | π 取 3.14；⅓ 系数 |
| proportion-scale | 解比例、比例尺换算（cm↔km） | 比例内项积；单位换算 |
| pigeonhole | 至少数 = ⌈n/k⌉ | ceil 除法 |

## 5. G6 部署决策（fraction-ops 开关）

- G6 部署时 fraction-ops 为六上第 7 周技能；当前第 5 周。
- 为保持 Daisy 现有可练范围（现 num-fraction-03/04 在拆分前对她恒解锁），P2-8 部署时给 `fraction-ops` 加一条手动「on」（与现有 3 条 on 并列，共 4 条）。
- percent-apply 为六下内容，Daisy 无对应 on（按校历，下学期解锁）。
