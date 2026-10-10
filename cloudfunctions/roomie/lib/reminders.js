/**
 * 日程 / 生日提醒派发。
 *
 * 背景：之前只有「别人新建日程」时会写一条通知，日程到点本身从来不会提醒，
 * 生日提醒更是完全没有实现。这里补上按时间触发的提醒派发。
 *
 * 由云函数定时触发器 reminderTick 驱动（见 config.json）。
 * 幂等关键：lastRemindKey 记录已派发的「日程 + 提醒日 + 提前量」，
 * 定时任务重复投递也不会重复提醒。
 */

const { COLLECTIONS, listAll, update, _ } = require('./db')
const { pushNotificationMany } = require('./notify')
const { lunarBirthdayInSolarYear } = require('./lunar')

const NOT_DELETED = _.neq(true)
/** 提醒时间过了这么久还没派发就跳过，避免云函数长时间停摆后集中补发。 */
const DUE_WINDOW_MS = 12 * 60 * 60 * 1000

const pad2 = (n) => String(n).padStart(2, '0')

/** 东八区「今天」的 YYYY-MM-DD。 */
function todayInShanghai(now = new Date()) {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`
}

function parseOffsets(value) {
  if (Array.isArray(value)) return value.map(Number).filter((n) => !Number.isNaN(n))
  if (typeof value === 'string' && value) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map(Number).filter((n) => !Number.isNaN(n))
    } catch (error) {
      return []
    }
  }
  return []
}

function normalizeTime(value) {
  const text = String(value || '').trim()
  const m = /^(\d{1,2}):(\d{2})$/.exec(text)
  if (!m) return '09:00'
  const hh = Math.min(23, Math.max(0, Number(m[1])))
  const mm = Math.min(59, Math.max(0, Number(m[2])))
  return `${pad2(hh)}:${pad2(mm)}`
}

/** 'YYYY-MM-DD' 加天数，返回 'YYYY-MM-DD'。 */
function addDays(dateStr, days) {
  const parts = String(dateStr).split('-').map(Number)
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return ''
  const base = Date.UTC(parts[0], parts[1] - 1, parts[2])
  const next = new Date(base + days * 86400000)
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`
}

/** 'YYYY-MM-DD' + 'HH:mm' -> Date（按东八区）。 */
function toDate(dateStr, timeStr) {
  const parts = String(dateStr).split('-').map(Number)
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null
  const hm = normalizeTime(timeStr).split(':').map(Number)
  // 东八区 00:00 对应 UTC 前一天 16:00
  const utcMs = Date.UTC(parts[0], parts[1] - 1, parts[2], hm[0] - 8, hm[1])
  return new Date(utcMs)
}

/**
 * 取某个时间字段落在东八区的哪一天。
 * startTime 在前端是毫秒时间戳（Number），历史数据里也可能是 ISO 字符串，
 * 不能直接对字符串切前 10 位，否则时间戳会被切成乱码日期。
 */
function datePartOf(value) {
  if (value === undefined || value === null || value === '') return ''
  const text = String(value).trim()
  if (/^\d{10,13}$/.test(text)) {
    const shifted = new Date(Number(text) + 8 * 60 * 60 * 1000)
    if (Number.isNaN(shifted.getTime())) return ''
    return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`
  }
  if (text.includes('T') && /(?:Z|[+-]\d{2}:?\d{2})$/.test(text)) {
    const shifted = new Date(new Date(text).getTime() + 8 * 60 * 60 * 1000)
    if (Number.isNaN(shifted.getTime())) return ''
    return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`
  }
  const datePart = text.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : ''
}

/** 这条日程在「基准年」里的生日 / 发生日。 */
function occurrenceDate(schedule, year) {
  if (schedule.scheduleType === 'birthday' || schedule.birthdayCalendar === 'lunar') {
    const month = Number(schedule.birthdayMonth)
    const day = Number(schedule.birthdayDay)
    if (!month || !day) return ''
    if (schedule.birthdayCalendar === 'lunar' || schedule.lunar === 1 || schedule.lunar === true) {
      return lunarBirthdayInSolarYear(year, month, day, !!schedule.birthdayLeapMonth)
    }
    return `${year}-${pad2(month)}-${pad2(day)}`
  }
  return datePartOf(schedule.startTime || schedule.date)
}

/**
 * 列出这条日程全部候选提醒（跨年枚举，生日按年重复）。
 * 返回 [{ key, remindAt, remindDate, offset, occurrence }]
 */
function candidateReminders(schedule, now) {
  const offsets = parseOffsets(schedule.remindOffsets)
  const list = offsets.length ? offsets : [0]
  const time = normalizeTime(schedule.remindTime)
  const isBirthday = schedule.scheduleType === 'birthday' || schedule.birthdayCalendar === 'lunar'
  const currentYear = todayInShanghai(now).slice(0, 4) * 1
  const years = isBirthday ? [currentYear - 1, currentYear, currentYear + 1] : [0]
  const out = []

  for (const year of years) {
    const base = isBirthday ? occurrenceDate(schedule, year) : occurrenceDate(schedule, 0)
    if (!base) continue
    for (const offset of list) {
      const remindDate = addDays(base, offset)
      if (!remindDate) continue
      const remindAt = toDate(remindDate, time)
      if (!remindAt) continue
      out.push({
        key: `${schedule._id}:${remindDate}:${offset}`,
        remindAt,
        remindDate,
        offset,
        occurrence: base
      })
    }
  }
  return out
}

/** 下一条尚未到点的提醒时间（ISO），没有则返回空串。 */
function nextReminderAt(schedule, now = new Date()) {
  if (!schedule || schedule.remindEnabled === false) return ''
  const candidates = candidateReminders(schedule, now)
  const future = candidates
    .filter((item) => item.remindAt.getTime() > now.getTime())
    .sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime())
  return future.length ? future[0].remindAt.toISOString() : ''
}

function buildMessage(schedule, candidate) {
  const isBirthday = schedule.scheduleType === 'birthday' || schedule.birthdayCalendar === 'lunar'
  const title = String(schedule.title || (isBirthday ? '生日' : '日程')).slice(0, 40)
  const offset = Number(candidate.offset) || 0
  const whenText = offset === 0
    ? (isBirthday ? '就是今天' : candidate.remindDate)
    : `还有 ${Math.abs(offset)} 天`

  if (isBirthday) {
    return {
      type: 'birthday_reminder',
      title: '生日提醒',
      body: `${title} 的生日${whenText}（${candidate.occurrence}）`,
      targetType: 'birthday',
      targetDate: candidate.occurrence
    }
  }
  return {
    type: 'schedule_reminder',
    title: '日程提醒',
    body: offset === 0
      ? `今天有日程「${title}」`
      : `「${title}」${whenText}（${candidate.remindDate}）`,
    targetType: 'schedule',
    targetDate: candidate.occurrence
  }
}

/**
 * 扫描全部日程，把「到点且尚未派发」的提醒写成站内通知。
 * @param {Date} now 当前时间（测试时可注入）
 */
async function generateDue(now = new Date(), options = {}) {
  const where = { deleted: NOT_DELETED }
  if (options.roomId) where.roomId = options.roomId
  const rows = await listAll(COLLECTIONS.schedules, where, {
    limit: Math.max(1, Math.min(500, Number(options.maxSchedules) || 300))
  })
  let sent = 0
  const details = []

  for (const schedule of rows) {
    if (schedule.remindEnabled === false) continue
    const candidates = candidateReminders(schedule, now)
    if (!candidates.length) continue

    // 只保留「已经到点、且没过期太久、且没发过」的候选
    const due = candidates.find((item) => {
      const delta = now.getTime() - item.remindAt.getTime()
      if (delta < 0 || delta > DUE_WINDOW_MS) return false
      return schedule.lastRemindKey !== item.key
    })
    if (!due) continue

    const members = await listAll(COLLECTIONS.members, { roomId: schedule.roomId, status: 'active' })
    const userIds = members.map((m) => m.userId).filter(Boolean)
    if (!userIds.length) continue

    const message = buildMessage(schedule, due)
    // actorId 留空：提醒要发给空间里所有人，包括创建者本人
    await pushNotificationMany(userIds, {
      roomId: schedule.roomId,
      actorId: '',
      type: message.type,
      title: message.title,
      body: message.body,
      targetType: message.targetType,
      targetId: schedule._id,
      targetDate: message.targetDate
    })

    await update(COLLECTIONS.schedules, schedule._id, {
      lastRemindKey: due.key,
      lastRemindSentAt: now.toISOString()
    })

    sent += userIds.length
    details.push({ scheduleId: schedule._id, key: due.key, userIds: userIds.length })
  }

  return { scanned: rows.length, sent, details }
}

module.exports = { generateDue, candidateReminders, todayInShanghai, nextReminderAt }
