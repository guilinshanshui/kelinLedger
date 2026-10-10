# Emoji 图标替代方案（MingCute）

> 扫描日期：2026-10-05。扫描范围：`pages/`、`components/`、`common/`、`cloudfunctions/`。
> 结论：共发现 **92 种 emoji、340+ 处引用**。本方案用 MingCute 图标库（Apache-2.0，line/fill 严格成对）替换。

## 一、分类体系类（存在数据库 `icon` 字段，改名需数据迁移）

这类 emoji 存在云端（分类、支付方式、空间头像、资产类型），**新老数据会并存**，替换分两步：
1. 渲染层支持新格式（`mc:图标名` 前缀），emoji 兜底保留；
2. 云函数 seed 改为发出新格式，新建空间即用新图标。

### 1.1 支出分类（`cloudfunctions/roomie/lib/seed.js` EXPENSE_CATEGORIES）

| 现在 | 语义 | MingCute（line / fill） |
|---|---|---|
| 🍜 | 餐饮 | `dinner` / `fork-knife`（备选 `bowl`） |
| 🚗 | 交通 | `car` |
| 🛍 | 购物 | `shopping-bag-3`（备选 `shopping-cart-2`） |
| 🏠 | 居住 | `home-5`（备选 `home-1`） |
| 💡 | 水电 | `flash` |
| 💊 | 医疗 | `first-aid-kit`（备选 `hospital`） |
| 📚 | 教育 | `book-2`（备选 `notebook-2`） |
| 🎮 | 娱乐 | `game-2`（备选 `game-1`） |
| 🎁 | 人情 | `gift-2`（备选 `gift`） |
| 🐾 | 宠物 | `cat`（备选 `dog`） |
| 📦 | 其他/未分类兜底 | `puzzled` |

### 1.2 收入分类（同文件 INCOME_CATEGORIES）

| 现在 | 语义 | MingCute |
|---|---|---|
| 💰 | 工资 | `receive-money`（备选 `pig-money`） |
| 🏆 | 奖金 | `trophy` |
| 📈 | 投资收益 | `chart-line` |
| 🧾 | 兼职 | `file-certificate`（备选 `report`） |
| 🧧 | 红包 | `red-packet` |
| 🧮 | 报销 | `counter-2`（备选 `card-refund`） |
| ➕ | 其他收入 | `add-circle` |

### 1.3 支付方式（PAY_METHODS）

| 现在 | 语义 | MingCute |
|---|---|---|
| 💚 | 微信 | `wechat`（品牌色由渲染层加 `color:#07C160`） |
| 💙 | 支付宝 | `alipay`（品牌色 `color:#1677FF`） |
| 💳 | 银行卡 | `bank-card` |
| 💵 | 现金 | `cash-2`（备选 `coin`） |
| 🧩 | 其他 | `puzzled` |

同步替换 `cloudfunctions/roomie/lib/accounts.js` 的 `ACCOUNT_TYPES`（微信/支付宝/银行卡/现金/投资/信用卡/其他）。

### 1.4 空间类型与图标选择（`cloudfunctions/roomie/actions/type.js`）

ROOM_TEMPLATES / ROOM_ICONS / room-settings 的 `iconOptions`：

| 现在 | 语义 | MingCute |
|---|---|---|
| 🏠 | 家庭 | `home-5` |
| 🏡 | 家宅 | `home-2` |
| 👨‍👩‍👧 | 成员组合 | `group-2` |
| 💞 | 情侣 | `love`（备选 `hand-heart`） |
| 🛋 | 合租 | `sofa` |
| ✈️ | 旅行 | `airplane` |
| 🍼 | 宝宝 | `baby` |
| 🐾 | 宠物 | `cat` |
| 💼 | 工作 | `briefcase` |
| 📚 | 学习 | `book-2` |
| 🏃 | 运动 | `run` |
| 🍜 | 美食 | `dinner` |
| 🎮 | 游戏 | `game-1` |
| 🐷 | 存钱 | `pig-money` |
| 🎁 | 礼物 | `gift` |
| 🧳 | 旅行箱 | `luggage` |
| ⭐ | 星星 | `star-2` |
| 🌱 | 植物 | `leaf` |
| 🎨 | 自定义 | `palette-2` |
| 🎯 | 目标 | `target` |
| 🧾 | 票据 | `ticket`（备选 `bill-2`） |
| 💰 | 账本 | `bill` |
| 📒 | 账本默认兜底 | `notebook-2` |

### 1.5 家庭功能模块（ROOM_FEATURES）

| 现在 | 语义 | MingCute |
|---|---|---|
| 💰 | 家庭账本 | `bill` |
| 📋 | 家庭清单 | `list-check-3` |
| 📅 | 日程提醒 | `calendar-2` |
| ✨ | 家庭动态 | `sparkles-2` |

## 二、页面 UI 类（纯展示，直接替换）

| 现在 | 位置 | 语义 | MingCute |
|---|---|---|---|
| 🔔 | home:19 / notifications / ScheduleCreateModal | 通知铃铛 | `bell` |
| 🔍 | home:74 / checklist-center:47 | 搜索 | `search-2` |
| 📊 | home:58 | 统计分析入口 | `chart-pie` |
| 📅 | home:62 | 账单日历入口 | `calendar-2` |
| 💳 | home:66 / profile:108 | 资产账户入口 | `bank-card` |
| ⇄ | home:30 | 切换账本 | `transfer-horizontal` |
| ▾ / ↗ / ↘ / → / ← | 多处 | 方向符号 | `arrow-down` / `arrow-right-up` / `arrow-right-down` / `arrow-right` / `arrow-left` |
| 🎨 | profile:95 / ThemePickerModal:23 | 个性换肤 | `palette-2` |
| 🙋 | profile:71 | 编辑资料 | `user-2`（备选 `idcard`） |
| 🔐 | profile:83 | 空间权限 | `safe-shield`（备选 `hand-card`） |
| 📥 | profile:120 | 导入账单 | `download-2`（语义为"导入"更贴切用 `file-upload`，二选一） |
| 📤 | profile:132 | 导出账单 | `file-upload`（若上面用 file-upload 则这里用 `download-2`） |
| 🚪 | profile:160（已注释保留） | 退出 | `exit-door` |
| ⚙️ | dashboard:44 / notifications:252 / room-list:42 | 设置齿轮 | `settings-3` |
| 👤 | add-entry:102 / member-management:136 等 | 经办成员/成员 | `user-2` |
| 📄 | ledger-import:40 | 上传文件 | `file`（备选 `attachment`） |
| ✓ | CategoryPicker / ledger-import | 选中勾 | `check-2` |
| 🌱 | ledger-all 空态 | 空账本插画 | `leaf` |
| 🍃 | asset-details:236 / ledger-all | 空态装饰 | `leaf-2` |
| 🚀 | version-history:64 | 版本发布 | `rocket` |
| 🐞 | version-history:106 | Bug 修复 | `bug` |
| 🔥 | DashboardLedger:508 / InviteModal:245 | 连续记录热度 | `fire`（备选 `campfire`） |
| 🛡 | home:103（已注释）/ member-management:135 | 安全 | `safe-shield` |
| ⚠️ | DashboardLedger:43 | 预算预警 | `alert`（备选 `information`） |
| 👑 | dashboard:26 | 创建者标识 | `vip-2`（备选 `medal`） |
| 💡 | seed:10 | 已在分类体系内 | `flash` |
| 👁 | member-management:137 | 只读角色 | `eye-2`（备选 `eye`） |
| 📲 | login:73 | 扫码/设备 | `cellphone` |
| 🔑 | login:73 | 密钥 | `hotkey`（备选 `safe-shield`） |
| 📸 | ProfileEditModal:35 | 拍照改头像 | `camera` |
| 🎈 | DashboardSchedule:164 | 庆祝 | `air-balloon` |
| ☀ / 🌙 | ScheduleCreateModal:48/56/95 | 白天/夜晚提醒 | `sun` / `moon` |
| 💌 📬 📩 📭 | notifications 空态/兜底 | 信箱 | `mail`（备选 `message-2`） |
| 💸 | DashboardLedger 等 | 支出金额 | `money-cny-circle`（人民币语义） |
| 💵 | accounts:24 | 现金 | `cash-2` |
| 👆 | ledger-all:106/196/317 | 左滑手势引导 | `finger-swipe` |
| ⭐ | type.js:38 | 星星 | `star-2` |
| ➕ | seed:27 | 其他收入 | `add-circle` |
| 🐷 | type.js:35 | 存钱 | `pig-money` |
| ⚠ | misc | 通用警告 | `alert` |

## 三、替换策略（三层渐进，避免数据迁移风险）

### 第 1 层：渲染层工具（先做，零风险）

新建 `common/utils/icon.js`：

```js
// 统一图标解析：mc:名称 / 旧 emoji / 图片 URL 三种格式
export function resolveIcon(value) {
  if (!value) return { type: 'emoji', value: '📦' }
  if (String(value).startsWith('mc:')) return { type: 'mingcute', name: String(value).slice(3) }
  if (/^(https?:|\/|data:image)/.test(String(value))) return { type: 'image', value }
  return { type: 'emoji', value }
}
```

配套建 `components/common/AppIcon.vue`：

- `type === 'mingcute'`：渲染 Iconfont Symbol（`<text class="mc-icon">`），主题色用 `currentColor`
- `type === 'image'`：渲染 `<image>`
- `type === 'emoji'`：渲染 `<text>` 兜底（旧数据仍可见）

所有 `isImageUrl(...) ? <image> : {{icon}}` 的分支统一换成 `<AppIcon :value="icon" />`。

### 第 2 层：云函数 seed 改新格式（随第 1 层一起发）

`lib/seed.js`、`actions/type.js`、`lib/accounts.js` 里的 emoji 改为 `mc:xxx`。
**不改存量数据**——旧房间继续显示 emoji，新房间自动用新图标。

### 第 3 层：Iconfont 资源接入

1. iconfont.cn 新建项目，从 MingCute 图标集勾选上表图标，复制 Symbol CDN 链接；
2. `App.vue` `<style>` 里 `@font-face` 或 `@import` 引入；
3. `.mc-icon { font-family: mcIcon; font-size: 1em; }`，颜色跟随 `currentColor`（主题色自动生效）；
4. tabBar 选中态：`-line` 未选中 / `-fill` 选中，颜色由 `setTabBarStyle` 的 `selectedColor` 控制，**可废弃现在的 PNG 改色脚本**。

## 四、不替换清单

| 类别 | 说明 |
|---|---|
| 箭头符号 `→ ← ↓ ↑ ↗ ↘ ▾ › ⇄` | 属于排版符号，部分保留文字箭头更轻量；只把视觉重要的 `⇄` 换成图标 |
| `✓ ✕ ✗ ✎` | 小尺寸勾叉，保留字符性能更好；大尺寸勾（CategoryPicker 选中态）换 `check-2` |
| 数字/货币符号 `¥ $` | 保持文本 |
| 云函数返回的 `icon` 里用户自选 emoji | 保留兜底渲染，用户自由度优先 |

## 五、执行顺序建议

1. 建 `AppIcon.vue` + `resolveIcon`（半天）
2. 替换第 1.2~1.5 与第 2 节的纯展示 emoji（1 天，可分页提交）
3. 改云函数 seed 与 ACCOUNT_TYPES（半小时）
4. iconfont 项目建库、接入 Symbol（1 小时）
5. tabBar 接 `-line`/`-fill` 双态，删 PNG 改色脚本（半天）
6. 旧数据兜底验证：老房间的分类/支付方式仍显示 emoji，新房间显示图标
