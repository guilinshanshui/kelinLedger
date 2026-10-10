// 全局类型定义
export interface ApiResponse<T = any> {
  code: number
  message: string
  data: T
}

export interface User {
  id: string
  userId?: string
  nickname: string
  avatar: string
  role?: string
  joinTime: string
  token?: string
  roomCount?: number
  roomsCount?: number
  phone?: string
}

export interface Room {
  id: string
  name: string
  description: string
  avatar: string
  role?: 'owner' | 'admin' | 'member' | 'viewer'
  userRole?: 'owner' | 'admin' | 'member' | 'viewer'
  ownerId?: string
  currentUserId?: string
  canManage?: boolean
  memberCount?: number
  budget?: number
  inviteCode: string
  members: User[]
  createTime: string
  updateTime: string
}

export interface Task {
  id: string
  title: string
  description?: string
  assigneeId: string
  assignee?: User
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'low' | 'medium' | 'high'
  dueDate?: string
  createTime: string
  updateTime: string
  roomId: string
}

export interface Schedule {
  id: string
  title: string
  description?: string
  startTime: string
  endTime: string
  isAllDay: boolean
  type: 'personal' | 'family'
  creatorId: string
  creator?: User
  roomId: string
  createTime: string
  updateTime: string
}

export interface AppConfig {
  /** 云开发环境 ID，留空使用默认环境 */
  cloudEnv: string
  /** 云函数名称 */
  cloudFunctionName: string
  appId: string
  version: string
}

/** 账本流水 */
export interface LedgerEntry {
  id: string
  roomId: string
  userId: string
  type: 'expense' | 'income' | 'transfer'
  amount: number
  amountMinor: number
  categoryId: string
  categoryName: string
  categoryIcon: string
  payMethodId: string
  payMethodName: string
  note: string
  occurredAt: string
  date: string
  source: 'manual' | 'import'
  createTime: string
}

/** 动态 */
export interface FeedItem {
  id: string
  roomId: string
  userId: string
  authorName: string
  authorAvatar: string
  type: string
  typeLabel: string
  content: string
  images: string[]
  likeCount: number
  liked: boolean
  createTime: string
}

/** 成员（含角色） */
export interface RoomMember {
  id: string
  userId: string
  roomId: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  roleLabel: string
  nickname: string
  avatar: string
  joinedAt: string
}

/** 通知 */
export interface NotificationItem {
  id: string
  roomId: string
  type: string
  title: string
  body: string
  targetType: string
  targetId: string
  read: boolean
  createTime: string
}
