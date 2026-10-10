const {
  COLLECTIONS,
  update,
  getById,
  listAll,
  page: pageQuery,
  count,
  _
} = require('../lib/db')
const { requireUser, requireMembership } = require('../lib/context')
const { notFound } = require('../lib/errors')
const { toInt } = require('../lib/validate')

const roomIdOf = (payload = {}, query = {}) => payload.roomId || query.roomId

/** 软删除标记：所有读取都要排掉 deleted=true，否则删除等于没删。 */
const NOT_DELETED = _.neq(true)

function shape(item) {
  return {
    id: item._id,
    roomId: item.roomId || '',
    type: item.type,
    title: item.title,
    body: item.body || '',
    targetType: item.targetType || '',
    targetId: item.targetId || '',
    read: !!item.read,
    subtitle: item.subtitle || '',
    triggerTimeLabel: item.triggerTimeLabel || '',
    targetDate: item.targetDate || '',
    createTime: item.createdAt
  }
}

/** 未读通知列表（任务提醒等）。 */
async function unread({ openid, payload, query }) {
  const user = await requireUser(openid)
  const where = { userId: user.id, read: false, deleted: NOT_DELETED }
  if (roomIdOf(payload, query)) where.roomId = roomIdOf(payload, query)

  const rows = await listAll(COLLECTIONS.notifications, where, { orderBy: 'createdAt', order: 'desc' })
  return rows.map(shape)
}

/** 全部通知分页列表。 */
async function list({ openid, payload, query }) {
  const user = await requireUser(openid)
  const where = { userId: user.id, deleted: NOT_DELETED }
  if (roomIdOf(payload, query)) where.roomId = roomIdOf(payload, query)

  const result = await pageQuery(COLLECTIONS.notifications, where, {
    page: toInt(payload.page, 1),
    pageSize: toInt(payload.pageSize, 20),
    orderBy: 'createdAt',
    order: 'desc'
  })

  return { ...result, list: result.list.map(shape) }
}

/** 未读数（红点）。 */
async function unreadCount({ openid, payload, query }) {
  const user = await requireUser(openid)
  const where = { userId: user.id, read: false, deleted: NOT_DELETED }
  if (roomIdOf(payload, query)) where.roomId = roomIdOf(payload, query)

  const total = await count(COLLECTIONS.notifications, where)
  // total 与 count 同时返回：前端历史代码读 total，新代码读 count，避免再出现红点不亮
  return { count: total, total, hasUnread: total > 0 }
}

/** 标记单条已读。支持 id 或 targetId + targetType。 */
async function markAsRead({ openid, payload, query }) {
  const user = await requireUser(openid)
  const id = payload.id || query.id

  if (id) {
    const item = await getById(COLLECTIONS.notifications, id)
    if (!item || item.userId !== user.id) throw notFound('消息不存在')
    await update(COLLECTIONS.notifications, id, { read: true, readAt: new Date().toISOString() })
    return { id, read: true }
  }

  const targetId = payload.targetId || query.targetId
  const targetType = payload.targetType || query.targetType
  if (!targetId || !targetType) throw notFound('缺少消息标识')

  const rows = await listAll(COLLECTIONS.notifications, {
    userId: user.id,
    targetId,
    targetType,
    read: false,
    deleted: NOT_DELETED
  })

  await Promise.all(
    rows.map((item) =>
      update(COLLECTIONS.notifications, item._id, { read: true, readAt: new Date().toISOString() })
    )
  )

  return { targetId, targetType, updated: rows.length }
}

/** 全部标记已读。 */
async function markRead({ openid, payload, query }) {
  const user = await requireUser(openid)
  const where = { userId: user.id, read: false, deleted: NOT_DELETED }
  if (roomIdOf(payload, query)) where.roomId = roomIdOf(payload, query)

  const rows = await listAll(COLLECTIONS.notifications, where)
  await Promise.all(
    rows.map((item) =>
      update(COLLECTIONS.notifications, item._id, { read: true, readAt: new Date().toISOString() })
    )
  )

  return { updated: rows.length }
}

/** 删除通知。 */
async function remove({ openid, payload, query }) {
  const user = await requireUser(openid)
  const id = payload.id || query.id
  const item = await getById(COLLECTIONS.notifications, id)
  if (!item || item.userId !== user.id) throw notFound('消息不存在')
  await update(COLLECTIONS.notifications, id, { deleted: true })
  return { id, deleted: true }
}

/**
 * 清空当前用户的通知（软删除）。
 * 传 roomId 时只清该空间的，不传则清全部。
 * 用软删除是为了和 remove 保持一致：提醒的去重靠 schedule.lastRemindKey，
 * 不依赖通知记录本身，硬删也不会重发，但统一走软删更容易日后再追溯。
 */
async function clear({ openid, payload, query }) {
  const user = await requireUser(openid)
  const where = { userId: user.id, deleted: NOT_DELETED }
  const roomId = roomIdOf(payload, query)
  if (roomId) where.roomId = roomId

  const rows = await listAll(COLLECTIONS.notifications, where)
  await Promise.all(
    rows.map((item) => update(COLLECTIONS.notifications, item._id, { deleted: true }))
  )
  return { deleted: rows.length }
}

/**
 * 微信订阅消息模板 ID。
 * 模板 ID 属于公开配置，建议放在云函数环境变量里，避免硬编码进仓库。
 */
async function subscribeTemplates() {
  return {
    birthdayTemplateId: process.env.WECHAT_BIRTHDAY_TEMPLATE_ID || '',
    scheduleTemplateId: process.env.WECHAT_SCHEDULE_TEMPLATE_ID || ''
  }
}

/** 房间维度的通知汇总，供房间列表红点使用。 */
async function roomUnread({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  const { user } = await requireMembership(openid, roomId, 'viewer')
  const total = await count(COLLECTIONS.notifications, { userId: user.id, roomId, read: false, deleted: NOT_DELETED })
  return { roomId, count: total }
}

module.exports = {
  unread,
  list,
  unreadCount,
  markAsRead,
  markRead,
  delete: remove,
  clear,
  subscribeTemplates,
  roomUnread
}
