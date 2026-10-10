# 微信小程序部署前模拟验证教程

适用于当前 `Roomie` 记账本项目。当前项目使用 Vue 3、uni-app Vue 3 + Vite、微信云开发和微信小程序原生 tabBar。

验证顺序：

1. 静态检查。
2. 云函数业务测试。
3. 微信开发者工具模拟器。
4. 云函数部署和数据库验证。
5. 真机双账号验证。

---

## 一、工具下载地址

| 工具 | 用途 | 官方地址 |
|---|---|---|
| 微信开发者工具 | 编译、模拟器、真机调试、体验评分、自动化测试 | https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html |
| Node.js | 运行构建、测试和自动化脚本 | https://nodejs.org/zh-cn/download |
| Git | 拉取项目和管理版本 | https://git-scm.com/downloads |
| HBuilderX | 可选，图形化运行 uni-app 项目 | https://www.dcloud.io/hbuilderx.html |
| miniprogram-ci | 命令行预览、上传、构建 npm、上传云函数 | https://www.npmjs.com/package/miniprogram-ci |
| miniprogram-automator | 自动点击、跳转、输入、读取页面数据 | https://www.npmjs.com/package/miniprogram-automator |
| 小程序自动化文档 | 官方自动化 API 文档 | https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/quick-start.html |
| 云函数本地调试文档 | 本地运行和断点调试云函数 | https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/guide/functions/local-debug.html |
| 体验评分文档 | 检查页面性能、体验和最佳实践 | https://developers.weixin.qq.com/miniprogram/dev/devtools/audits.html |
| 真机调试文档 | 验证真实微信客户端行为 | https://developers.weixin.qq.com/miniprogram/dev/devtools/remote-debug.html |
| Minitest 自动化 | Monkey、AI 自动化、性能和压力测试 | https://developers.weixin.qq.com/miniprogram/dev/devtools/minitest/monkey.html |

建议安装 Node.js 22 LTS 或更高版本和微信开发者工具稳定版。HBuilderX 不是必需项。

---

## 二、项目目录

```text
E:\chatgpt\记账本小程序\roomie
```

当前 AppID：

```text
wx8ab87add7a9a0f11
```

AppID 必须保持一致，涉及：

- `manifest.json`
- `project.config.json`
- `common/config/index.ts`
- 微信公众平台
- 微信开发者工具云开发环境

---

## 三、安装依赖和第一批检查

```powershell
cd "E:\chatgpt\记账本小程序\roomie"
npm install
```

当前 `package.json` 已固定 Vue 3 + Vite 工具链。不要使用 `--force` 或 `--legacy-peer-deps` 绕过 Vue 版本冲突。

静态审计：

```powershell
npm run audit
```

云函数冒烟测试：

```powershell
npm run test:cloud
```

当前应通过 98 项业务断言，包括登录、建房、邀请、权限、记账、任务、动态、通知、预算、结算、周期账单、导入、转让和解散。

校验微信构建产物：

```powershell
npm run verify:mp
```

它会检查 `app.json`、tabBar 图标、`cloudfunctions/roomie` 和 `project.config.json` 是否存在。

---

## 四、构建微信小程序

正式构建：

```powershell
npm run build:mp-weixin
```

输出目录：

```text
E:\chatgpt\记账本小程序\roomie\dist\build\mp-weixin
```

开发模式：

```powershell
npm run dev:mp-weixin
```

输出目录：

```text
E:\chatgpt\记账本小程序\roomie\dist\dev\mp-weixin
```

构建启动器是：

```text
scripts/uni-cli.js
```

它会把绝对 `UNI_INPUT_DIR` 指向项目根目录，并把以下内容复制到构建产物：

```text
static
cloudfunctions
```

不要直接导入 uni-app 源码根目录，必须导入构建产物目录。

---

## 五、微信开发者工具导入项目

1. 关闭开发者工具中的旧项目。
2. 选择「导入项目」。
3. 生产验证导入：

```text
E:\chatgpt\记账本小程序\roomie\dist\build\mp-weixin
```

4. 开发验证导入：

```text
E:\chatgpt\记账本小程序\roomie\dist\dev\mp-weixin
```

5. AppID 使用：

```text
wx8ab87add7a9a0f11
```

6. 打开「详情 → 本地设置」，检查基础库版本。
7. 清除旧缓存：详情 → 本地设置 → 清除全部缓存。
8. 使用自动化测试时，打开「安全设置 → CLI/HTTP 调用」和「服务端口」。

导入成功后，左侧应同时出现：

```text
pages
static
cloudfunctions
```

tabBar 图标必须存在：

```text
static/tabbar/tn-tabbar0.png
static/tabbar/tn-tabbar0-cur.png
static/tabbar/tn-tabbar2.png
static/tabbar/tn-tabbar2-cur.png
static/tabbar/tn-tabbar3.png
static/tabbar/tn-tabbar3-cur.png
```

---

## 六、配置微信云开发

### 1. 创建云环境

在微信开发者工具中打开「云开发」，创建环境。创建成功后复制环境 ID，格式通常类似：

```text
cloud1-xxxxxxxxxxxx
```

### 2. 填写环境 ID

打开：

```text
common/config/index.ts
```

配置：

```ts
export const appConfig: AppConfig = {
  cloudEnv: 'cloud1-xxxxxxxxxxxx',
  cloudFunctionName: 'roomie',
  appId: 'wx8ab87add7a9a0f11',
  version: '2.1.0'
}
```

必须显式填写环境 ID，否则会报 `Environment not found` 或 `INVALID_ENV`。

### 3. 部署云函数

构建时会把根目录的 `cloudfunctions` 复制到：

```text
dist\build\mp-weixin\cloudfunctions
dist\dev\mp-weixin\cloudfunctions
```

`project.config.json` 已声明：

```json
"cloudfunctionRoot": "cloudfunctions/"
```

在开发者工具中：

1. 展开 `cloudfunctions`。
2. 右键点击 `roomie` 文件夹。
3. 选择「上传并部署：云端安装依赖」。

如果菜单显示为「上传并部署：云端安装依赖（不上传 node_modules）」，优先选择这一项。

不要只选择「上传所有文件」。云函数依赖包括：

- `wx-server-sdk`
- `xlsx`
- `iconv-lite`

### 4. 数据库集合

当前云函数首次访问集合时会自动创建集合。第一次登录通常会先创建 `users`。

完整集合为：

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

如果自动创建失败，可在云开发控制台手工创建以上集合。

所有集合权限建议设置为「仅管理员可读写」。

### 5. 正确部署顺序

```text
创建云环境
→ 填写 cloudEnv
→ 重新构建小程序
→ 导入构建产物
→ 右键部署 roomie 云函数
→ 重新编译小程序
→ 登录和页面验证
```

---

## 七、云函数本地调试

```powershell
cd "E:\chatgpt\记账本小程序\roomie\cloudfunctions\roomie"
npm install
```

然后在开发者工具中右键 `roomie`，选择「开启云函数本地调试」，勾选「开启本地调试」。

注意：

- 本地调试不支持共享环境云函数。
- 本地调试不提供完整 `UNIONID` 和临时存储等线上能力。
- 本地必须安装云函数依赖。

---

## 八、模拟器验证流程

1. 首次启动。
2. 微信身份自动建立。
3. 创建账本。
4. 修改名称、图标、说明和预算。
5. 生成邀请码。
6. 切换第二个测试微信账号。
7. 输入邀请码加入账本。
8. 创建任务并指派成员。
9. 完成任务并恢复。
10. 记支出、收入和转账。
11. 编辑和删除流水。
12. 检查账户余额。
13. 查看账单日历。
14. 测试自然月、自然年、全部和自定义统计。
15. 导入 CSV 账单。
16. 调整成员角色。
17. 移除成员。
18. 测试退出空间。
19. 测试转让创建者。
20. 测试解散账本。

重点检查 Console、Network、AppData、Storage、页面刷新和权限按钮状态。

---

## 九、体验评分

1. 打开「详情 → 本地设置」。
2. 勾选「自动运行体验评分」。
3. 或者打开 Audits 面板，点击「开始」。
4. 操作核心页面。
5. 点击「停止」查看报告。

重点检查首屏启动时间、页面切换耗时、图片尺寸、长列表渲染、同步 API，以及加载态、空态和错误态。

---

## 十、自动化测试 SDK

```powershell
cd "E:\chatgpt\记账本小程序\roomie"
npm install --save-dev miniprogram-automator
```

先在开发者工具中打开「CLI/HTTP 调用」。

```powershell
& "实际开发者工具安装目录\cli.bat" --auto "E:\chatgpt\记账本小程序\roomie\dist\dev\mp-weixin" --auto-port 9420
```

连接示例：

```js
const automator = require('miniprogram-automator')

async function main() {
  const miniProgram = await automator.connect({
    wsEndpoint: 'ws://127.0.0.1:9420'
  })

  const page = await miniProgram.reLaunch('/pages/room-list/room-list')
  await page.waitFor(500)

  const title = await page.$('.header-title')
  console.log(await title.text())
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

建议覆盖创建账本、修改账本资料、记账、编辑流水、删除流水、创建任务、完成任务、成员管理、修改角色、转让创建者、解散账本。

---

## 十一、miniprogram-ci 命令预览和上传

```powershell
npm install --save-dev miniprogram-ci
```

在微信公众平台下载代码上传私钥：

```text
微信公众平台 → 管理 → 开发管理 → 开发设置 → 小程序代码上传
```

预览脚本示例：

```js
const ci = require('miniprogram-ci')

async function main() {
  const project = new ci.Project({
    appid: 'wx8ab87add7a9a0f11',
    type: 'miniProgram',
    projectPath: 'E:/chatgpt/记账本小程序/roomie/dist/build/mp-weixin',
    privateKeyPath: 'E:/secure/private.wx8ab87add7a9a0f11.key',
    ignores: ['node_modules/**/*']
  })

  await ci.preview({
    project,
    desc: 'Roomie pre-deploy preview',
    setting: {
      es6: true,
      minify: true
    },
    qrcodeFormat: 'image',
    qrcodeOutputDest: 'E:/chatgpt/记账本小程序/roomie/preview.png',
    onProgressUpdate: console.log
  })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

`miniprogram-ci` 不能代替页面交互、多账号权限和真机兼容性测试。

---

## 十二、真机调试

1. 点击「真机调试」。
2. 用微信扫码。
3. 使用手机操作小程序。
4. 在开发者工具查看手机端日志和请求。

至少验证微信登录、微信头像选择、分享邀请、邀请码进入、聊天文件上传、云函数请求、云数据库读写、网络断开和恢复、页面返回和重新进入，以及底部安全区。

邀请和多人权限必须使用两个真实微信账号：

```text
账号 A：创建、邀请、转让、解散
账号 B：加入、记账、权限变更、移除或主动退出
```

---

## 十三、Minitest 和性能测试

Minitest 支持 Monkey 测试、AI 自动化测试、启动性能分析、运行时性能分析、压力测试、虚拟账号和测试任务。

适合检查多次启动是否稳定、页面是否白屏、弱网是否崩溃、长列表是否卡顿、多次记账是否内存增长，以及连续切换账本是否状态错乱。

---

## 十四、发布前检查清单

### 项目状态

- [ ] `manifest.json` AppID 正确
- [ ] `project.config.json` AppID 正确
- [ ] `common/config/index.ts` AppID 和环境 ID 正确
- [ ] `npm run audit` 通过
- [ ] `npm run test:cloud` 通过
- [ ] `npm run build:mp-weixin` 成功
- [ ] 微信开发者工具编译无错误

### 静态资源

- [ ] `dist\build\mp-weixin\static\tabbar` 存在
- [ ] tabBar 图标 6 个文件全部存在
- [ ] `app.json` 无资源路径错误
- [ ] `app.wxss` 无 WXSS 编译错误

### 云开发

- [ ] 已创建云开发环境
- [ ] 云环境 ID 已显式填写
- [ ] `roomie` 云函数已使用云端安装依赖部署
- [ ] 云函数定时触发器已生效
- [ ] 数据库集合已创建
- [ ] 集合权限为仅管理员可读写
- [ ] 云存储权限符合要求

### 业务

- [ ] 创建账本成功
- [ ] 邀请两个账号成功
- [ ] 角色调整真实生效
- [ ] 移除成员后无法再访问
- [ ] 退出空间正常
- [ ] 转让创建者正常
- [ ] 解散账本后成员列表清除
- [ ] 记账、编辑、删除和余额一致
- [ ] 转账两个账户余额一致
- [ ] CSV 导入成功且余额联动
- [ ] 自然月、自然年、全部、自定义统计正确
- [ ] 账单日历数据正确
- [ ] 任务、动态和通知正常

### 真机

- [ ] 两个微信账号完整走通协作流程
- [ ] 分享卡片可以进入
- [ ] 聊天下载账单文件可以导入
- [ ] 弱网和断网有可读提示
- [ ] 页面无横向溢出
- [ ] 底部按钮不被安全区遮挡

---

## 十五、常见问题

### 1. 微信开发者工具打不开当前源码目录

如果报 “在项目根目录未找到 app.json”，说明导入目录选错。必须选择：

```text
E:\chatgpt\记账本小程序\roomie\dist\build\mp-weixin
```

或者：

```text
E:\chatgpt\记账本小程序\roomie\dist\dev\mp-weixin
```

不要选择 `dist`、`dist\build`、`dist\dev` 或项目源码根目录。

uni-app 源码需要先构建，再导入 `dist\dev\mp-weixin` 或 `dist\build\mp-weixin`，不能直接导入项目源码根目录。

### 2. npm install 报 ERESOLVE

旧版项目使用 `@dcloudio/* latest` 时，可能被 npm 解析到 Vue 2 版 uni-app，报 `@vue/composition-api` 与 Vue 3 冲突。

当前项目已固定 Vue 3 + Vite 依赖。不要长期使用 `npm install --force` 或 `npm install --legacy-peer-deps`，否则会把 Vue 2 和 Vue 3 运行时混在一起。

### 3. 构建时报找不到 src\manifest.json

Vite 版 uni-app 默认从 `src` 读取源码，当前项目源码在根目录。项目通过 `scripts/uni-cli.js` 设置绝对 `UNI_INPUT_DIR` 指向项目根目录，不需要搬迁源码。

### 4. app.json 提示 tabBar 图标未找到

说明导入的是旧构建产物，或者 `static` 没有复制。

```powershell
npm run build:mp-weixin
```

然后重新导入 `dist\build\mp-weixin`。当前构建会自动复制 `static/tabbar`。

### 5. app.wxss 报 unexpected token `*`

微信 WXSS 不支持通用选择器 `*`。当前 `App.vue` 已改成显式选择器：`page, view, text, button, input, textarea, image, scroll-view`。重新构建后即可。

### 6. setTabBarStyle:fail not TabBar page

启动页不是 tab 页面时，调用 `setTabBarStyle` 会失败。当前代码已经为非 tab 页面增加静默失败处理。

### 7. Environment not found 或 INVALID_ENV

说明没有配置云环境 ID，或者填写的环境不存在。

1. 在开发者工具创建云环境。
2. 复制环境 ID。
3. 写入 `common/config/index.ts` 的 `cloudEnv`。
4. 重新构建并重新导入。

### 8. cloud.callFunction 提示 FUNCTION_NOT_FOUND

说明云环境找到了，但云函数没有部署。

1. 重新执行 `npm run build:mp-weixin`。
2. 导入 `dist\build\mp-weixin`。
3. 展开 `cloudfunctions`。
4. 右键 `roomie`。
5. 选择「上传并部署：云端安装依赖」。
6. 重新编译小程序。

### 9. DATABASE_COLLECTION_NOT_EXIST: users

说明数据库集合不存在。当前云函数首次访问集合时会自动创建集合，需要重新部署最新版 `roomie` 云函数后才会生效。

如果自动创建失败，手工创建：

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

### 10. touristappid 和正式 AppID

`touristappid` 只适合本地编译和基础模拟，不具备真实云开发能力。当前项目已使用 `wx8ab87add7a9a0f11`。

### 11. 找不到 wx.cloud

说明运行在 H5，或者开发者工具没有使用云开发环境。微信云开发只在小程序端可用。

### 12. 云函数提示模块不存在

```powershell
cd "E:\chatgpt\记账本小程序\roomie\cloudfunctions\roomie"
npm install
```

部署时使用「上传并部署：云端安装依赖」。

### 13. 自动化 SDK 连接失败

检查开发者工具已打开 CLI/HTTP 调用、CLI 已使用 `--auto` 启动项目、`wsEndpoint` 端口与 `--auto-port` 一致，以及自动化连接的是构建产物目录。

### 14. 预览或上传提示 AppID 不匹配

确认以下位置一致：微信公众平台、`manifest.json`、`project.config.json`、`common/config/index.ts`。

### 15. 当前项目还不能直接完成全部真机验证

还需要完成云开发环境创建、云环境 ID 填写、`roomie` 云函数部署、数据库集合创建和权限设置，以及两个真实微信账号测试。
