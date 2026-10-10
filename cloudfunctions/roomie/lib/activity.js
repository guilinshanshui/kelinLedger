const { COLLECTIONS, insert } = require('./db')
const { nextId } = require('./id')

/**
 * 动态（Feed）统一入口。
 * 任务完成、记账、日程创建等动作会自动生成动态，与手动发布的动态共用一张表，
 * 前端只需按 type 渲染不同卡片。
 */
const FEED_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  TASK_COMPLETE: 'task_complete',
  TASK_CREATE: 'task_create',
  LEDGER_ADD: 'ledger_add',
  SCHEDULE_CREATE: 'schedule_create',
  MEMBER_JOIN: 'member_join'
}

async function publishFeed({
  roomId,
  userId,
  type = FEED_TYPES.TEXT,
  content = '',
  images = [],
  refType = '',
  refId = '',
  meta = {}
}) {
  try {
    const doc = {
      _id: nextId('feed'),
      roomId,
      userId,
      type,
      content,
      images: Array.isArray(images) ? images : [],
      refType,
      refId,
      meta,
      likeCount: 0,
      likedBy: [],
      createdAt: new Date().toISOString()
    }
    await insert(COLLECTIONS.feeds, doc)
    return doc
  } catch (error) {
    console.error('[activity] 写入动态失败', error)
    return null
  }
}

module.exports = { publishFeed, FEED_TYPES }
