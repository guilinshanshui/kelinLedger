#!/usr/bin/env node
/**
 * 对比度体检：找出"字色和底色太接近、看不清"的样式。
 *
 * 做法：
 * 1. 从 App.vue 解析两套主题的 CSS 变量表
 * 2. 把每个 <style> 块拆成规则，取 color 和 background(-color)
 * 3. 解析 var(--token, #fallback)，用主题变量表算 WCAG 对比度
 * 4. 低于阈值就报出来（默认 3.0，正文级 4.5 用 --strict 开启）
 *
 * 运行：node scripts/audit-contrast.js
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SCAN_DIRS = ['pages', 'components']
const THRESHOLD = process.argv.includes('--strict') ? 4.5 : 3.0

/* ---------- 颜色工具 ---------- */

function parseColor(value) {
  if (!value) return null
  const hex = value.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)
  if (hex) {
    let v = hex[1]
    if (v.length === 3) v = v.split('').map((c) => c + c).join('')
    if (v.length === 4) v = v.slice(0, 3).split('').map((c) => c + c).join('')
    const r = parseInt(v.slice(0, 2), 16)
    const g = parseInt(v.slice(2, 4), 16)
    const b = parseInt(v.slice(4, 6), 16)
    return { r, g, b, a: 1 }
  }
  const rgb = value.trim().match(/^rgba?\(([^)]*)\)/)
  if (rgb) {
    const parts = rgb[1].split(',').map((s) => parseFloat(s.trim()))
    if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
  }
  return null
}

function relativeLuminance({ r, g, b }) {
  const f = (c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrast(fg, bg) {
  const l1 = relativeLuminance(fg)
  const l2 = relativeLuminance(bg)
  const hi = Math.max(l1, l2)
  const lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}

function toHex({ r, g, b }) {
  const p = (n) => Math.round(n).toString(16).padStart(2, '0').toUpperCase()
  return `#${p(r)}${p(g)}${p(b)}`
}

/* ---------- 读主题变量 ---------- */

function readThemeTokens() {
  const source = fs.readFileSync(path.join(ROOT, 'App.vue'), 'utf8')
  const themes = {}
  const blockRe = /(\.theme-daiqing|\.theme-nuanzhe|:root)\s*\{([\s\S]*?)\}/g
  let m
  while ((m = blockRe.exec(source))) {
    const key = m[1] === '.theme-nuanzhe' ? 'nuanzhe' : 'daiqing'
    themes[key] = themes[key] || {}
    const declRe = /(--[\w-]+)\s*:\s*([^;]+);/g
    let d
    while ((d = declRe.exec(m[2]))) themes[key][d[1]] = d[2].trim()
  }
  return themes
}

/* ---------- 解析样式规则 ---------- */

function styleBlocks(source) {
  const out = []
  const re = /<style[^>]*>([\s\S]*?)<\/style>/g
  let m
  while ((m = re.exec(source))) {
    const startLine = source.slice(0, m.index).split('\n').length
    out.push({ startLine, text: m[1] })
  }
  return out
}

function parseRules(text, startLine) {
  const rules = []
  // 去掉注释，避免注释里的色值干扰
  const cleaned = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m
  while ((m = re.exec(cleaned))) {
    const selector = m[1].trim().replace(/\s+/g, ' ')
    const body = m[2]
    if (!selector || selector.indexOf('@') === 0) continue
    const line = startLine + cleaned.slice(0, m.index).split('\n').length - 1
    rules.push({ selector, body, line })
  }
  return rules
}

function declarations(body) {
  const out = {}
  for (const part of body.split(';')) {
    const i = part.indexOf(':')
    if (i < 0) continue
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  return out
}

/** var(--token, #fallback) → 主题里的实际色值 */
function resolveValue(value, tokens) {
  if (!value) return null
  const varMatch = value.match(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/)
  if (varMatch) {
    const tokenValue = tokens[varMatch[1]]
    if (tokenValue !== undefined) return tokenValue.trim()
    return varMatch[2] ? varMatch[2].trim() : null
  }
  return value.trim()
}

/* ---------- 主流程 ---------- */

const themes = readThemeTokens()
const findings = []

for (const dir of SCAN_DIRS) {
  const abs = path.join(ROOT, dir)
  if (!fs.existsSync(abs)) continue
  const stack = [abs]
  while (stack.length) {
    const current = stack.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (entry.name.endsWith('.vue')) {
        const rel = path.relative(ROOT, full).replace(/\\/g, '/')
        const source = fs.readFileSync(full, 'utf8')

        for (const themeName of ['daiqing', 'nuanzhe']) {
          const tokens = themes[themeName] || {}
          // 选择器 → 背景色，供没写背景的规则继承
          const bgBySelector = {}

          for (const block of styleBlocks(source)) {
            for (const rule of parseRules(block.text, block.startLine)) {
              const decls = declarations(rule.body)
              const bgRaw =
                decls['background-color'] ||
                (decls.background && decls.background.indexOf('gradient') < 0 ? decls.background : null)
              if (bgRaw) {
                const resolved = resolveValue(bgRaw, tokens)
                const color = resolveValue(bgRaw, tokens)
                const rgb = parseColor(color)
                if (rgb && rgb.a >= 1) bgBySelector[rule.selector] = rgb
              }
            }
          }

          for (const block of styleBlocks(source)) {
            for (const rule of parseRules(block.text, block.startLine)) {
              const decls = declarations(rule.body)
              if (!decls.color) continue

              const fgRaw = resolveValue(decls.color, tokens)
              const fg = parseColor(fgRaw)
              if (!fg || fg.a < 1) continue

              // 近白字色基本都是“深色按钮/彩色芯片上的白字”，
              // 父级背景推不出来，一律跳过，只盯浅色字压浅色底的情况
              if (relativeLuminance(fg) > 0.8) continue

              // 背景：同规则 > 同选择器 > 白
              let bg = null
              const bgRaw =
                decls['background-color'] ||
                (decls.background && decls.background.indexOf('gradient') < 0 ? decls.background : null)
              if (bgRaw) {
                const bgResolved = resolveValue(bgRaw, tokens)
                const rgb = parseColor(bgResolved)
                if (rgb && rgb.a >= 1) bg = rgb
              }
              if (!bg && bgBySelector[rule.selector]) bg = bgBySelector[rule.selector]
              if (!bg) bg = { r: 255, g: 255, b: 255, a: 1 }

              const ratio = contrast(fg, bg)
              if (ratio < THRESHOLD) {
                const fontSize = decls['font-size'] || ''
                findings.push({
                  theme: themeName,
                  file: rel,
                  line: rule.line,
                  selector: rule.selector,
                  ratio,
                  fg: toHex(fg),
                  bg: toHex(bg),
                  fontSize
                })
              }
            }
          }
        }
      }
    }
  }
}

// 同一处问题两套主题都会报，这里按文件+行+选择器归并
const byKey = new Map()
for (const f of findings) {
  const key = `${f.file}:${f.line}:${f.selector}`
  if (!byKey.has(key)) {
    byKey.set(key, { ...f, themes: [f.theme] })
  } else {
    byKey.get(key).themes.push(f.theme)
    // 保留更差的那套
    if (f.ratio < byKey.get(key).ratio) Object.assign(byKey.get(key), f, { themes: byKey.get(key).themes })
  }
}

const list = [...byKey.values()].sort((a, b) => a.ratio - b.ratio)

if (!list.length) {
  console.log(`没有发现对比度低于 ${THRESHOLD}:1 的文本/底色组合。`)
  process.exit(0)
}

console.log(`发现 ${list.length} 处对比度低于 ${THRESHOLD}:1 的文本样式：\n`)
for (const f of list) {
  const size = f.fontSize ? ` [${f.fontSize}]` : ''
  console.log(
    `${f.ratio.toFixed(2)}:1  ${f.file}:${f.line}${size}\n    ${f.selector}\n    ${f.fg} on ${f.bg}  (${f.themes.join('/')})`
  )
}
