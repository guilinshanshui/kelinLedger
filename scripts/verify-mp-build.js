#!/usr/bin/env node
/** 校验微信小程序构建产物是否可以被开发者工具直接导入。 */

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const targets = ['dist/build/mp-weixin', 'dist/dev/mp-weixin']
const required = [
  'app.json',
  'app.js',
  'app.wxss',
  'project.config.json',
  'static/tabbar/tn-tabbar0.png',
  'static/tabbar/tn-tabbar0-cur.png',
  'static/tabbar/tn-tabbar2.png',
  'static/tabbar/tn-tabbar2-cur.png',
  'static/tabbar/tn-tabbar3.png',
  'static/tabbar/tn-tabbar3-cur.png',
  'cloudfunctions/roomie/index.js'
]

function walkJsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'cloudfunctions' || entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkJsFiles(full, out)
    else if (entry.isFile() && entry.name.endsWith('.js') && entry.name !== 'vendor.js') {
      out.push(full)
    }
  }
  return out
}

let failed = false
for (const target of targets) {
  const absolute = path.join(root, target)
  if (!fs.existsSync(absolute)) {
    console.log(`[跳过] ${target} 尚未生成`)
    continue
  }

  const missing = required.filter((file) => !fs.existsSync(path.join(absolute, file)))
  const es2020Hits = []
  for (const jsFile of walkJsFiles(absolute)) {
    const content = fs.readFileSync(jsFile, 'utf8')
    if (/\?\?|\?\.[a-zA-Z_$([]/.test(content)) {
      es2020Hits.push(path.relative(absolute, jsFile))
    }
  }

  if (missing.length || es2020Hits.length) {
    failed = true
    console.log(`[失败] ${target}`)
    missing.forEach((file) => console.log(`  缺少 ${file}`))
    es2020Hits.forEach((file) => console.log(`  包含微信上传不支持的 ?? / ?. 语法: ${file}`))
  } else {
    console.log(`[通过] ${target}`)
  }
}

if (failed) process.exitCode = 1
