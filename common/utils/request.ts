import type { ApiResponse } from '@/types'
import { STORAGE_KEYS } from '@/common/config'
import { callCloud, uploadToCloud } from '@/common/utils/cloud'
import { goToLogin } from '@/pages/js/utils.js'

/**
 * 请求层。
 *
 * 对外保留 http.get/post/put/delete/patch/upload 这套方法签名，
 * 内部改为微信云开发调用云函数，因此页面代码无需改动。
 *
 * 云函数按「模块.方法」分发：
 *   /room/createRoom       -> room.createRoom
 *   /ledger/import/preview -> ledger.importPreview
 */

interface RequestConfig {
  showLoading?: boolean
  showError?: boolean
  /** 允许把非 0 业务码原样返回给调用方（如登录返回 333 要求完善资料） */
  allowBusinessCode?: boolean
}

interface UploadConfig {
  name?: string
  showLoading?: boolean
  showError?: boolean
}

/** 把 /path?a=1&b=2 拆成 action 与 query 对象。 */
function splitUrl(url: string): { action: string; query: Record<string, any> } {
  const [action, search] = String(url || '').split('?')

  const query: Record<string, any> = {}
  if (search) {
    search.split('&').forEach((pair) => {
      if (!pair) return
      const [key, value = ''] = pair.split('=')
      if (!key) return
      try {
        query[decodeURIComponent(key)] = decodeURIComponent(value)
      } catch (error) {
        query[key] = value
      }
    })
  }

  return { action, query }
}

class HttpRequest {
  // ---- 登录态 ----

  public getToken(): string | null {
    try {
      return uni.getStorageSync(STORAGE_KEYS.TOKEN) || null
    } catch (error) {
      return null
    }
  }

  public setToken(token: string): void {
    try {
      uni.setStorageSync(STORAGE_KEYS.TOKEN, token)
    } catch (error) {
      console.error('[request] 保存 token 失败', error)
    }
  }

  public clearToken(): void {
    try {
      uni.removeStorageSync(STORAGE_KEYS.TOKEN)
    } catch (error) {
      console.error('[request] 清除 token 失败', error)
    }
  }

  // ---- 交互反馈 ----

  private showLoading(title = '加载中...'): void {
    uni.showLoading({ title, mask: true })
  }

  private hideLoading(): void {
    uni.hideLoading()
  }

  private toast(message: string): void {
    uni.showToast({ title: message, icon: 'none', duration: 3000 })
  }

  /** 登录态失效时统一处理。 */
  private handleAuthError(message: string): void {
    this.clearToken()
    // 同时清掉本地身份缓存。
    // 否则 hasSession() 仍然为 true，goToLogin() 会直接 return，
    // 用户就会卡在「接口一直 401 但页面不跳登录」的死循环里
    // （云端账号被清空、换微信号、换云环境后都会碰到）。
    try {
      uni.removeStorageSync(STORAGE_KEYS.USER_INFO)
      uni.removeStorageSync(STORAGE_KEYS.CURRENT_ROOM)
    } catch (error) {
      console.error('[request] 清理本地登录态失败', error)
    }
    uni.showModal({
      title: '提示',
      content: message || '登录已过期，请重新登录',
      showCancel: false,
      success: () => goToLogin()
    })
  }

  // ---- 核心调用 ----

  /**
   * 统一处理云函数返回：
   * code === 0 视为成功，401 触发重新登录，其余抛出业务错误。
   */
  private unwrap<T>(
    result: ApiResponse<T>,
    showError: boolean,
    allowBusinessCode = false
  ): ApiResponse<T> {
    if (result.code === 0) return result

    // 少数接口需要把业务码交给调用方分支处理，不能在这里统一抛错
    if (allowBusinessCode && result.code !== 401) return result

    if (result.code === 401) {
      this.handleAuthError(result.message)
      throw new Error(result.message || '登录已过期')
    }

    if (showError) this.toast(result.message || '请求失败')
    throw new Error(result.message || '请求失败')
  }

  private async send<T>(
    url: string,
    payload: Record<string, any> | undefined,
    config: RequestConfig = {}
  ): Promise<ApiResponse<T>> {
    const { showLoading = false, showError = true, allowBusinessCode = false } = config
    const { action, query } = splitUrl(url)

    if (showLoading) this.showLoading()

    try {
      const result = await callCloud<T>({ action, payload, query })
      return this.unwrap(result, showError, allowBusinessCode)
    } catch (error) {
      if (showError) this.toast(error instanceof Error ? error.message : '网络连接失败')
      throw error instanceof Error ? error : new Error('网络连接失败')
    } finally {
      if (showLoading) this.hideLoading()
    }
  }

  // ---- 对外方法 ----

  public get<T>(
    url: string,
    params?: Record<string, any>,
    config?: RequestConfig
  ): Promise<ApiResponse<T>> {
    const { action, query } = splitUrl(url)
    const merged: Record<string, any> = { ...query }
    if (params) {
      Object.keys(params).forEach((key) => {
        const value = params[key]
        if (value !== undefined && value !== null) merged[key] = value
      })
    }

    if (config?.showLoading) this.showLoading()
    return callCloud<T>({ action, query: merged })
      .then((result) =>
        this.unwrap(result, config?.showError !== false, config?.allowBusinessCode === true)
      )
      .catch((error) => {
        throw error instanceof Error ? error : new Error('请求失败')
      })
      .finally(() => {
        if (config?.showLoading) this.hideLoading()
      })
  }

  public post<T>(
    url: string,
    data?: Record<string, any>,
    config?: RequestConfig
  ): Promise<ApiResponse<T>> {
    return this.send<T>(url, data || {}, config)
  }

  public put<T>(
    url: string,
    data?: Record<string, any>,
    config?: RequestConfig
  ): Promise<ApiResponse<T>> {
    return this.send<T>(url, data || {}, config)
  }

  public delete<T>(url: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.send<T>(url, {}, config)
  }

  public patch<T>(
    url: string,
    data?: Record<string, any>,
    config?: RequestConfig
  ): Promise<ApiResponse<T>> {
    return this.send<T>(url, data || {}, config)
  }

  /**
   * 上传文件。
   * 先传到云存储换取 fileID，再把 fileID 交给云函数处理。
   */
  public async upload<T>(
    url: string,
    filePath: string,
    formData: Record<string, any> = {},
    config: UploadConfig = {}
  ): Promise<ApiResponse<T>> {
    const { showLoading = true, showError = true } = config

    if (showLoading) this.showLoading('上传中...')

    try {
      const fileID = await uploadToCloud(filePath)
      const { action, query } = splitUrl(url)
      const result = await callCloud<T>({
        action,
        payload: { ...formData, fileID },
        query
      })
      return this.unwrap(result, showError)
    } catch (error) {
      const message = error instanceof Error ? error.message : '文件上传失败'
      if (showError) this.toast(message)
      throw new Error(message)
    } finally {
      if (showLoading) this.hideLoading()
    }
  }
}

const http = new HttpRequest()

export default http
export { HttpRequest }
