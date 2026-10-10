import type { AppConfig } from '@/types'

/** 应用版本号（UI 展示与业务逻辑统一从此读取） */
export const APP_VERSION = '2.1.8'

/** 带 v 前缀的版本文案，如 v2.0.0 */
export function formatAppVersion(withPrefix = true) {
  return withPrefix ? `v${APP_VERSION}` : APP_VERSION
}

// 应用配置
export const appConfig: AppConfig = {
  // 云开发环境 ID。必须在微信开发者工具中创建云环境后显式填写，例如 cloud1-xxxxxxxx。
  // 未填写时前端会直接提示配置环境，不会发起云函数调用。
  // 多环境（开发/体验/生产）建议各自建一个环境，在这里按需切换。
  cloudEnv: 'cloudbase-d0g5v4tf442146566' as string,

  // 云函数名称，需与 cloudfunctions/ 下的目录名一致
  cloudFunctionName: 'roomie',

  // 微信小程序 AppID，需与 manifest.json 中 mp-weixin.appid 保持一致
  appId: 'wx8ab87add7a9a0f11',

  version: APP_VERSION
}

// API接口路径
export const API_PATHS = {
  // 用户相关
  USER_LOGIN: '/user/wxEmoteLogin',//授权登录
  USER_INFO: '/user/info',
  USER_ACCOUNT_LOGIN:'/user/login',
  USER_UPDATE: '/user/update',
  USER_VERSION:'/version/list',//获取更新版本
  USER_STATS_INFO:'/user/stats/info',//获取用户中心的数量
  USER_ARATAR:'/user/updateEmoteUserName',//修改头像和昵称

  // 同屋相关
  ROOM_CREATE: '/room/createRoom',//房间创建
  ROOM_UPDATE_BUDGET:'/room/updateBudget',//修改预算
  ROOM_INVITATION_PENDING:'/room/invitation/pending',//获取邀请列表
  ROOM_INVITATION_ACCEPT_ALL:'/room/invitation/acceptAll',//接受所有的邀请
  ROOM_INVITATION_REJECT_ALL:'/room/invitation/rejectAll',//忽略所有的邀请
  ROOM_INVITATION_REJECT:'/room/invitation/reject',//拒绝单个邀请
  ROOM_INVITATION_ACCEPT:'/room/invitation/accept',//接受单个邀请
  LEDGER_ADD: '/ledger/add',//流水添加
  LEDGER_DETAIL:'/ledger/detail',//根据id查询详情
  LEDGER_DELETE: '/ledger/delete',//流水删除
  LEDGER_UPDATE: '/ledger/update',//修改流水
  LEDGER_WEEK_LIST:'/ledger/week',//本周分组的数据
  LEDGER_DAY_LIST:'/ledger/today',//今天记账明细数据
  LEDGER_MONTH_LIST:'/ledger/month',//本月记账明细数据
  LEDGER_YEAR_LIST:'/ledger/year',//本年记账明细数据
  LEDGER_RANGE:'/ledger/range',//自定义起止区间的记账明细
  LEDGER_CATEOGER_LIST:'/ledger/category/list',//获取支付分类
  LEDGER_CATEGORY_TREE:'/ledger/category/tree',//分类树（账单导入改分类）
  LEDGER_IMPORT_PREVIEW:'/ledger/import/preview',//账单导入预览
  LEDGER_IMPORT_CONFIRM:'/ledger/import/confirm',//账单导入确认
  LEDGER_IMPORT_MERCHANT_RULES:'/ledger/import/merchant-rules',//商户分类记忆
  ROOM_LIST:'/room/rooms',//房间列表
  ROOM_JOIN: '/room/join',
  ROOM_PERMISSION_UPDATE_ROLE:'/room/permission/updateRole',//room/permission/updateRole //修改成员权限
  ROOM_REMOVE_MEMBER:'/roomNumber/removeMember',//移除房间成员
  ROOM_DASHBOARD:'/room/dashboard/overview', //dashboard
  DASHBOARD_HOME: '/dashboard/home',//看板首屏聚合（房间详情+成员+流水列表+流水汇总）
  ROOM_INFO: '/roomDetail/detail',//房间详情
  ROOM_DELETE: '/room/delete',//删除房间
  ROOM_MEMBERS: '/roomDetail/members',//获取成员列表
  ROOM_INVITE: '/room/invite',
  LEDGER_SUMMARY: '/ledger/summary',//记账的卡片金额总汇
  LEDGER_LIST: '/ledger/list',//记账的记录

  // 任务相关
  TASK_LIST: '/task/list',//任务列表
  TASK_CREATE: '/task/add',//任务添加
  TASK_UPDATE: '/task/update',//任务修改
  TASK_DELETE: '/task/delete',//任务删除
  TASK_ASSIGN: '/task/assign',
  TASK_COMPLATE:"/task/complete",//任务完成
  TASK_RESET: '/task/reset',//任务恢复为待办
  TASK_ALL_LIST:'/task/allStatus',//任务全部列表
  TASK_LEDGER_SUMMARY: '/taskLedger/summary',//清单关联记账汇总
  TASK_LEDGER_RECORDS: '/taskLedger/records',//清单关联记账明细
  TASK_COMPLATE_LIST:"/task/completedList",//获取完成列表
  NOTIFICATION_LIST:"/notifications/unread", //获取任务提醒
  NOTIFICATION_READ:"/notifications/markRead",
  // SCHEDULE_ADD:"/schedule/add",//添加日程
  // SCHEDULE_LIST:"/schedule/list",//添加日程
  //INSERT INTO task_notifications 

  // 日程相关
  SCHEDULE_LIST: '/schedule/list',
  SCHEDULE_CREATE: '/schedule/add',
  SCHEDULE_UPDATE: '/schedule/update',
  SCHEDULE_DELETE: '/schedule/delete',
  SCHEDULE_RUN_DUE: '/schedule/runDue',

  // 动态相关
  FEED_LIST: '/feed/list',
  FEED_CREATE: '/feed/create',
  FEED_LIKE: '/feed/like',
  
  //类型相关
  ROOM_ALL_ICON:"/roomIcon//all",
  ROOM_ALL_TEMPLATE:"/roomTemplate/all",
  ROOM_ALL_FEATURE:"/roomFeature/all",
  
  //消息类的 notifications unreadCount
  NOTIFICATION_LISTS:'/notifications/list',//获取消息列表
  NOTIFICATION_UNREAD_COUNT:'/notifications/unreadCount',//获取消息数字
  NOTIFICATION_ALER_READ:'/notifications/markAsRead',//已读
  /** 微信订阅消息模板 ID（生日/日程），由后台下发 */
  WECHAT_SUBSCRIBE_TEMPLATES: '/wechat/subscribe/templates',

  WHEEL_LIST:'/decisionWheel/list',

  // 文件上传（云存储 fileID）
  UPLOAD_IMAGE: '/upload/image',
  UPLOAD_FILE: '/upload/file',

  // 房间信息
  ROOM_UPDATE_INFO: '/room/update',
  ROOM_TRANSFER_OWNER: '/room/transferOwner',

  // 成员管理
  MEMBER_LIST: '/member/list',
  MEMBER_LEAVE: '/member/leave',

  // 清单（任务分组）
  TASK_LISTS: '/task/listLists',
  TASK_LIST_CREATE: '/task/createList',
  TASK_LIST_DELETE: '/task/deleteList',
  TASK_STATS: '/task/stats',

  // 动态
  FEED_DELETE: '/feed/delete',
  FEED_CLEAR: '/feed/clear',

  // 消息
  NOTIFICATION_DELETE: '/notification/delete',
  NOTIFICATION_CLEAR_ALL: '/notifications/clear',
  NOTIFICATION_ROOM_UNREAD: '/notification/roomUnread',

  // 账户与资产
  LEDGER_ACCOUNT_LIST: '/ledger/account/list',//账户列表
  LEDGER_ACCOUNT_SAVE: '/ledger/account/save',//新增/修改账户
  LEDGER_ACCOUNT_DELETE: '/ledger/account/delete',//删除账户
  LEDGER_ASSET_OVERVIEW: '/ledger/assetOverview',//资产总览

  // 预算
  LEDGER_BUDGET_LIST: '/ledger/budget/list',//预算列表
  LEDGER_BUDGET_SAVE: '/ledger/budget/save',//保存预算
  LEDGER_BUDGET_DELETE: '/ledger/budget/delete',//删除预算
  LEDGER_BUDGET_PROGRESS: '/ledger/budget/progress',//预算执行进度

  // 分摊结算
  LEDGER_SETTLEMENT: '/ledger/settlement',//谁欠谁

  // 周期账单
  LEDGER_RECURRING_LIST: '/ledger/recurring/list',//周期账单列表
  LEDGER_RECURRING_SAVE: '/ledger/recurring/save',//保存周期账单
  LEDGER_RECURRING_DELETE: '/ledger/recurring/delete',//删除周期账单
  LEDGER_RECURRING_GENERATE: '/ledger/recurring/generate',//手动触发生成

  // 导出
  LEDGER_EXPORT: '/ledger/exportCsv',

  // 统计分析：自然月 / 自然年 / 全部 / 自定义
  LEDGER_STATS: '/ledger/stats'
}

// 本地存储键名
export const STORAGE_KEYS = {
  TOKEN: 'roomie_token',
  USER_INFO: 'roomie_user_info',
  CURRENT_ROOM: 'roomie_current_room',
  SETTINGS: 'roomie_settings'
}

// 常量定义
export const CONSTANTS = {
  PAGE_SIZE: 20,
  MAX_ROOM_MEMBERS: 20,
  MAX_TASK_TITLE_LENGTH: 50,
  MAX_TASK_DESC_LENGTH: 200,
  REQUEST_TIMEOUT: 30000
}
