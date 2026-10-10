#!/usr/bin/env node
/**
 * 校验 common/icons/mingcute.js：
 * 1. 每个图标都解析出至少一条可绘制路径；
 * 2. SVG 标记闭合、base64 能原样解码回来；
 * 3. 顺带生成一张可视化对照页 design-previews/mingcute-verify.html，
 *    用来肉眼确认提取过程没有把图形切坏。
 *
 * 用法：node scripts/verify-mingcute-icons.js
 */

const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

const ROOT = path.resolve(__dirname, '..')
const MODULE = path.join(ROOT, 'common', 'icons', 'mingcute.js')
const PREVIEW = path.join(ROOT, 'design-previews', 'mingcute-verify.html')

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** 内联 SVG 的数据地址前缀。 */
const IMAGE_URI_PREFIX = 'data:' + 'image/svg+xml;base64,'

/** 与 common/utils/icon.js 完全一致的编码实现，用于交叉验证。 */
function base64Encode(input) {
  let out = ''
  for (let i = 0; i < input.length; i += 3) {
    const c1 = input.charCodeAt(i)
    const c2 = input.charCodeAt(i + 1)
    const c3 = input.charCodeAt(i + 2)
    const hasC2 = !Number.isNaN(c2)
    const hasC3 = !Number.isNaN(c3)
    out += BASE64_CHARS[c1 >> 2]
    out += BASE64_CHARS[((c1 & 0x03) << 4) | (hasC2 ? c2 >> 4 : 0)]
    out += hasC2 ? BASE64_CHARS[((c2 & 0x0f) << 2) | (hasC3 ? c3 >> 6 : 0)] : '='
    out += hasC3 ? BASE64_CHARS[c3 & 0x3f] : '='
  }
  return out
}

async function main() {
  const mod = await import(pathToFileURL(MODULE).href)
  const { MINGCUTE_ICONS, MINGCUTE_VIEW_BOX, hasMingcuteIcon } = mod
  const names = Object.keys(MINGCUTE_ICONS).sort()

  const problems = []
  const cards = []

  for (const name of names) {
    const body = MINGCUTE_ICONS[name]
    if (!body || !body.trim()) {
      problems.push(`${name}: 路径为空`)
      continue
    }
    const opens = (body.match(/<path\b/g) || []).length
    const closes = (body.match(/\/>/g) || []).length
    if (opens !== closes) problems.push(`${name}: path 标签不闭合 (${opens}/${closes})`)
    if (!/fill="/.test(body)) problems.push(`${name}: 没有 fill 属性`)
    if (/m12\.59\d 23\.25\d/.test(body)) problems.push(`${name}: 残留占位路径`)

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MINGCUTE_VIEW_BOX}" width="24" height="24">${body}</svg>`
    const encoded = base64Encode(svg)
    const decoded = Buffer.from(encoded, 'base64').toString('ascii')
    if (decoded !== svg) problems.push(`${name}: base64 往返不一致`)

    const uri = IMAGE_URI_PREFIX + encoded
    cards.push(
      `<figure><img src="${uri}" alt="${name}"><figcaption>${name}</figcaption></figure>`
    )
  }

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>MingCute 模块自检 · Roomie</title>
<style>
  body { font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif; background:#F6F8F8; color:#1E293B; margin:0; padding:24px; }
  h1 { font-size:18px; margin:0 0 4px; }
  p { font-size:12px; color:#64748B; margin:0 0 20px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(68px,1fr)); gap:7px; }
  figure { margin:0; background:#fff; border:1px solid #E8EEEF; border-radius:9px; padding:8px 3px 5px; text-align:center; }
  img { width:21px; height:21px; }
  figcaption { font-size:8px; color:#64748B; margin-top:4px; word-break:break-all; line-height:1.25; }
</style>
</head>
<body>
  <h1>MingCute 模块自检</h1>
  <p>共 ${names.length} 个图标 · 全部由 common/icons/mingcute.js 现场生成 data URI 渲染 · 颜色 #2F5D6B</p>
  <div class="grid">${cards.join('')}</div>
</body>
</html>`

  fs.writeFileSync(PREVIEW, html, 'utf8')

  console.log(`图标总数：${names.length}`)
  console.log(`hasMingcuteIcon('dinner') = ${hasMingcuteIcon('dinner')}`)
  console.log(`hasMingcuteIcon('nope') = ${hasMingcuteIcon('nope')}`)
  console.log(`自检页面：design-previews/mingcute-verify.html`)
  if (problems.length) {
    console.error(`\n发现 ${problems.length} 个问题：`)
    for (const item of problems) console.error('  - ' + item)
    process.exitCode = 1
  } else {
    console.log('全部通过：路径闭合、无残留占位、base64 往返一致。')
  }
}

main()
