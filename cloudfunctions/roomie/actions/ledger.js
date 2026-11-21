const {
  COLLECTIONS,
  insert,
  update,
  getById,
  listAll,
  page: pageQuery,
  _
} = require('../lib/db')
const { nextId } = require('../lib/id')
const { requireMembership } = require('../lib/context')
const { badRequest, notFound } = require('../lib/errors')
const { toMinor, toYuan } = require('../lib/money')
const { dayRange, weekRange, monthRange, yearRange, dayKey, cnDayStart, cnDayEnd } = require('../lib/dates')
const { optionalString, requireOneOf, toInt } = require('../lib/validate')
const { publishFeed, FEED_TYPES } = require('../lib/activity')
const ledgerImport = require('./ledgerImport')
const accounts = require('../lib/accounts')
const budget = require('../lib/budget')
const settlement = require('../lib/settlement')
const recurring = require('../lib/recurring')
const statsLib = require('../lib/stats')
const membership = require('../lib/membership')

const TYPES = ['expense', 'income', 'transfer']
const NOT_DELETED = _.neq(true)

const roomIdOf = (payload = {}, query = {}) => payload.roomId || query.roomId

function shapeEntry(entry, memberMap = null) {
  const member = memberMap && entry.userId ? memberMap.get(String(entry.userId)) : null
  const occurredAt = entry.occurredAt || entry.createdAt
  return {
    id: entry._id,
    roomId: entry.roomId,
    userId: entry.userId,
    type: entry.type,
    amount: toYuan(entry.amountMinor || 0),
    amountMinor: entry.amountMinor || 0,
    categoryId: entry.categoryId || '',
    categoryName: entry.categoryName || '',
    categoryIcon: entry.categoryIcon || '',
    accountId: entry.accountId || '',
    accountName: entry.accountName || '',
    toAccountId: entry.toAccountId || '',
    toAccountName: entry.toAccountName || '',
    participants: entry.participants || [],
    payMethodId: entry.payMethodId || '',
    payMethodName: entry.payMethodName || '',
    note: entry.note || '',
    merchant: entry.merchant || '',
    taskId: entry.taskId || '',
    listId: entry.listId || '',
    occurredAt,
    entryTime: occurredAt,
    date: dayKey(occurredAt),
    source: entry.source || 'manual',
    createdBy: entry.userId,
    creatorNickname: (member && member.nickname) || entry.creatorNickname || '',
    creatorAvatar: (member && member.avatar) || entry.creatorAvatar || '',
    createTime: entry.createdAt,
    updateTime: entry.updatedAt
  }
}

async function getMemberMap(roomId) {
  if (!roomId) return new Map()
  try {
    const members = await membership.listMembers(roomId)
    return new Map(members.map((m) => [String(m.userId), m]))
  } catch (e) {
    return new Map()
  }
}

async function resolveCategory(roomId, categoryId) {
  if (!categoryId) return null
  const category = await getById(COLLECTIONS.categories, categoryId)
  if (!category || category.roomId !== roomId) return null
  return category
}

async function resolvePayMethod(roomId, payMethodId) {
  if (!payMethodId) return null
  const method = await getById(COLLECTIONS.payMethods, payMethodId)
  if (!method || method.roomId !== roomId) return null
  return method
}

async function resolveDefaultOrAccount(roomId, accountId) {
  const raw = accountId === undefined || accountId === null ? '' : String(accountId).trim()
  const id = raw && raw !== '0' && raw !== 'undefined' && raw !== 'null' ? raw : ''
  if (id) return accounts.requireAccount(roomId, id)
  const all = await listAll(
    COLLECTIONS.accounts,
    { roomId, status: _.neq('deleted') },
    { orderBy: 'sort', order: 'asc' }
  )
  return all[0] || null
}

/** 新增流水。 */
async function add({ openid, payload }) {
  const roomId = roomIdOf(payload)
  const { user } = await requireMembership(openid, roomId, 'member')

  const type = requireOneOf(payload.type || 'expense', TYPES, '收支类型')
  const amountMinor = toMinor(payload.amount)
  if (amountMinor <= 0) throw badRequest('金额必须大于 0')

  const [category, payMethod, memberMap] = await Promise.all([
    resolveCategory(roomId, payload.categoryId),
    resolvePayMethod(roomId, payload.payMethodId),
    getMemberMap(roomId)
  ])
  const now = new Date().toISOString()

  // 账户：记账必须能让余额对得上，支出从账户扣、收入进账户、转账两边动
  const account = await resolveDefaultOrAccount(roomId, payload.accountId)
  const toAccount =
    type === 'transfer' ? await accounts.requireAccount(roomId, payload.toAccountId) : null
  if (!account) throw badRequest('请选择入账账户')
  if (type === 'transfer' && !toAccount) throw badRequest('转账需要选择转入账户')
  if (type === 'transfer' && account && toAccount && account._id === toAccount._id) {
    throw badRequest('转出与转入账户不能相同')
  }

  const requestedUserId = payload.userId || payload.handlerId || ''
  const targetMember = (requestedUserId && memberMap.get(String(requestedUserId))) || memberMap.get(String(user.id)) || null
  const entryUserId = targetMember ? targetMember.userId : user.id
  const creatorNickname = (targetMember && targetMember.nickname) || user.nickname || ''
  const creatorAvatar = (targetMember && targetMember.avatar) || user.avatar || ''

  const entry = {
    _id: nextId('led'),
    roomId,
    userId: entryUserId,
    creatorNickname,
    creatorAvatar,
    type,
    amountMinor,
    categoryId: category ? category._id : '',
    categoryName: category ? category.name : optionalString(payload.categoryName, 30),
    categoryIcon: category ? category.icon : '',
    accountId: account ? account._id : '',
    accountName: account ? account.name : '',
    toAccountId: toAccount ? toAccount._id : '',
    toAccountName: toAccount ? toAccount.name : '',
    participants: Array.isArray(payload.participants) ? payload.participants : [],
    payMethodId: payMethod ? payMethod._id : '',
    payMethodName: payMethod ? payMethod.name : optionalString(payload.payMethodName, 30),
    note: optionalString(payload.note || payload.remark, 200),
    merchant: optionalString(payload.merchant, 60),
    merchantKey: optionalString(payload.merchantKey, 60),
    taskId: optionalString(payload.taskId, 60),
    listId: optionalString(payload.listId, 60),
    occurredAt: payload.occurredAt || payload.date || now,
    source: 'manual',
    deleted: false,
    createdAt: now,
    updatedAt: now
  }

  await insert(COLLECTIONS.ledgers, entry)

  // 落库后同步账户余额
  await accounts.applyDeltas(roomId, entry)

  // 动态文案不带昵称前缀（动态卡片本身已展示作者），改成「做了什么 + 金额 + 类目/备注」，
  // 让协作成员一眼看清这笔账，而不是只有一句模糊的"记录了一笔支出"。
  const amountText = toYuan(amountMinor)
  const amountLabel = type === 'income' ? '收入' : type === 'transfer' ? '转账' : '支出'
  const detailParts = []
  if (type === 'transfer' && account && toAccount) {
    detailParts.push(`${account.name} → ${toAccount.name}`)
  } else if (entry.categoryName) {
    detailParts.push(entry.categoryName)
  }
  if (entry.note) detailParts.push(entry.note)
  else if (entry.merchant) detailParts.push(entry.merchant)
  const feedContent = detailParts.length
    ? `记录了${amountLabel} ¥${amountText} · ${detailParts.join(' · ')}`
    : `记录了${amountLabel} ¥${amountText}`

  await publishFeed({
    roomId,
    userId: entryUserId,
    type: FEED_TYPES.LEDGER_ADD,
    content: feedContent,
    refType: 'ledger',
    refId: entry._id,
    meta: {
      amount: amountText,
      type,
      categoryName: entry.categoryName || '',
      note: entry.note || '',
      merchant: entry.merchant || ''
    }
  })

  return shapeEntry(entry, memberMap)
}

async function detail({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  const { user, member } = await requireMembership(openid, roomId, 'viewer')
  const id = payload.id || query.id
  const [entry, memberMap] = await Promise.all([
    getById(COLLECTIONS.ledgers, id),
    getMemberMap(roomId)
  ])
  if (!entry || entry.roomId !== roomId) throw notFound('流水不存在')

  // 只有创建者本人和 owner/admin 能改删，其他人进详情页只是只读浏览。
  // 权限由服务端判定后下发给前端，前端只负责展示，不做可信校验。
  const canOperate = entry.userId === user.id || ['owner', 'admin'].includes(member.role)
  return { ...shapeEntry(entry, memberMap), canEdit: canOperate, canDelete: canOperate }
}

async function edit({ openid, payload }) {
  const roomId = roomIdOf(payload)
  const { user, member } = await requireMembership(openid, roomId, 'member')
  const id = payload.id
  const [entry, memberMap] = await Promise.all([
    getById(COLLECTIONS.ledgers, id),
    getMemberMap(roomId)
  ])
  if (!entry || entry.roomId !== roomId) throw notFound('流水不存在')
  if (entry.userId !== user.id && !['owner', 'admin'].includes(member.role)) {
    throw badRequest('只能修改自己记录的流水')
  }

  const patch = { updatedAt: new Date().toISOString() }
  if (payload.amount !== undefined) {
    const minor = toMinor(payload.amount)
    if (minor <= 0) throw badRequest('金额必须大于 0')
    patch.amountMinor = minor
  }
  if (payload.type !== undefined) patch.type = requireOneOf(payload.type, TYPES, '收支类型')
  if (payload.note !== undefined || payload.remark !== undefined) {
    patch.note = optionalString(payload.note === undefined || payload.note === null ? payload.remark : payload.note, 200)
  }
  if (payload.occurredAt !== undefined || payload.date !== undefined) {
    patch.occurredAt = payload.occurredAt || payload.date
  }
  if (payload.categoryId !== undefined) {
    const category = await resolveCategory(roomId, payload.categoryId)
    patch.categoryId = category ? category._id : ''
    patch.categoryName = category ? category.name : ''
    patch.categoryIcon = category ? category.icon : ''
  }
  if (payload.payMethodId !== undefined) {
    const method = await resolvePayMethod(roomId, payload.payMethodId)
    patch.payMethodId = method ? method._id : ''
    patch.payMethodName = method ? method.name : ''
  }

  if (payload.accountId !== undefined) {
    const account = await resolveDefaultOrAccount(roomId, payload.accountId)
    patch.accountId = account ? account._id : ''
    patch.accountName = account ? account.name : ''
  }
  if (payload.toAccountId !== undefined) {
    const toAccount = await accounts.requireAccount(roomId, payload.toAccountId)
    patch.toAccountId = toAccount ? toAccount._id : ''
    patch.toAccountName = toAccount ? toAccount.name : ''
  }
  if (payload.participants !== undefined) {
    patch.participants = Array.isArray(payload.participants) ? payload.participants : []
  }
  if (payload.taskId !== undefined) {
    patch.taskId = optionalString(payload.taskId, 60)
  }
  if (payload.listId !== undefined) {
    patch.listId = optionalString(payload.listId, 60)
  }
  if (payload.userId !== undefined || payload.handlerId !== undefined) {
    const reqUid = payload.userId || payload.handlerId
    const targetMember = reqUid && memberMap.get(String(reqUid))
    if (targetMember) {
      patch.userId = targetMember.userId
      patch.creatorNickname = targetMember.nickname || ''
      patch.creatorAvatar = targetMember.avatar || ''
    }
  }

  await update(COLLECTIONS.ledgers, id, patch)

  // 金额、类型、账户任一变化都要重算余额：先冲销旧值，再记新值
  const nextEntry = { ...entry, ...patch }
  await accounts.reapplyDeltas(roomId, entry, nextEntry)

  return shapeEntry(nextEntry, memberMap)
}

async function remove({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  const { user, member } = await requireMembership(openid, roomId, 'member')
  const id = payload.id || query.id
  const entry = await getById(COLLECTIONS.ledgers, id)
  if (!entry || entry.roomId !== roomId) throw notFound('流水不存在')
  if (entry.userId !== user.id && !['owner', 'admin'].includes(member.role)) {
    throw badRequest('只能删除自己记录的流水')
  }

  await update(COLLECTIONS.ledgers, id, { deleted: true, deletedAt: new Date().toISOString() })

  // 删除流水必须把对应的余额影响回滚，否则账户余额会虚高/虚低
  await accounts.applyDeltas(roomId, entry, -1)

  return { id, deleted: true }
}

function normalizeBoundStart(val) {
  if (!val) return ''
  const str = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number)
    return cnDayStart(y, m, d).toISOString()
  }
  return str
}

function normalizeBoundEnd(val) {
  if (!val) return ''
  const str = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number)
    return cnDayEnd(y, m, d).toISOString()
  }
  return str
}

/** 通用列表：按区间 + 类型 + 分类过滤，支持分页。 */
async function list({ openid, payload = {}, query = {} }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'viewer')

  const type = payload.type || query.type
  const categoryId = payload.categoryId || query.categoryId
  const taskId = payload.taskId || query.taskId || payload.linkTaskId || query.linkTaskId
  const startDate = normalizeBoundStart(payload.startDate || query.startDate)
  const endDate = normalizeBoundEnd(payload.endDate || query.endDate)

  const where = { roomId, deleted: NOT_DELETED }
  if (type && type !== 'all') where.type = type
  if (categoryId) where.categoryId = categoryId
  if (taskId) where.taskId = taskId
  if (startDate && endDate) {
    where.occurredAt = _.gte(startDate).and(_.lte(endDate))
  }

  const [result, memberMap] = await Promise.all([
    pageQuery(COLLECTIONS.ledgers, where, {
      page: toInt(payload.page || query.page, 1),
      pageSize: toInt(payload.pageSize || query.pageSize, 20),
      orderBy: 'occurredAt',
      order: 'desc'
    }),
    getMemberMap(roomId)
  ])

  return { ...result, list: result.list.map((entry) => shapeEntry(entry, memberMap)) }
}

/** 区间明细 + 汇总，week/today/month/year 共用。 */
async function rangeView(openid, roomId, range, accountId = '', taskId = '') {
  const { user, member } = await requireMembership(openid, roomId, 'viewer')
  const [rows, memberMap] = await Promise.all([
    listAll(
      COLLECTIONS.ledgers,
      { roomId, deleted: NOT_DELETED, occurredAt: _.gte(range.start).and(_.lte(range.end)) },
      { orderBy: 'occurredAt', order: 'desc' }
    ),
    getMemberMap(roomId)
  ])

  // 从资产页点单个账户进来时，只该看到这个账户相关的流水（转出算一次、转入也算）
  let entries = accountId
    ? rows.filter((item) => item.accountId === accountId || item.toAccountId === accountId)
    : rows
  if (taskId) {
    entries = entries.filter((item) => String(item.taskId || '') === String(taskId))
  }

  const shaped = entries.map((entry) => shapeEntry(entry, memberMap))
  const summary = summarize(entries)
  const groups = groupByDay(shaped)
  return {
    list: shaped,
    summary,
    groups,
    total_income: summary.totalIncome,
    total_expense: summary.totalExpense,
    ledgers: shaped,
    days: groups,
    weeks: groups,
    months: groups,
    accountId,
    currentUserId: user.id,
    currentUserRole: member.role,
    canWrite: member.role !== 'viewer',
    canManage: ['owner', 'admin'].includes(member.role)
  }
}

function summarize(entries) {
  const expense = entries.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amountMinor, 0)
  const income = entries.filter((e) => e.type === 'income').reduce((s, e) => s + e.amountMinor, 0)
  return {
    totalExpense: toYuan(expense),
    totalIncome: toYuan(income),
    balance: toYuan(income - expense),
    count: entries.length
  }
}

function groupByDay(entries) {
  const map = new Map()
  entries.forEach((entry) => {
    const key = entry.date
    if (!map.has(key)) map.set(key, { date: key, list: [], expense: 0, income: 0 })
    const bucket = map.get(key)
    bucket.list.push(entry)
    if (entry.type === 'expense') bucket.expense += entry.amountMinor
    if (entry.type === 'income') bucket.income += entry.amountMinor
  })
  return Array.from(map.values()).map((bucket) => ({
    ...bucket,
    expense: toYuan(bucket.expense),
    income: toYuan(bucket.income)
  }))
}

const accountIdOf = (payload = {}, query = {}) => {
  const raw = payload.accountId || query.accountId || ''
  return raw && String(raw) !== '0' && String(raw) !== 'undefined' && String(raw) !== 'null' ? String(raw) : ''
}
const taskIdOf = (payload = {}, query = {}) =>
  payload.taskId || query.taskId || payload.linkTaskId || query.linkTaskId || ''

const week = ({ openid, payload = {}, query = {} }) =>
  rangeView(
    openid,
    roomIdOf(payload, query),
    weekRange(payload.date || query.date),
    accountIdOf(payload, query),
    taskIdOf(payload, query)
  )
const today = ({ openid, payload = {}, query = {} }) =>
  rangeView(
    openid,
    roomIdOf(payload, query),
    dayRange(payload.date || query.date),
    accountIdOf(payload, query),
    taskIdOf(payload, query)
  )
const month = ({ openid, payload = {}, query = {} }) =>
  rangeView(
    openid,
    roomIdOf(payload, query),
    monthRange(payload.year || query.year, payload.month || query.month),
    accountIdOf(payload, query),
    taskIdOf(payload, query)
  )
/**
 * 自定义区间：起止日期都按北京时间整天算（含结束日当天到 23:59:59.999）。
 * 前端传的是 YYYY-MM-DD。
 */
const customRange = ({ openid, payload = {}, query = {} }) => {
  const startDate = payload.startDate || query.startDate
  const endDate = payload.endDate || query.endDate
  if (!startDate || !endDate) throw badRequest('请选择起止日期')
  if (String(startDate) > String(endDate)) throw badRequest('开始日期不能晚于结束日期')

  const [sy, sm, sd] = String(startDate).split('-').map(Number)
  const [ey, em, ed] = String(endDate).split('-').map(Number)
  if (!sy || !sm || !sd || !ey || !em || !ed) throw badRequest('日期格式不正确')

  return rangeView(
    openid,
    roomIdOf(payload, query),
    { start: cnDayStart(sy, sm, sd).toISOString(), end: cnDayEnd(ey, em, ed).toISOString() },
    accountIdOf(payload, query),
    taskIdOf(payload, query)
  )
}

const year = ({ openid, payload = {}, query = {} }) =>
  rangeView(
    openid,
    roomIdOf(payload, query),
    yearRange(payload.year || query.year),
    accountIdOf(payload, query),
    taskIdOf(payload, query)
  )

/** 分类列表。 */
async function categoryList({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'viewer')

  // GET 参数落在 query，POST 落在 payload（见 common/utils/request.ts）。
  // 两个来源都要读，否则 type 过滤会静默失效，三个维度返回同一份数据。
  const type = payload.type || query.type

  // type=transfer 在前端语义里表示「支付方式」
  if (type === 'transfer') {
    const methods = await listAll(COLLECTIONS.payMethods, { roomId }, { orderBy: 'sort', order: 'asc' })
    return methods.map((item) => ({ id: item._id, name: item.name, icon: item.icon, type: 'transfer' }))
  }

  const where = { roomId }
  if (type) where.type = type
  const rows = await listAll(COLLECTIONS.categories, where, { orderBy: 'sort', order: 'asc' })
  return rows.map((item) => ({
    id: item._id,
    name: item.name,
    icon: item.icon,
    type: item.type,
    sort: item.sort,
    system: !!item.system
  }))
}

/** 分类树：前端账单导入改分类用，按 income/expense 分组。 */
async function categoryTree({ openid, payload = {}, query = {} }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'viewer')
  const rows = await listAll(COLLECTIONS.categories, { roomId }, { orderBy: 'sort', order: 'asc' })

  const type = payload.type || query.type
  const filtered = type ? rows.filter((item) => item.type === type) : rows

  const groups = new Map()
  filtered.forEach((item) => {
    if (!groups.has(item.type)) {
      groups.set(item.type, {
        type: item.type,
        label: item.type === 'income' ? '收入' : '支出',
        children: []
      })
    }
    groups.get(item.type).children.push({
      id: item._id,
      name: item.name,
      icon: item.icon
    })
  })

  return Array.from(groups.values())
}

/** 记账卡片汇总。 */
async function summary({ openid, payload = {}, query = {} }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'viewer')

  const startDate = normalizeBoundStart(payload.startDate || query.startDate)
  const endDate = normalizeBoundEnd(payload.endDate || query.endDate)
  const year = payload.year || query.year
  const month = payload.month || query.month

  const range = startDate && endDate
    ? { start: startDate, end: endDate }
    : monthRange(year, month)

  const todayBounds = dayRange()

  const [entries, todayEntries, room, accountsList, memberMap] = await Promise.all([
    listAll(
      COLLECTIONS.ledgers,
      { roomId, deleted: NOT_DELETED, occurredAt: _.gte(range.start).and(_.lte(range.end)) }
    ),
    listAll(
      COLLECTIONS.ledgers,
      { roomId, deleted: NOT_DELETED, occurredAt: _.gte(todayBounds.start).and(_.lte(todayBounds.end)) }
    ),
    getById(COLLECTIONS.rooms, roomId),
    accounts.listAccounts(roomId),
    getMemberMap(roomId)
  ])

  const monthSum = summarize(entries)
  const todaySum = summarize(todayEntries)

  const netWorthMinor = accountsList
    .filter((item) => item.includeInNetWorth)
    .reduce((sum, item) => sum + (item.balanceMinor || 0), 0)
  const netAmount = toYuan(netWorthMinor)

  const roomBudgetMinor = room && typeof room.budgetMinor === 'number' ? room.budgetMinor : 0
  const budgetYuan = roomBudgetMinor > 0 ? toYuan(roomBudgetMinor) : 3000

  // 本月最大开支分类
  const catTotals = new Map()
  entries
    .filter((e) => e.type === 'expense')
    .forEach((e) => {
      const name = e.categoryName || '其他'
      catTotals.set(name, (catTotals.get(name) || 0) + (e.amountMinor || 0))
    })
  let maxCategory = ''
  let maxCatMinor = 0
  catTotals.forEach((minor, name) => {
    if (minor > maxCatMinor) {
      maxCatMinor = minor
      maxCategory = name
    }
  })

  // 本月贡献（按收支贡献总额计算占比）
  const userTotals = new Map()
  let totalContribMinor = 0
  entries
    .filter((e) => e.type === 'expense' || e.type === 'income')
    .forEach((e) => {
      const uid = String(e.userId || '')
      if (!uid) return
      const minor = e.amountMinor || 0
      userTotals.set(uid, (userTotals.get(uid) || 0) + minor)
      totalContribMinor += minor
    })
  let topContributor = null
  if (totalContribMinor > 0) {
    let topUid = ''
    let topMinor = 0
    userTotals.forEach((minor, uid) => {
      if (minor > topMinor) {
        topMinor = minor
        topUid = uid
      }
    })
    if (topUid) {
      const m = memberMap.get(topUid)
      const entryFallback = entries.find((e) => String(e.userId) === topUid)
      topContributor = {
        userId: topUid,
        nickname: (m && m.nickname) || (entryFallback && entryFallback.creatorNickname) || '家庭成员',
        pct: Math.round((topMinor / totalContribMinor) * 100)
      }
    }
  }

  return {
    ...monthSum,
    range,
    total_income: monthSum.totalIncome,
    total_expense: monthSum.totalExpense,
    net_amount: netAmount,
    totalBalance: netAmount,
    today_change: todaySum.balance,
    todayChange: todaySum.balance,
    budget: budgetYuan,
    budget_limit: budgetYuan,
    max_category: maxCategory,
    maxCategory,
    top_contributor: topContributor,
    topContributor
  }
}

// ---------------- 统计分析 ----------------

/**
 * 统计分析：自然月 / 自然年 / 全部 / 自定义。
 * 四种范围全部在云函数内聚合，前端只负责切换参数，不是前端假过滤。
 */
async function stats({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'viewer')

  return statsLib.stats(roomId, {
    rangeType: payload.rangeType || query.rangeType,
    year: payload.year || query.year,
    month: payload.month || query.month,
    startDate: payload.startDate || query.startDate,
    endDate: payload.endDate || query.endDate
  })
}

// ---------------- 账户与资产 ----------------

/** 账户列表。 */
async function accountList({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'viewer')
  return accounts.listAccounts(roomId)
}

/** 新增或修改账户（含手动校准余额）。 */
async function accountSave({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  const { user } = await requireMembership(openid, roomId, 'admin')

  if (payload.id) return accounts.updateAccount(roomId, payload.id, payload)
  return accounts.createAccount(roomId, user.id, payload)
}

/** 删除账户（仍有流水时拒绝，避免账目悬空）。 */
async function accountDelete({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'admin')
  const id = payload.id || query.id
  if (!id) throw badRequest('缺少账户标识')
  return accounts.deleteAccount(roomId, id)
}

/** 资产总览：账户余额 + 期间收支 + 按账户分类。 */
async function assetOverview({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'viewer')
  return accounts.assetOverview(roomId, {
    startDate: payload.startDate || query.startDate,
    endDate: payload.endDate || query.endDate
  })
}

// ---------------- 预算 ----------------

async function budgetList({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'viewer')
  return budget.listBudgets(roomId, payload.month || query.month)
}

async function budgetSave({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'admin')
  return budget.saveBudget(roomId, payload)
}

async function budgetDelete({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'admin')
  return budget.deleteBudget(roomId, payload.month || query.month, payload.categoryId || '')
}

/** 预算执行进度 + 超支预警。 */
async function budgetProgress({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'viewer')
  return budget.budgetProgress(roomId, payload.month || query.month)
}

// ---------------- 分摊结算 ----------------

/** 谁欠谁：返回每人净额与最少转账方案。 */
async function settlementView({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'viewer')
  return settlement.settlement(roomId, {
    startDate: payload.startDate || query.startDate,
    endDate: payload.endDate || query.endDate,
    month: payload.month || query.month
  })
}

// ---------------- 周期账单 ----------------

async function recurringList({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'viewer')
  return recurring.listRecurrings(roomId)
}

async function recurringSave({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  const { user } = await requireMembership(openid, roomId, 'admin')
  return recurring.saveRecurring(roomId, user.id, payload)
}

async function recurringDelete({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'admin')
  return recurring.deleteRecurring(roomId, payload.id || query.id)
}

/** 手动触发本空间到期的周期账单（定时任务会自动调用）。 */
async function recurringGenerate({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'admin')
  return recurring.generateDue(roomId)
}

// ---------------- 导出 ----------------

/** 导出流水为 CSV 文本（带 BOM，Excel 中文不乱码）。 */
async function exportCsv({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'viewer')

  const where = { roomId, deleted: NOT_DELETED }
  if (payload.startDate && payload.endDate) {
    where.occurredAt = _.gte(payload.startDate).and(_.lte(payload.endDate))
  }

  const entries = await listAll(COLLECTIONS.ledgers, where, { orderBy: 'occurredAt', order: 'asc' })
  const escape = (value) =>
    `"${String(value === undefined || value === null ? '' : value).replace(/"/g, '""')}"`

  const lines = [['日期', '类型', '金额', '分类', '账户', '备注', '来源'].map(escape).join(',')]

  entries.forEach((item) => {
    const typeLabel =
      item.type === 'income' ? '收入' : item.type === 'transfer' ? '转账' : '支出'
    lines.push(
      [
        dayKey(item.occurredAt || item.createdAt),
        typeLabel,
        toYuan(item.amountMinor || 0).toFixed(2),
        item.categoryName || '',
        item.accountName || '',
        item.note || '',
        item.source || 'manual'
      ]
        .map(escape)
        .join(',')
    )
  })

  return {
    filename: `roomie-ledger-${Date.now()}.csv`,
    count: entries.length,
    content: `\uFEFF${lines.join('\n')}`
  }
}

module.exports = {
  add,
  detail,
  update: edit,
  delete: remove,
  range: customRange,
  list,
  week,
  today,
  month,
  year,
  categoryList,
  categoryTree,
  summary,
  stats,
  accountList,
  accountSave,
  accountDelete,
  assetOverview,
  budgetList,
  budgetSave,
  budgetDelete,
  budgetProgress,
  settlement: settlementView,
  recurringList,
  recurringSave,
  recurringDelete,
  recurringGenerate,
  exportCsv,
  // 账单导入相关（路由落在 ledger 模块下）
  importPreview: ledgerImport.importPreview,
  importConfirm: ledgerImport.importConfirm,
  importMerchantRules: ledgerImport.importMerchantRules
}
