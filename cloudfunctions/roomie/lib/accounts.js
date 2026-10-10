const {
  COLLECTIONS,
  insert,
  update,
  getById,
  getOne,
  listAll,
  count,
  _
} = require('./db')
const { nextId } = require('./id')
const { badRequest, notFound, conflict } = require('./errors')
const { toYuan, toMinor } = require('./money')

/**
 * 账户与余额。
 *
 * 记账 App 的核心是「一笔流水改变一个账户的余额」。
 * 这里集中处理余额变动，避免各个 action 各写一遍导致对不上账。
 */

/**
 * 账户类型，决定默认图标与是否计入净资产。
 * 图标同样走 `mc:` 前缀，由前端 AppIcon 渲染成主题色；老账户里的 emoji 继续兼容。
 */
const ACCOUNT_TYPES = {
  cash: { label: '现金', icon: 'mc:cash-2', netWorth: true },
  wechat: { label: '微信', icon: 'mc:wechat', netWorth: true },
  alipay: { label: '支付宝', icon: 'mc:alipay', netWorth: true },
  bank: { label: '银行卡', icon: 'mc:bank-card', netWorth: true },
  investment: { label: '投资', icon: 'mc:chart-line', netWorth: true },
  credit: { label: '信用卡', icon: 'mc:wallet-3', netWorth: false },
  other: { label: '其他', icon: 'mc:puzzled', netWorth: true }
}

const DEFAULT_ACCOUNTS = [
  { name: '现金', type: 'cash' },
  { name: '微信钱包', type: 'wechat' },
  { name: '支付宝', type: 'alipay' },
  { name: '银行卡', type: 'bank' }
]

function shapeAccount(account) {
  const meta = ACCOUNT_TYPES[account.type] || ACCOUNT_TYPES.other
  return {
    id: account._id,
    roomId: account.roomId,
    name: account.name,
    type: account.type,
    typeLabel: meta.label,
    icon: account.icon || meta.icon,
    balance: toYuan(account.balanceMinor || 0),
    balanceMinor: account.balanceMinor || 0,
    initial: toYuan(account.initialMinor || 0),
    includeInNetWorth: account.includeInNetWorth !== false,
    remark: account.remark || '',
    status: account.status || 'active',
    sort: account.sort || 0,
    createTime: account.createdAt
  }
}

/** 为空间初始化默认账户。 */
async function seedAccounts(roomId, userId) {
  const now = new Date().toISOString()
  return Promise.all(
    DEFAULT_ACCOUNTS.map((item, index) =>
      insert(COLLECTIONS.accounts, {
        _id: nextId('acc'),
        roomId,
        name: item.name,
        type: item.type,
        icon: ACCOUNT_TYPES[item.type].icon,
        balanceMinor: 0,
        initialMinor: 0,
        includeInNetWorth: ACCOUNT_TYPES[item.type].netWorth,
        remark: '',
        status: 'active',
        sort: index * 10,
        createdBy: userId,
        createdAt: now,
        updatedAt: now
      })
    )
  )
}

async function listAccounts(roomId) {
  const rows = await listAll(
    COLLECTIONS.accounts,
    { roomId, status: _.neq('deleted') },
    { orderBy: 'sort', order: 'asc' }
  )
  return rows.map(shapeAccount)
}

async function requireAccount(roomId, accountId) {
  if (!accountId) return null
  const account = await getById(COLLECTIONS.accounts, accountId)
  if (!account || account.roomId !== roomId || account.status === 'deleted') {
    throw notFound('账户不存在')
  }
  return account
}

/** 调整余额并返回新的余额值。 */
async function adjustBalance(account, deltaMinor) {
  const next = (account.balanceMinor || 0) + deltaMinor
  await update(COLLECTIONS.accounts, account._id, {
    balanceMinor: next,
    updatedAt: new Date().toISOString()
  })
  return next
}

/**
 * 计算一笔流水对账户余额的影响，返回 [{ accountId, deltaMinor }]。
 *
 * 支出：账户减少
 * 收入：账户增加
 * 转账：转出账户减少、转入账户增加
 */
function balanceDeltas(entry, direction = 1) {
  const amount = (entry.amountMinor || 0) * direction
  const deltas = []

  if (entry.type === 'transfer') {
    if (entry.accountId) deltas.push({ accountId: entry.accountId, deltaMinor: -amount })
    if (entry.toAccountId) deltas.push({ accountId: entry.toAccountId, deltaMinor: amount })
    return deltas
  }

  if (!entry.accountId) return deltas
  deltas.push({
    accountId: entry.accountId,
    deltaMinor: entry.type === 'income' ? amount : -amount
  })
  return deltas
}

/** 应用余额变动（写入流水时调用）。 */
async function applyDeltas(roomId, entry, direction = 1) {
  const deltas = balanceDeltas(entry, direction)
  for (const item of deltas) {
    const account = await getById(COLLECTIONS.accounts, item.accountId)
    if (!account || account.roomId !== roomId) continue
    await adjustBalance(account, item.deltaMinor)
  }
}

/**
 * 流水被修改时修正余额。
 * 先按旧值反向冲销，再按新值正向记账，等价于重算这笔流水的影响。
 */
async function reapplyDeltas(roomId, oldEntry, newEntry) {
  await applyDeltas(roomId, oldEntry, -1)
  await applyDeltas(roomId, newEntry, 1)
}

/** 新增账户。 */
async function createAccount(roomId, userId, payload) {
  const type = ACCOUNT_TYPES[payload.type] ? payload.type : 'other'
  const name = String(payload.name || ACCOUNT_TYPES[type].label).trim().slice(0, 20)
  if (!name) throw badRequest('账户名称不能为空')

  const now = new Date().toISOString()
  const initialMinor = toMinor(payload.initial || payload.balance || 0)

  const account = {
    _id: nextId('acc'),
    roomId,
    name,
    type,
    icon: payload.icon || ACCOUNT_TYPES[type].icon,
    balanceMinor: initialMinor,
    initialMinor,
    includeInNetWorth:
      payload.includeInNetWorth === undefined
        ? ACCOUNT_TYPES[type].netWorth
        : !!payload.includeInNetWorth,
    remark: String(payload.remark || '').slice(0, 60),
    status: 'active',
    sort: Number(payload.sort) || 0,
    createdBy: userId,
    createdAt: now,
    updatedAt: now
  }

  await insert(COLLECTIONS.accounts, account)
  return shapeAccount(account)
}

/** 修改账户信息（余额不直接改，通过初始余额差额调整）。 */
async function updateAccount(roomId, accountId, payload) {
  const account = await requireAccount(roomId, accountId)

  const patch = { updatedAt: new Date().toISOString() }
  if (payload.name !== undefined) patch.name = String(payload.name).trim().slice(0, 20) || account.name
  if (payload.type !== undefined && ACCOUNT_TYPES[payload.type]) patch.type = payload.type
  if (payload.icon !== undefined) patch.icon = String(payload.icon)
  if (payload.remark !== undefined) patch.remark = String(payload.remark).slice(0, 60)
  if (payload.includeInNetWorth !== undefined) patch.includeInNetWorth = !!payload.includeInNetWorth
  if (payload.sort !== undefined) patch.sort = Number(payload.sort) || 0

  // 手动校准余额：记录差额，保持 initial + 流水 = balance 的一致性
  if (payload.balance !== undefined) {
    const target = toMinor(payload.balance)
    const diff = target - (account.balanceMinor || 0)
    patch.balanceMinor = target
    patch.initialMinor = (account.initialMinor || 0) + diff
  }

  await update(COLLECTIONS.accounts, account._id, patch)
  return shapeAccount({ ...account, ...patch })
}

/** 删除账户：仍有流水引用时拒绝，避免账目悬空。 */
async function deleteAccount(roomId, accountId) {
  const account = await requireAccount(roomId, accountId)

  const used = await count(COLLECTIONS.ledgers, {
    roomId,
    deleted: _.neq(true),
    accountId
  })
  if (used > 0) {
    throw conflict(`该账户下还有 ${used} 笔流水，请先转移或删除后再试`)
  }

  await update(COLLECTIONS.accounts, accountId, {
    status: 'deleted',
    deletedAt: new Date().toISOString()
  })
  return { id: accountId, deleted: true }
}

/**
 * 资产总览：账户余额、期间收支、按账户汇总。
 * 前端「资产详情」页依赖这个结构。
 */
async function assetOverview(roomId, { startDate, endDate } = {}) {
  const accounts = await listAccounts(roomId)

  const where = { roomId, deleted: _.neq(true) }
  if (startDate && endDate) {
    where.occurredAt = _.gte(startDate).and(_.lte(endDate))
  }
  const entries = await listAll(COLLECTIONS.ledgers, where)

  const incomeTotal = entries
    .filter((item) => item.type === 'income')
    .reduce((sum, item) => sum + (item.amountMinor || 0), 0)
  const expenseTotal = entries
    .filter((item) => item.type === 'expense')
    .reduce((sum, item) => sum + (item.amountMinor || 0), 0)

  const totalBalance = accounts
    .filter((item) => item.includeInNetWorth)
    .reduce((sum, item) => sum + item.balanceMinor, 0)

  // 按账户聚合期间的收支，用于资产页的分类柱状图
  const categories = accounts.map((account) => {
    const owned = entries.filter((item) => item.accountId === account.id)
    const income = owned
      .filter((item) => item.type === 'income')
      .reduce((sum, item) => sum + (item.amountMinor || 0), 0)
    const expense = owned
      .filter((item) => item.type === 'expense')
      .reduce((sum, item) => sum + (item.amountMinor || 0), 0)

    return {
      id: account.id,
      name: account.name,
      // label 是历史字段名，保留一份避免旧页面取值落空
      label: account.name,
      icon: account.icon,
      type: account.type,
      amount: toYuan(account.balanceMinor),
      balance: toYuan(account.balanceMinor),
      income: toYuan(income),
      expense: toYuan(expense)
    }
  })

  // 资产分布进度条用：占比按资产绝对额算，后端一次给全，前端不再猜
  const totalAbs = categories.reduce((sum, item) => sum + Math.abs(item.amount), 0)
  categories.forEach((item) => {
    item.percent = totalAbs ? Math.round((Math.abs(item.amount) / totalAbs) * 100) : 0
  })

  // 近 12 条流水，资产页底部列表
  const history = entries
    .slice()
    .sort((a, b) => String(b.occurredAt || '').localeCompare(String(a.occurredAt || '')))
    .slice(0, 12)
    .map((item) => ({
      id: item._id,
      type: item.type,
      amount: toYuan(item.amountMinor || 0),
      category: item.categoryName || '',
      categoryName: item.categoryName || '',
      categoryIcon: item.categoryIcon || '',
      note: item.note || '',
      occurredAt: item.occurredAt,
      entryTime: item.occurredAt,
      accountId: item.accountId || ''
    }))

  return {
    asset: {
      total_balance: toYuan(totalBalance),
      income_total: toYuan(incomeTotal),
      expense_total: toYuan(expenseTotal),
      accounts,
      categories
    },
    history
  }
}

module.exports = {
  ACCOUNT_TYPES,
  DEFAULT_ACCOUNTS,
  seedAccounts,
  listAccounts,
  requireAccount,
  createAccount,
  updateAccount,
  deleteAccount,
  applyDeltas,
  reapplyDeltas,
  balanceDeltas,
  assetOverview,
  shapeAccount
}
