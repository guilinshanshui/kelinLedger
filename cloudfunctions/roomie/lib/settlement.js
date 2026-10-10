const { COLLECTIONS, listAll, _ } = require('./db')
const { toYuan } = require('./money')
const { monthRange } = require('./dates')

/**
 * 分摊结算。
 *
 * 家庭/室友场景的核心问题：这个月谁付得多、谁该补谁。
 * 只统计支出（收入不参与分摊），计算方式：
 *   每人垫付额 paid  -  每人应承担额 share  =  净额 net
 *   net > 0 应收，net < 0 应付
 *
 * 分摊对象优先取流水的 participants（部分人参与），
 * 未指定时默认全员均摊（家庭共同开销）。
 */

const EPSILON = 1 // 分

/** 均摊并处理尾差，保证各份之和严格等于总额。 */
function splitMinor(totalMinor, userIds) {
  const count = userIds.length
  if (!count) return new Map()
  const base = Math.floor(totalMinor / count)
  const remainder = totalMinor - base * count

  const result = new Map()
  userIds.forEach((id, index) => {
    result.set(id, base + (index < remainder ? 1 : 0))
  })
  return result
}

/**
 * 最少转账次数：贪心匹配最大应付与最大应收。
 * 两人之间只产生一笔转账，避免来回倒账。
 */
function minimizeTransfers(netMap) {
  const creditors = []
  const debtors = []

  netMap.forEach((amount, userId) => {
    if (amount > EPSILON) creditors.push({ userId, amount })
    else if (amount < -EPSILON) debtors.push({ userId, amount: -amount })
  })

  creditors.sort((a, b) => b.amount - a.amount)
  debtors.sort((a, b) => b.amount - a.amount)

  const transfers = []
  let i = 0
  let j = 0

  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount)
    if (pay > EPSILON) {
      transfers.push({
        fromUserId: debtors[i].userId,
        toUserId: creditors[j].userId,
        amount: toYuan(pay),
        amountMinor: pay
      })
    }

    debtors[i].amount -= pay
    creditors[j].amount -= pay

    if (debtors[i].amount <= EPSILON) i += 1
    if (creditors[j].amount <= EPSILON) j += 1
  }

  return transfers
}

/**
 * 计算期间内的分摊结算方案。
 * @returns { members, transfers, totalExpense, range }
 */
async function settlement(roomId, { startDate, endDate, month } = {}) {
  let range
  if (startDate && endDate) {
    range = { start: startDate, end: endDate }
  } else if (month) {
    const [y, m] = String(month).split('-').map(Number)
    range = monthRange(y, m)
  } else {
    const now = new Date()
    range = monthRange(now.getFullYear(), now.getMonth() + 1)
  }

  const [members, entries] = await Promise.all([
    listAll(COLLECTIONS.members, { roomId, status: 'active' }),
    listAll(COLLECTIONS.ledgers, {
      roomId,
      deleted: _.neq(true),
      type: 'expense',
      occurredAt: _.gte(range.start).and(_.lte(range.end))
    })
  ])

  const activeIds = members.map((item) => item.userId)
  const nameOf = new Map(members.map((item) => [item.userId, item.nickname || '成员']))

  const paid = new Map(activeIds.map((id) => [id, 0]))
  const share = new Map(activeIds.map((id) => [id, 0]))

  entries.forEach((entry) => {
    const payer = entry.userId
    if (paid.has(payer)) {
      paid.set(payer, paid.get(payer) + (entry.amountMinor || 0))
    }

    // 参与人：显式指定则按指定，否则全员均摊
    const participants = Array.isArray(entry.participants) && entry.participants.length
      ? entry.participants.filter((id) => share.has(id))
      : activeIds

    if (!participants.length) return

    const parts = splitMinor(entry.amountMinor || 0, participants)
    parts.forEach((amount, userId) => {
      share.set(userId, share.get(userId) + amount)
    })
  })

  const net = new Map()
  const rows = activeIds.map((userId) => {
    const paidMinor = paid.get(userId) || 0
    const shareMinor = share.get(userId) || 0
    const netMinor = paidMinor - shareMinor
    net.set(userId, netMinor)

    return {
      userId,
      nickname: nameOf.get(userId) || '成员',
      paid: toYuan(paidMinor),
      share: toYuan(shareMinor),
      net: toYuan(netMinor),
      // 应收（正）或应付（负），前端直接展示
      status: netMinor > EPSILON ? 'receivable' : netMinor < -EPSILON ? 'payable' : 'settled'
    }
  })

  const totalExpense = entries.reduce((sum, item) => sum + (item.amountMinor || 0), 0)

  return {
    range,
    totalExpense: toYuan(totalExpense),
    entryCount: entries.length,
    members: rows.sort((a, b) => b.net - a.net),
    transfers: minimizeTransfers(net)
  }
}

module.exports = { settlement, minimizeTransfers, splitMinor }
