const { COLLECTIONS, insert, update, getOne, listAll, removeWhere, _ } = require('./db')
const { nextId } = require('./id')
const { badRequest } = require('./errors')
const { toYuan, toMinor } = require('./money')
const { monthRange } = require('./dates')

/**
 * 预算。
 *
 * categoryId 为空字符串表示「总预算」，否则是分类预算。
 * 同一空间同一月份同一分类只保留一条记录（save 时先查再写）。
 */

function normalizeMonth(input) {
  if (input && /^\d{4}-\d{2}$/.test(input)) return input
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function shapeBudget(row) {
  return {
    id: row._id,
    roomId: row.roomId,
    month: row.month,
    categoryId: row.categoryId || '',
    amount: toYuan(row.amountMinor || 0),
    amountMinor: row.amountMinor || 0,
    createTime: row.createdAt
  }
}

/** 保存（新增或覆盖）预算。金额为 0 视为删除该条预算。 */
async function saveBudget(roomId, payload) {
  const month = normalizeMonth(payload.month)
  const categoryId = payload.categoryId || ''
  const amountMinor = toMinor(payload.amount)

  if (amountMinor < 0) throw badRequest('预算金额不能为负')

  const existed = await getOne(COLLECTIONS.budgets, { roomId, month, categoryId })

  if (amountMinor === 0) {
    if (existed) await update(COLLECTIONS.budgets, existed._id, { amountMinor: 0, updatedAt: new Date().toISOString() })
    return { month, categoryId, amount: 0 }
  }

  const now = new Date().toISOString()
  if (existed) {
    await update(COLLECTIONS.budgets, existed._id, { amountMinor, updatedAt: now })
    return shapeBudget({ ...existed, amountMinor })
  }

  const doc = {
    _id: nextId('bud'),
    roomId,
    month,
    categoryId,
    amountMinor,
    createdAt: now,
    updatedAt: now
  }
  await insert(COLLECTIONS.budgets, doc)
  return shapeBudget(doc)
}

async function listBudgets(roomId, month) {
  const target = normalizeMonth(month)
  const rows = await listAll(COLLECTIONS.budgets, { roomId, month: target })
  return rows.filter((row) => (row.amountMinor || 0) > 0).map(shapeBudget)
}

async function deleteBudget(roomId, month, categoryId = '') {
  const target = normalizeMonth(month)
  await removeWhere(COLLECTIONS.budgets, { roomId, month: target, categoryId })
  return { month: target, categoryId, deleted: true }
}

/**
 * 预算执行进度：对比当月实际支出与预算。
 * 返回总进度与分类进度，供前端画进度条与超支预警。
 */
async function budgetProgress(roomId, month) {
  const target = normalizeMonth(month)
  const [y, m] = target.split('-').map(Number)
  const range = monthRange(y, m)

  const [budgets, entries] = await Promise.all([
    listBudgets(roomId, target),
    listAll(COLLECTIONS.ledgers, {
      roomId,
      deleted: _.neq(true),
      type: 'expense',
      occurredAt: _.gte(range.start).and(_.lte(range.end))
    })
  ])

  const totalSpent = entries.reduce((sum, item) => sum + (item.amountMinor || 0), 0)
  const totalBudget = budgets.find((b) => !b.categoryId)

  const byCategory = new Map()
  entries.forEach((item) => {
    const key = item.categoryId || ''
    if (!byCategory.has(key)) {
    byCategory.set(key, { amountMinor: 0, name: item.categoryName || '未分类', icon: item.categoryIcon || 'mc:puzzled' })
    }
    byCategory.get(key).amountMinor += item.amountMinor || 0
  })

  const categoryProgress = budgets
    .filter((b) => b.categoryId)
    .map((budget) => {
      const spent = (byCategory.get(budget.categoryId) || { amountMinor: 0 }).amountMinor
      const meta = byCategory.get(budget.categoryId) || {}
      const percent = budget.amountMinor ? Math.round((spent / budget.amountMinor) * 100) : 0
      return {
        categoryId: budget.categoryId,
        name: meta.name || '未分类',
    icon: meta.icon || 'mc:puzzled',
        budget: toYuan(budget.amountMinor),
        spent: toYuan(spent),
        remaining: toYuan(budget.amountMinor - spent),
        percent,
        over: spent > budget.amountMinor
      }
    })
    .sort((a, b) => b.percent - a.percent)

  const totalPercent = totalBudget ? Math.round((totalSpent / totalBudget.amountMinor) * 100) : 0

  return {
    month: target,
    total: {
      budget: totalBudget ? toYuan(totalBudget.amountMinor) : 0,
      spent: toYuan(totalSpent),
      remaining: totalBudget ? toYuan(totalBudget.amountMinor - totalSpent) : 0,
      percent: totalPercent,
      over: totalBudget ? totalSpent > totalBudget.amountMinor : false
    },
    categories: categoryProgress,
    // 达到 80% 以上或已超支时给出预警，前端可直接展示
    alerts: [
      ...(totalBudget && totalPercent >= 80
        ? [{ level: totalPercent >= 100 ? 'danger' : 'warning', message: totalPercent >= 100 ? `本月总预算已超支 ${totalPercent - 100}%` : `本月总预算已使用 ${totalPercent}%` }]
        : []),
      ...categoryProgress
        .filter((item) => item.percent >= 80)
        .map((item) => ({
          level: item.over ? 'danger' : 'warning',
          message: item.over
            ? `${item.name}已超支 ¥${Math.abs(item.remaining).toFixed(2)}`
            : `${item.name}已使用 ${item.percent}%`
        }))
    ]
  }
}

module.exports = {
  normalizeMonth,
  shapeBudget,
  saveBudget,
  listBudgets,
  deleteBudget,
  budgetProgress
}
