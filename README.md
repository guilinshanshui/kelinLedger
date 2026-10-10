# 可林记账本

可林记账本是一款面向情侣、夫妻和家庭成员的协同记账微信小程序。它把日常收支、资产账户、预算、家庭清单、日程提醒和家庭动态放在同一个账本里，基于 **uni-app + 微信云开发**，不需要购买服务器、域名或数据库。

> 当前版本：**v2.1.9**
>
> 云函数：微信云开发，单函数多 action
>
> 主要入口：账本、明细、我的

## 项目特点

- **多人协作**：通过邀请码或定向邀请加入账本，成员共享账本数据。
- **权限明确**：创建者和管理员可以修改、删除订单，普通成员只能浏览，避免误操作。
- **账本独立**：切换账本后，首页、流水、资产、预算、统计、清单、日程和动态都切换到当前账本的数据。
- **完整记账链路**：支出、收入、转账、账户余额、编辑、删除、日历和 CSV 导出。
- **统计范围完整**：支持自然月、自然年、全部和自定义时间范围，而不是只做界面占位。
- **账单导入**：支持微信支付、支付宝官方账单文件，先预览再确认，自动识别重复记录。
- **家庭协作功能**：家庭清单、任务分配、日程提醒、生日提醒、家庭动态和消息中心。
- **主题统一**：黛青、暖赭两套主题，页面、图标、选中态和品牌视觉保持一致。
- **免费部署**：体验版配合未发布的微信免费云环境，适合个人和家庭长期使用。

## 主要功能

### 账本与协同

- 创建、编辑和管理多个账本。
- 通过邀请码加入账本，也可生成定向邀请。
- 成员角色包括 `owner`、`admin`、`member`、`viewer`。
- 创建者和管理员可以修改、删除流水；其他成员以浏览为主。
- 支持成员管理、角色调整、退出账本、转让创建者和解散账本。

### 收支与资产

- 记录支出、收入和账户间转账。
- 交易日期、分类、支付账户、成员和备注均可记录。
- 账户余额随新增、编辑、删除流水联动。
- 资产总览展示总余额、期间收支、账户分布和最近变动。
- 首页和“我的”页面展示当前账本的月度数据，包含协作成员共同产生的记录。
- 支持预算、分类预算、预算进度和超支提醒。
- 支持分摊结算、周期账单和 CSV 流水导出。

### 流水浏览与修改

- 首页和收支流水页点击账单先进入详情浏览，减少误触。
- 创建者和管理员可在账单上左滑，选择修改或删除。
- 修改页会带入当前订单的原始信息、原始日期和原收支类型。
- 删除操作有二次确认。
- 收支流水页支持今日、本周等快捷范围，也支持自定义时间查询。

### 统计与日历

- 统计分析支持自然月、自然年、全部、自定义。
- 分类排行、成员维度、收支趋势、空数据提示均按真实数据计算。
- 账单日历按日期展示当天收入和支出。
- 资产账户中的全部流水可跳转到收支流水页继续查看。

### 家庭协作

- 家庭清单：创建清单、添加待办、分配成员、完成任务。
- 日程提醒：家庭日程、提醒时间、站内通知。
- 生日提醒：公历或农历生日、提前提醒、消息中心。
- 家庭动态：记录记账、任务、成员加入等协作行为，支持手动发布、点赞和清空记录。
- 消息中心：查看、删除单条消息或清空全部消息。

### 账单导入

- 支持微信支付、支付宝账单文件 `.csv` / `.xlsx`。
- 导入前预览总条数、可导入、重复和待检查记录。
- 可修改分类、支付方式和导入范围。
- 可记住商户分类规则。
- 重复交易不会重复入账。

详细步骤见 [账单导入使用说明](./docs/ledger-import-features.md)。

## 页面结构

底部固定三个原生 Tab：

| Tab | 页面 | 主要职责 |
|---|---|---|
| 账本 | `pages/room-list/room-list` | 创建、加入、切换和管理账本 |
| 明细 | `pages/home/home` | 当前账本概览、快速记账、统计分析、资产和流水 |
| 我的 | `pages/profile/profile` | 当前账本月度数据、资产入口、导入导出、主题和设置 |

当前账本保存在 `STORAGE_KEYS.CURRENT_ROOM`，三个 Tab 通过它保持同步。跳转 Tab 页必须使用 `uni.switchTab`。

## 技术架构

- 前端：uni-app、Vue 3、TypeScript、Pinia。
- 小程序端：微信小程序原生 tabBar。
- 后端：微信云开发云函数、云数据库、云存储。
- 接口层：`common/utils/request.ts` 通过 `wx.cloud.callFunction` 调用云函数。
- 云函数：`cloudfunctions/roomie`，按 `模块.方法` 分发。
- 主题：`common/themes/appTheme.ts` 中的 CSS 变量与预设。
- 图标：MingCute line 主图标，配合主题选中态和品牌资源。

云函数调用链：

```text
pages / components
        |
        v
common/api/index.ts
        |
        v
common/utils/request.ts
        |
        v
wx.cloud.callFunction({ name: 'roomie', data: { action: '模块.方法' } })
        |
        v
cloudfunctions/roomie
        |
        v
微信云数据库 / 云存储
```

## 本地运行

### 环境要求

推荐：

- Windows 10/11。
- Node.js 22 LTS。
- npm 10 或更高版本。
- 微信开发者工具稳定版。
- 一个已注册的小程序 AppID。
- 一个微信云开发环境。

克隆仓库：

```powershell
git clone https://github.com/guilinshanshui/kelinLedger.git
cd kelinLedger
npm install
```

如果本地目录名不是 `kelinLedger`，以实际目录为准。

### 配置 AppID 和云环境

不要直接使用原作者的云环境。自己的账号需要创建自己的云环境，并同步修改以下三个位置：

1. `manifest.json`：

```json
{
  "mp-weixin": {
    "appid": "wx你的小程序AppID"
  }
}
```

2. `project.config.json`：

```json
{
  "appid": "wx你的小程序AppID"
}
```

3. `common/config/index.ts`：

```ts
export const appConfig: AppConfig = {
  cloudEnv: '你的云环境ID',
  cloudFunctionName: 'roomie',
  appId: 'wx你的小程序AppID',
  version: APP_VERSION
}
```

云环境 ID 必须显式填写，否则开发者工具可能报 `INVALID_ENV`、`Environment not found` 或“没有权限，请先开通云开发”。

### 检查和构建

```powershell
npm run audit
npm run test:cloud
npm run build:mp-weixin
npm run verify:mp
```

当前云函数业务测试为 **110 项通过，0 项失败**。`build:mp-weixin` 会把前端编译到 `dist/build/mp-weixin`，同时把云函数打包成单文件。

构建完成后，用 `npm run open:mp` 打开最新产物；也可以手动在微信开发者工具中导入：

```text
E:\chatgpt\记账本小程序\roomie\dist\build\mp-weixin
```

不要直接导入 uni-app 源码根目录。源码根目录没有开发者工具需要的 `app.json`。

## 微信云开发配置

完整的创建环境、数据库、索引和排错步骤见 [微信云开发部署指南](./docs/cloud-setup.md)。

### 1. 创建云环境

1. 在微信开发者工具顶部进入“云开发”。
2. 创建云环境并复制环境 ID。
3. 将环境 ID 写入 `common/config/index.ts` 的 `cloudEnv`。
4. 重新执行 `npm run build:mp-weixin`。

### 2. 创建数据库集合

建议在云开发控制台手动创建以下 **16 个集合**，并统一设置为“仅管理员可读写”。所有业务读写都经过云函数，客户端不应直接读写数据库。

```text
users
rooms
room_members
room_invites
ledger_entries
ledger_categories
pay_methods
merchant_rules
assets_accounts
budgets
recurring_bills
task_lists
tasks
schedules
feeds
notifications
```

常用索引见 [docs/cloud-setup.md](./docs/cloud-setup.md)。

### 3. 部署云函数

重新构建后，在微信开发者工具中展开：

```text
dist\build\mp-weixin\cloudfunctions
```

右键 `roomie`，依次执行：

1. “上传并部署：云端安装依赖”更新云函数代码。
2. “上传触发器”注册定时任务。

这两个操作必须分别执行。只上传小程序代码或只部署云函数，都不会自动注册触发器。

当前触发器：

| 名称 | 频率 | 用途 |
|---|---|---|
| `dailyRecurring` | 每天 01:05 | 生成到期的周期账单 |
| `reminderTick` | 每小时整点 | 检查生日和日程提醒 |

## 使用说明

### 第一次使用

1. 打开小程序，在登录页完成微信登录。
2. 首次登录需要补充昵称和头像。
3. 进入“账本”，创建自己的账本，或输入邀请码加入家人的账本。
4. 选择当前账本后，进入“明细”开始记账。

未登录过的微信账号会创建独立用户数据。开发版和体验版默认共享同一个云环境；如果要避免体验版看到开发测试数据，请先备份测试集合，再清理测试数据，或者为体验版单独创建一个云环境。

### 创建和加入账本

- 在“账本”页面创建温馨小窝。
- 在账本设置中生成邀请码。
- 对方在“账本 → 添加账本”中输入邀请码加入。
- 加入后，双方看到的是同一个账本的数据。

### 记一笔

1. 进入“明细”，点击“记一笔”。
2. 选择支出、收入或转账。
3. 填写金额、日期、分类、账户、成员和备注。
4. 保存后，流水、账户余额、预算进度、统计和家庭动态同步更新。

### 查看、修改和删除订单

- 点击流水先进入订单详情页。
- 创建者和管理员可以在首页或收支流水页左滑订单。
- 左滑后可选择“修改”或“删除”。
- 修改页使用当前订单的原始日期和原始类型，不会默认改成今天。
- 删除前会再次确认。
- 普通成员只能浏览，不能修改或删除他人的订单。

### 我的页面数据口径

- **记账笔数**：当前选中账本在本月的账单数，包含协作成员创建的账单。
- **累计支出**：当前选中账本在本月的支出，包含协作成员创建的支出。
- **温馨小窝**：当前用户已加入的账本数量。

这三个数据都可以点击进入对应页面。

### 主题

在“我的 → 主题色”中选择黛青或暖赭。切换后，页面背景、按钮、选中态、图标和品牌资源会同步更新。

## 项目结构

```text
kelinLedger/
├── common/                 公共 API、配置、主题和工具
├── components/             通用组件与看板组件
├── cloudfunctions/
│   └── roomie/             微信云函数源码
├── docs/                   部署、验证和功能说明
├── pages/                  小程序页面
├── scripts/                构建、审计、验证和自动化脚本
├── static/                 品牌、tabBar 和其他静态资源
├── store/                  Pinia 状态
├── types/                  TypeScript 类型
├── manifest.json           uni-app 应用配置
├── pages.json              页面与原生 tabBar 配置
└── package.json            依赖和 npm scripts
```

## 测试与验证

| 命令 | 用途 |
|---|---|
| `npm run audit` | 页面、按钮、跳转和对比度静态检查 |
| `npm run test:cloud` | 云函数业务链路测试，当前 110 项通过 |
| `npm run icons:verify` | 图标映射与资源校验 |
| `npm run build:mp-weixin` | 构建小程序并打包云函数 |
| `npm run verify:mp` | 检查构建产物和 tabBar 资源 |
| `npm run open:mp` | 重新构建后用开发者工具打开最新产物 |

部署前模拟器、真机、自动化和 miniprogram-ci 的完整流程见 [部署前模拟验证教程](./docs/simulation-validation-guide.md)。

## 不发布上线，长期使用体验版

如果只给自己和家人使用，可以一直停留在“开发版本”或“体验版”，不提交审核、不发布上线。免费规则和操作步骤见 [不发布上线部署指南](./docs/free-experience-deploy.md)。

核心原则：

- 可以“上传代码”和“设为体验版”。
- 不点击“提交审核”和“发布”。
- 云函数和触发器需要单独上传。
- 体验成员需要先加入小程序后台的体验成员列表。
- 具体免费配额以微信官方最新计费说明为准。

## 已知限制

- H5 端尚未接入 `@cloudbase/js-sdk`，当前云调用主要面向微信小程序。
- 微信订阅消息需要在公众平台申请模板，并在云函数中配置对应模板 ID。
- 云函数触发器不会随普通代码上传自动注册，必须手动上传。
- 项目当前版本固定为 `2.1.9`，不再继续递增版本号。

## 相关文档

- [数据库、索引和云函数部署](./docs/cloud-setup.md)
- [不发布上线与长期体验版](./docs/free-experience-deploy.md)
- [部署前模拟验证教程](./docs/simulation-validation-guide.md)
- [账单导入功能说明](./docs/ledger-import-features.md)
- [生日与提醒功能说明](./docs/birthday-reminder-features.md)

## 许可证与项目地址

本项目采用 MIT 许可证，详见 [LICENSE](LICENSE)。

- GitHub：https://github.com/guilinshanshui/kelinLedger
- 邮箱：903531306@qq.com
