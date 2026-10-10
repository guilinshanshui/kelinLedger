#!/usr/bin/env node
/** 渲染设计验收样机并输出桌面/移动端截图。 */

const path = require('path')
const { pathToFileURL } = require('url')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '..')
const preview = path.join(root, 'design-previews', '2026-10-05-room-settings')

async function main() {
  const executablePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })
  await page.goto(pathToFileURL(path.join(preview, 'index.html')).href)
  await page.screenshot({ path: path.join(preview, 'desktop.png'), fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    phones: [...document.querySelectorAll('.phone')].map((node) => ({
      width: node.getBoundingClientRect().width,
      scrollWidth: node.scrollWidth,
      scrollHeight: node.scrollHeight
    }))
  }))
  await page.screenshot({ path: path.join(preview, 'mobile.png'), fullPage: true })
  await browser.close()

  if (metrics.scrollWidth > metrics.viewport + 1) {
    throw new Error(`移动端页面横向溢出：${metrics.scrollWidth} > ${metrics.viewport}`)
  }
  console.log(JSON.stringify(metrics, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
