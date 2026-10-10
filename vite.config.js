import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

/** 将云函数源码复制进微信构建产物，供开发者工具直接上传部署。 */
function copyCloudFunctions() {
  let outDir = ''
  return {
    name: 'roomie-copy-cloudfunctions',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      if (process.env.UNI_PLATFORM !== 'mp-weixin' || !outDir) return
      const source = path.join(projectRoot, 'cloudfunctions')
      const target = path.join(path.resolve(outDir), 'cloudfunctions')
      if (!fs.existsSync(source)) return

      // 开发者工具开着时会对该目录加文件监听锁，rmSync 会抛 EPERM。
      // 能删就删（清理已移除的文件），删不掉就退回覆盖拷贝 —— 内容始终最新。
      try {
        fs.rmSync(target, { recursive: true, force: true })
      } catch (error) {
        if (error && error.code !== 'EPERM' && error.code !== 'EBUSY') throw error
        console.warn('[cloudfunctions] 目标目录被占用，改用覆盖拷贝')
      }

      fs.cpSync(source, target, { recursive: true, force: true, errorOnExist: false })
    }
  }
}

export default defineConfig({
  plugins: [uni(), copyCloudFunctions()]
})
