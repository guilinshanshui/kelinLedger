#!/usr/bin/env node
/**
 * 页面可达性体检。
 *
 * 比"孤儿页面"更严：不光看页面路径有没有出现在源码里，
 * 还要看**引用了它的那个组件/页面自己是不是可达的**，
 * 避免出现「A 跳 B、但没人能到 A」这种断链。
 *
 * 判定：
 *   - tabBar 页面 → 天然可达
 *   - 被可达页面/组件 navigateTo / switchTab / redirectTo 到 → 可达
 *   - 只在「分享路径 / 分享 title」这类字符串里出现 → 不算可达
 *
 * 运行：node scripts/audit-page-reach.js
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
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

const files = walk(ROOT)
const read = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]))
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/')

/* 1. 所有注册页面 */
const pagesJson = fs.readFileSync(path.join(ROOT, 'pages.json'), 'utf8')
const registered = [...pagesJson.matchAll(/"path"\s*:\s*"([^"]+)"/g)].map((m) => '/' + m[1])

/* 2. tabBar 页面天然可达 */
const tabBarBlock = pagesJson.slice(pagesJson.indexOf('"tabBar"'))
const tabPages = [...tabBarBlock.matchAll(/"pagePath"\s*:\s*"([^"]+)"/g)].map((m) => '/' + m[1])

/* 3. 收集「真实跳转」和「仅分享字符串」 */
const realNav = new Map() // 目标页面 → [来源文件]
const shareOnly = new Map()

for (const [file, src] of read) {
  const r = rel(file)
  // 跳过体检脚本自己
  if (r.startsWith('scripts/')) continue

  for (const target of registered) {
    if (!src.includes(target)) continue

    // 只看真正会触发跳转的写法
    const navRe = new RegExp(
      `(?:navigateTo|redirectTo|reLaunch|switchTab)\\s*\\(\\s*\\{[^}]*['"\`]${target.replace(/\//g, '\\/')}`,
      's'
    )
    if (navRe.test(src)) {
      if (!realNav.has(target)) realNav.set(target, [])
      realNav.get(target).push(r)
    } else {
      if (!shareOnly.has(target)) shareOnly.set(target, [])
      shareOnly.get(target).push(r)
    }
  }
}

/* 4. 广度优先：从 tabBar 页面出发能走到哪些页面 */
const componentOf = new Map() // 组件文件 → 引用它的文件
for (const [file, src] of read) {
  const r = rel(file)
  if (!r.startsWith('components/')) continue
  const base = path.basename(file, '.vue')
  for (const [other, otherSrc] of read) {
    if (other === file) continue
    if (otherSrc.includes(`/${base}.vue`) || otherSrc.includes(`components/${base}`)) {
      if (!componentOf.has(r)) componentOf.set(r, [])
      componentOf.get(r).push(rel(other))
    }
  }
}

/** 某来源文件是否可达（tabBar 页面 或 被可达来源引用） */
function isReachable(src, seen = new Set()) {
  if (seen.has(src)) return false
  seen.add(src)
  if (src.startsWith('pages/')) {
    const pagePath = '/' + src.replace(/\.vue$/, '')
    if (tabPages.includes(pagePath)) return true
  }
  const parents = componentOf.get(src) || []
  if (src.startsWith('components/')) {
    return parents.some((p) => isReachable(p, seen))
  }
  // 页面：看有没有从可达页面跳过来。
  // realNav 的 key 是 pages.json 里的路径（不带 .vue），这里必须把后缀去掉，
  // 否则永远查不到跳转表，会把可达页面误报成断链。
  const pagePath = '/' + src.replace(/\.vue$/, '')
  const refs = realNav.get(pagePath) || []
  return refs.some((from) => from !== src && isReachable(from, seen))
}

const reachablePages = new Set(tabPages)
const unreachable = []

for (const page of registered) {
  if (tabPages.includes(page)) continue
  const refs = realNav.get(page) || []
  const ok = refs.some((from) => isReachable(from))
  if (ok) reachablePages.add(page)
  else {
    unreachable.push({
      page,
      refs: refs.length ? refs : [],
      shareOnly: shareOnly.get(page) || []
    })
  }
}

/* ---------- 输出 ---------- */

console.log(`注册页面 ${registered.length} 个，其中 tabBar ${tabPages.length} 个\n`)
console.log(`【可达】${reachablePages.size} 个`)
console.log([...reachablePages].sort().map((p) => `  ${p}`).join('\n'))

if (!unreachable.length) {
  console.log('\n【不可达】0 个')
  process.exit(0)
}

console.log(`\n【从界面点不到】${unreachable.length} 个\n`)
for (const u of unreachable) {
  console.log(`  ${u.page}`)
  if (u.refs.length) {
    console.log(`      被引用它的页面/组件：`)
    u.refs.forEach((r) => console.log(`        ${r}  ← 这个自己不可达，所以断链`))
  } else {
    console.log(`      没有任何真实跳转指向它`)
  }
  if (u.shareOnly.length) {
    console.log(`      只在分享路径里出现：${[...new Set(u.shareOnly)].join(', ')}`)
  }
}
