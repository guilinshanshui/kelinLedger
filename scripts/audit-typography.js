#!/usr/bin/env node
/**
 * 字体一致性体检：找出"同一类语义标签"里没跟上全站字阶的规则。
 *
 * 全站约定（DESIGN.md）：
 * - 分类名 / 记录标题：15px + 600 字重（对标 .cell-title）
 * - 辅助说明 / 时间：11px + 400
 *
 * 运行：node scripts/audit-typography.js
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DIRS = ['pages', 'components']

/** 需要对齐的语义类：class 名里出现这些词就按"记录标题"要求 600 字重 */
const TITLE_HINTS = ['-name', '-title', '-label', '-head']

const findings = []
const LIST_ALL = process.argv.includes('--list')
const table = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full)
      continue
    }
    if (!entry.name.endsWith('.vue')) continue

    const source = fs.readFileSync(full, 'utf8')
    const rel = path.relative(ROOT, full).replace(/\\/g, '/')
    const re = /<style[^>]*>([\s\S]*?)<\/style>/g
    let block
    while ((block = re.exec(source))) {
      const startLine = source.slice(0, block.index).split('\n').length
      const cleaned = block[1].replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
      const ruleRe = /([^{}]+)\{([^{}]*)\}/g
      let rule
      while ((rule = ruleRe.exec(cleaned))) {
        const selector = rule[1].trim().replace(/\s+/g, ' ')
        const body = rule[2]
        // 只看不带状态后缀的"基类"规则，且必须是文字类 class
        if (selector.indexOf(',') >= 0) continue
        if (selector.indexOf(':') >= 0 || selector.indexOf('.active') >= 0) continue
        const cls = selector.match(/^\.([\w-]+)$/) || selector.match(/^\.([\w-]+)\s/)
        if (!cls) continue
        const name = cls[1]
        if (!TITLE_HINTS.some((h) => name.endsWith(h))) continue

        const size = /font-size:\s*([\d.]+)(px|rpx)/.exec(body)
        const weight = /font-weight:\s*(\d+|bold)/.exec(body)
        if (!size) continue

        const px = size[2] === 'rpx' ? Number(size[1]) / 2 : Number(size[1])
        // 只关心"记录标题"量级（13-17px）的那些
        if (px < 13 || px > 17) continue

        const w = weight ? String(weight[1]) : '400'
        table.push({ file: rel, selector, size: size[0], weight: weight ? weight[0] : '(未声明，默认 400)' })
        if (w === '600' || w === 'bold' || w === '700') continue

        const line = startLine + cleaned.slice(0, rule.index).split('\n').length - 1
        findings.push({ file: rel, line, selector, size: size[0], weight: weight ? weight[0] : '(未声明，默认 400)' })
      }
    }
  }
}

if (LIST_ALL) {
for (const dir of DIRS) {
  const abs = path.join(ROOT, dir)
  if (fs.existsSync(abs)) walk(abs)
}

  table.sort((a, b) => (a.file + a.selector).localeCompare(b.file + b.selector))
  for (const row of table) console.log(`${row.file}  ${row.selector}  ${row.size} / ${row.weight}`)
  console.log(`\n共 ${table.length} 条记录标题类规则。`)
  process.exit(0)
}

if (!findings.length) {
  console.log('记录标题类文字的字重都跟全站字阶一致。')
  process.exit(0)
}

console.log(`发现 ${findings.length} 处记录标题类文字没跟上字重（应 600）：\n`)
for (const f of findings) {
  console.log(`${f.file}:${f.line}  ${f.selector}\n    ${f.size} / ${f.weight}`)
}
