const cloud = require('wx-server-sdk')

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

/** 集合名集中登记，避免散落的魔法字符串。 */
const COLLECTIONS = {
  users: 'users',
  rooms: 'rooms',
  members: 'room_members',
  invites: 'room_invites',
  ledgers: 'ledger_entries',
  categories: 'ledger_categories',
  payMethods: 'pay_methods',
  merchantRules: 'merchant_rules',
  accounts: 'assets_accounts',
  budgets: 'budgets',
  recurrings: 'recurring_bills',
  taskLists: 'task_lists',
  tasks: 'tasks',
  schedules: 'schedules',
  feeds: 'feeds',
  notifications: 'notifications',
}

/** 云数据库单次 get() 上限，安全值取 100。 */
const PAGE_SIZE = 100

const collection = (name) => db.collection(name)

const ensuredCollections = new Set()

function isMissingCollection(error) {
  if (!error) return false
  const code = Number(error.errCode || error.code)
  if (code === -502005 || code === 502005) return true
  const message = String(error.errMsg || error.message || '')
  return /collection not exists|DATABASE_COLLECTION_NOT_EXIST|Db or Table not exist|Table not exist/i.test(message)
}

/**
 * 集合已存在判定。
 * 微信云对“已存在”的文案不统一（Table exist / already exists / ResourceExist），
 * 所以这里同时认错误码和文案，避免把“已存在”当成真错误抛给前端。
 */
function isCollectionExists(error) {
  if (!error) return false
  const code = Number(error.errCode || error.code)
  if (code === -501001 || code === 501001) return true
  const message = String(error.errMsg || error.message || '')
  return /already[_ ]?exists|collection exists|DATABASE_COLLECTION_EXIST|Table exist|ResourceExist/i.test(message)
}

/**
 * 惰性补建集合：正常读写不再先调 createCollection，
 * 只有真的命中“集合不存在”时才补建一次再重试，避免每次请求都撞“已存在”。
 */
async function createCollectionQuietly(name) {
  if (ensuredCollections.has(name)) return true
  if (typeof db.createCollection !== 'function') return false

  try {
    await db.createCollection(name)
  } catch (error) {
    if (!isCollectionExists(error)) {
      console.warn('[db] 自动创建集合失败', name, error && (error.errMsg || error.message))
      return false
    }
  }
  ensuredCollections.add(name)
  return true
}

async function run(name, task) {
  try {
    return await task()
  } catch (error) {
    if (!isMissingCollection(error)) throw error
    const created = await createCollectionQuietly(name)
    if (!created) throw error
    return task()
  }
}

async function getOne(name, where) {
  return run(name, async () => {
    const res = await collection(name).where(where).limit(1).get()
    return res.data[0] || null
  })
}

async function getById(name, id) {
  if (!id) return null
  return run(name, async () => {
    const res = await collection(name).where({ _id: id }).limit(1).get()
    return res.data[0] || null
  })
}

/**
 * 分页读取全部匹配记录。
 * 云数据库单次返回有上限，聚合类查询必须翻页累加，否则会静默截断。
 */
async function listAll(name, where = {}, options = {}) {
  return run(name, async () => {
    const { orderBy, order = 'desc', limit = 1000 } = options
    const rows = []
    let skip = 0

    while (rows.length < limit) {
      const take = Math.min(PAGE_SIZE, limit - rows.length)
      let query = collection(name).where(where)
      if (orderBy) {
        query = query.orderBy(orderBy, order)
      }

      const res = await query.skip(skip).limit(take).get()
      rows.push(...res.data)

      // 不足一页说明已到末尾
      if (res.data.length < take) break
      skip += res.data.length
    }

    return rows
  })
}

async function page(name, where = {}, options = {}) {
  return run(name, async () => {
    const { page: pageNo = 1, pageSize = 20, orderBy, order = 'desc' } = options
    const safePage = Math.max(1, Number(pageNo) || 1)
    const safeSize = Math.min(100, Math.max(1, Number(pageSize) || 20))
    const skip = (safePage - 1) * safeSize

    let query = collection(name).where(where)
    if (orderBy) {
      query = query.orderBy(orderBy, order)
    }

    const [listRes, countRes] = await Promise.all([
      query.skip(skip).limit(safeSize).get(),
      collection(name).where(where).count()
    ])

    return {
      list: listRes.data,
      total: countRes.total,
      page: safePage,
      pageSize: safeSize
    }
  })
}

async function count(name, where = {}) {
  return run(name, async () => {
    const res = await collection(name).where(where).count()
    return res.total
  })
}

async function insert(name, data) {
  return run(name, async () => {
    await collection(name).add({ data })
    return data
  })
}

async function update(name, id, data) {
  return run(name, async () => {
    await collection(name).where({ _id: id }).update({ data })
    return { ...data, _id: id }
  })
}

async function remove(name, id) {
  return run(name, async () => {
    await collection(name).where({ _id: id }).remove()
  })
}

/** 按条件批量删除（云数据库 where().remove() 支持）。 */
async function removeWhere(name, where) {
  return run(name, async () => {
    const res = await collection(name).where(where).remove()
    return res.stats ? res.stats.removed : 0
  })
}

/** 原子自增，用于计数器场景。 */
async function inc(name, id, field, value) {
  return run(name, async () => {
    await collection(name).where({ _id: id }).update({ data: { [field]: _.inc(value) } })
  })
}

module.exports = {
  db,
  _,
  $,
  COLLECTIONS,
  ensureCollection: createCollectionQuietly,
  PAGE_SIZE,
  collection,
  getOne,
  getById,
  listAll,
  page,
  count,
  insert,
  update,
  remove,
  removeWhere,
  inc
}
