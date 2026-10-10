#!/usr/bin/env node
/**
 * 孤儿页面分析。
 *
 * 以入口页 + tabBar 页为根，沿代码里的跳转目标做可达性搜索，
 * 找出注册了但永远到不了的页面（含级联孤儿，例如只被另一个孤儿页引用的页面）。
 *
 * 运行：node scripts/audit-orphan-pages.js
 */

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const SKIP = ['node_modules', 'unpackage', 'dist', '.git', '.debug']

function walk(dir, extensions, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, extensions, result)
    else if (extensions.includes(path.extname(entry.name))) result.push(full)
  }
  return result
}

const pagesFile = path.join(root, 'pages.json')
const raw = fs.readFileSync(pagesFile, 'utf8')
const cleaned = raw.replace(/^[ \t]*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1')
const config = JSON.parse(cleaned)

const pageList = config.pages.map((p) => p.path)
const pageSet = new Set(pageList)
const tabPages = (config.tabBar && config.tabBar.list ? config.tabBar.list : []).map((t) => t.pagePath)
const entry = pageList[0]

// 所有源码文件（排除 pages.json 自身，它只是注册表不是引用）
const files = walk(root, ['.vue', '.js', '.ts'])
  .filter((f) => path.basename(f) !== 'pages.json')

const fileText = new Map()
for (const file of files) fileText.set(file, fs.readFileSync(file, 'utf8'))

/** 页面文件路径 -> 该页面引用的其它页面 */
function pageTargets(pagePath) {
  const file = path.join(root, `${pagePath}.vue`)
  const text = fileText.get(file)
  if (!text) return []
  const found = new Set()
  for (const candidate of pageList) {
    if (candidate === pagePath) continue
    if (text.includes(candidate)) found.add(candidate)
  }
  return [...found]
}

/** 非页面文件（组件、工具）里出现的页面引用，视为全局可达入口的补充 */
const globalTargets = new Set()
for (const [file, text] of fileText) {
  const rel = path.relative(root, file).replace(/\\/g, '/')
  if (rel.startsWith('pages/')) continue
  for (const candidate of pageList) {
    if (text.includes(candidate)) globalTargets.add(candidate)
  }
}

const reachable = new Set()
const queue = [entry, ...tabPages]

// 组件里出现的跳转目标也当作可达（例如 profile.vue 里的菜单由组件触发）
for (const target of globalTargets) queue.push(target)

while (queue.length) {
  const current = queue.shift()
  if (!pageSet.has(current) || reachable.has(current)) continue
  reachable.add(current)
  for (const next of pageTargets(current)) queue.push(next)
}

const orphans = pageList.filter((p) => !reachable.has(p))

console.log(`注册页面：${pageList.length}`)
console.log(`可达页面：${reachable.size}`)
console.log(`孤儿页面：${orphans.length}`)

let bytes = 0
for (const p of orphans) {
  const file = path.join(root, `${p}.vue`)
  const size = fs.existsSync(file) ? fs.statSync(file).size : 0
  bytes += size
  console.log(`  - ${p}  (${(size / 1024).toFixed(1)} KB 源码)`)
}
console.log(`孤儿页面源码合计：${(bytes / 1024).toFixed(1)} KB`)

process.exitCode = 0
