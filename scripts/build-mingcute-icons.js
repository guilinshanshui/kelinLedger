#!/usr/bin/env node
/**
 * 由 design-previews/icon-mapping.html 的对照数据生成 common/icons/mingcute.js。
 *
 * 为什么需要这一步：
 * 1. 对照页里的 SVG 片段直接塞进小程序会带上大量无用字符，主包体积吃不消；
 * 2. MingCute 源文件的每条路径里混有一段不可见的占位路径
 *    （d 以 m12.59x 23.25x 开头、且不带 fill 属性），只保留真正带 fill
 *    的绘制路径，渲染结果不变，模块体积能砍掉一半。
 *
 * 用法：node scripts/build-mingcute-icons.js
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SOURCE = path.join(ROOT, 'design-previews', 'icon-mapping.html')
const TARGET = path.join(ROOT, 'common', 'icons', 'mingcute.js')

/**
 * 从锚点往后取第一个完整的花括号对象。
 * 对照页里 DATA 后面还跟着一份 GROUPS 副本，用括号配平才能切准。
 */
function extractObject(source, anchor) {
  const anchorIndex = source.indexOf(anchor)
  if (anchorIndex === -1) throw new Error(`在 icon-mapping.html 中找不到 ${anchor.trim()}`)

  const begin = source.indexOf('{', anchorIndex)
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = begin; i < source.length; i += 1) {
    const ch = source[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return source.slice(begin, i + 1)
    }
  }

  throw new Error('icon-mapping.html 的对象没有闭合')
}

function readMapping() {
  const html = fs.readFileSync(SOURCE, 'utf8')
  return JSON.parse(extractObject(html, 'const DATA = '))
}

/**
 * 只保留真正参与绘制的 path，丢弃占位路径。
 * 另外把写在 <g> 上的 fill-rule / clip-rule 下沉到每条 path，
 * 否则丢掉镂空规则后，品牌类图标（alipay 等）会糊成一个实心块。
 */
function visiblePaths(line) {
  const groups = line.match(/<g\b[^>]*>/g) || []
  const inherited = ['fill-rule', 'clip-rule'].filter((attr) =>
    groups.some((group) => new RegExp(`\\s${attr}\\s*=\\s*"`).test(group))
  )

  const paths = line.match(/<path\b[^>]*?\/?>/g) || []
  return paths
    .filter((item) => /\sfill\s*=\s*"/.test(item))
    .map((item) =>
      inherited.reduce((acc, attr) => {
        if (new RegExp(`\\s${attr}\\s*=`).test(acc)) return acc
        return acc.replace('<path', `<path ${attr}="evenodd"`)
      }, item)
    )
}

function build() {
  const mapping = readMapping()
  const icons = {}
  const order = []

  for (const items of Object.values(mapping)) {
    for (const item of items) {
      if (item.name in icons) continue
      const paths = visiblePaths(item.line)
      if (!paths.length) throw new Error(`图标 ${item.name} 没有可绘制路径`)
      icons[item.name] = paths.join('')
      order.push(item.name)
    }
  }

  const names = order.slice().sort()
  const body = names
    .map((name) => `  ${JSON.stringify(name)}: ${JSON.stringify(icons[name])}`)
    .join(',\n')

  const output = `/**
 * MingCute 图标路径数据（自动生成，请勿手改）。
 * 生成脚本：scripts/build-mingcute-icons.js
 *
 * 每个值是一段 SVG 内部标记，fill="currentColor" 为占位色，
 * 实际颜色由 common/utils/icon.js 在生成 data URI 时替换，
 * 因此同一份数据可以跟随任意主题色。
 */

export const MINGCUTE_VIEW_BOX = '0 0 24 24'

export const MINGCUTE_ICONS = {
${body}
}

/** 校验某个名字是否是已知的 MingCute 图标。 */
export function hasMingcuteIcon(name) {
  return Object.prototype.hasOwnProperty.call(MINGCUTE_ICONS, name)
}
`

  fs.mkdirSync(path.dirname(TARGET), { recursive: true })
  fs.writeFileSync(TARGET, output, 'utf8')

  const bytes = Buffer.byteLength(output)
  console.log('已生成 common/icons/mingcute.js')
  console.log(`  图标数量：${names.length}`)
  console.log(`  模块体积：${(bytes / 1024).toFixed(1)} KB`)
}

build()
