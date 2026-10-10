/**
 * 把 cloudfunctions/roomie 打成单文件，写进 mp-weixin 产物目录。
 *
 * 为什么需要这一步：
 *   Windows 版开发者工具的命令行部署（cli cloud functions deploy）会把子目录名
 *   用反斜杠拼进压缩包，云端解压后 actions/、lib/ 不会成为文件夹，而是变成
 *   一堆形如 `lib\\response.js` 的平铺文件，运行时 require('./lib/response')
 *   直接报 Cannot find module。
 *
 *   打包成单个 index.js 后产物里没有任何子目录，这个坑就绕开了，
 *   顺便还能减少云函数冷启动时的文件寻址开销。
 *
 * 源码结构保持不变，只在构建产物中做这个转换。
 */
const path = require('path')
const fs = require('fs')
const esbuild = require('esbuild')

const projectRoot = path.resolve(__dirname, '..')
const sourceDir = path.join(projectRoot, 'cloudfunctions', 'roomie')
const outDir = path.join(projectRoot, 'dist', 'build', 'mp-weixin', 'cloudfunctions', 'roomie')

/** 这些依赖由云端 npm install 提供，不打进包里。 */
const EXTERNAL_DEPS = ['wx-server-sdk', 'xlsx', 'iconv-lite']

async function main() {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`找不到云函数源码目录：${sourceDir}`)
  }
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  await esbuild.build({
    entryPoints: [path.join(sourceDir, 'index.js')],
    outfile: path.join(outDir, 'index.js'),
    bundle: true,
    platform: 'node',
    target: 'node16',
    format: 'cjs',
    external: EXTERNAL_DEPS,
    legalComments: 'none',
    logLevel: 'warning'
  })

  // 单文件产物不再需要子目录；留着反而会生成带反斜杠的垃圾文件。
  for (const dir of ['actions', 'lib']) {
    const target = path.join(outDir, dir)
    try {
      if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true })
    } catch (error) {
      if (error && error.code !== 'EPERM' && error.code !== 'EBUSY') throw error
      console.warn(`[cloudfunction] ${dir}/ 被开发者工具占用，跳过删除`)
    }
  }

  for (const file of ['package.json', 'package-lock.json', 'config.json']) {
    const from = path.join(sourceDir, file)
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(outDir, file))
  }

  const size = fs.statSync(path.join(outDir, 'index.js')).size
  console.log(`[cloudfunction] roomie 已打包为单文件 index.js（${(size / 1024).toFixed(1)} KB）`)
}

main().catch((error) => {
  console.error('[cloudfunction] 打包失败', error)
  process.exit(1)
})
