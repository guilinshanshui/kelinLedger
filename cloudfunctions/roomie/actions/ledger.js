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

const TYPES = ['expense', 'income', 'transfer']
const NOT_DELETED = _.neq(true)

const roomIdOf = (payload = {}, query = {}) => payload.roomId || query.roomId

function shapeEntry(entry) {
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
    occurredAt: entry.occurredAt,
    date: dayKey(entry.occurredAt || entry.createdAt),
    source: entry.source || 'manual',
    createdBy: entry.userId,
    createTime: entry.createdAt,
    updateTime: entry.updatedAt
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

/** 新增流水。 */
async function add({ openid, payload }) {
  const roomId = roomIdOf(payload)
  const { user } = await requireMembership(openid, roomId, 'member')

  const type = requireOneOf(payload.type || 'expense', TYPES, '收支类型')
  const amountMinor = toMinor(payload.amount)
  if (amountMinor <= 0) throw badRequest('金额必须大于 0')

  const category = await resolveCategory(roomId, payload.categoryId)
  const payMethod = await resolvePayMethod(roomId, payload.payMethodId)
  const now = new Date().toISOString()

  // 账户：记账必须能让余额对得上，支出从账户扣、收入进账户、转账两边动
  const account = await accounts.requireAccount(roomId, payload.accountId)
  const toAccount =
    type === 'transfer' ? await accounts.requireAccount(roomId, payload.toAccountId) : null
  if (!account) throw badRequest('请选择入账账户')
  if (type === 'transfer' && !toAccount) throw badRequest('转账需要选择转入账户')
  if (type === 'transfer' && account && toAccount && account._id === toAccount._id) {
    throw badRequest('转出与转入账户不能相同')
  }

  const entry = {
    _id: nextId('led'),
    roomId,
    userId: user.id,
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
    userId: user.id,
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

  return shapeEntry(entry)
}

async function detail({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  const { user, member } = await requireMembership(openid, roomId, 'viewer')
  const id = payload.id || query.id
  const entry = await getById(COLLECTIONS.ledgers, id)
  if (!entry || entry.roomId !== roomId) throw notFound('流水不存在')

  // 只有创建者本人和 owner/admin 能改删，其他人进详情页只是只读浏览。
  // 权限由服务端判定后下发给前端，前端只负责展示，不做可信校验。
  const canOperate = entry.userId === user.id || ['owner', 'admin'].includes(member.role)
  return { ...shapeEntry(entry), canEdit: canOperate, canDelete: canOperate }
}

async function edit({ openid, payload }) {
  const roomId = roomIdOf(payload)
  const { user, member } = await requireMembership(openid, roomId, 'member')
  const id = payload.id
  const entry = await getById(COLLECTIONS.ledgers, id)
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
    const account = await accounts.requireAccount(roomId, payload.accountId)
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

  await update(COLLECTIONS.ledgers, id, patch)

  // 金额、类型、账户任一变化都要重算余额：先冲销旧值，再记新值
  const nextEntry = { ...entry, ...patch }
  await accounts.reapplyDeltas(roomId, entry, nextEntry)

  return shapeEntry(nextEntry)
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

/** 通用列表：按区间 + 类型 + 分类过滤，支持分页。 */
async function list({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'viewer')

  const where = { roomId, deleted: NOT_DELETED }
  if (payload.type && payload.type !== 'all') where.type = payload.type
  if (payload.categoryId) where.categoryId = payload.categoryId
  if (payload.startDate && payload.endDate) {
    where.occurredAt = _.gte(payload.startDate).and(_.lte(payload.endDate))
  }

  const result = await pageQuery(COLLECTIONS.ledgers, where, {
    page: toInt(payload.page, 1),
    pageSize: toInt(payload.pageSize, 20),
    orderBy: 'occurredAt',
    order: 'desc'
  })

  return { ...result, list: result.list.map(shapeEntry) }
}

/** 区间明细 + 汇总，week/today/month/year 共用。 */
async function rangeView(openid, roomId, range, accountId = '') {
  const { user, member } = await requireMembership(openid, roomId, 'viewer')
  const rows = await listAll(
    COLLECTIONS.ledgers,
    { roomId, deleted: NOT_DELETED, occurredAt: _.gte(range.start).and(_.lte(range.end)) },
    { orderBy: 'occurredAt', order: 'desc' }
  )

  // 从资产页点单个账户进来时，只该看到这个账户相关的流水（转出算一次、转入也算）
  const entries = accountId
    ? rows.filter((item) => item.accountId === accountId || item.toAccountId === accountId)
    : rows

  const shaped = entries.map(shapeEntry)
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

const accountIdOf = (payload = {}, query = {}) => payload.accountId || query.accountId || ''

const week = ({ openid, payload, query }) =>
  rangeView(openid, roomIdOf(payload, query), weekRange(payload.date), accountIdOf(payload, query))
const today = ({ openid, payload, query }) =>
  rangeView(openid, roomIdOf(payload, query), dayRange(payload.date), accountIdOf(payload, query))
const month = ({ openid, payload, query }) =>
  rangeView(openid, roomIdOf(payload, query), monthRange(payload.year, payload.month), accountIdOf(payload, query))
/**
 * 自定义区间：起止日期都按北京时间整天算（含结束日当天到 23:59:59.999）。
 * 前端传的是 YYYY-MM-DD。
 */
const customRange = ({ openid, payload, query }) => {
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
    accountIdOf(payload, query)
  )
}

const year = ({ openid, payload, query }) =>
  rangeView(openid, roomIdOf(payload, query), yearRange(payload.year), accountIdOf(payload, query))

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
async function categoryTree({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'viewer')
  const rows = await listAll(COLLECTIONS.categories, { roomId }, { orderBy: 'sort', order: 'asc' })

  const type = payload.type
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
async function summary({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'viewer')

  const range = payload.startDate && payload.endDate
    ? { start: payload.startDate, end: payload.endDate }
    : monthRange(payload.year, payload.month)

  const entries = await listAll(
    COLLECTIONS.ledgers,
    { roomId, deleted: NOT_DELETED, occurredAt: _.gte(range.start).and(_.lte(range.end)) }
  )

  return { ...summarize(entries), range }
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
