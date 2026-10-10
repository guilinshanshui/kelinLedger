#!/usr/bin/env node
/**
 * 一条命令完成「重新构建 + 用开发者工具打开」。
 *
 * 为什么需要它：
 * 小程序有 `dist/dev`（watch 产物）和 `dist/build`（发布产物）两条输出路径。
 * 之前踩过的坑就是——开发者工具指着 dist/dev，而实际重新构建的是 dist/build，
 * 结果改完代码看到的还是几小时前的旧包，反复排查都以为是别的问题。
 *
 * 这里固定只认 `dist/build/mp-weixin`：每次先构建、再校验产物、最后才打开，
 * 保证「看到的包」和「刚构建的包」永远是同一个。
 *
 * 用法：npm run open:mp
 */

const fs = require('fs')
const path = require('path')
const { execFileSync, spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const TARGET = path.join(ROOT, 'dist', 'build', 'mp-weixin')
const ENTRY = path.join(TARGET, 'app.json')

const CLI_CANDIDATES = [
  process.env.WX_DEVTOOLS_CLI,
  'D:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat',
  'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat',
  'C:\\Program Files\\Tencent\\微信web开发者工具\\cli.bat'
].filter(Boolean)

function resolveCli() {
  const hit = CLI_CANDIDATES.find((item) => fs.existsSync(item))
  if (!hit) throw new Error('找不到微信开发者工具 CLI，请设置环境变量 WX_DEVTOOLS_CLI 指向 cli.bat')
  return hit
}

function main() {
  const cli = resolveCli()

  console.log('[1/3] 构建 mp-weixin …')
  execFileSync(process.execPath, [path.join(__dirname, 'uni-cli.js'), 'build', '-p', 'mp-weixin'], {
    cwd: ROOT,
    stdio: 'inherit'
  })

  console.log('[2/3] 校验产物 …')
  if (!fs.existsSync(ENTRY)) {
    throw new Error(`构建产物缺少 app.json：${ENTRY}`)
  }
  console.log(`      产物时间：${fs.statSync(ENTRY).mtime.toLocaleString()}`)

  console.log('[3/3] 用开发者工具打开最新构建 …')
  // cli.bat 必须经过 cmd 才能执行，路径含空格所以要显式加引号
  const result = spawnSync(`"${cli}" open --project "${TARGET}"`, { stdio: 'inherit', shell: true })
  if (result.status !== 0) throw new Error('开发者工具打开失败，请确认 IDE 已登录且服务端口已开启')

  console.log(`\n完成。开发者工具已指向：${TARGET}`)
  console.log('以后改完代码直接跑 npm run open:mp，不要再手动指定别的目录。')
}

main()
