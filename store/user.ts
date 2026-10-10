import { defineStore } from 'pinia'
import { reactive, computed } from 'vue'
import type { User } from '@/types'
import { STORAGE_KEYS } from '@/common/config'
import { userApi } from '@/common/api'
import http from '@/common/utils/request'

interface UserState {
  currentUser: User | null
  isLoggedIn: boolean
  currentRoom: { id: string; name: string; avatar?: string } | null
}

/**
 * 用户状态。
 *
 * 登录态以微信 openid 为准（由云函数注入），token 仅作为本地登录标记，
 * 不再依赖 data.json 这类构建期常量。
 */
export const useUserStore = defineStore('user', () => {
  const state = reactive<UserState>({
    currentUser: null,
    isLoggedIn: false,
    currentRoom: null
  })

  const userInfo = computed(() => state.currentUser)
  const currentUserId = computed(() => String(state.currentUser?.id || state.currentUser?.userId || ''))
  const isAuthenticated = computed(() => state.isLoggedIn && !!currentUserId.value)
  const isLoggedIn = computed(() => state.isLoggedIn)

  const persist = (user: User | null) => {
    try {
      if (user) {
        uni.setStorageSync(STORAGE_KEYS.USER_INFO, user)
      } else {
        uni.removeStorageSync(STORAGE_KEYS.USER_INFO)
      }
    } catch (error) {
      console.error('[user] 写入本地登录态失败', error)
    }
  }

  /** 从本地缓存恢复登录态。 */
  /** 当前账本：账本 Tab 与明细 Tab 靠它保持一致。 */
  const setCurrentRoom = (room: { id: string; name?: string; avatar?: string } | null) => {
    state.currentRoom = room ? { id: room.id, name: room.name || '默认账本', avatar: room.avatar || '📒' } : null
    try {
      if (state.currentRoom) {
        uni.setStorageSync(STORAGE_KEYS.CURRENT_ROOM, state.currentRoom)
      } else {
        uni.removeStorageSync(STORAGE_KEYS.CURRENT_ROOM)
      }
    } catch (error) {
      console.error('[user] 保存当前账本失败', error)
    }
  }

  /** 从本地缓存恢复登录态。 */
  const initUser = () => {
    try {
      const cached = uni.getStorageSync(STORAGE_KEYS.USER_INFO)
      if (cached && cached.id) {
        state.currentUser = cached
        state.isLoggedIn = true
      }
      // 一并恢复上次选中的账本，避免明细页首次进入时空白
      const room = uni.getStorageSync(STORAGE_KEYS.CURRENT_ROOM)
      if (room && room.id) state.currentRoom = room
    } catch (error) {
      console.error('[user] 恢复登录态失败', error)
      clearUserData()
    }
  }

  /** 写入用户资料（登录成功、资料更新后统一走这里）。 */
  const setUser = (user: User & { token?: string }) => {
    if (user && user.token) {
      http.setToken(user.token)
    }
    state.currentUser = user
    state.isLoggedIn = !!user
    persist(user)
  }

  /**
   * 微信登录。
   * 云开发下无需 code2session，直接调用云函数按 openid 建档。
   */
  const login = async (profile: Partial<User> = {}) => {
    const result = await userApi.login(profile)
    if (result.code !== 0) {
      throw new Error(result.message || '登录失败')
    }
    setUser(result.data as User & { token?: string })
    return result.data
  }

  /**
   * 用云端的用户资料覆盖本地缓存。
   * 登录态失效（401）时静默清空，由请求层统一引导重新登录。
   */
  const refreshProfile = async () => {
    if (!state.isLoggedIn) return null
    const result = await userApi.getUserInfo()
    if (result.code === 0 && result.data) {
      setUser(result.data)
    }
    return result.data
  }

  const logout = () => {
    clearUserData()
  }

  const updateUserInfo = (userData: Partial<User>) => {
    if (!state.currentUser) return
    const next = { ...state.currentUser, ...userData }
    state.currentUser = next
    persist(next)
  }

  const clearUserData = () => {
    state.currentUser = null
    state.isLoggedIn = false
    http.clearToken()
    persist(null)
  }

  const checkLoginStatus = (): boolean => state.isLoggedIn && !!state.currentUser

  return {
    state,
    currentUser: computed(() => state.currentUser),
    currentUserId,
    isLoggedIn,
    userInfo,
    isAuthenticated,
    initUser,
    setUser,
    setCurrentRoom,
    refreshProfile,
    logout,
    updateUserInfo,
    clearUserData,
    checkLoginStatus
  }
})
