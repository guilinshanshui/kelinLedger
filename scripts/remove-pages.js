#!/usr/bin/env node
/**
 * 从 pages.json 中移除指定的页面注册项（含紧邻的注释行与尾随逗号）。
 *
 * 用法：node scripts/remove-pages.js pages/a/a pages/b/b ...
 */

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const pagesFile = path.join(root, 'pages.json')

const targets = process.argv.slice(2)
if (!targets.length) {
  console.error('需要传入要移除的页面路径')
  process.exit(1)
}

let text = fs.readFileSync(pagesFile, 'utf8')

function findObjectEnd(source, start) {
  let depth = 0
  let inString = false
  let quote = ''
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i]
    const prev = source[i - 1]
    if (inString) {
      if (ch === quote && prev !== '\\') inString = false
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = true
      quote = ch
      continue
    }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

const removed = []

for (const target of targets) {
  const needle = `"path": "${target}"`
  const pathIndex = text.indexOf(needle)
  if (pathIndex < 0) {
    console.log(`跳过（未注册）：${target}`)
    continue
  }

  // 向前找到该条目对象的起始 {
  const objStart = text.lastIndexOf('{', pathIndex)
  const objEnd = findObjectEnd(text, objStart)
  if (objStart < 0 || objEnd < 0) {
    console.error(`无法定位对象边界：${target}`)
    process.exitCode = 1
    continue
  }

  // 吃掉对象后的逗号与换行
  let removeEnd = objEnd + 1
  while (removeEnd < text.length && /[\s,]/.test(text[removeEnd])) removeEnd += 1

  // 向前吃掉紧邻的注释行
  let removeStart = objStart
  const before = text.slice(0, objStart)
  const lines = before.split('\n')
  if (lines.length >= 2) {
    const prevLine = lines[lines.length - 2]
    if (/^\s*\/\//.test(prevLine)) {
      removeStart = objStart - (lines[lines.length - 1].length + prevLine.length + 1)
    }
  }

  text = text.slice(0, removeStart) + text.slice(removeEnd)
  removed.push(target)
}

fs.writeFileSync(pagesFile, text, 'utf8')

console.log(`已移除 ${removed.length} 个页面注册项：`)
removed.forEach((p) => console.log(`  - ${p}`))
