#!/usr/bin/env node
/**
 * 扫出 .vue 的 <script>/<template> 里出现的色值字面量（样式块之外）。
 * 这些值不会被 normalize-theme-colors 处理，容易残留旧主题色或看不清的浅灰。
 *
 * 运行：node scripts/audit-inline-colors.js
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DIRS = ['pages', 'components', 'common']

const findings = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full)
      continue
    }
    if (!/\.(vue|js|ts)$/.test(entry.name)) continue

    let source = fs.readFileSync(full, 'utf8')
    if (entry.name.endsWith('.vue')) {
      // 抹掉 <style> 块，只留模板和脚本
      source = source.replace(/<style[^>]*>[\s\S]*?<\/style>/g, (m) => m.replace(/[^\n]/g, ' '))
    }

    source.split('\n').forEach((line, index) => {
      const matches = line.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)
      if (!matches) return
      findings.push({
        file: path.relative(ROOT, full).replace(/\\/g, '/'),
        line: index + 1,
        colors: matches.join(' '),
        text: line.trim()
      })
    })
  }
}

DIRS.forEach((d) => {
  const abs = path.join(ROOT, d)
  if (fs.existsSync(abs)) walk(abs)
})

if (!findings.length) {
  console.log('样式块之外没有发现色值字面量。')
  process.exit(0)
}

console.log(`样式块之外共发现 ${findings.length} 处色值字面量：\n`)
for (const f of findings) {
  console.log(`${f.file}:${f.line}  ${f.colors}\n    ${f.text}`)
}
