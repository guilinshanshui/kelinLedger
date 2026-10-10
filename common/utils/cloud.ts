import type { ApiResponse } from '@/types'
import { appConfig } from '@/common/config'

// 微信小程序全局对象；H5 端不存在，调用处均已做存在性判断
declare const wx: any

/**
 * 微信云开发传输层。
 *
 * 与原来的 HTTP 传输层保持同样的返回结构（code / message / data），
 * 页面侧只依赖 `http.xxx()` 的签名，因此迁移不需要改动任何页面代码。
 */

let initialized = false

/** 当前配置的云环境 ID。为空时不允许调用云函数，避免无默认环境时报错。 */
export function getCloudEnv(): string {
  return String(appConfig.cloudEnv || '').trim()
}

/** 当前环境是否支持云开发（微信小程序端）。 */
export function isCloudAvailable(): boolean {
  return typeof wx !== 'undefined' && !!wx.cloud
}

/**
 * 初始化云环境。
 * env 为空时使用当前小程序绑定的默认环境，避免把环境 ID 写死在仓库里。
 */
export function initCloud(env?: string): void {
  if (initialized || !isCloudAvailable()) return

  try {
    const resolvedEnv = String(env || getCloudEnv()).trim()
    if (!resolvedEnv) {
      console.warn('[cloud] 未配置云环境 ID，请先创建微信云开发环境并填写 common/config/index.ts 的 cloudEnv')
      return
    }

    wx.cloud.init({ env: resolvedEnv, traceUser: true })
    initialized = true
  } catch (error) {
    console.error('[cloud] 初始化失败', error)
  }
}

export interface CloudCallResult<T> {
  action: string
  payload?: Record<string, any>
  query?: Record<string, any>
}

/**
 * 调用云函数。
 * 云函数以 `模块.方法` 作为 action 分发，见 cloudfunctions/roomie/lib/route.js。
 */
export async function callCloud<T = any>({
  action,
  payload = {},
  query = {}
}: CloudCallResult<T>): Promise<ApiResponse<T>> {
  if (!isCloudAvailable()) {
    throw new Error('当前环境不支持微信云开发，请在微信开发者工具中运行')
  }

  if (!getCloudEnv()) {
    throw new Error('未配置微信云开发环境 ID：请在开发者工具创建云环境，并把环境 ID 填入 common/config/index.ts 的 cloudEnv')
  }

  initCloud()

  const response = await wx.cloud.callFunction({
    name: appConfig.cloudFunctionName,
    data: { action, payload, query }
  })

  const result = response.result as ApiResponse<T> | undefined
  if (!result || typeof result.code !== 'number') {
    throw new Error('云函数返回格式异常')
  }

  return result
}

/**
 * 上传文件到云存储，返回 fileID。
 * 账单导入等场景把 fileID 交给云函数读取。
 */
export async function uploadToCloud(filePath: string, folder = 'uploads'): Promise<string> {
  if (!isCloudAvailable()) {
    throw new Error('当前环境不支持云存储上传')
  }

  initCloud()

  // 微信头像选择器 / 相册返回的临时路径可能是 wxfile://tmp_xxx（没有扩展名），
  // 直接拼 '.' 会生成带 :// 的非法 cloudPath，真机上传会失败，这里只接尾部合法扩展名。
  const matched = /\.([a-zA-Z0-9]{1,5})$/.exec(filePath)
  const ext = (matched ? matched[1] : 'png').toLowerCase()
  const cloudPath = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`
  const res = await wx.cloud.uploadFile({ cloudPath, filePath })
  return res.fileID
}
