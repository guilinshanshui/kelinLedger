#!/usr/bin/env node
/**
 * 用当前 MingCute 图标库重新生成 tabBar 图标。
 *
 * 为什么需要这一步：小程序原生 tabBar 只接受图片文件，没法像 AppIcon 那样
 * 直接渲染矢量。这里把 MingCute 的路径数据渲染成 SVG，再用 resvg 栅格化成
 * 透明底 PNG，保证底部导航和页面内的图标出自同一套线稿。
 *
 * 换图标或换主题色时重跑本脚本即可，不需要手工做图。
 *
 * 用法：node scripts/generate-tabbar-icons.js
 * 依赖：@resvg/resvg-js（预编译原生模块，只在生成图标时需要）
 *   npm install --no-save --package-lock=false --legacy-peer-deps @resvg/resvg-js
 */

const fs = require('fs')
const path = require('path')
const { Resvg } = require('@resvg/resvg-js')

const ROOT = path.resolve(__dirname, '..')
const ICON_MODULE = path.join(ROOT, 'common', 'icons', 'mingcute.js')
const OUT_DIR = path.join(ROOT, 'static', 'tabbar')

/** 未选中用中性灰；选中色与 common/themes/appTheme.ts 的主题主色保持一致。 */
const INACTIVE_COLOR = '#94A3B8'
const THEMES = [
  { id: 'daiqing', color: '#2F5D6B' },
  { id: 'nuanzhe', color: '#6F5643' }
]

/** tabBar 三个位置对应的 MingCute 图标（文件名编号沿用设计稿的 0/2/3）。 */
const TABS = [
  { base: 'tn-tabbar0', icon: 'notebook-2' },
  { base: 'tn-tabbar2', icon: 'list-check-3' },
  { base: 'tn-tabbar3', icon: 'user-2' }
]

const CANVAS = 80
/** 图标实心区域约占画布 70%，和微信 tabBar 的视觉重量对齐。 */
const GLYPH = 56
const OFFSET = (CANVAS - GLYPH) / 2

/** 从生成的图标模块里取路径数据，把颜色换成占位符方便替换。 */
function loadIconBodies() {
  const source = fs.readFileSync(ICON_MODULE, 'utf8')
  const bodies = {}
  for (const { icon } of TABS) {
    const matched = source.match(new RegExp(`"${icon}": ("(?:[^"\\\\]|\\\\.)*")`))
    if (!matched) throw new Error(`图标库里找不到 ${icon}`)
    bodies[icon] = JSON.parse(matched[1]).replace(/currentColor/g, '@COLOR@')
  }
  return bodies
}

function buildSvg(body, color) {
  const markup = body.split('@COLOR@').join(color)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">` +
    `<g transform="translate(${OFFSET} ${OFFSET}) scale(${GLYPH / 24})">${markup}</g>` +
    `</svg>`
}

function renderPng(svg, outFile) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: CANVAS },
    background: 'rgba(0,0,0,0)'
  })
  fs.writeFileSync(outFile, resvg.render().asPng())
}

function main() {
  const bodies = loadIconBodies()
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const jobs = []
  for (const tab of TABS) {
    // 未选中态
    jobs.push({ file: `${tab.base}.png`, body: bodies[tab.icon], color: INACTIVE_COLOR })
    // 每个主题一套选中态
    for (const theme of THEMES) {
      jobs.push({
        file: `${tab.base}-cur-${theme.id}.png`,
        body: bodies[tab.icon],
        color: theme.color
      })
    }
    // pages.json 里写的兜底选中图，用默认主题色
    jobs.push({
      file: `${tab.base}-cur.png`,
      body: bodies[tab.icon],
      color: THEMES[0].color
    })
  }

  jobs.forEach((job) => {
    renderPng(buildSvg(job.body, job.color), path.join(OUT_DIR, job.file))
    console.log('已生成', job.file)
  })

  console.log(`\n共 ${jobs.length} 个文件，输出目录 static/tabbar/`)
}

main()
