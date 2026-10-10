#!/usr/bin/env node
/**
 * 按钮可用性审计。
 *
 * 逐个 .vue 文件比对模板里绑定的事件处理器和 <script setup> 里实际定义的绑定：
 * - 处理器名在脚本里根本不存在（点击必然无反应）
 * - 处理器存在但函数体是空的（点击静默无反应）
 *
 * 运行：node scripts/audit-buttons.js
 */

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const SKIP_DIRS = ['node_modules', 'unpackage', 'dist', '.git', '.debug']

const JS_KEYWORDS = new Set([
  'true', 'false', 'null', 'undefined', 'typeof', 'instanceof', 'new',
  'return', 'if', 'else', 'in', 'of', 'this', 'void', 'delete', 'await'
])

function walk(dir, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, result)
    else if (entry.name.endsWith('.vue')) result.push(full)
  }
  return result
}

/** 去掉字符串字面量与注释，避免把文案里的词当成标识符 */
function stripLiterals(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/`(?:\\.|[^`\\])*`/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
}

function extractIdentifiers(expression) {
  const cleaned = stripLiterals(expression)
  const found = new Set()
  const regex = /(^|[^.\w$])([A-Za-z_$][\w$]*)/g
  let match
  while ((match = regex.exec(cleaned))) {
    const name = match[2]
    if (JS_KEYWORDS.has(name)) continue
    if (name === 'emit') continue
    // 模板内置对象（$emit / $slots / $attrs 等）
    if (name.startsWith('$')) continue
    found.add(name)
  }
  return [...found]
}

/** 收集脚本里所有顶层绑定名 */
function collectBindings(script) {
  const names = new Set()

  const patterns = [
    /\bconst\s+([A-Za-z_$][\w$]*)/g,
    /\blet\s+([A-Za-z_$][\w$]*)/g,
    /\bvar\s+([A-Za-z_$][\w$]*)/g,
    /\bfunction\s+([A-Za-z_$][\w$]*)/g,
    /\bimport\s+([A-Za-z_$][\w$]*)\s*(?:,|from)/g,
    /\bimport\s*\{([^}]*)\}/g
  ]

  for (const regex of patterns) {
    let match
    while ((match = regex.exec(script))) {
      if (regex.source.includes('\\{')) {
        match[1].split(',').forEach((part) => {
          const name = part.split(/\s+as\s+/).pop().trim()
          if (name) names.add(name)
        })
      } else {
        names.add(match[1])
      }
    }
  }

  // defineProps 解构出来的名字
  // 解构赋值：const { theme, user } = ... / const [a, b] = ...
  const destructureRegex = /\b(?:const|let|var)\s*[\{\[]([^\}\]]*)[\}\]]\s*=/g
  let destructMatch
  while ((destructMatch = destructureRegex.exec(script))) {
    destructMatch[1].split(',').forEach((part) => {
      const name = part.split(':').pop().split('=')[0].trim()
      if (name) names.add(name)
    })
  }

  const propsMatch = script.match(/defineProps\s*\(\s*\{([\s\S]*?)\}\s*\)/)
  if (propsMatch) {
    const propRegex = /([A-Za-z_$][\w$]*)\s*:/g
    let m
    while ((m = propRegex.exec(propsMatch[1]))) names.add(m[1])
  }

  return names
}

/** 找出空函数体：`const x = () => {}` / `function x() {}` */
function findEmptyHandlers(script) {
  const empty = new Set()
  const arrow = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{\s*\}/g
  let match
  while ((match = arrow.exec(script))) empty.add(match[1])
  return empty
}

/** 模板表达式里箭头函数的形参（它们在表达式内部已声明） */
function collectArrowParams(template) {
  const names = new Set()
  const regex = /\(([^()]*)\)\s*=>|\b([A-Za-z_$][\w$]*)\s*=>/g
  let match
  while ((match = regex.exec(template))) {
    const group = match[1] || match[2] || ''
    group.split(',').forEach((part) => {
      const name = part.trim()
      if (name) names.add(name)
    })
  }
  return names
}

/** 绑定属性（:class / :style / v-if / v-show 等）里引用的变量 */
function collectBoundAttrNames(template) {
  const names = new Set()
  const regex = /(?:v-if|v-else-if|v-show|v-model|:[A-Za-z-]+)\s*=\s*"([^"]+)"/g
  let match
  while ((match = regex.exec(template))) {
    const expression = match[1]
      .replace(/\(([^()]*)\)\s*=>/g, '=>')
      .replace(/\b[A-Za-z_$][\w$]*\s*=>/g, '=>')
      .replace(/(^|[,{(\s])([A-Za-z_$][\w$]*)\s*:/g, '$1')
    for (const name of extractIdentifiers(expression)) {
      if (TEMPLATE_GLOBALS.has(name)) continue
      names.add(name)
    }
  }
  return [...names]
}

const TEMPLATE_GLOBALS = new Set([
  'Math', 'Date', 'Number', 'String', 'Boolean', 'JSON', 'Array', 'Object',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite'
])

/** 模板插值 {{ expr }} 里引用的变量 */
function collectInterpolationNames(template) {
  const names = new Set()
  const regex = /\{\{([\s\S]*?)\}\}/g
  let match
  while ((match = regex.exec(template))) {
    // 去掉对象字面量的键名（key: value 里的 key）与三元运算符的冒号干扰
    const expression = match[1]
      // 去掉箭头函数参数（reduce((s, i) => ...) 里的 s / i 不是模板变量）
      .replace(/\(([^()]*)\)\s*=>/g, '=>')
      .replace(/\b[A-Za-z_$][\w$]*\s*=>/g, '=>')
      // 去掉对象字面量的键名
      .replace(/(^|[,{(\s])([A-Za-z_$][\w$]*)\s*:/g, '$1')
    for (const name of extractIdentifiers(expression)) {
      if (TEMPLATE_GLOBALS.has(name)) continue
      names.add(name)
    }
  }
  return [...names]
}

const EVENT_ATTR = /@(?:click|tap|longpress|longtap|confirm|blur|focus)\s*=\s*"([^"]+)"/g

/** 模板作用域内声明的名字：v-for 循环变量、插槽作用域变量 */
function collectTemplateScopedNames(template) {
  const names = new Set()
  const forRegex = /v-for\s*=\s*"\(?\s*([^)]+?)\s*\)?\s+(?:in|of)\s/g
  let match
  while ((match = forRegex.exec(template))) {
    match[1].split(',').forEach((part) => {
      const name = part.trim()
      if (name) names.add(name)
    })
  }
  const slotRegex = /(?:v-slot|slot-scope)\s*=\s*"([^"]+)"/g
  while ((match = slotRegex.exec(template))) {
    match[1].split(',').forEach((part) => {
      const name = part.trim().replace(/^\{?|\}?$/g, '')
      if (name) names.add(name)
    })
  }
  return names
}

/** 从 pages.json 收集已注册路由 */
function collectRegisteredRoutes() {
  const raw = fs.readFileSync(path.join(root, 'pages.json'), 'utf8')
  const cleaned = raw.replace(/^[ \t]*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1')
  const routes = new Set()
  try {
    const config = JSON.parse(cleaned)
    ;(config.pages || []).forEach((page) => routes.add('/' + page.path))
  } catch (error) {
    console.error('pages.json 解析失败：' + error.message)
  }
  return routes
}

/** 提取代码里所有跳转目标（含模板与脚本） */
function collectNavigationTargets(source) {
  const targets = new Set()
  const regex = /url\s*:\s*[`'"](\/pages\/[^`'"?]+)/g
  let match
  while ((match = regex.exec(source))) targets.add(match[1])
  return [...targets]
}

const files = walk(root)
const registeredRoutes = collectRegisteredRoutes()
const badRoutes = []
const missing = []
const missingBindings = []
const emptyHandlers = []

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8')
  const templateMatch = source.match(/<template>([\s\S]*)<\/template>/)
  if (!templateMatch) continue
  const template = templateMatch[1]
  const scriptMatch = source.match(/<script[^>]*>([\s\S]*?)<\/script>/)
  const script = scriptMatch ? scriptMatch[1] : ''

  const bindings = collectBindings(script)
  collectTemplateScopedNames(template).forEach((name) => bindings.add(name))
  collectArrowParams(template).forEach((name) => bindings.add(name))
  const empties = findEmptyHandlers(script)

  for (const target of collectNavigationTargets(source)) {
    if (!registeredRoutes.has(target)) {
      badRoutes.push({ file: path.relative(root, file).replace(/\\/g, '/'), target })
    }
  }

  let match
  EVENT_ATTR.lastIndex = 0
  while ((match = EVENT_ATTR.exec(template))) {
    const expression = match[1]
    for (const name of extractIdentifiers(expression)) {
      if (!bindings.has(name)) {
        missing.push({
          file: path.relative(root, file).replace(/\\/g, '/'),
          handler: name,
          expression: expression.trim()
        })
      } else if (empties.has(name)) {
        emptyHandlers.push({
          file: path.relative(root, file).replace(/\\/g, '/'),
          handler: name
        })
      }
    }
  }
  for (const name of collectInterpolationNames(template)) {
    if (!bindings.has(name)) {
      missingBindings.push({
        file: path.relative(root, file).replace(/\\/g, '/'),
        name
      })
    }
  }
  for (const name of collectBoundAttrNames(template)) {
    if (!bindings.has(name)) {
      missingBindings.push({
        file: path.relative(root, file).replace(/\\/g, '/'),
        name
      })
    }
  }

}

const rel = (p) => p

console.log(`扫描 .vue 文件：${files.length}`)

if (missing.length) {
  console.log('\n[缺失处理器] 模板绑定了脚本里不存在的名字：')
  const seen = new Set()
  missing.forEach((item) => {
    const key = `${item.file}::${item.handler}`
    if (seen.has(key)) return
    seen.add(key)
    console.log(`  - ${rel(item.file)} → ${item.handler}()  [${item.expression}]`)
  })
}

if (emptyHandlers.length) {
  console.log('\n[空函数] 处理器存在但函数体为空：')
  const seen = new Set()
  emptyHandlers.forEach((item) => {
    const key = `${item.file}::${item.handler}`
    if (seen.has(key)) return
    seen.add(key)
    console.log(`  - ${rel(item.file)} → ${item.handler}()`)
  })
}

if (badRoutes.length) {
  console.log('\n[无效跳转] 目标未在 pages.json 注册：')
  const seenRoute = new Set()
  badRoutes.forEach((item) => {
    const key = `${item.file}::${item.target}`
    if (seenRoute.has(key)) return
    seenRoute.add(key)
    console.log(`  - ${item.file} → ${item.target}`)
  })
}

if (missingBindings.length) {
  console.log('\n[未定义变量] 模板引用了脚本里不存在的变量：')
  const seenBinding = new Set()
  missingBindings.forEach((item) => {
    const key = item.file + '::' + item.name
    if (seenBinding.has(key)) return
    seenBinding.add(key)
    console.log('  - ' + item.file + ' → ' + item.name)
  })
}

if (!missing.length && !emptyHandlers.length && !badRoutes.length && !missingBindings.length) {
  console.log('\n未发现失效的点击处理器、未定义变量与无效跳转。')
}
process.exitCode = (missing.length || badRoutes.length || missingBindings.length) ? 1 : 0
