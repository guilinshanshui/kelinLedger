import http from '@/common/utils/request'
import { API_PATHS } from '@/common/config'
import type {
  User,
  Room,
  Task,
  Schedule,
  RoomMember,
  FeedItem,
  NotificationItem,
  LedgerEntry,
  ApiResponse
} from '@/types'

/**
 * API 层。
 *
 * 每个方法对应云函数的一个 action（模块.方法），由路径自动推导：
 *   API_PATHS.TASK_LIST = '/task/list' -> task.list
 *
 * 约定：ID 一律通过 payload/query 传递，不再拼进 URL 路径，
 * 避免路径参数与 action 名称混淆。
 */

// ---------------- 用户 ----------------

export const userApi = {
  /** 微信登录（云开发下由平台注入 openid，无需 code2session） */
  /**
   * 微信登录。
   * 云函数在资料未完善时返回业务码 333，这里必须让非 0 码透传，
   * 否则请求层会先抛错，登录页的「完善资料」分支永远走不到。
   */
  login: (data: Record<string, any> = {}): Promise<ApiResponse<User & { token: string; isNewUser: boolean }>> =>
    http.post(API_PATHS.USER_LOGIN, data, { allowBusinessCode: true }),

  /** 个人中心统计 */
  getUserStatsInfo: (params?: { roomId?: string }): Promise<ApiResponse<Record<string, number>>> =>
    http.get(API_PATHS.USER_STATS_INFO, params),

  getUserInfo: (): Promise<ApiResponse<User>> => http.get(API_PATHS.USER_INFO),

  getVersionInfo: (): Promise<ApiResponse<any>> => http.get(API_PATHS.USER_VERSION),

  /** 账号密码登录（保留入口） */
  accountLogin: (data: Record<string, any>): Promise<ApiResponse<User>> =>
    http.post(API_PATHS.USER_ACCOUNT_LOGIN, data),

  updateUserInfo: (data: Partial<User>): Promise<ApiResponse<User>> =>
    http.put(API_PATHS.USER_UPDATE, data),

  updateUserAratar: (data: Partial<User>): Promise<ApiResponse<User>> =>
    http.post(API_PATHS.USER_ARATAR, data)
}

// ---------------- 房间 ----------------

export const roomApi = {
  createRoom: (data: Record<string, any>, currentUserId?: string): Promise<ApiResponse<Room>> =>
    http.post(API_PATHS.ROOM_CREATE, { ...data, currentUserId }),

  /** 我参与的房间列表 */
  getRoomList: (): Promise<ApiResponse<Room[]>> => http.get(API_PATHS.ROOM_LIST),

  joinRoom: (inviteCode: string): Promise<ApiResponse<Room>> =>
    http.post(API_PATHS.ROOM_JOIN, { inviteCode }),

  getRoomInfo: (roomId: string): Promise<ApiResponse<Room>> =>
    http.get(API_PATHS.ROOM_INFO, { roomId }),

  getRoomMembers: (roomId: string): Promise<ApiResponse<RoomMember[]>> =>
    http.get(API_PATHS.ROOM_MEMBERS, { roomId }),

  /** 更新空间信息（名称/描述/预算） */
  updateRoomInfo: (data: Record<string, any>): Promise<ApiResponse<Room>> =>
    http.post(API_PATHS.ROOM_UPDATE_INFO, data),

  deleteRoom: (roomId: string): Promise<ApiResponse<Room>> =>
    http.post(API_PATHS.ROOM_DELETE, { roomId }),

  /** 转让创建者；仅当前创建者可调用 */
  transferOwner: (roomId: string, targetUserId: string): Promise<ApiResponse<Room>> =>
    http.post(API_PATHS.ROOM_TRANSFER_OWNER, { roomId, targetUserId }),

  updateBudget: (data: Record<string, any>): Promise<ApiResponse<Room>> =>
    http.post(API_PATHS.ROOM_UPDATE_BUDGET, data),

  /** 生成邀请码；传 inviteeId 则为定向邀请 */
  generateInviteCode: (
    roomId: string,
    inviteeId = ''
  ): Promise<ApiResponse<{ id: string; code: string; expiresAt: string }>> =>
    http.post(API_PATHS.ROOM_INVITE, { roomId, inviteeId }),

  // ---- 邀请 ----
  inviteList: (params?: Record<string, any>): Promise<ApiResponse<any[]>> =>
    http.get(API_PATHS.ROOM_INVITATION_PENDING, params),

  accecptSigin: (invitationId: string, data: Record<string, any> = {}): Promise<ApiResponse<Room>> =>
    http.post(API_PATHS.ROOM_INVITATION_ACCEPT, { ...data, invitationId }),

  rejectSigin: (invitationId: string, data: Record<string, any> = {}): Promise<ApiResponse<Room>> =>
    http.post(API_PATHS.ROOM_INVITATION_REJECT, { ...data, invitationId }),

  accecptAll: (data: Record<string, any> = {}): Promise<ApiResponse<Room>> =>
    http.post(API_PATHS.ROOM_INVITATION_ACCEPT_ALL, data),

  rejectAll: (data: Record<string, any> = {}): Promise<ApiResponse<Room>> =>
    http.post(API_PATHS.ROOM_INVITATION_REJECT_ALL, data),

  getDashBoardList: (params: Record<string, any>): Promise<ApiResponse<any>> =>
    http.get(API_PATHS.ROOM_DASHBOARD, params),

  // ---- 流水 ----
  ledgerAdd: (data: Record<string, any>): Promise<ApiResponse<LedgerEntry>> =>
    http.post(API_PATHS.LEDGER_ADD, data),

  ledgerSummary: (params: Record<string, any>): Promise<ApiResponse<any>> =>
    http.get(API_PATHS.LEDGER_SUMMARY, params),

  ledgerDetail: (data: Record<string, any>): Promise<ApiResponse<LedgerEntry>> =>
    http.get(API_PATHS.LEDGER_DETAIL, data),

  ledgerList: (params: Record<string, any>): Promise<ApiResponse<any>> =>
    http.get(API_PATHS.LEDGER_LIST, params),

  ledgerUpdate: (data: Record<string, any>): Promise<ApiResponse<LedgerEntry>> =>
    http.post(API_PATHS.LEDGER_UPDATE, data),

  /**
   * 按周 / 日 / 月 / 年拉取区间明细，返回 { list, summary, groups }。
   * 账单日历用 month 取当月每天的收支。
   */
  getLedgerWeekList: (
    params: Record<string, any>,
    requestType: 'week' | 'today' | 'month' | 'year' = 'week'
  ): Promise<ApiResponse<any>> => {
    const map: Record<string, string> = {
      week: API_PATHS.LEDGER_WEEK_LIST,
      today: API_PATHS.LEDGER_DAY_LIST,
      month: API_PATHS.LEDGER_MONTH_LIST,
      year: API_PATHS.LEDGER_YEAR_LIST
    }
    return http.get(map[requestType] || map.week, params)
  }
}

// ---------------- 成员管理 ----------------

export const memberApi = {
  /** 成员列表 */
  list: (roomId: string): Promise<ApiResponse<RoomMember[]>> =>
    http.get(API_PATHS.MEMBER_LIST, { roomId }),

  /** 修改角色 */
  updateRole: (roomId: string, userId: string, role: string): Promise<ApiResponse<any>> =>
    http.post(API_PATHS.ROOM_PERMISSION_UPDATE_ROLE, { roomId, userId, role }),

  /** 移除成员 */
  remove: (roomId: string, userId: string): Promise<ApiResponse<any>> =>
    http.post(API_PATHS.ROOM_REMOVE_MEMBER, { roomId, userId }),

  /** 退出空间 */
  leave: (roomId: string): Promise<ApiResponse<any>> =>
    http.post(API_PATHS.MEMBER_LEAVE, { roomId }),

}

// ---------------- 账单导入 ----------------

export const ledgerImportApi = {
  /** 上传账单文件并预览（不入库） */
  preview: (
    filePath: string,
    roomId: string | number,
    accountId: string | number = ''
  ): Promise<ApiResponse<Record<string, any>>> =>
    http.upload(API_PATHS.LEDGER_IMPORT_PREVIEW, filePath, { roomId: String(roomId), accountId: String(accountId) }, {
      showLoading: true,
      showError: false
    }),

  /** 确认导入勾选的行 */
  confirm: (data: Record<string, any>): Promise<ApiResponse<Record<string, any>>> =>
    http.post(API_PATHS.LEDGER_IMPORT_CONFIRM, data, { showLoading: true, showError: false }),

  /** 分类树（按 income/expense） */
  getCategoryTree: (roomId: string, type: 'income' | 'expense'): Promise<ApiResponse<any[]>> =>
    http.get(API_PATHS.LEDGER_CATEGORY_TREE, { roomId, type }, { showError: false }),

  /** 支付方式列表 */
  getPayMethods: (roomId: string): Promise<ApiResponse<any[]>> =>
    http.get(API_PATHS.LEDGER_CATEOGER_LIST, { roomId, type: 'transfer' }),

  /** 商户分类记忆 */
  getMerchantRules: (roomId: string): Promise<ApiResponse<any[]>> =>
    http.get(API_PATHS.LEDGER_IMPORT_MERCHANT_RULES, { roomId })
}

// ---------------- 类型与选项 ----------------

export const typeApi = {
  getAllFeatures: (): Promise<ApiResponse<any[]>> => http.get(API_PATHS.ROOM_ALL_FEATURE),
  getAllTemplates: (): Promise<ApiResponse<any[]>> => http.get(API_PATHS.ROOM_ALL_TEMPLATE),
  getAllIcons: (): Promise<ApiResponse<any[]>> => http.get(API_PATHS.ROOM_ALL_ICON),
  getWheelList: (priorityId?: string): Promise<ApiResponse<any[]>> =>
    http.get(API_PATHS.WHEEL_LIST, { priorityId })
}

// ---------------- 清单与任务 ----------------

export const taskApi = {
  /** 任务列表（分页 + 过滤） */
  getTaskList: (params?: {
    roomId?: string
    status?: string
    assigneeId?: string
    listId?: string
    page?: number
    pageSize?: number
  }): Promise<ApiResponse<{ list: Task[]; total: number }>> => http.get(API_PATHS.TASK_LIST, params),

  /** 全部状态视图，清单中心使用 */
  taskAllList: (params: Record<string, any>): Promise<ApiResponse<Record<string, Task[]>>> =>
    http.get(API_PATHS.TASK_ALL_LIST, params),

  /** 已完成任务 */
  complateTaskLIst: (params: Record<string, any>): Promise<ApiResponse<Task[]>> =>
    http.get(API_PATHS.TASK_COMPLATE_LIST, params),

  createTask: (data: Record<string, any>): Promise<ApiResponse<Task>> =>
    http.post(API_PATHS.TASK_CREATE, data),

  updateTask: (data: Record<string, any>): Promise<ApiResponse<Task>> =>
    http.post(API_PATHS.TASK_UPDATE, data),

  deleteTask: (taskId: string, roomId: string): Promise<ApiResponse<null>> =>
    http.post(API_PATHS.TASK_DELETE, { id: taskId, roomId }),

  assignTask: (taskId: string, assigneeId: string, roomId = ''): Promise<ApiResponse<Task>> =>
    http.post(API_PATHS.TASK_ASSIGN, { taskId, assigneeId, roomId }),

  complateTask: (id: string, roomId = ''): Promise<ApiResponse<Task>> =>
    http.post(API_PATHS.TASK_COMPLATE, { id, roomId }),

  resetTask: (id: string, roomId = ''): Promise<ApiResponse<Task>> =>
    http.post(API_PATHS.TASK_RESET, { id, roomId }),

  /** 任务统计 */
  stats: (roomId: string): Promise<ApiResponse<Record<string, number>>> =>
    http.get(API_PATHS.TASK_STATS, { roomId }),

  // ---- 清单（任务分组） ----
  getLists: (roomId: string): Promise<ApiResponse<any[]>> =>
    http.get(API_PATHS.TASK_LISTS, { roomId }),

  createList: (data: Record<string, any>): Promise<ApiResponse<any>> =>
    http.post(API_PATHS.TASK_LIST_CREATE, data),

  deleteList: (id: string, roomId: string): Promise<ApiResponse<any>> =>
    http.post(API_PATHS.TASK_LIST_DELETE, { id, roomId }),

  // ---- 清单关联记账 ----
  taskLedgerSummary: (params?: Record<string, any>): Promise<ApiResponse<any>> =>
    http.get(API_PATHS.TASK_LEDGER_SUMMARY, params),

  taskLedgerRecords: (params?: Record<string, any>): Promise<ApiResponse<any>> =>
    http.get(API_PATHS.TASK_LEDGER_RECORDS, params),

  // ---- 记账相关（历史遗留在此，保留兼容） ----
  getcategoryList: (params: Record<string, any>): Promise<ApiResponse<any[]>> =>
    http.get(API_PATHS.LEDGER_CATEOGER_LIST, params),

  /** 自定义起止区间（含结束日整天），参数为 YYYY-MM-DD。 */
  getLedgerRange: (params: Record<string, any>): Promise<ApiResponse<any>> =>
    http.get(API_PATHS.LEDGER_RANGE, params),

  getLedgerWeekList: (params: Record<string, any>, requestType = 'week'): Promise<ApiResponse<any>> => {
    const map: Record<string, string> = {
      week: API_PATHS.LEDGER_WEEK_LIST,
      today: API_PATHS.LEDGER_DAY_LIST,
      month: API_PATHS.LEDGER_MONTH_LIST,
      year: API_PATHS.LEDGER_YEAR_LIST
    }
    return http.get(map[requestType] || map.week, params)
  },

  deleteLedger: (id: string, roomId: string): Promise<ApiResponse<any>> =>
    http.post(API_PATHS.LEDGER_DELETE, { id, roomId }),

  // ---- 消息（任务提醒） ----
  notificationList: (params: Record<string, any>): Promise<ApiResponse<NotificationItem[]>> =>
    http.get(API_PATHS.NOTIFICATION_LIST, params),

  notificationRead: (data: Record<string, any>): Promise<ApiResponse<any>> =>
    http.post(API_PATHS.NOTIFICATION_READ, data),

  // ---- 日程（历史调用入口在 taskApi，保留别名避免页面改动） ----
  createSchedule: (data: Record<string, any>): Promise<ApiResponse<Schedule>> =>
    http.post(API_PATHS.SCHEDULE_CREATE, data),

  scheduleList: (params: Record<string, any>): Promise<ApiResponse<Schedule[]>> =>
    http.get(API_PATHS.SCHEDULE_LIST, params),

  updateSchedule: (
    scheduleId: string | Record<string, any>,
    data: Record<string, any> = {}
  ): Promise<ApiResponse<Schedule>> => {
    // 兼容两种调用：updateSchedule(id, patch) 与 updateSchedule({ id, ...patch })
    const body = typeof scheduleId === 'object' && scheduleId !== null
      ? { ...scheduleId }
      : { ...data, id: scheduleId }
    return http.put(API_PATHS.SCHEDULE_UPDATE, body)
  },

  deleteSchedule: (scheduleId: string, roomId = ''): Promise<ApiResponse<null>> =>
    http.delete(`${API_PATHS.SCHEDULE_DELETE}?id=${scheduleId}&roomId=${roomId}`)
}

// ---------------- 日程 ----------------

export const scheduleApi = {
  getScheduleList: (params?: Record<string, any>): Promise<ApiResponse<{ list: Schedule[]; total: number }>> =>
    http.get(API_PATHS.SCHEDULE_LIST, params),

  scheduleList: (params: Record<string, any>): Promise<ApiResponse<Schedule[]>> =>
    http.get(API_PATHS.SCHEDULE_LIST, params),

  createSchedule: (data: Record<string, any>): Promise<ApiResponse<Schedule>> =>
    http.post(API_PATHS.SCHEDULE_CREATE, data),

  updateSchedule: (
    scheduleId: string | Record<string, any>,
    data: Record<string, any> = {}
  ): Promise<ApiResponse<Schedule>> => {
    const body = typeof scheduleId === 'object' && scheduleId !== null
      ? { ...scheduleId }
      : { ...data, id: scheduleId }
    return http.put(API_PATHS.SCHEDULE_UPDATE, body)
  },

  deleteSchedule: (scheduleId: string, roomId = ''): Promise<ApiResponse<null>> =>
    http.delete(`${API_PATHS.SCHEDULE_DELETE}?id=${scheduleId}&roomId=${roomId}`)
}

// ---------------- 动态 ----------------

export const feedApi = {
  getFeedList: (params?: Record<string, any>): Promise<ApiResponse<{ list: FeedItem[]; total: number }>> =>
    http.get(API_PATHS.FEED_LIST, params),

  createFeed: (data: {
    roomId: string
    content: string
    images?: string[]
  }): Promise<ApiResponse<FeedItem>> => http.post(API_PATHS.FEED_CREATE, data),

  likeFeed: (feedId: string, roomId: string): Promise<ApiResponse<any>> =>
    http.post(API_PATHS.FEED_LIKE, { feedId, roomId }),

  clearFeed: (roomId: string): Promise<ApiResponse<{ cleared: number }>> =>
    http.post(API_PATHS.FEED_CLEAR, { roomId }),

  deleteFeed: (feedId: string, roomId: string): Promise<ApiResponse<any>> =>
    http.post(API_PATHS.FEED_DELETE, { feedId, roomId })
}

// ---------------- 文件上传 ----------------

export const uploadApi = {
  uploadImage: (filePath: string, type = 'avatar'): Promise<ApiResponse<{ url: string }>> =>
    http.upload(API_PATHS.UPLOAD_IMAGE, filePath, { type }),

  uploadFile: (filePath: string, type: string): Promise<ApiResponse<{ url: string }>> =>
    http.upload(API_PATHS.UPLOAD_FILE, filePath, { type })
}

// ---------------- 消息中心 ----------------

export interface WechatSubscribeTemplates {
  birthdayTemplateId?: string
  birthday_template_id?: string
  scheduleTemplateId?: string
  schedule_template_id?: string
}

export const notificationsApi = {
  getWechatSubscribeTemplates: (): Promise<ApiResponse<WechatSubscribeTemplates>> =>
    http.get(API_PATHS.WECHAT_SUBSCRIBE_TEMPLATES, undefined, { showError: false }),

  /** 兜底派发到点提醒（打开消息中心时调用，静默失败，不打断列表加载） */
  runScheduleDue: (): Promise<ApiResponse<{ sent: number }>> =>
    http.post(API_PATHS.SCHEDULE_RUN_DUE, {}, { showError: false }),

  getNotificationList: (params?: Record<string, any>): Promise<ApiResponse<NotificationItem[]>> =>
    http.get(API_PATHS.NOTIFICATION_LISTS, params),

  getUnreadList: (params?: Record<string, any>): Promise<ApiResponse<NotificationItem[]>> =>
    http.get(API_PATHS.NOTIFICATION_LIST, params),

  getNotificationReadCount: (params?: Record<string, any>): Promise<ApiResponse<{ count: number }>> =>
    http.get(API_PATHS.NOTIFICATION_UNREAD_COUNT, params),

  markNotificationRead: (params: {
    id?: string | number
    targetId?: string | number
    targetType?: string
  }): Promise<ApiResponse<null>> => http.post(API_PATHS.NOTIFICATION_ALER_READ, params),

  getNotificationRead: (targetId: string | number, targetType: string): Promise<ApiResponse<null>> =>
    http.post(API_PATHS.NOTIFICATION_ALER_READ, { targetId, targetType }),

  markAllRead: (params?: Record<string, any>): Promise<ApiResponse<{ updated: number }>> =>
    http.post(API_PATHS.NOTIFICATION_READ, params || {}),

  deleteNotification: (id: string): Promise<ApiResponse<any>> =>
    http.post(API_PATHS.NOTIFICATION_DELETE, { id }),

  /** 清空消息（传 roomId 只清该空间，不传清全部） */
  clearAllNotifications: (params?: Record<string, any>): Promise<ApiResponse<{ deleted: number }>> =>
    http.post(API_PATHS.NOTIFICATION_CLEAR_ALL, params || {}),

  getRoomUnread: (roomId: string): Promise<ApiResponse<{ roomId: string; count: number }>> =>
    http.get(API_PATHS.NOTIFICATION_ROOM_UNREAD, { roomId })
}

// ---------------- 账户 / 资产 ----------------

export const assetApi = {
  /** 账户列表 */
  listAccounts: (roomId: string): Promise<ApiResponse<any[]>> =>
    http.get(API_PATHS.LEDGER_ACCOUNT_LIST, { roomId }),

  /** 新增或修改账户；传 id 为修改 */
  saveAccount: (data: Record<string, any>): Promise<ApiResponse<any>> =>
    http.post(API_PATHS.LEDGER_ACCOUNT_SAVE, data),

  /** 删除账户（仍有流水时会被拒绝） */
  deleteAccount: (roomId: string, id: string): Promise<ApiResponse<any>> =>
    http.post(API_PATHS.LEDGER_ACCOUNT_DELETE, { roomId, id }),

  /** 资产总览：总余额 / 期间收支 / 按账户分类 */
  overview: (params: Record<string, any>): Promise<ApiResponse<any>> =>
    http.get(API_PATHS.LEDGER_ASSET_OVERVIEW, params),

  // ---- 预算 ----
  listBudgets: (roomId: string, month?: string): Promise<ApiResponse<any[]>> =>
    http.get(API_PATHS.LEDGER_BUDGET_LIST, { roomId, month }),

  saveBudget: (data: Record<string, any>): Promise<ApiResponse<any>> =>
    http.post(API_PATHS.LEDGER_BUDGET_SAVE, data),

  deleteBudget: (roomId: string, month: string, categoryId = ''): Promise<ApiResponse<any>> =>
    http.post(API_PATHS.LEDGER_BUDGET_DELETE, { roomId, month, categoryId }),

  /** 预算进度与超支预警 */
  budgetProgress: (roomId: string, month?: string): Promise<ApiResponse<any>> =>
    http.get(API_PATHS.LEDGER_BUDGET_PROGRESS, { roomId, month }),

  // ---- 分摊结算 ----
  /** 谁欠谁：每人净额 + 最少转账方案 */
  settlement: (params: Record<string, any>): Promise<ApiResponse<any>> =>
    http.get(API_PATHS.LEDGER_SETTLEMENT, params),

  // ---- 周期账单 ----
  listRecurrings: (roomId: string): Promise<ApiResponse<any[]>> =>
    http.get(API_PATHS.LEDGER_RECURRING_LIST, { roomId }),

  saveRecurring: (data: Record<string, any>): Promise<ApiResponse<any>> =>
    http.post(API_PATHS.LEDGER_RECURRING_SAVE, data),

  deleteRecurring: (roomId: string, id: string): Promise<ApiResponse<any>> =>
    http.post(API_PATHS.LEDGER_RECURRING_DELETE, { roomId, id }),

  /** 手动触发到期的周期账单（定时任务会自动执行） */
  generateRecurrings: (roomId: string): Promise<ApiResponse<any>> =>
    http.post(API_PATHS.LEDGER_RECURRING_GENERATE, { roomId }),

  // ---- 导出 ----
  /** 导出流水 CSV（带 BOM，Excel 中文不乱码） */
  exportLedger: (params: Record<string, any>): Promise<ApiResponse<{ filename: string; count: number; content: string }>> =>
    http.get(API_PATHS.LEDGER_EXPORT, params)
}

// ---------------- 统计分析 ----------------

export type StatsRangeType = 'month' | 'year' | 'all' | 'custom'

export interface StatsQuery {
  roomId: string
  /** 自然月 / 自然年 / 全部 / 自定义 */
  rangeType: StatsRangeType
  year?: number
  month?: number
  startDate?: string
  endDate?: string
}

export const statsApi = {
  /**
   * 统计概览。四种 rangeType 都由云函数按对应区间重新聚合：
 *   month 取该年月；year 取该年；all 取全部；custom 取起止区间（上限 12 个月）
   */
  overview: (params: StatsQuery): Promise<ApiResponse<any>> =>
    http.get(API_PATHS.LEDGER_STATS, params)
}

// ---------------- 看板 ----------------

export const dashboardApi = {
  /**
   * 看板首屏聚合：房间详情 + 成员 + 流水列表 + 流水汇总，一次请求全部带回。
   * 之前这四项要发 4 次云调用，现在首屏只发 1 次。
   */
  home: (roomId: string): Promise<ApiResponse<{
    room: any
    members: any[]
    ledgerList: any
    ledgerSummary: any
  }>> => http.get(API_PATHS.DASHBOARD_HOME, { roomId })
}

// ---------------- 统一导出 ----------------

export const api = {
  user: userApi,
  room: roomApi,
  member: memberApi,
  ledger: roomApi,
  asset: assetApi,
  stats: statsApi,
  ledgerImport: ledgerImportApi,
  task: taskApi,
  schedule: scheduleApi,
  feed: feedApi,
  upload: uploadApi,
  type: typeApi,
  notifications: notificationsApi,
  dashboard: dashboardApi
}

export default api
