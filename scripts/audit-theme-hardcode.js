#!/usr/bin/env node
/**
 * 扫出样式里"脱离主题变量"的硬编码颜色。
 *
 * 规则：`var(--token, #fallback)` 里的 fallback 不算问题（运行时永远读变量），
 * 只有**独立出现的**颜色字面量才可能造成"换肤后这块没变色"。
 * 中性灰（#fff / #f8fafc 这类无彩度色）单独归类，不计入违规。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SCAN_DIRS = ['pages', 'components']

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.vue')) out.push(full)
  }
  return out
}

/** 提取所有 <style> 块，返回 [{ startLine, text }] */
function styleBlocks(source) {
  const blocks = []
  const re = /<style[^>]*>([\s\S]*?)<\/style>/g
  let m
  while ((m = re.exec(source))) {
    const startLine = source.slice(0, m.index).split('\n').length
    blocks.push({ startLine, text: m[1] })
  }
  return blocks
}

/** 判断一个颜色是否无彩度（灰阶），灰阶不算主题违规 */
function isNeutral(color) {
  const hex = color.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  if (hex) {
    let v = hex[1]
    if (v.length === 3) v = v.split('').map((c) => c + c).join('')
    const r = parseInt(v.slice(0, 2), 16)
    const g = parseInt(v.slice(2, 4), 16)
    const b = parseInt(v.slice(4, 6), 16)
    return Math.max(r, g, b) - Math.min(r, g, b) <= 12
  }
  const rgb = color.match(/^rgba?\(([^)]*)\)/)
  if (rgb) {
    const parts = rgb[1].split(',').map((s) => parseFloat(s.trim()))
    if (parts.length >= 3) {
      const [r, g, b] = parts
      return Math.max(r, g, b) - Math.min(r, g, b) <= 12
    }
  }
  return false
}

const findings = []
for (const dir of SCAN_DIRS) {
  const abs = path.join(ROOT, dir)
  if (!fs.existsSync(abs)) continue
  for (const file of walk(abs)) {
    const source = fs.readFileSync(file, 'utf8')
    for (const block of styleBlocks(source)) {
      // 把 var(--x, <fallback>) 整段挖掉，剩下的才是"裸色值"
      const masked = block.text.replace(/var\(\s*--[\w-]+\s*,[^)]*\)/g, 'VAR()')
      let m
      COLOR_RE.lastIndex = 0
      while ((m = COLOR_RE.exec(masked))) {
        const color = m[0]
        if (isNeutral(color)) continue
        const before = masked.slice(0, m.index)
        const line = block.startLine + before.split('\n').length
        const lineText = block.text.split('\n')[line - block.startLine] || ''
        findings.push({
          file: path.relative(ROOT, file).replace(/\\/g, '/'),
          line,
          color,
          text: lineText.trim()
        })
      }
    }
  }
}

if (!findings.length) {
  console.log('没有发现脱离主题变量的硬编码颜色。')
  process.exit(0)
}

console.log(`发现 ${findings.length} 处脱离主题变量的硬编码颜色：\n`)
for (const f of findings) {
  console.log(`${f.file}:${f.line}  ${f.color}\n    ${f.text}`)
}
