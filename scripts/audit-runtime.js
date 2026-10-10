#!/usr/bin/env node
/**
 * 运行时体检：数据逻辑风险 + 性能风险。
 *
 * 检查项：
 *   1. uni.$on 注册了但没配套的 uni.$off（监听泄漏，切页面越多次越卡）
 *   2. 每个页面挂载时会打几次云函数（串行瀑布流）
 *   3. onShow 里重复全量拉数据（每次切 tab 都重新请求）
 *   4. 直接用 new Date() 取「今天 / 本月」（云函数在 UTC，跨时区会错位）
 *   5. 金额用浮点累加（0.1 + 0.2 问题）
 *   6. 除零风险（百分比 / 占比计算前没有判零）
 *
 * 运行：node scripts/audit-runtime.js
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DIRS = ['pages', 'components', 'common', 'store']
const SKIP = ['node_modules', 'dist', 'unpackage', '.git', '.debug', 'cloudfunctions']

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.includes(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (/\.(vue|js|ts)$/.test(e.name)) out.push(full)
  }
  return out
}

const files = DIRS.flatMap((d) => walk(path.join(ROOT, d)))
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/')

const leaks = []
const dateHazards = []
const floatMoney = []
const divZero = []
const pageApiStats = []
const onShowReload = []
const commentedCode = []

for (const file of files) {
  const r = rel(file)
  const src = fs.readFileSync(file, 'utf8')
  const lines = src.split('\n')

  /* ---- 1. 监听泄漏 ---- */
  const ons = [...src.matchAll(/uni\.\$on\(\s*['"]([\w:]+)['"]/g)].map((m) => m[1])
  const offs = [...src.matchAll(/uni\.\$off\(\s*['"]([\w:]+)['"]/g)].map((m) => m[1])
  const leaked = ons.filter((n) => !offs.includes(n))
  if (leaked.length) leaks.push({ file: r, names: [...new Set(leaked)] })

  /* ---- 2. 页面挂载时的云函数调用 ---- */
  if (r.startsWith('pages/')) {
    const apiCalls = [...src.matchAll(/\b((?:room|task|user|ledger|schedule|feed|stats|asset|notification|member)\w*Api)\.(\w+)\s*\(/g)]
    if (apiCalls.length) {
      pageApiStats.push({
        file: r,
        count: apiCalls.length,
        names: [...new Set(apiCalls.map((m) => `${m[1]}.${m[2]}`))]
      })
    }
  }

  /* ---- 3. onShow 里全量拉数据 ---- */
  const onShowMatch = src.match(/onShow\(\s*\(\s*\)\s*=>\s*\{([\s\S]{0,600}?)\n\}\)/)
  if (onShowMatch && /await\s|\.then\(|getData\(|initPage\(|loadStats\(|getAllList\(/.test(onShowMatch[1])) {
    onShowReload.push({ file: r })
  }

  /* ---- 4. 时区风险：前端直接用 new Date 取今天 / 本月 ---- */
  lines.forEach((line, i) => {
    if (/new Date\(\)\.get(FullYear|Month|Date|Day)\(/.test(line)) {
      dateHazards.push({ file: r, line: i + 1, text: line.trim() })
    }
  })

  /* ---- 5. 浮点金额 ---- */
  lines.forEach((line, i) => {
    if (/amountMinor\s*\/\s*100|parseFloat\(.*amount|\+\s*Number\(.*amount/i.test(line) && /(sum|\+=|total)/i.test(line)) {
      floatMoney.push({ file: r, line: i + 1, text: line.trim() })
    }
  })

  /* ---- 6. 除零风险 ---- */
  lines.forEach((line, i) => {
    if (/\/\s*(total|max|sum|count)\w*\.?(value)?\b/.test(line) && !/Math\.max\(|!total|!max|\|\|\s*1|: *1\b/.test(line)) {
      divZero.push({ file: r, line: i + 1, text: line.trim() })
    }
  })

  /* ---- 7. 注释掉的代码 ---- */
  const HINT = /^\/\/\s*(?:const|let|var|function|if|for|return|import|export|uni\.|wx\.|await)/
  let run = 0
  let start = 0
  lines.forEach((line, i) => {
    if (HINT.test(line.trim())) {
      if (!run) start = i + 1
      run++
    } else {
      if (run >= 3) commentedCode.push({ file: r, line: start, count: run })
      run = 0
    }
  })
  if (run >= 3) commentedCode.push({ file: r, line: start, count: run })
}

const out = []

if (leaks.length) {
  out.push(
    `【事件监听泄漏：uni.$on 没有配套 uni.$off】${leaks.length} 个文件\n` +
      leaks.map((l) => `  ${l.file}  →  ${l.names.join(', ')}`).join('\n')
  )
}

if (onShowReload.length) {
  out.push(
    `【onShow 每次都全量重新拉数据】${onShowReload.length} 个页面\n` +
      onShowReload.map((o) => `  ${o.file}`).join('\n')
  )
}

if (pageApiStats.length) {
  const sorted = [...pageApiStats].sort((a, b) => b.count - a.count)
  out.push(
    `【页面挂载时调用的云函数数量】\n` +
      sorted
        .map((p) => `  ${String(p.count).padStart(2)} 次  ${p.file}\n        ${p.names.join(', ')}`)
        .join('\n')
  )
}

if (dateHazards.length) {
  out.push(
    `【前端直接取“今天/本月”（时区风险）】${dateHazards.length} 处\n` +
      dateHazards.map((d) => `  ${d.file}:${d.line}  ${d.text}`).join('\n')
  )
}

if (floatMoney.length) {
  out.push(
    `【浮点金额累加】${floatMoney.length} 处\n` +
      floatMoney.map((d) => `  ${d.file}:${d.line}  ${d.text}`).join('\n')
  )
}

if (divZero.length) {
  out.push(
    `【可能的除零】${divZero.length} 处（需人工确认）\n` +
      divZero.slice(0, 20).map((d) => `  ${d.file}:${d.line}  ${d.text}`).join('\n')
  )
}

if (commentedCode.length) {
  out.push(
    `【注释掉的代码】${commentedCode.length} 处\n` +
      commentedCode.map((c) => `  ${c.file}:${c.line}  连续 ${c.count} 行`).join('\n')
  )
}

if (!out.length) {
  console.log('没有发现运行时风险。')
  process.exit(0)
}

console.log(out.join('\n\n'))
