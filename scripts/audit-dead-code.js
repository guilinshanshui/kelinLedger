#!/usr/bin/env node
/**
 * 死代码体检。
 *
 * 扫四类：
 *   1. 没有任何地方 import 的组件
 *   2. 源码里找不到引用的静态资源
 *   3. common/ 里导出了但全项目没人用的函数 / 常量
 *   4. 连续 3 行以上的注释掉的代码
 *
 * 判定刻意偏保守：只要文件名的"主干"在源码里出现过就算被使用，
 * 避免把 tabBar 那种用模板字符串拼路径的资源误报成死文件。
 *
 * 运行：node scripts/audit-dead-code.js
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SRC_DIRS = ['pages', 'components', 'common', 'store']
const SKIP_DIRS = ['node_modules', 'dist', 'unpackage', '.git', '.debug', 'cloudfunctions']

/* ---------- 收集源码 ---------- */

function walk(dir, filter, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, filter, out)
    else if (filter(entry.name)) out.push(full)
  }
  return out
}

const sourceFiles = SRC_DIRS.flatMap((d) =>
  walk(path.join(ROOT, d), (n) => /\.(vue|js|ts)$/.test(n))
)

// 根目录下的入口文件也要算进来：App.vue / main.js 里用到的东西不能被当成“没人用”
for (const name of ['App.vue', 'main.js', 'main.ts']) {
  const full = path.join(ROOT, name)
  if (fs.existsSync(full)) sourceFiles.push(full)
}

/** 把全部源码拼成一个大字符串，用于"有没有被提到"的判断 */
const allSource = sourceFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n')
const extraSource = ['pages.json', 'App.vue', 'main.js', 'manifest.json', 'project.config.json']
  .map((f) => path.join(ROOT, f))
  .filter((f) => fs.existsSync(f))
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n')
const haystack = allSource + '\n' + extraSource

/* ---------- 1. 没人引用的组件 ---------- */

const componentFiles = walk(path.join(ROOT, 'components'), (n) => n.endsWith('.vue'))

const unusedComponents = componentFiles.filter((file) => {
  const base = path.basename(file, '.vue')
  // 组件要么在源码里被 import 到对应的 .vue 路径，要么以连字符标签形式出现。
  // （注意：别在这里写出完整的 import 语句字面量，audit-project 会把它当成真导入去解析）
  const importRe = new RegExp(`from\\s+['"][^'"]*${base}\\.vue['"]`, 'i')
  const tag = base
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase()
  const tagRe = new RegExp(`<${tag}[\\s/>]`, 'i')
  return !importRe.test(haystack) && !tagRe.test(haystack)
})

/* ---------- 2. 没人引用的静态资源 ---------- */

const staticRoot = path.join(ROOT, 'static')
const staticFiles = walk(staticRoot, () => true)
  .filter((f) => /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(f))

/**
 * 源码里可能用模板字符串拼静态路径，比如 tabBar 图标是
 *   `/static/tabbar/${base}-cur-${themeId}.png`
 * 所以先把源码里所有 /static/... 片段抓出来，把 ${...} 当通配符，
 * 静态文件只要能被某一模式匹配上就算在用。
 */
const staticPatterns = []
{ 
  // 先找出所有反引号模板串，里面带 /static/ 且有 ${...} 的就是动态拼路径
  const tplRe = /`([^`]*\/static\/[^`]*)`/g
  let tm
  while ((tm = tplRe.exec(haystack))) {
    const literal = tm[1]
    if (!literal.includes('${')) continue
    // 按 ${...} 切开，每段转义成正则字面量，切口处当通配；比“转义再还原”稳得多
    const pattern = literal
      .split(/\$\{[^}]*\}/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]*')
    staticPatterns.push(new RegExp('^' + pattern + '$'))
  }
}

const unusedStatic = staticFiles.filter((file) => {
  const base = path.basename(file, path.extname(file))
  if (haystack.includes(base)) return false
  const rel = '/' + path.relative(ROOT, file).replace(/\\/g, '/')
  return !staticPatterns.some((re) => re.test(rel))
})

/* ---------- 3. common/ 里没被用到的导出 ---------- */

const exportRe = /export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g
const unusedExports = []

// 先把全文缓存下来，否则每个导出都要把所有文件重读一遍（O(n²)）
const fileTexts = new Map(sourceFiles.map((f) => [f, fs.readFileSync(f, 'utf8')]))
const combinedText = [...fileTexts.values()].join('\n')

for (const file of sourceFiles) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')
  if (!rel.startsWith('common/') && !rel.startsWith('store/')) continue

  const source = fileTexts.get(file)
  let m
  exportRe.lastIndex = 0
  while ((m = exportRe.exec(source))) {
    const name = m[1]
    // 全文里出现次数 减去 本文件自己出现的次数 = 外部引用次数；为 0 才算没人用
    const re = new RegExp(`\\b${name}\\b`, 'g')
    const total = (combinedText.match(re) || []).length
    const own = (source.match(re) || []).length
    if (total - own === 0) {
      // own 只出现 1 次 = 连本文件都没用过，整个声明可以删；
      // own 大于 1 = 本文件内部在用，只是不该 export
      unusedExports.push({ file: rel, name, internalUse: own > 1 })
    }
  }
}

/* ---------- 4. 注释掉的代码 ---------- */

const commentedCode = []
const CODE_HINT = /(?:^|\/\/\s*)(?:const|let|var|function|if|for|return|import|export|uni\.|wx\.|await|=>|\}\s*$|\{\s*$)/

for (const file of sourceFiles) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  let run = []
  const flush = () => {
    if (run.length >= 3) {
      commentedCode.push({ file: rel, line: run[0].line, count: run.length })
    }
    run = []
  }
  lines.forEach((line, i) => {
    const t = line.trim()
    if (t.startsWith('//') && CODE_HINT.test(t)) run.push({ line: i + 1, text: t })
    else flush()
  })
  flush()
}

/* ---------- 输出 ---------- */

const sections = []

if (unusedComponents.length) {
  sections.push(
    `【没人引用的组件】${unusedComponents.length} 个\n` +
      unusedComponents
        .map((f) => `  ${path.relative(ROOT, f).replace(/\\/g, '/')}`)
        .join('\n')
  )
}

if (unusedStatic.length) {
  const total = unusedStatic.reduce((s, f) => s + fs.statSync(f).size, 0)
  sections.push(
    `【没人引用的静态资源】${unusedStatic.length} 个，合计 ${(total / 1024).toFixed(1)} KB\n` +
      unusedStatic
        .map(
          (f) =>
            `  ${path.relative(ROOT, f).replace(/\\/g, '/')}  ${(
              fs.statSync(f).size / 1024
            ).toFixed(1)} KB`
        )
        .join('\n')
  )
}

if (unusedExports.length) {
  const dead = unusedExports.filter((e) => !e.internalUse)
  const justExported = unusedExports.filter((e) => e.internalUse)
  const lines = []
  if (dead.length) {
    lines.push(`  ── 完全没人用（整个声明可删）${dead.length} 个 ──`) 
    dead.forEach((e) => lines.push(`  ${e.file}  →  ${e.name}`))
  }
  if (justExported.length) {
    lines.push(`  ── 只是不该 export（本文件内部在用）${justExported.length} 个 ──`) 
    justExported.forEach((e) => lines.push(`  ${e.file}  →  ${e.name}`))
  }
  sections.push(`【导出但外部没人用】共 ${unusedExports.length} 个\n` + lines.join('\n'))
}

if (commentedCode.length) {
  sections.push(
    `【连续 3 行以上被注释掉的代码】${commentedCode.length} 处\n` +
      commentedCode
        .map((c) => `  ${c.file}:${c.line}  连续 ${c.count} 行`)
        .join('\n')
  )
}

if (!sections.length) {
  console.log('没有发现死代码。')
  process.exit(0)
}

console.log(sections.join('\n\n'))
console.log(`\n共 ${unusedComponents.length + unusedStatic.length + unusedExports.length + commentedCode.length} 条。`)
