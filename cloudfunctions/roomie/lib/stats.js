const { COLLECTIONS, listAll, _ } = require('./db')
const { badRequest } = require('./errors')
const { toYuan } = require('./money')
const { monthRange, yearRange, dayKey } = require('./dates')

/**
 * 统计分析。
 *
 * 四种查询范围全部在服务端生效，不是前端过滤：
 *   month  自然月   指定年 + 月
 *   year   自然年   指定年
 *   all    全部     该账本有史以来
 *   custom 自定义   指定起止日期，跨度上限 12 个月
 *
 * 聚合粒度随范围自适应：跨度 ≤ 62 天按天，否则按月。
 */

const MAX_CUSTOM_DAYS = 366

function startOfDayIso(value) {
  const d = new Date(value)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function endOfDayIso(value) {
  const d = new Date(value)
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

const daysBetween = (start, end) =>
  Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000)

/**
 * 把四种 rangeType 归一化成 { type, label, start, end }。
 * 自定义范围做 12 个月上限校验，避免一次拉爆全表。
 */
function normalizeRange(input = {}) {
  const now = new Date()
  const rangeType = ['month', 'year', 'all', 'custom'].includes(input.rangeType)
    ? input.rangeType
    : 'month'

  if (rangeType === 'month') {
    const year = Number(input.year) || now.getFullYear()
    const month = Number(input.month) || now.getMonth() + 1
    const range = monthRange(year, month)
    return { type: 'month', year, month, label: `${year} 年 ${month} 月`, ...range }
  }

  if (rangeType === 'year') {
    const year = Number(input.year) || now.getFullYear()
    const range = yearRange(year)
    return { type: 'year', year, label: `${year} 年`, ...range }
  }

  if (rangeType === 'all') {
    return { type: 'all', label: '全部', start: '', end: '' }
  }

  // 自定义
  if (!input.startDate || !input.endDate) {
    throw badRequest('自定义范围需要同时提供开始与结束日期')
  }
  const start = startOfDayIso(input.startDate)
  const end = endOfDayIso(input.endDate)
  if (start > end) throw badRequest('开始日期不能晚于结束日期')
  const span = daysBetween(start, end)
  if (span > MAX_CUSTOM_DAYS) throw badRequest('自定义查询区间最大跨度为 12 个月')

  const fmt = (value) => dayKey(value)
  return { type: 'custom', label: `${fmt(start)} 至 ${fmt(end)}`, start, end }
}

/** 根据跨度选择聚合粒度。 */
function pickGranularity(range, entryCount) {
  if (range.type === 'month') return 'day'
  if (range.type === 'year') return 'month'
  if (range.type === 'custom') {
    return daysBetween(range.start, range.end) <= 62 ? 'day' : 'month'
  }
  // 全部：条目少按天，否则按月
  return entryCount > 0 && entryCount < 60 ? 'day' : 'month'
}

function bucketKey(iso, granularity) {
  return granularity === 'day' ? dayKey(iso) : String(iso).slice(0, 7)
}

/**
 * 生成区间内完整的桶序列。
 * 关键：时间轴间隔必须与数据粒度一致，不能只画有数据的时段，
 * 否则间隔两个月的两根柱子会被画成相邻，误导趋势判断。
 */
function buildBuckets(range, granularity, entries) {
  const keys = []

  let start = range.start
  let end = range.end
  if (range.type === 'all') {
    if (!entries.length) return keys
    const times = entries.map((item) => item.occurredAt || item.createdAt).sort()
    start = times[0]
    end = times[times.length - 1]
  }
  if (!start || !end) return keys

  if (granularity === 'day') {
    const cursor = new Date(start)
    cursor.setHours(0, 0, 0, 0)
    const last = new Date(end)
    while (cursor <= last) {
      keys.push(dayKey(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    return keys
  }

  const cursor = new Date(start)
  cursor.setDate(1)
  cursor.setHours(0, 0, 0, 0)
  const last = new Date(end)
  while (cursor <= last) {
    keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`)
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return keys
}

/** 聚合分类支出 / 收入排行。 */
function aggregateCategories(entries, type) {
  const map = new Map()
  entries
    .filter((item) => item.type === type)
    .forEach((item) => {
      const key = item.categoryId || `uncat_${type}`
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name: item.categoryName || '未分类',
    icon: item.categoryIcon || 'mc:puzzled',
          amountMinor: 0,
          count: 0
        })
      }
      const bucket = map.get(key)
      bucket.amountMinor += item.amountMinor || 0
      bucket.count += 1
    })

  const total = Array.from(map.values()).reduce((sum, item) => sum + item.amountMinor, 0)

  return Array.from(map.values())
    .map((item) => ({
      id: item.id,
      name: item.name,
      icon: item.icon,
      amount: toYuan(item.amountMinor),
      count: item.count,
      percent: total ? Math.round((item.amountMinor / total) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.amount - a.amount)
}

/** 按成员聚合，用于「谁花得多」。 */
async function aggregateMembers(roomId, entries) {
  const members = await listAll(COLLECTIONS.members, { roomId, status: 'active' })
  const nameOf = new Map(members.map((item) => [item.userId, item.nickname || '成员']))

  const map = new Map()
  entries.forEach((item) => {
    const key = item.userId || 'unknown'
    if (!map.has(key)) {
      map.set(key, { userId: key, nickname: nameOf.get(key) || '成员', expenseMinor: 0, incomeMinor: 0 })
    }
    const bucket = map.get(key)
    if (item.type === 'expense') bucket.expenseMinor += item.amountMinor || 0
    if (item.type === 'income') bucket.incomeMinor += item.amountMinor || 0
  })

  return Array.from(map.values())
    .map((item) => ({
      userId: item.userId,
      nickname: item.nickname,
      expense: toYuan(item.expenseMinor),
      income: toYuan(item.incomeMinor)
    }))
    .sort((a, b) => b.expense - a.expense)
}

/** 环比：取上一个等长周期做对比。 */
async function previousPeriod(roomId, range) {
  if (range.type === 'all' || range.type === 'custom') return null

  let start
  let end
  if (range.type === 'month') {
    const y = range.month === 1 ? range.year - 1 : range.year
    const m = range.month === 1 ? 12 : range.month - 1
    ;({ start, end } = monthRange(y, m))
  } else {
    ;({ start, end } = yearRange(range.year - 1))
  }

  const entries = await listAll(COLLECTIONS.ledgers, {
    roomId,
    deleted: _.neq(true),
    occurredAt: _.gte(start).and(_.lte(end))
  })

  const sum = (type) =>
    entries.filter((item) => item.type === type).reduce((s, item) => s + (item.amountMinor || 0), 0)

  return {
    label: range.type === 'month' ? '上月' : '去年',
    expense: toYuan(sum('expense')),
    income: toYuan(sum('income'))
  }
}

/**
 * 主入口：返回某一范围的完整统计。
 */
async function stats(roomId, input = {}) {
  const range = normalizeRange(input)

  const where = { roomId, deleted: _.neq(true) }
  if (range.start && range.end) {
    where.occurredAt = _.gte(range.start).and(_.lte(range.end))
  }

  const entries = await listAll(COLLECTIONS.ledgers, where, { orderBy: 'occurredAt', order: 'asc' })

  const sumOf = (type) =>
    entries.filter((item) => item.type === type).reduce((s, item) => s + (item.amountMinor || 0), 0)

  const expenseMinor = sumOf('expense')
  const incomeMinor = sumOf('income')

  // 无数据时明确区分「区间内确实没有账单」，前端据此显示空态而不是全 0 图表
  const granularity = pickGranularity(range, entries.length)

  const trendMap = new Map()
  entries.forEach((item) => {
    const key = bucketKey(item.occurredAt || item.createdAt, granularity)
    if (!trendMap.has(key)) trendMap.set(key, { label: key, incomeMinor: 0, expenseMinor: 0 })
    const bucket = trendMap.get(key)
    if (item.type === 'income') bucket.incomeMinor += item.amountMinor || 0
    if (item.type === 'expense') bucket.expenseMinor += item.amountMinor || 0
  })

  // 按完整桶序列输出：没有账单的时段给 null，前端画空位而不是 0 柱
  const bucketKeys = buildBuckets(range, granularity, entries)
  const trend = bucketKeys.map((key) => {
    const bucket = trendMap.get(key)
    const label = granularity === 'day' ? key.slice(5).replace('-', '/') : key
    if (!bucket) {
      // empty 明确表示该时段没有任何账单，与「收支刚好为 0」区分
      return { label, raw: key, income: null, expense: null, balance: null, empty: true }
    }
    return {
      label,
      raw: key,
      income: toYuan(bucket.incomeMinor),
      expense: toYuan(bucket.expenseMinor),
      balance: toYuan(bucket.incomeMinor - bucket.expenseMinor),
      empty: false
    }
  })

  const [expenseCategories, incomeCategories, memberStats, compare] = await Promise.all([
    Promise.resolve(aggregateCategories(entries, 'expense')),
    Promise.resolve(aggregateCategories(entries, 'income')),
    aggregateMembers(roomId, entries),
    previousPeriod(roomId, range)
  ])

  const days =
    range.start && range.end ? Math.max(1, daysBetween(range.start, range.end) + 1) : null

  return {
    range: {
      type: range.type,
      label: range.label,
      start: range.start,
      end: range.end,
      year: range.year || null,
      month: range.month || null
    },
    granularity,
    summary: {
      expense: toYuan(expenseMinor),
      income: toYuan(incomeMinor),
      balance: toYuan(incomeMinor - expenseMinor),
      count: entries.length,
      // 日均支出给「全部」这类长区间一个可比较的口径
      avgExpense: days ? toYuan(Math.round(expenseMinor / days)) : null,
      days
    },
    trend,
    expenseCategories,
    incomeCategories,
    members: memberStats,
    compare,
    isEmpty: entries.length === 0
  }
}

module.exports = { stats, normalizeRange, MAX_CUSTOM_DAYS }
