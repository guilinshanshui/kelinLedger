const {
  COLLECTIONS,
  insert,
  update,
  getById,
  listAll,
  _
} = require('./db')
const { nextId } = require('./id')
const { badRequest, notFound } = require('./errors')
const { toYuan, toMinor } = require('./money')
const { pushNotificationMany } = require('./notify')
const accounts = require('./accounts')

/**
 * 周期账单。
 *
 * 房租、订阅、房贷这类固定收支，每月到点自动生成一条流水，
 * 由云函数定时触发器驱动（见 cloudfunctions/roomie/config.json）。
 *
 * 幂等关键：lastGeneratedMonth 记录已生成的月份，
 * 定时任务重复投递也不会重复入账。
 */

const currentMonth = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function shapeRecurring(row) {
  return {
    id: row._id,
    roomId: row.roomId,
    title: row.title,
    type: row.type,
    amount: toYuan(row.amountMinor || 0),
    amountMinor: row.amountMinor || 0,
    categoryId: row.categoryId || '',
    categoryName: row.categoryName || '',
    categoryIcon: row.categoryIcon || '',
    accountId: row.accountId || '',
    accountName: row.accountName || '',
    dayOfMonth: row.dayOfMonth || 1,
    note: row.note || '',
    enabled: row.enabled !== false,
    lastGeneratedMonth: row.lastGeneratedMonth || '',
    createTime: row.createdAt
  }
}

async function listRecurrings(roomId) {
  const rows = await listAll(COLLECTIONS.recurrings, { roomId, status: _.neq('deleted') })
  return rows.map(shapeRecurring)
}

async function saveRecurring(roomId, userId, payload) {
  const title = String(payload.title || '').trim().slice(0, 30)
  if (!title) throw badRequest('请填写账单名称')

  const amountMinor = toMinor(payload.amount)
  if (amountMinor <= 0) throw badRequest('金额必须大于 0')

  const dayOfMonth = Math.min(28, Math.max(1, Number(payload.dayOfMonth) || 1))
  const type = payload.type === 'income' ? 'income' : 'expense'

  const now = new Date().toISOString()
  const base = {
    title,
    type,
    amountMinor,
    dayOfMonth,
    note: String(payload.note || '').slice(0, 100),
    categoryId: payload.categoryId || '',
    categoryName: payload.categoryName || '',
    categoryIcon: payload.categoryIcon || '',
    accountId: payload.accountId || '',
    accountName: payload.accountName || '',
    enabled: payload.enabled === undefined ? true : !!payload.enabled,
    updatedAt: now
  }

  if (payload.id) {
    const existed = await getById(COLLECTIONS.recurrings, payload.id)
    if (!existed || existed.roomId !== roomId) throw notFound('周期账单不存在')
    await update(COLLECTIONS.recurrings, payload.id, base)
    return shapeRecurring({ ...existed, ...base })
  }

  const doc = {
    _id: nextId('rec'),
    roomId,
    ...base,
    lastGeneratedMonth: '',
    status: 'active',
    createdBy: userId,
    createdAt: now
  }
  await insert(COLLECTIONS.recurrings, doc)
  return shapeRecurring(doc)
}

async function deleteRecurring(roomId, id) {
  const existed = await getById(COLLECTIONS.recurrings, id)
  if (!existed || existed.roomId !== roomId) throw notFound('周期账单不存在')
  await update(COLLECTIONS.recurrings, id, { status: 'deleted', deletedAt: new Date().toISOString() })
  return { id, deleted: true }
}

/**
 * 生成到期账单。
 *
 * @param {string} roomId 指定空间；不传则扫描所有空间（定时任务用）
 * @param {Date}   today  基准日期，便于测试注入
 */
async function generateDue(roomId, today = new Date()) {
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const day = today.getDate()

  const where = { status: _.neq('deleted') }
  if (roomId) where.roomId = roomId
  const rules = await listAll(COLLECTIONS.recurrings, where)

  const created = []

  for (const rule of rules) {
    if (rule.enabled === false) continue
    if (rule.lastGeneratedMonth === month) continue
    if ((rule.dayOfMonth || 1) > day) continue

    // 用当月的目标日作为发生时间
    const occurredAt = new Date(today.getFullYear(), today.getMonth(), rule.dayOfMonth || 1, 12, 0, 0).toISOString()
    const now = new Date().toISOString()

    const entry = {
      _id: nextId('led'),
      roomId: rule.roomId,
      userId: rule.createdBy,
      type: rule.type,
      amountMinor: rule.amountMinor,
      categoryId: rule.categoryId || '',
      categoryName: rule.categoryName || '',
      categoryIcon: rule.categoryIcon || '',
      accountId: rule.accountId || '',
      accountName: rule.accountName || '',
      payMethodId: '',
      payMethodName: '',
      note: rule.note || `周期账单：${rule.title}`,
      occurredAt,
      source: 'recurring',
      recurringId: rule._id,
      deleted: false,
      createdAt: now,
      updatedAt: now
    }

    await insert(COLLECTIONS.ledgers, entry)
    await accounts.applyDeltas(rule.roomId, entry)
    await update(COLLECTIONS.recurrings, rule._id, { lastGeneratedMonth: month, lastGeneratedAt: now })

    created.push({ id: entry._id, roomId: rule.roomId, title: rule.title, amount: toYuan(rule.amountMinor) })

    // 通知空间成员
    const members = await listAll(COLLECTIONS.members, { roomId: rule.roomId, status: 'active' })
    await pushNotificationMany(
      members.map((item) => item.userId),
      {
        roomId: rule.roomId,
        actorId: '',
        type: 'recurring_generated',
        title: '周期账单已入账',
        body: `${rule.title} ¥${toYuan(rule.amountMinor)} 已自动记入本月`,
        targetType: 'ledger',
        targetId: entry._id
      }
    )
  }

  return { month, scanned: rules.length, created, count: created.length }
}

module.exports = {
  currentMonth,
  shapeRecurring,
  listRecurrings,
  saveRecurring,
  deleteRecurring,
  generateDue
}
