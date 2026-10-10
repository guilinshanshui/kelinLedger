/**
 * 农历换算（1900-2100）。
 *
 * 前端 common/utils/lunarDisplay.js 已经有一份公历转农历的实现，但生日提醒要在
 * 云函数里算「今年这个农历生日对应哪一天」，所以后端也需要同一套数据表，
 * 并且要支持反方向（农历月日 -> 公历日期）。
 *
 * 两边数据表必须保持一致，改动其中一份时请同步另一份。
 */

const LUNAR_MONTH_NAMES = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊']
const DAY_NUMS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']

/** 1900-2100 农历数据 */
const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5d0, 0x14573, 0x052d0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056d0,
  0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, 0x14b63, 0x09370,
  0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a654, 0x0ab60, 0x095b0, 0x174d2,
  0x09690, 0x054ae, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x1d558, 0x0b540, 0x0b6a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada8,
  0x04b60, 0x0aae6, 0x0a930, 0x052f2, 0x04970, 0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0,
  0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, 0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4,
  0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, 0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5d0,
  0x14573, 0x052d0, 0x0a9a8, 0x0e950, 0x06aa0, 0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570,
  0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50,
  0x1b255, 0x06d20, 0x0ada0, 0x14b63
]

const MIN_YEAR = 1900
const MAX_YEAR = 2100
const BASE_DATE = Date.UTC(1900, 0, 31)

function leapMonth(year) {
  return LUNAR_INFO[year - MIN_YEAR] & 0xf
}

function leapDays(year) {
  if (leapMonth(year)) {
    return LUNAR_INFO[year - MIN_YEAR] & 0x10000 ? 30 : 29
  }
  return 0
}

function monthDays(year, month) {
  return LUNAR_INFO[year - MIN_YEAR] & (0x10000 >> month) ? 30 : 29
}

function lunarYearDays(year) {
  let sum = 348
  for (let i = 0x8000; i > 0x8; i >>= 1) {
    sum += LUNAR_INFO[year - MIN_YEAR] & i ? 1 : 0
  }
  return sum + leapDays(year)
}

/** 公历 -> 农历。越界或非法输入返回 null。 */
function solarToLunar(year, month, day) {
  if (year < MIN_YEAR || year > MAX_YEAR) return null
  const target = Date.UTC(year, month - 1, day)
  let offset = Math.floor((target - BASE_DATE) / 86400000)
  if (offset < 0) return null

  let i
  let temp = 0
  for (i = MIN_YEAR; i < MAX_YEAR + 1 && offset > 0; i++) {
    temp = lunarYearDays(i)
    offset -= temp
  }
  if (offset < 0) {
    offset += temp
    i--
  }

  const lunarYear = i
  const leap = leapMonth(i)
  let isLeap = false

  let j
  for (j = 1; j < 13 && offset > 0; j++) {
    if (leap > 0 && j === leap + 1 && !isLeap) {
      j--
      isLeap = true
      temp = leapDays(i)
    } else {
      temp = monthDays(i, j)
    }
    if (isLeap && j === leap + 1) isLeap = false
    offset -= temp
  }

  if (offset === 0 && leap > 0 && j === leap + 1) {
    if (isLeap) {
      isLeap = false
    } else {
      isLeap = true
      j--
    }
  }
  if (offset < 0) {
    offset += temp
    j--
  }

  return { year: lunarYear, month: j, day: offset + 1, isLeap }
}

/**
 * 农历 -> 公历。
 * lunarYear 用农历年，month/day 是月日，isLeap 表示是否为闰月。
 */
function lunarToSolar(lunarYear, month, day, isLeap = false) {
  if (lunarYear < MIN_YEAR || lunarYear >= MAX_YEAR) return null
  const m = Number(month)
  const d = Number(day)
  if (!m || !d || m < 1 || m > 12 || d < 1 || d > 30) return null

  let offset = 0
  for (let y = MIN_YEAR; y < lunarYear; y++) offset += lunarYearDays(y)

  const leap = leapMonth(lunarYear)
  let placed = false
  for (let i = 1; i <= 12; i++) {
    if (leap > 0 && i === leap + 1 && !placed) {
      // 闰月插在原月之后
      if (isLeap && m === leap) {
        offset += d - 1
        return new Date(BASE_DATE + offset * 86400000)
      }
      offset += leapDays(lunarYear)
      placed = true
      i--
      continue
    }
    if (i === m) {
      if (isLeap && leap !== m) return null
      offset += d - 1
      return new Date(BASE_DATE + offset * 86400000)
    }
    offset += monthDays(lunarYear, i)
  }
  return null
}

function formatYmd(date) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 农历生日在指定公历年份里的公历日期（YYYY-MM-DD）。
 * 农历年与公历年有偏移，闰月/正月可能落在目标年前后，所以同时尝试 lunarYear 与 lunarYear-1。
 */
function lunarBirthdayInSolarYear(solarYear, month, day, isLeap = false) {
  for (const ly of [solarYear - 1, solarYear, solarYear + 1]) {
    const solar = lunarToSolar(ly, month, day, isLeap)
    if (!solar) continue
    if (solar.getUTCFullYear() === solarYear) return formatYmd(solar)
  }
  return ''
}

module.exports = {
  LUNAR_MONTH_NAMES,
  DAY_NUMS,
  solarToLunar,
  lunarToSolar,
  lunarBirthdayInSolarYear,
  formatYmd
}
