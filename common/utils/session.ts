import { STORAGE_KEYS } from '@/common/config'
import { coalesce } from '@/common/utils/coalesce.js'
import type { User } from '@/types'

/** 读取本地缓存的当前用户。 */
export function getStoredUser(): (User & { userId?: string }) | null {
  try {
    return uni.getStorageSync(STORAGE_KEYS.USER_INFO) || null
  } catch (error) {
    return null
  }
}

/** 当前用户 ID。云函数返回 id 与 userId 两个兼容字段。 */
export function getCurrentUserId(): string {
  const user = getStoredUser()
  return String(user?.id || user?.userId || '')
}

/** 是否已有可用登录态。 */
export function hasSession(): boolean {
  return !!getCurrentUserId()
}

export interface UserDisplay {
  nickname: string
  avatar: string
  userNickname: string
  userHeadUrl: string
  roomsCount: number
  [key: string]: unknown
}

/**
 * 统一用户展示字段。
 *
 * 会话里存的原始对象只有 nickname / avatar，而页面模板读的是 userNickname / userHeadUrl，
 * 直接赋值会让模板拿到 undefined（表现为「你好，undefined」）。
 * 所有页面统一走这里，不要各自再拼一遍。
 */
export function normalizeUser(raw: unknown): UserDisplay {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const nickname = String(source.nickname || source.userNickname || '')
  const avatar = String(source.avatar || source.userHeadUrl || '')
  const roomsCount = Number(coalesce(source.roomsCount, source.roomCount, 0))

  return {
    ...source,
    nickname,
    avatar,
    userNickname: nickname || '微信用户',
    userHeadUrl: avatar,
    roomsCount: Number.isFinite(roomsCount) ? roomsCount : 0
  }
}

/** 当前账本。 */
export function getCurrentRoom(): { id: string; name?: string; avatar?: string } | null {
  try {
    const room = uni.getStorageSync(STORAGE_KEYS.CURRENT_ROOM)
    return room && room.id ? room : null
  } catch (error) {
    return null
  }
}
