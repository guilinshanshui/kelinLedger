/**
 * 日期区间工具。
 *
 * 关键约束：云函数运行在 UTC 时区，而用户在北京时间（UTC+8）。
 * 如果直接用 `new Date(...).setHours(0,0,0,0)` 划区间，会得到 UTC 的
 * 0 点～24 点，换算成北京时间就是 08:00～次日 08:00——凌晨记的账会被
 * 漏掉，晚上记的账又可能跑到第二天。
 *
 * 所以这里统一按 UTC+8 口径计算「业务日」的起止，再转成 ISO 字符串；
 * 与 dayKey 的归日规则保持一致，区间查询和按天分组不会再打架。
 */

const CN_OFFSET_MS = 8 * 60 * 60 * 1000

/** 取某个时刻对应的北京时间年 / 月 / 日 / 星期（周一=1）。 */
function cnParts(input = new Date()) {
  const shifted = new Date(new Date(input).getTime() + CN_OFFSET_MS)
  const weekday = shifted.getUTCDay()
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: weekday === 0 ? 7 : weekday
  }
}

/** 北京时间某一天 00:00 对应的真实时刻。 */
function cnDayStart(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day) - CN_OFFSET_MS)
}

/** 北京时间某一天 23:59:59.999 对应的真实时刻。 */
function cnDayEnd(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day + 1) - CN_OFFSET_MS - 1)
}

const iso = (date) => new Date(date).toISOString()

function dayRange(input = new Date()) {
  const { year, month, day } = cnParts(input)
  return { start: iso(cnDayStart(year, month, day)), end: iso(cnDayEnd(year, month, day)) }
}

/** 以周一为一周起点。 */
function weekRange(input = new Date()) {
  const { year, month, day, weekday } = cnParts(input)
  const start = cnDayStart(year, month, day)
  start.setUTCDate(start.getUTCDate() - (weekday - 1))
  const end = new Date(start.getTime())
  end.setUTCDate(end.getUTCDate() + 7)
  return { start: iso(start), end: iso(new Date(end.getTime() - 1)) }
}

function monthRange(year, month) {
  const now = cnParts(new Date())
  const y = Number(year) || now.year
  const m = Number(month) || now.month
  const start = cnDayStart(y, m, 1)
  const end = cnDayStart(y, m + 1, 1)
  return { start: iso(start), end: iso(new Date(end.getTime() - 1)) }
}

function yearRange(year) {
  const y = Number(year) || cnParts(new Date()).year
  return {
    start: iso(cnDayStart(y, 1, 1)),
    end: iso(new Date(cnDayStart(y + 1, 1, 1).getTime() - 1))
  }
}

function rangeOf(input = new Date(), year, month) {
  const parts = cnParts(input)
  return monthRange(
    year === undefined || year === null ? parts.year : year,
    month === undefined || month === null ? parts.month : month
  )
}

/**
 * 把时间戳/ISO 字符串转成「业务日期」YYYY-MM-DD（UTC+8 口径）。
 */
const dayKey = (value) => {
  const { year, month, day } = cnParts(value)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * 列举区间内的每一天（YYYY-MM-DD，与 dayKey 同一口径）。
 * 趋势图需要完整时间轴：没记账的那天也要占位，否则柱子和横轴标签会对不上。
 */
function enumerateDays(startISO, endISO) {
  const days = []
  const startTime = new Date(`${dayKey(startISO)}T00:00:00.000Z`).getTime()
  const endTime = new Date(`${dayKey(endISO)}T00:00:00.000Z`).getTime()
  for (let cursor = startTime; cursor <= endTime; cursor += 86400000) {
    days.push(new Date(cursor).toISOString().slice(0, 10))
  }
  return days
}

module.exports = {
  cnParts,
  cnDayStart,
  cnDayEnd,
  dayRange,
  weekRange,
  monthRange,
  yearRange,
  rangeOf,
  dayKey,
  enumerateDays
}
