#!/usr/bin/env node
/**
 * 将历史页面中的机械 UI 违规统一到 DESIGN.md：
 * - 中文伪粗体 700/800/900 -> 600
 * - 负字距 -> 0
 * - transition: all -> 明确的属性列表
 * - 移除 backdrop-filter 玻璃拟态
 *
 * 只处理表现层，不修改业务结构。
 */

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')

function walk(dir, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'unpackage', '.git'].includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, result)
    else if (/\.(vue|css)$/.test(entry.name)) result.push(full)
  }
  return result
}

let changed = 0
for (const file of walk(root)) {
  const before = fs.readFileSync(file, 'utf8')
  const after = before
    .replace(/font-weight:\s*(?:700|800|900)\b/g, 'font-weight: 600')
    .replace(/letter-spacing:\s*-[\w.]+(?:px|rpx|em|rem)?/g, 'letter-spacing: 0')
    .replace(
      /transition:\s*all\s*([^;]*);/g,
      'transition: background-color 0.2s, color 0.2s, border-color 0.2s, box-shadow 0.2s, opacity 0.2s, transform 0.2s;'
    )
    .replace(/(?:-webkit-)?backdrop-filter\s*:[^;]+;?/g, '')

  if (after !== before) {
    fs.writeFileSync(file, after)
    changed += 1
  }
}

console.log(`已归一 ${changed} 个文件`)
