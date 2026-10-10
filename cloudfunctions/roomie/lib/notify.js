const { COLLECTIONS, insert } = require('./db')
const { nextId } = require('./id')

/**
 * 写入站内通知。
 * 通知是异步副产物，失败不应阻断主流程，因此统一吞掉异常并打日志。
 */
async function pushNotification({
  roomId,
  userId,
  type,
  title,
  body = '',
  targetType = '',
  targetId = '',
  targetDate = '',
  actorId = ''
}) {
  if (!userId) return null
  try {
    const doc = {
      _id: nextId('ntf'),
      roomId: roomId || '',
      userId,
      actorId,
      type,
      title,
      body,
      targetType,
      targetId,
      targetDate,
      read: false,
      createdAt: new Date().toISOString()
    }
    await insert(COLLECTIONS.notifications, doc)
    return doc
  } catch (error) {
    console.error('[notify] 写入通知失败', error)
    return null
  }
}

/** 批量通知，跳过自己。 */
async function pushNotificationMany(userIds, payload) {
  const unique = Array.from(new Set(userIds.filter(Boolean))).filter(
    (id) => id !== payload.actorId
  )
  return Promise.all(unique.map((userId) => pushNotification({ ...payload, userId })))
}

module.exports = { pushNotification, pushNotificationMany }
