#!/usr/bin/env node
/**
 * uni-app Vue 3 启动器。
 *
 * Vite 版 uni-app 默认从 src 读取源码，而 Roomie 使用根目录源码结构。
 * 这里统一设置绝对 UNI_INPUT_DIR，确保 manifest、pages 和 static 都能正确解析与复制。
 */

const path = require('path')
const { spawn } = require('child_process')

const root = path.resolve(__dirname, '..')
const cli = require.resolve('@dcloudio/vite-plugin-uni/bin/uni.js')

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    UNI_INPUT_DIR: root,
    VITE_ROOT_DIR: root
  }
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})

child.on('error', (error) => {
  console.error('[uni-cli] 启动失败', error)
  process.exit(1)
})
