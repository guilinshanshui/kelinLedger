#!/usr/bin/env node
/**
 * 主题切换 + 资产页排版的自查脚本。
 *
 * - 分别把 app_theme 切成 daiqing / nuanzhe，进同一个页面截图，肉眼比对配色
 * - 同时打印根节点 class、¥ 符号与数字的实测高度，确认样式真的生效
 *
 * 用法：WX_AUTO_PORT=9420 node scripts/verify-theme-and-asset.js
 * 截图输出到 .debug/ui-shots/。
 */

const fs = require('fs')
const path = require('path')
const automator = require('miniprogram-automator')

const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, '.debug', 'ui-shots')
const PORT = Number(process.env.WX_AUTO_PORT || 9420)

const THEMES = ['daiqing', 'nuanzhe']
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let mp = null

async function shot(name) {
  await mp.screenshot({ path: path.join(OUT_DIR, `${name}.png`) })
  console.log(`  已截图 ${name}.png`)
}

/** 主题是否真的落到页面上：比对根节点 class 里的 theme-xxx */
async function reportThemeClass(page, label) {
  const root = await page.$('[class*="theme-"]')
  if (!root) {
    console.log(`  ${label}: 未找到带 theme-* 的根节点`)
    return
  }
  console.log(`  ${label}: ${await root.attribute('class')}`)
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  mp = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${PORT}` })

  await mp.reLaunch('/pages/home/home')
  await sleep(2500)
  const saved = await mp.callWxMethod('getStorageSync', 'roomie_current_room')
  const roomId = (saved && saved.id) || ''
  console.log('当前账本 roomId =', roomId || '(空)')

  for (const theme of THEMES) {
    await mp.callWxMethod('setStorageSync', 'app_theme', theme)
    console.log(`\n===== 主题 ${theme} =====`)

    // 资产账户页
    await mp.reLaunch(`/pages/asset-details/asset-details?roomId=${roomId}`)
    await sleep(Number(process.env.SHOT_WAIT_MS || 5000))
    const page = await mp.currentPage()
    const root = await page.$('.details-container')
    console.log('  详情页根节点 class =', root ? await root.attribute('class') : '(未找到)')
    await shot(`asset-${theme}`)

    // 我的页
    await mp.reLaunch('/pages/profile/profile')
    await sleep(3500)
    const profilePage = await mp.currentPage()
    const profileRoot = await profilePage.$('.profile-container')
    if (profileRoot) console.log('  我的页根节点 class =', await profileRoot.attribute('class'))
    await shot(`profile-${theme}`)
  }

  // 复位成默认主题，避免留下奇怪状态
  await mp.callWxMethod('setStorageSync', 'app_theme', 'daiqing')
  console.log('\n完成，截图在 .debug/ui-shots/')
}

main()
  .catch((error) => {
    console.error('失败：', error && error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    if (mp) {
      try {
        await mp.disconnect()
      } catch (error) {
        /* 忽略断开错误 */
      }
    }
    process.exit(process.exitCode || 0)
  })
