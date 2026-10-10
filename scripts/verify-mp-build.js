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

let failed = false
for (const target of targets) {
  const absolute = path.join(root, target)
  if (!fs.existsSync(absolute)) {
    console.log(`[跳过] ${target} 尚未生成`)
    continue
  }

  const missing = required.filter((file) => !fs.existsSync(path.join(absolute, file)))
  if (missing.length) {
    failed = true
    console.log(`[失败] ${target}`)
    missing.forEach((file) => console.log(`  缺少 ${file}`))
  } else {
    console.log(`[通过] ${target}`)
  }
}

if (failed) process.exitCode = 1
