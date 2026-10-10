# 可林记账本微信云开发部署指南

可林记账本前端通过 **微信云开发** 调用云函数，不需要自建服务器、备案域名或配置 AppSecret。当前版本为 **v2.1.9**。

> 只给自己和家人使用、不上架且希望长期使用免费云环境：见 [不发布上线 · 长期免费用微信云开发部署指南](./free-experience-deploy.md)。
>
> 官方规则可能调整，免费资格、配额和到期时间请以微信官方最新计费说明为准。

```text
小程序（uni-app）
      │  wx.cloud.callFunction({ action: '模块.方法' })
      ▼
云函数 roomie（单函数多 action 分发）
      │  wx-server-sdk
      ▼
云数据库（16 个集合） + 云存储（账单文件、图片）
```

## 1. 注册小程序并配置 AppID

1. 到 [mp.weixin.qq.com](https://mp.weixin.qq.com) 注册小程序。
2. 在「开发管理 → 开发设置」获取小程序 AppID。
3. 将同一个 AppID 填入以下三个位置：
   - `manifest.json` → `mp-weixin.appid`
   - `project.config.json` → `appid`
   - `common/config/index.ts` → `appConfig.appId`

三处必须一致。只改一处会导致开发者工具、云环境和前端请求使用不同身份。

## 2. 开通云环境

1. 在微信开发者工具顶部点击「云开发」。
2. 创建环境并等待初始化完成。
3. 复制环境 ID，通常形如 `cloud1-xxxxxxxxxxxxxxxx`。
4. 打开 `common/config/index.ts`，填写：

```ts
export const appConfig: AppConfig = {
  cloudEnv: 'cloud1-xxxxxxxxxxxxxxxx',
  cloudFunctionName: 'roomie',
  appId: 'wx你的小程序AppID',
  version: APP_VERSION
}
```

> 必须显式填写 `cloudEnv`。留空可能在真机或体验版中出现 `INVALID_ENV`、`Environment not found` 或“没有权限，请先开通云开发”。

## 3. 构建小程序和云函数

在项目根目录执行：

```powershell
npm install
npm run test:cloud
npm run build:mp-weixin
npm run verify:mp
```

`build:mp-weixin` 会完成两件事：

1. 把 uni-app 前端编译到 `dist/build/mp-weixin`。
2. 把 `cloudfunctions/roomie` 打包成构建产物中的单文件云函数。

微信开发者工具必须导入构建产物：

```text
E:\chatgpt\记账本小程序\roomie\dist\build\mp-weixin
```

不要导入项目源码根目录，也不要导入 `dist`、`dist/build` 或 `dist/dev`。源码根目录没有 `app.json`。

也可以使用：

```powershell
npm run open:mp
```

它会重新构建、检查 `app.json`，然后用开发者工具打开最新的 `dist/build/mp-weixin`。

## 4. 创建数据库集合

在云开发控制台「数据库」中创建以下 **16 个集合**。

| 集合 | 用途 | 关键字段 |
|---|---|---|
| `users` | 用户档案 | `openid`、`nickname`、`avatar` |
| `rooms` | 账本 / 温馨小窝 | `ownerId`、`inviteCode`、`budgetMinor`、`status` |
| `room_members` | 成员关系与角色 | `roomId`、`userId`、`role`、`status` |
| `room_invites` | 邀请码与定向邀请 | `code`、`roomId`、`inviteeId`、`status` |
| `ledger_entries` | 收支流水 | `roomId`、`amountMinor`、`type`、`occurredAt` |
| `ledger_categories` | 收支分类 | `roomId`、`type`、`name` |
| `pay_methods` | 支付方式 | `roomId`、`name` |
| `merchant_rules` | 商户分类记忆 | `roomId`、`merchantKey`、`categoryId` |
| `assets_accounts` | 资金账户与余额 | `roomId`、`type`、`balanceMinor`、`status` |
| `budgets` | 总预算与分类预算 | `roomId`、`month`、`categoryId`、`amountMinor` |
| `recurring_bills` | 周期账单 | `roomId`、`dayOfMonth`、`lastGeneratedMonth` |
| `task_lists` | 清单 / 任务分组 | `roomId`、`name` |
| `tasks` | 家庭任务 | `roomId`、`status`、`assigneeId` |
| `schedules` | 日程和提醒 | `roomId`、`startTime` |
| `feeds` | 家庭动态 | `roomId`、`type`、`likedBy` |
| `notifications` | 站内通知 | `userId`、`read`、`targetType` |

### 权限设置

全部集合统一选择 **「仅管理员可读写」**。客户端不能直接读写数据库，所有数据访问都由云函数校验 `openid` 和账本成员权限。

### 建议索引

数据量增加后，建议在云开发控制台建立以下索引：

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

云函数首次访问缺失的集合时，部分版本会尝试自动创建。为了避免权限和首次登录不稳定，正式部署仍建议提前手动创建完整集合。

## 5. 部署云函数和触发器

构建后，在微信开发者工具左侧展开：

```text
cloudfunctions
└── roomie
```

右键 `roomie`，分别执行：

1. **「上传并部署：云端安装依赖」**：更新云函数代码。
2. **「上传触发器」**：注册 `config.json` 中的定时触发器。

不要把“小程序代码上传”和“云函数部署”混为一谈。两者是独立操作，触发器也不会随代码部署自动注册。

当前触发器配置：

| 名称 | cron | 用途 |
|---|---|---|
| `dailyRecurring` | `0 5 1 * * * *` | 每天 01:05 生成到期的周期账单 |
| `reminderTick` | `0 0 * * * * *` | 每小时整点检查生日和日程提醒 |

云函数依赖包括：

- `wx-server-sdk`
- `xlsx`
- `iconv-lite`

使用“云端安装依赖”，不要把本地 `node_modules` 直接上传。

## 6. 云存储权限

账单导入会先把文件上传到云存储，路径前缀为 `uploads/`。

在「云开发 → 存储 → 权限设置」中，可以选择：

- 「仅创建者可读写」；或
- 按实际业务配置自定义安全规则。

云函数使用管理员身份读取文件，不受客户端规则限制。

## 7. 验证部署

### 本地业务测试

```powershell
npm run test:cloud
```

当前应通过 **110 项，失败 0 项**，覆盖登录、建房、邀请、角色权限、记账、任务、动态、通知、账户余额、预算、结算、周期账单、账单导入、转让和解散等链路。

### 构建产物检查

```powershell
npm run verify:mp
npm run icons:verify
```

### 模拟器和真机验证

至少检查：

1. 微信登录和首次完善资料。
2. 创建账本、生成邀请码、另一账号加入。
3. 新增支出、收入、转账，确认账户余额。
4. 首页和收支流水页显示记录，点击后可以浏览详情。
5. 创建者和管理员左滑修改、删除订单。
6. 切换账本后，首页、流水、资产、统计、清单和动态同步切换。
7. 自然月、自然年、全部、自定义统计结果正确。
8. 账单导入、预算、分摊结算、周期账单正常。
9. 成员角色调整、退出、转让创建者、解散账本正常。
10. 家庭清单、日程提醒、生日提醒和消息中心正常。

## 8. 接口约定

云函数按 `模块.方法` 分发，前端 API 常量会自动推导对应 action：

| 前端路径 | 云函数 action | 说明 |
|---|---|---|
| `/user/wxEmoteLogin` | `user.wxEmoteLogin` | 微信登录 |
| `/room/createRoom` | `room.createRoom` | 创建账本 |
| `/room/rooms` | `room.rooms` | 获取账本列表 |
| `/ledger/add` | `ledger.add` | 记一笔 |
| `/ledger/update` | `ledger.update` | 修改流水 |
| `/ledger/delete` | `ledger.delete` | 删除流水 |
| `/task/allStatus` | `task.allStatus` | 任务全状态视图 |
| `/feed/list` | `feed.list` | 家庭动态 |
| `/ledger/import/preview` | `ledger.importPreview` | 账单导入预览 |
| `/ledger/stats` | `ledger.stats` | 自然月 / 自然年 / 全部 / 自定义统计 |

路由规则见 `cloudfunctions/roomie/lib/route.js`。ID 应通过 payload 或 query 传递，不要拼接到 URL 路径中。

## 9. 数据模型要点

- 金额统一以整数“分”存储，字段以 `Minor` 结尾，展示层再除以 100。
- 账户余额只通过 `lib/accounts.js` 的余额变更逻辑修改，禁止业务代码直接写 `balanceMinor`。
- 周期账单通过 `lastGeneratedMonth` 保证幂等，重复触发不会重复入账。
- 角色顺序为 `viewer < member < admin < owner`，未登记角色没有权限。
- 所有账本数据读写都经过 `requireMembership()`。
- 仅创建者可以转让创建者身份；转让后原创建者降为管理员。
- 解散账本会关闭账本、移除成员、撤销邀请；历史流水采用软删除语义。
- 流水、任务、动态和日程删除时写入 `deleted: true`，便于审计和恢复。
- 记账、任务、成员加入和日程创建会自动生成家庭动态。

## 10. 常见问题

### 提示 `users` 集合不存在

说明数据库集合未创建，或部署的云函数版本过旧。优先手动创建完整 16 个集合，然后重新执行：

```powershell
npm run build:mp-weixin
```

在开发者工具中重新部署 `roomie` 云函数。

### 提示 `FUNCTION_NOT_FOUND`

云环境找到了，但云函数没有部署。确认开发者工具导入的是 `dist/build/mp-weixin`，然后右键构建产物中的 `cloudfunctions/roomie`，选择「上传并部署：云端安装依赖」。

### 提示 `INVALID_ENV` 或 `Environment not found`

检查 `common/config/index.ts` 中的 `cloudEnv` 是否填写、是否与开发者工具当前环境一致，然后重新构建。

### 提示 `DATABASE_COLLECTION_ALREADY_EXIST`

集合已经存在，可以忽略，继续检查权限和索引。

### 账单导入提示缺少 XLSX 依赖

重新部署云函数，并选择「上传并部署：云端安装依赖」。如果仍失败，可使用 UTF-8 编码的 CSV。

### 定时提醒或周期账单不执行

检查云函数是否部署了 `config.json`，然后在开发者工具中右键 `roomie` 选择「上传触发器」。触发器不会随代码部署自动注册。

### 真机一直停在加载中

依次检查：

1. `cloudEnv` 是否显式配置。
2. 云函数是否上传到当前环境。
3. 数据库集合是否存在。
4. 当前微信账号是否被加入体验成员。
5. 是否清除了开发者工具或真机缓存后重新打开。

更多模拟器、自动化和真机验证步骤见 [部署前模拟验证教程](./simulation-validation-guide.md)。
