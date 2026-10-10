const { COLLECTIONS, insert, update, getById, listAll, _ } = require('../lib/db')
const { nextId } = require('../lib/id')
const { requireUser, requireMembership } = require('../lib/context')
const { badRequest, notFound } = require('../lib/errors')
const { requireString, optionalString, toBool } = require('../lib/validate')
const { publishFeed, FEED_TYPES } = require('../lib/activity')
const { pushNotificationMany } = require('../lib/notify')
const { nextReminderAt } = require('../lib/reminders')

const NOT_DELETED = _.neq(true)
const ALLOWED_OFFSETS = [0, -1, -3, -7]
const ALLOWED_CHANNELS = ['in_app', 'wechat']
const DEFAULT_REMIND_TIME = '09:00'

const pad2 = (n) => String(n).padStart(2, '0')
const roomIdOf = (payload = {}, query = {}) => payload.roomId || query.roomId

const isBirthdayLike = (item = {}) =>
  item.scheduleType === 'birthday' || item.isBirthday === true || item.birthdayCalendar === 'lunar'

/**
 * 统一判定日程类型。
 * 历史数据只有 type: 'family' | 'personal'，没有 scheduleType，
 * 因此这里把「非 birthday」一律归为普通日程，避免旧数据在列表里消失。
 */
function scheduleTypeOf(item = {}) {
  return isBirthdayLike(item) ? 'birthday' : 'schedule'
}

function parseOffsets(value) {
  let list = value
  if (typeof value === 'string' && value) {
    try {
      list = JSON.parse(value)
    } catch (error) {
      list = String(value).split(',')
    }
  }
  if (!Array.isArray(list)) return [0]
  const cleaned = list
    .map((item) => Number(item))
    .filter((item) => ALLOWED_OFFSETS.indexOf(item) >= 0)
  if (!cleaned.length) return [0]
  // 去重并按时间先后排序（当天 -> 提前 7 天）
  return Array.from(new Set(cleaned)).sort((a, b) => b - a)
}

function parseChannels(value) {
  let list = value
  if (typeof value === 'string' && value) {
    try {
      list = JSON.parse(value)
    } catch (error) {
      list = String(value).split(',')
    }
  }
  if (!Array.isArray(list)) return ['in_app']
  const cleaned = list
    .map((item) => String(item || '').trim())
    .filter((item) => ALLOWED_CHANNELS.indexOf(item) >= 0)
  return cleaned.length ? Array.from(new Set(cleaned)) : ['in_app']
}

function normalizeTime(value) {
  const text = String(value || '').trim()
  const matched = /^(\d{1,2}):(\d{2})$/.exec(text)
  if (!matched) return DEFAULT_REMIND_TIME
  const hh = Math.min(23, Math.max(0, Number(matched[1])))
  const mm = Math.min(59, Math.max(0, Number(matched[2])))
  return `${pad2(hh)}:${pad2(mm)}`
}

function parseDateParts(value) {
  const matched = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(value || ''))
  if (!matched) return null
  return {
    year: Number(matched[1]),
    month: Number(matched[2]),
    day: Number(matched[3])
  }
}

/** 从 payload 提取提醒相关字段（只有显式传入才覆盖）。 */
function pickRemindFields(payload = {}) {
  const patch = {}
  if (payload.remindEnabled !== undefined) {
    patch.remindEnabled = toBool(payload.remindEnabled, true)
  }
  if (payload.remindTime !== undefined || payload.time !== undefined) {
    patch.remindTime = normalizeTime(payload.remindTime || payload.time)
  }
  if (payload.remindOffsets !== undefined) {
    patch.remindOffsets = parseOffsets(payload.remindOffsets)
  }
  if (payload.remindChannels !== undefined) {
    patch.remindChannels = parseChannels(payload.remindChannels)
  }
  if (payload.repeatType !== undefined) {
    patch.repeatType = payload.repeatType === 'yearly' ? 'yearly' : 'none'
  }
  if (payload.remindMinutes !== undefined) {
    patch.remindMinutes = Number(payload.remindMinutes) || 0
  }
  return patch
}

/** 从 payload 提取生日相关字段。 */
function pickBirthdayFields(payload = {}) {
  const patch = {}
  const calendar = payload.birthdayCalendar === 'lunar' ? 'lunar' : 'solar'
  let month = Number(payload.birthdayMonth)
  let day = Number(payload.birthdayDay)

  // 公历生日没单独给月日时，从 birthdayOriginalDate / solarDate / date 推导
  if ((!month || !day) && calendar === 'solar') {
    const parts = parseDateParts(payload.birthdayOriginalDate || payload.solarDate || payload.date)
    if (parts) {
      month = month || parts.month
      day = day || parts.day
    }
  }

  if (payload.birthdayCalendar !== undefined || payload.solarDate !== undefined) {
    patch.birthdayCalendar = calendar
  }
  if (payload.birthdayOriginalDate !== undefined) {
    patch.birthdayOriginalDate = String(payload.birthdayOriginalDate || '').slice(0, 10)
  }
  if (month >= 1 && month <= 12) patch.birthdayMonth = month
  if (day >= 1 && day <= 31) patch.birthdayDay = day
  if (payload.birthdayLeapMonth !== undefined) {
    patch.birthdayLeapMonth = toBool(payload.birthdayLeapMonth, false)
  }
  if (payload.isLunar !== undefined || payload.lunar !== undefined) {
    patch.lunar = toBool(
      payload.lunar !== undefined ? payload.lunar : payload.isLunar,
      calendar === 'lunar'
    )
  }
  return patch
}

function shapeSchedule(item) {
  const scheduleType = scheduleTypeOf(item)
  const nextAt = nextReminderAt(item)
  return {
    id: item._id,
    roomId: item.roomId,
    title: item.title,
    description: item.description || '',
    date: item.date || '',
    startTime: item.startTime,
    endTime: item.endTime || item.startTime,
    isAllDay: !!item.isAllDay,
    // 兼容旧字段：type 仍表示 family / personal
    type: item.type || 'family',
    scheduleType,
    isBirthday: scheduleType === 'birthday',
    remindEnabled: item.remindEnabled !== false,
    remindTime: normalizeTime(item.remindTime),
    remindOffsets: parseOffsets(item.remindOffsets),
    remindChannels: parseChannels(item.remindChannels),
    repeatType: item.repeatType || (scheduleType === 'birthday' ? 'yearly' : 'none'),
    remindMinutes: item.remindMinutes || 0,
    birthdayCalendar: item.birthdayCalendar || '',
    birthdayOriginalDate: item.birthdayOriginalDate || '',
    birthdayMonth: item.birthdayMonth || 0,
    birthdayDay: item.birthdayDay || 0,
    birthdayLeapMonth: !!item.birthdayLeapMonth,
    lunar: item.lunar === 1 || item.lunar === true ? 1 : 0,
    creatorId: item.creatorId,
    creatorName: item.creatorName || '',
    participantIds: item.participantIds || [],
    lastRemindSentAt: item.lastRemindSentAt || '',
    nextRemindAt: nextAt,
    hasPendingReminder: !!nextAt,
    createTime: item.createdAt,
    updateTime: item.updatedAt
  }
}

async function list({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'viewer')

  const where = { roomId, deleted: NOT_DELETED }
  if (payload.startDate && payload.endDate) {
    where.startTime = _.gte(payload.startDate).and(_.lte(payload.endDate))
  }
  if (payload.type) where.type = payload.type

  const rows = await listAll(COLLECTIONS.schedules, where, { orderBy: 'startTime', order: 'asc' })

  const wanted = payload.scheduleType || query.scheduleType
  const filtered = wanted
    ? rows.filter((item) => scheduleTypeOf(item) === (wanted === 'birthday' ? 'birthday' : 'schedule'))
    : rows

  return filtered.map(shapeSchedule)
}

async function add({ openid, payload }) {
  const roomId = roomIdOf(payload)
  const { user } = await requireMembership(openid, roomId, 'member')

  const title = requireString(payload.title, '日程标题', { max: 50 })
  const scheduleType = scheduleTypeOf({ scheduleType: payload.scheduleType, isBirthday: payload.type === 'birthday' })
  const isBirthday = scheduleType === 'birthday'
  const startTime = payload.startTime || payload.date || (isBirthday ? '' : '')
  if (!startTime && !isBirthday) throw badRequest('缺少开始时间')

  const now = new Date().toISOString()
  const doc = {
    _id: nextId('sch'),
    roomId,
    title,
    description: optionalString(payload.description, 200),
    scheduleType,
    date: payload.date || '',
    startTime,
    endTime: payload.endTime || startTime,
    isAllDay: toBool(payload.isAllDay, false),
    type: payload.type === 'personal' ? 'personal' : 'family',
    remindEnabled: toBool(payload.remindEnabled, true),
    remindTime: normalizeTime(payload.remindTime || payload.time),
    remindOffsets: parseOffsets(payload.remindOffsets),
    remindChannels: parseChannels(payload.remindChannels),
    repeatType: payload.repeatType === 'yearly' || isBirthday ? 'yearly' : 'none',
    remindMinutes: Number(payload.remindMinutes) || 0,
    birthdayCalendar: payload.birthdayCalendar === 'lunar' ? 'lunar' : 'solar',
    birthdayOriginalDate: '',
    birthdayMonth: 0,
    birthdayDay: 0,
    birthdayLeapMonth: false,
    lunar: 0,
    creatorId: user.id,
    creatorName: user.nickname,
    participantIds: Array.isArray(payload.participantIds) ? payload.participantIds : [],
    lastRemindKey: '',
    lastRemindSentAt: '',
    deleted: false,
    createdAt: now,
    updatedAt: now
  }

  if (isBirthday) {
    Object.assign(doc, pickBirthdayFields(payload))
    if (!doc.birthdayMonth || !doc.birthdayDay) throw badRequest('缺少生日日期')
  }

  await insert(COLLECTIONS.schedules, doc)

  const feedDate = isBirthday
    ? (doc.birthdayOriginalDate || '')
    : (typeof startTime === 'string' ? startTime.slice(0, 10) : '')
  await publishFeed({
    roomId,
    userId: user.id,
    type: FEED_TYPES.SCHEDULE_CREATE,
    content: isBirthday
      ? `添加了生日「${title}」`
      : (feedDate ? `添加了日程「${title}」 · ${feedDate}` : `添加了日程「${title}」`),
    refType: 'schedule',
    refId: doc._id
  })

  const members = await listAll(COLLECTIONS.members, { roomId, status: 'active' })
  await pushNotificationMany(
    members.map((item) => item.userId),
    {
      roomId,
      actorId: user.id,
      type: 'schedule_created',
      title: isBirthday ? '新生日' : '新日程',
      body: `${user.nickname} 添加了「${title}」`,
      targetType: scheduleType,
      targetId: doc._id
    }
  )

  return shapeSchedule(doc)
}

async function edit({ openid, payload, params }) {
  const roomId = roomIdOf(payload)
  await requireMembership(openid, roomId, 'member')

  const id = payload.id || (params && params[0])
  const item = await getById(COLLECTIONS.schedules, id)
  if (!item || item.roomId !== roomId) throw notFound('日程不存在')

  const patch = { updatedAt: new Date().toISOString() }
  if (payload.title !== undefined) patch.title = requireString(payload.title, '日程标题', { max: 50 })
  if (payload.description !== undefined) patch.description = optionalString(payload.description, 200)
  if (payload.startTime !== undefined) patch.startTime = payload.startTime
  if (payload.endTime !== undefined) patch.endTime = payload.endTime
  if (payload.isAllDay !== undefined) patch.isAllDay = toBool(payload.isAllDay, false)
  if (payload.date !== undefined) patch.date = payload.date

  Object.assign(patch, pickRemindFields(payload))
  if (payload.scheduleType === 'birthday' || payload.birthdayCalendar !== undefined) {
    patch.scheduleType = payload.scheduleType === 'birthday' ? 'birthday' : scheduleTypeOf({ ...item, ...patch })
    Object.assign(patch, pickBirthdayFields(payload))
  }

  // 提醒时间 / 提前量 / 开始时间变化后必须允许重新提醒，否则改完再也不会触发
  const reminderChanged =
    patch.remindTime !== undefined ||
    patch.remindOffsets !== undefined ||
    patch.startTime !== undefined ||
    patch.birthdayMonth !== undefined ||
    patch.birthdayDay !== undefined
  if (reminderChanged) {
    patch.lastRemindKey = ''
    patch.lastRemindSentAt = ''
  }

  await update(COLLECTIONS.schedules, id, patch)
  return shapeSchedule({ ...item, ...patch })
}

async function remove({ openid, payload, query, params }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'member')

  const id = payload.id || query.id || (params && params[0])
  const item = await getById(COLLECTIONS.schedules, id)
  if (!item || item.roomId !== roomId) throw notFound('日程不存在')

  await update(COLLECTIONS.schedules, id, { deleted: true, deletedAt: new Date().toISOString() })
  return { id, deleted: true }
}

/**
 * 消息中心兜底：打开消息页时跑一次到点提醒派发。
 * 定时触发器是主通道，这里保证「触发器没传上去 / 定时没跑到」时也不丢提醒。
 */
async function runDue({ openid }) {
  await requireUser(openid)
  const { generateDue } = require('../lib/reminders')
  return generateDue(new Date(), { maxSchedules: 300 })
}

module.exports = {
  list,
  add,
  update: edit,
  delete: remove,
  runDue
}
