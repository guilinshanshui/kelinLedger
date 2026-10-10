#!/usr/bin/env node
/**
 * Roomie 项目静态审计。
 *
 * 目标不是替代构建，而是提前发现这些高成本问题：
 * - pages.json 指向不存在的页面
 * - 已废弃的假身份 / 假角色 / 假数据入口回流
 * - 明显的样式规范回归
 * - 前端 API 使用了未登记的路径
 *
 * 运行：node scripts/audit-project.js
 */

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const failures = []
const warnings = []

function walk(dir, extensions, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'unpackage', 'dist', '.git'].includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, extensions, result)
    } else if (extensions.includes(path.extname(entry.name))) {
      result.push(full)
    }
  }
  return result
}

function relative(file) {
  return path.relative(root, file).replace(/\\/g, '/')
}

function readJsonWithComments(file) {
  const source = fs
    .readFileSync(file, 'utf8')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/,\s*([}\]])/g, '$1')
  return JSON.parse(source)
}

function scan(file, patterns) {
  const content = fs.readFileSync(file, 'utf8')
  patterns.forEach(({ regex, label }) => {
    const matches = content.match(regex)
    if (matches) {
      failures.push(`${relative(file)} 命中「${label}」${matches.length} 处`)
    }
  })
}

function count(file, regex) {
  const content = fs.readFileSync(file, 'utf8')
  return (content.match(regex) || []).length
}

// 1. 页面路由完整性
const pagesFile = path.join(root, 'pages.json')
let pagesConfig
try {
  pagesConfig = readJsonWithComments(pagesFile)
} catch (error) {
  failures.push(`pages.json 无法解析：${error.message}`)
}

if (pagesConfig) {
  for (const page of pagesConfig.pages) {
    const file = path.join(root, `${page.path}.vue`)
    if (!fs.existsSync(file)) failures.push(`pages.json 指向不存在的页面：${page.path}`)
  }
  for (const tab of pagesConfig.tabBar.list) {
    if (!pagesConfig.pages.some((page) => page.path === tab.pagePath)) {
      failures.push(`tabBar 指向未注册页面：${tab.pagePath}`)
    }
  }
}

// 2. 废弃模式
const sourceFiles = walk(root, ['.vue', '.js', '.ts']).filter(
  (file) =>
    !relative(file).startsWith('cloudfunctions/roomie/node_modules') &&
    !['scripts/audit-project.js', 'scripts/normalize-ui.js'].includes(relative(file))
)
for (const file of sourceFiles.filter((item) => item.endsWith('.vue'))) {
  const source = fs.readFileSync(file, 'utf8')
  for (const tag of ['template', 'script', 'style']) {
    const opens = (source.match(new RegExp(`<${tag}(\\s[^>]*)?>`, 'g')) || []).length
    const closes = (source.match(new RegExp(`</${tag}>`, 'g')) || []).length
    if (opens !== closes) failures.push(`${relative(file)} 区块标签不配对：${tag}`)
  }

  for (const match of source.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/lang=["']ts["']/.test(match[1])) continue
    const code = match[2]
      .replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
      .replace(/^\s*import\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
      .replace(/\bexport\s+default\b/g, 'const __sfc_default = ')
    try {
      // 只编译不执行；可捕获遗漏括号、非法语句等语法错误。
      new Function(code)
    } catch (error) {
      failures.push(`${relative(file)} script 语法错误：${error.message}`)
    }
  }
}

// 1.1 相对导入与 @ 别名是否指向真实文件
function resolveImport(fromFile, specifier) {
  const base = specifier.startsWith('@/')
    ? path.join(root, specifier.slice(2))
    : path.resolve(path.dirname(fromFile), specifier)
  const candidates = [base, `${base}.vue`, `${base}.js`, `${base}.ts`, path.join(base, 'index.js'), path.join(base, 'index.ts')]
  return candidates.some((candidate) => fs.existsSync(candidate))
}

for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8')
  for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const specifier = match[1]
    if (!specifier.startsWith('.') && !specifier.startsWith('@/')) continue
    if (!resolveImport(file, specifier)) failures.push(`${relative(file)} 导入不存在：${specifier}`)
  }
}

for (const file of sourceFiles) {
  scan(file, [
    { regex: /dataJson|['"]\/data\.json['"]/g, label: '旧 data.json 身份' },
    { regex: /\bobserver\b/g, label: '旧 observer 角色' },
    { regex: /transition:\s*all/g, label: 'transition: all' },
    { regex: /backdrop-filter\s*:/g, label: '玻璃拟态 backdrop-filter' },
    { regex: /font-weight:\s*(700|800|900)/g, label: '中文伪粗体 700+' },
    { regex: /font-style:\s*italic/g, label: 'UI 斜体' },
    { regex: /letter-spacing:\s*-/g, label: '负字距' }
  ])
}

// 3. 前端 API 路径是否登记
const configFile = path.join(root, 'common/config/index.ts')
const apiFile = path.join(root, 'common/api/index.ts')
const configSource = fs.readFileSync(configFile, 'utf8')
const apiSource = fs.readFileSync(apiFile, 'utf8')
const configKeys = new Set([...configSource.matchAll(/^\s*([A-Z][A-Z0-9_]+)\s*:/gm)].map((m) => m[1]))
for (const match of apiSource.matchAll(/API_PATHS\.([A-Z][A-Z0-9_]+)/g)) {
  if (!configKeys.has(match[1])) failures.push(`common/api 使用未登记路径：API_PATHS.${match[1]}`)
}

// 3.1 前端 action 是否真的在云函数模块中实现
const pathMap = new Map()
for (const match of configSource.matchAll(/^\s*([A-Z][A-Z0-9_]+)\s*:\s*['"]([^'"]+)['"]/gm)) {
  if (!match[2].startsWith('/')) continue
  pathMap.set(match[1], match[2])
}

function hasMethod(moduleName, method) {
  const file = path.join(root, 'cloudfunctions', 'roomie', 'actions', `${moduleName}.js`)
  if (!fs.existsSync(file)) return false
  const source = fs.readFileSync(file, 'utf8')
  const escaped = method.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [
    new RegExp(`\\b${escaped}\\s*[:,]`),
    new RegExp(`\\bfunction\\s+${escaped}\\s*\\(`),
    new RegExp(`\\basync\\s+${escaped}\\s*\\(`)
  ].some((regex) => regex.test(source))
}

let resolveRoute = null
try {
  resolveRoute = require(path.join(root, 'cloudfunctions', 'roomie', 'lib', 'route')).resolveRoute
} catch (error) {
  failures.push(`无法加载云函数路由解析器：${error.message}`)
}

if (resolveRoute) {
  const usedKeys = new Set([...apiSource.matchAll(/API_PATHS\.([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]))
  usedKeys.forEach((key) => {
    const action = pathMap.get(key)
    if (!action) return
    const route = resolveRoute(action)
    if (!hasMethod(route.module, route.method)) {
      failures.push(`API ${key} -> ${route.module}.${route.method} 未导出`)
    }
  })
}

// 4. 明确已删除页面回流
const deletedRoutes = [
  'pages/room-select/room-select',
  'pages/order/order',
  'pages/report/monthly-report',
  'pages/report/weekly-report',
  'pages/share-poster/share-poster',
  'pages/profile-settings/profile-settings',
  'pages/profile-view/profile-view'
]
for (const route of deletedRoutes) {
  if (fs.existsSync(path.join(root, `${route}.vue`))) failures.push(`已删除页面重新出现：${route}.vue`)
  for (const file of sourceFiles) {
    if (fs.readFileSync(file, 'utf8').includes(route)) {
      failures.push(`${relative(file)} 仍引用已删除页面：${route}`)
    }
  }
}

// 5. 输出摘要
const pageCount = pagesConfig ? pagesConfig.pages.length : 0
console.log(`扫描页面：${pageCount}`)
console.log(`扫描源码文件：${sourceFiles.length}`)
console.log(`失败：${failures.length}`)
if (failures.length) {
  failures.forEach((item) => console.log(`  ✗ ${item}`))
}
if (warnings.length) {
  warnings.forEach((item) => console.log(`  ! ${item}`))
}
if (failures.length) process.exitCode = 1
