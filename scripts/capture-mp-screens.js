#!/usr/bin/env node
/**
 * 用微信开发者工具的自动化接口给关键页面截图，改完 UI 后自查用。
 *
 * 依赖可选的 miniprogram-automator（没有写进 package.json，按需安装）：
 *   npm install --no-save --package-lock=false --legacy-peer-deps miniprogram-automator
 *
 * 用法：
 *   node scripts/capture-mp-screens.js
 *   node scripts/capture-mp-screens.js pages/profile/profile    # 只截指定页
 *
 * 截图输出到 .debug/ui-shots/。
 */

const fs = require('fs')
const path = require('path')
const automator = require('miniprogram-automator')

const ROOT = path.resolve(__dirname, '..')
const PROJECT = path.join(ROOT, 'dist', 'build', 'mp-weixin')
const OUT_DIR = path.join(ROOT, '.debug', 'ui-shots')
const CLI_PATH =
  process.env.WX_DEVTOOLS_CLI || 'D:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat'

/** 默认要截的页面，key 是文件名，value 是页面路径。 */
const DEFAULT_TARGETS = [
  ['home', '/pages/home/home'],
  ['profile', '/pages/profile/profile'],
  ['asset-details', '/pages/asset-details/asset-details?roomId={{roomId}}'],
  ['ledger-all', '/pages/ledger-all/ledger-all?roomId={{roomId}}'],
  ['add-entry', '/pages/add-entry/add-entry?roomId={{roomId}}'],
  ['room-list', '/pages/room-list/room-list'],
  ['dashboard', '/pages/dashboard/dashboard']
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function resolveTargets() {
  const args = process.argv.slice(2).filter((item) => item.indexOf('pages/') === 0)
  if (!args.length) return DEFAULT_TARGETS
  return args.map((page) => {
    const path = page.indexOf('/') === 0 ? page : '/' + page
    const name = path.split('?')[0].split('/').filter(Boolean).pop()
    return [name, path]
  })
}

async function main() {
  if (!fs.existsSync(PROJECT)) {
    throw new Error(`找不到构建产物：${PROJECT}，请先跑 npm run build:mp-weixin`)
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })

  // 开发者工具已经用 `cli auto --auto-port 9420` 起了自动化服务时，直接连上去，
  // 比 launch 稳（launch 在 IDE 已运行时容易因为 HTTP 端口不一致失败）。
  const autoPort = Number(process.env.WX_AUTO_PORT || 0)
  const miniProgram = autoPort
    ? await automator.connect({ wsEndpoint: `ws://127.0.0.1:${autoPort}` })
    : await automator.launch({
        cliPath: CLI_PATH,
        projectPath: PROJECT
      })

  try {
    // 先回首页让应用把「当前账本」写进 storage，后面带参数的页面才有 roomId 可用
    await miniProgram.reLaunch('/pages/home/home')
    await sleep(1500)
    let roomId = ''
    try {
      const saved = await miniProgram.callWxMethod('getStorageSync', 'roomie_current_room')
      roomId = (saved && saved.id) || ''
    } catch (error) {
      console.warn('读取当前账本失败：' + error.message)
    }
    console.log('当前账本 roomId =', roomId || '(空)')

    for (const [name, rawPath] of resolveTargets()) {
      const pagePath = rawPath.replace('{{roomId}}', roomId)
      try {
        await miniProgram.reLaunch(pagePath)
        // 页面普遍有「骨架屏 + 云函数往返」，等短了会截到加载中
        await sleep(Number(process.env.SHOT_WAIT_MS || 4000))
        const file = path.join(OUT_DIR, `${name}.png`)
        await miniProgram.screenshot({ path: file })
        console.log('已截图', path.relative(ROOT, file))
      } catch (error) {
        console.warn(`跳过 ${name}：${error.message}`)
      }
    }
  } finally {
    // 直连模式（WX_AUTO_PORT）下不关闭，方便连着跑多轮截图；
    // 只有 launch 起来的会话才需要收尾。
    if (autoPort) await miniProgram.disconnect()
    else await miniProgram.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
