# Roomie 云开发部署指南

本项目前端通过**微信云开发**调用云函数，不需要自建服务器、不需要备案域名、不需要配置 AppSecret。

> 只想给自己和家人用、不上架且不希望产生费用？见 [不发布上线 · 长期免费用微信云开发部署指南](./free-experience-deploy.md)。
> 官方规则：小程序**未发布上线期间，免费云环境无需续费**；一旦发布，免费环境在上线后第 15 天到期。

```
小程序（uni-app）
      │  wx.cloud.callFunction({ action: '模块.方法' })
      ▼
云函数 roomie（单函数多 action 分发）
      │  wx-server-sdk
      ▼
云数据库（13 个集合） + 云存储（账单文件、图片）
```

---

## 1. 注册小程序并开通云开发

1. 到 [mp.weixin.qq.com](https://mp.weixin.qq.com) 注册**小程序**（个人主体即可，免费）。
2. 在「开发管理 → 开发设置」拿到 **AppID**。
3. 把 AppID 填到两处，保持一致：
   - `manifest.json` → `mp-weixin.appid`
   - `common/config/index.ts` → `appConfig.appId`
4. 用微信开发者工具打开项目，点击顶部**「云开发」→ 开通**，创建一个环境（例如 `roomie-dev`）。
5. 复制云环境 ID，填到 `common/config/index.ts`：

```ts
export const appConfig: AppConfig = {
  cloudEnv: 'cloud1-xxxxxxxxxxxxxxxx',  // ← 这里
  cloudFunctionName: 'roomie',
  appId: 'wxYourAppId',
  version: APP_VERSION
}
```

> 留空 `cloudEnv` 会使用开发者工具当前选中的默认环境，适合只有单一环境的场景。

---

## 2. 创建数据库集合

在云开发控制台「数据库」中新建以下 **16 个集合**。

| 集合 | 用途 | 关键字段 |
|---|---|---|
| `users` | 用户档案 | `openid`（唯一）、`nickname`、`avatar` |
| `rooms` | 空间/家庭 | `ownerId`、`inviteCode`、`budgetMinor`、`status` |
| `room_members` | 成员关系与角色 | `roomId`、`userId`、`role`、`status` |
| `room_invites` | 邀请码与定向邀请 | `code`、`roomId`、`inviteeId`、`status` |
| `ledger_entries` | 账本流水 | `roomId`、`amountMinor`、`type`、`occurredAt` |
| `ledger_categories` | 收支分类 | `roomId`、`type`、`name` |
| `pay_methods` | 支付方式 | `roomId`、`name` |
| `merchant_rules` | 商户分类记忆（账单导入） | `roomId`、`merchantKey`、`categoryId` |
| `assets_accounts` | 资金账户与余额 | `roomId`、`type`、`balanceMinor`、`status` |
| `budgets` | 预算（总/分类/月） | `roomId`、`month`、`categoryId`、`amountMinor` |
| `recurring_bills` | 周期账单 | `roomId`、`dayOfMonth`、`lastGeneratedMonth` |
| `task_lists` | 清单（任务分组） | `roomId`、`name` |
| `tasks` | 任务 | `roomId`、`status`、`assigneeId` |
| `schedules` | 日程 | `roomId`、`startTime` |
| `feeds` | 动态 | `roomId`、`type`、`likedBy` |
| `notifications` | 站内通知 | `userId`、`read`、`targetType` |

### 权限设置

**全部集合都选「仅管理员可读写」**（即客户端不可直接读写）。

所有数据访问都经过云函数，云函数会用 `openid` 做身份校验和成员权限校验。
客户端直连数据库会绕过权限判断，因此必须关闭。

### 建议索引

在云开发控制台为以下字段建索引（数据量上来后查询性能差别明显）：

| 集合 | 字段 | 类型 |
|---|---|---|
| `users` | `openid` | 唯一 |
| `room_members` | `userId` | 普通 |
| `room_members` | `roomId + status` | 普通 |
| `room_invites` | `code` | 唯一 |
| `ledger_entries` | `roomId + occurredAt` | 普通 |
| `tasks` | `roomId + status` | 普通 |
| `schedules` | `roomId + startTime` | 普通 |
| `feeds` | `roomId + createdAt` | 普通 |
| `notifications` | `userId + read` | 普通 |
| `assets_accounts` | `roomId + status` | 普通 |
| `budgets` | `roomId + month` | 普通 |
| `recurring_bills` | `roomId + status` | 普通 |

> 集合无需手动初始化数据：创建空间时 `seedRoom()` 会自动写入 11 个支出分类、7 个收入分类、5 个支付方式，
> `seedAccounts()` 会写入 4 个默认账户（现金 / 微信钱包 / 支付宝 / 银行卡）。

---

## 3. 部署云函数

1. 在微信开发者工具文件树中找到 `cloudfunctions/roomie`。
2. 右键 → **「上传并部署：云端安装依赖」**。
3. 等待提示部署成功。依赖包含 `wx-server-sdk`、`xlsx`、`iconv-lite`（后两个用于解析账单文件）。

> 使用「云端安装依赖」而不是「上传所有文件」，否则 `node_modules` 不会被打包。

如果账单解析不常用，可以在 `cloudfunctions/roomie/package.json` 中移除 `xlsx` / `iconv-lite`；
代码对这两个依赖做了降级处理，缺失时仅支持 UTF-8 编码的 CSV。

---

## 4. 云存储权限

账单导入会把文件先传到云存储（路径前缀 `uploads/`）。

在「云开发 → 存储 → 权限设置」中，选择**「仅创建者可读写」**或自定义规则。
云函数使用管理员身份读取文件，不受客户端规则限制。

---

## 5. 验证部署

### 本地逻辑自测（不需要云环境）

```bash
node scripts/smoke-cloud.js
```

该脚本用内存数据库替换 `wx-server-sdk`，跑通
「登录 → 建房 → 邀请加入 → 改权限 → 记账 → 建任务 → 完成任务 → 动态 → 通知 → 移除成员」全链路，
用于验证路由与业务逻辑，共 44 项断言。

### 云端验证

在小程序里依次操作：

1. 登录 → 创建空间
2. 在云开发控制台检查 `users`、`rooms`、`room_members`、`ledger_categories` 是否写入数据
3. 「我的 → 成员管理」生成邀请码，用另一个微信号加入
4. 记一笔账，查看「本月」汇总是否正确
5. 建一条任务并指派给另一名成员，确认对方能收到通知

---

## 6. 接口约定

云函数按 `模块.方法` 分发，路径由前端 API 常量自动推导：

| 前端路径 | 云函数 action | 说明 |
|---|---|---|
| `/user/wxEmoteLogin` | `user.wxEmoteLogin` | 微信登录 |
| `/room/createRoom` | `room.createRoom` | 创建空间 |
| `/ledger/add` | `ledger.add` | 记一笔 |
| `/task/allStatus` | `task.allStatus` | 任务全状态视图 |
| `/feed/list` | `feed.list` | 动态流 |
| `/ledger/import/preview` | `ledger.importPreview` | 账单导入预览 |

路由规则见 `cloudfunctions/roomie/lib/route.js`。

**约定：ID 通过 payload 或 query 传递，不要拼进 URL 路径。**
路由层虽然兼容了尾段 ID（`/feed/like/fd_xxx`），但显式传参更清晰。

---

## 7. 数据模型要点
## 6.1 记账核心能力

除基础的流水记录，还包含：

- **账户与余额**：新建空间时自动生成 4 个默认账户。支出从账户扣、收入进账户、转账两边动，
  删改流水会反向冲销后重算，保证「初始余额 + 流水 = 当前余额」始终成立。
- **资产总览**：`/ledger/assetOverview` 返回总余额、期间收支、按账户分类，
  前端「资产详情」页直接消费该结构。
- **预算**：支持总预算与分类预算（按月份），`/ledger/budget/progress` 返回执行进度，
  使用超 80% 或已超支时在 `alerts` 里给出预警文案。
- **分摊结算**：`/ledger/settlement` 计算每人垫付额与应承担额，
  输出「谁欠谁」与最少转账方案（贪心匹配，净额总和严格为零）。
- **周期账单**：房租、订阅等每月自动入账，靠 `lastGeneratedMonth` 保证幂等。
- **导出**：`/ledger/exportCsv` 返回带 BOM 的 CSV 文本，Excel 打开不乱码。

### 定时触发器

`cloudfunctions/roomie/config.json` 已声明定时触发器，每天 01:05 执行周期账单入账：

```json
{
  "triggers": [
    { "name": "dailyRecurring", "type": "timer", "config": "0 5 1 * * * *" },
    { "name": "reminderTick", "type": "timer", "config": "0 0 * * * * *" }
  ]
}
```

- `dailyRecurring`：每天 01:05 执行周期账单入账。
- `reminderTick`：每小时整点检查一次到期提醒与生日，派发站内通知。

**注意：** 命令行部署云函数不会自动注册触发器，需要在微信开发者工具里右键 `cloudfunctions/roomie` →「上传触发器」，
或到云开发控制台「云函数 → roomie → 触发器」手动创建。触发器未生效时，也可以在前端调 `/schedule/run-due`
和 `/ledger/recurring/generate` 手动补跑。

## 7. 数据模型要点

- **金额统一用「分」存整数**（字段名以 `Minor` 结尾），展示层才除以 100，避免浮点误差。
- **余额一致性**：账户余额只通过 `lib/accounts.js` 的 `applyDeltas` / `reapplyDeltas` 变更，
  不允许在业务代码里直接写 `balanceMinor`，否则容易漏冲销导致对不上账。
- **幂等**：周期账单靠 `lastGeneratedMonth` 去重；定时任务重复投递不会重复入账。
- **权限默认拒绝**：角色等级 `viewer < member < admin < owner`，未登记的角色没有任何权限。
  所有涉及空间数据的读写都经过 `requireMembership()`。
- **创建者转让**：仅当前创建者可调用 `/room/transferOwner`；成功后旧创建者降为管理员，新创建者获得 owner。
- **解散清理**：解散账本会关闭房间并移除成员、撤销邀请；流水采用软删除语义，历史数据留在云端。
- **软删除**：流水、任务、动态、日程删除时写 `deleted: true`，不物理删除，便于审计与恢复。
- **自动动态**：记账、建任务、完成任务、成员加入、创建日程会自动生成动态，与手动发布共用 `feeds` 集合。

---

## 8. 常见问题

**登录后页面取不到 userId？**
检查 `cloudfunctions/roomie/actions/user.js` 的 `toClientUser`，它同时返回 `id` 和 `userId` 两个字段。
前端历史代码使用 `userId`，新代码建议用 `id`。

**提示「当前环境不支持微信云开发」？**
`wx.cloud` 只在微信小程序端存在。H5 端需要改用 `@cloudbase/js-sdk`，本项目未做 H5 适配。

**账单导入报「未安装 XLSX 解析依赖」？**
说明云函数部署时没有装上 `xlsx`。重新用「上传并部署：云端安装依赖」部署，
或先用 CSV（UTF-8）格式导出账单。

**云函数部署后接口返回 404 接口未实现？**
说明该 action 在云函数里没有对应实现。检查 `cloudfunctions/roomie/actions/` 下是否有同名方法，
以及 `lib/route.js` 的模块别名是否需要补充。
