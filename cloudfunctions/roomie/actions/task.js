const {
  COLLECTIONS,
  insert,
  update,
  getById,
  listAll,
  page: pageQuery,
  count,
  _
} = require('../lib/db')
const { nextId } = require('../lib/id')
const { requireMembership } = require('../lib/context')
const { badRequest, notFound } = require('../lib/errors')
const { requireString, optionalString, requireOneOf, toInt } = require('../lib/validate')
const { pushNotification } = require('../lib/notify')
const { publishFeed, FEED_TYPES } = require('../lib/activity')

const STATUSES = ['pending', 'in_progress', 'completed']
const PRIORITIES = ['low', 'medium', 'high']
const NOT_DELETED = _.neq(true)

const roomIdOf = (payload = {}, query = {}) => payload.roomId || query.roomId

function shapeTask(task) {
  return {
    id: task._id,
    roomId: task.roomId,
    title: task.title,
    description: task.description || '',
    listId: task.listId || '',
    assigneeId: task.assigneeId || '',
    assigneeName: task.assigneeName || '',
    creatorId: task.creatorId,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate || '',
    completedAt: task.completedAt || '',
    createTime: task.createdAt,
    updateTime: task.updatedAt
  }
}

/** 任务列表，支持按状态、负责人、清单过滤。 */
async function list({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'viewer')

  const where = { roomId, deleted: NOT_DELETED }
  if (payload.status && payload.status !== 'all') where.status = payload.status
  if (payload.assigneeId) where.assigneeId = payload.assigneeId
  if (payload.listId) where.listId = payload.listId

  const result = await pageQuery(COLLECTIONS.tasks, where, {
    page: toInt(payload.page, 1),
    pageSize: toInt(payload.pageSize, 20),
    orderBy: 'createdAt',
    order: 'desc'
  })

  return { ...result, list: result.list.map(shapeTask) }
}

/** 全部状态视图：一次返回待办、进行中、已完成分组，供清单中心使用。 */
async function allStatus({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'viewer')

  const tasks = await listAll(COLLECTIONS.tasks, { roomId, deleted: NOT_DELETED }, {
    orderBy: 'createdAt',
    order: 'desc'
  })

  const shaped = tasks.map(shapeTask)
  return {
    pending: shaped.filter((item) => item.status === 'pending'),
    inProgress: shaped.filter((item) => item.status === 'in_progress'),
    completed: shaped.filter((item) => item.status === 'completed'),
    total: shaped.length
  }
}

/** 已完成任务列表。 */
async function completedList({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'viewer')

  const tasks = await listAll(
    COLLECTIONS.tasks,
    { roomId, status: 'completed', deleted: NOT_DELETED },
    { orderBy: 'completedAt', order: 'desc' }
  )
  return tasks.map(shapeTask)
}

/** 新建任务。 */
async function add({ openid, payload }) {
  const roomId = roomIdOf(payload)
  const { user } = await requireMembership(openid, roomId, 'member')

  const title = requireString(payload.title, '任务标题', { max: 50 })
  const now = new Date().toISOString()

  let assigneeName = ''
  if (payload.assigneeId) {
    const members = await listAll(COLLECTIONS.members, { roomId, status: 'active' })
    const target = members.find((item) => item.userId === payload.assigneeId)
    if (!target) throw badRequest('指定的负责人不在空间中')
    assigneeName = target.nickname || ''
  }

  const task = {
    _id: nextId('task'),
    roomId,
    title,
    description: optionalString(payload.description, 200),
    listId: payload.listId || '',
    assigneeId: payload.assigneeId || '',
    assigneeName,
    creatorId: user.id,
    creatorName: user.nickname,
    status: 'pending',
    priority: PRIORITIES.includes(payload.priority) ? payload.priority : 'medium',
    dueDate: payload.dueDate || '',
    deleted: false,
    createdAt: now,
    updatedAt: now
  }

  await insert(COLLECTIONS.tasks, task)

  await publishFeed({
    roomId,
    userId: user.id,
    type: FEED_TYPES.TASK_CREATE,
    content: `新建了任务「${title}」`,
    refType: 'task',
    refId: task._id
  })

  if (task.assigneeId) {
    await pushNotification({
      roomId,
      userId: task.assigneeId,
      actorId: user.id,
      type: 'task_assigned',
      title: '新任务',
      body: `${user.nickname} 把「${title}」指派给了你`,
      targetType: 'task',
      targetId: task._id
    })
  }

  return shapeTask(task)
}

/** 修改任务。 */
async function edit({ openid, payload }) {
  const roomId = roomIdOf(payload)
  const { user } = await requireMembership(openid, roomId, 'member')

  const id = payload.id || payload.taskId
  const task = await getById(COLLECTIONS.tasks, id)
  if (!task || task.roomId !== roomId || task.deleted) throw notFound('任务不存在')

  const patch = { updatedAt: new Date().toISOString() }
  if (payload.title !== undefined) patch.title = requireString(payload.title, '任务标题', { max: 50 })
  if (payload.description !== undefined) patch.description = optionalString(payload.description, 200)
  if (payload.priority !== undefined) patch.priority = requireOneOf(payload.priority, PRIORITIES, '优先级')
  if (payload.dueDate !== undefined) patch.dueDate = payload.dueDate || ''
  if (payload.status !== undefined) patch.status = requireOneOf(payload.status, STATUSES, '任务状态')
  if (payload.listId !== undefined) patch.listId = payload.listId || ''
  if (payload.assigneeId !== undefined) patch.assigneeId = payload.assigneeId || ''

  await update(COLLECTIONS.tasks, id, patch)
  return shapeTask({ ...task, ...patch })
}

/** 删除任务（软删除）。 */
async function remove({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'member')

  const id = payload.id || payload.taskId || query.id
  const task = await getById(COLLECTIONS.tasks, id)
  if (!task || task.roomId !== roomId) throw notFound('任务不存在')

  await update(COLLECTIONS.tasks, id, { deleted: true, deletedAt: new Date().toISOString() })
  return { id, deleted: true }
}

/** 指派任务。 */
async function assign({ openid, payload, params }) {
  const roomId = roomIdOf(payload)
  const { user } = await requireMembership(openid, roomId, 'member')

  const taskId = payload.taskId || payload.id || (params && params[0])
  const assigneeId = payload.assigneeId
  if (!taskId || !assigneeId) throw badRequest('缺少任务或负责人')

  const task = await getById(COLLECTIONS.tasks, taskId)
  if (!task || task.roomId !== roomId) throw notFound('任务不存在')

  const members = await listAll(COLLECTIONS.members, { roomId, status: 'active' })
  const target = members.find((item) => item.userId === assigneeId)
  if (!target) throw badRequest('指定的负责人不在空间中')

  const now = new Date().toISOString()
  await update(COLLECTIONS.tasks, taskId, {
    assigneeId,
    assigneeName: target.nickname || '',
    updatedAt: now
  })

  await pushNotification({
    roomId,
    userId: assigneeId,
    actorId: user.id,
    type: 'task_assigned',
    title: '任务指派',
    body: `${user.nickname} 把「${task.title}」指派给了你`,
    targetType: 'task',
    targetId: taskId
  })

  return shapeTask({ ...task, assigneeId, assigneeName: target.nickname || '', updatedAt: now })
}

/** 完成任务。 */
async function complete({ openid, payload, query, params }) {
  const roomId = roomIdOf(payload, query)
  const { user } = await requireMembership(openid, roomId, 'member')

  const id = payload.id || payload.taskId || query.id || (params && params[0])
  const task = await getById(COLLECTIONS.tasks, id)
  if (!task || task.roomId !== roomId) throw notFound('任务不存在')
  if (task.status === 'completed') return shapeTask(task)

  const now = new Date().toISOString()
  await update(COLLECTIONS.tasks, id, { status: 'completed', completedAt: now, updatedAt: now })

  await publishFeed({
    roomId,
    userId: user.id,
    type: FEED_TYPES.TASK_COMPLETE,
    content: `完成了任务「${task.title}」`,
    refType: 'task',
    refId: id
  })

  const members = await listAll(COLLECTIONS.members, { roomId, status: 'active' })
  await Promise.all(
    members
      .filter((member) => member.userId !== user.id)
      .map((member) =>
        pushNotification({
          roomId,
          userId: member.userId,
          actorId: user.id,
          type: 'task_completed',
          title: '任务完成',
          body: `${user.nickname} 完成了「${task.title}」`,
          targetType: 'task',
          targetId: id
        })
      )
  )

  return shapeTask({ ...task, status: 'completed', completedAt: now, updatedAt: now })
}

/** 把已完成任务恢复为待办。 */
async function reset({ openid, payload, query, params }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'member')

  const id = payload.id || payload.taskId || query.id || (params && params[0])
  const task = await getById(COLLECTIONS.tasks, id)
  if (!task || task.roomId !== roomId) throw notFound('任务不存在')

  const now = new Date().toISOString()
  await update(COLLECTIONS.tasks, id, { status: 'pending', completedAt: '', updatedAt: now })
  return shapeTask({ ...task, status: 'pending', completedAt: '', updatedAt: now })
}

/** 清单（任务分组）列表。 */
async function listLists({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'viewer')

  const lists = await listAll(COLLECTIONS.taskLists, { roomId, deleted: NOT_DELETED }, {
    orderBy: 'sort',
    order: 'asc'
  })
  const tasks = await listAll(COLLECTIONS.tasks, { roomId, deleted: NOT_DELETED })

  return lists.map((item) => {
    const owned = tasks.filter((task) => task.listId === item._id)
    return {
      id: item._id,
      name: item.name,
    icon: item.icon || 'mc:list-check-3',
      sort: item.sort,
      taskCount: owned.length,
      pendingCount: owned.filter((task) => task.status !== 'completed').length
    }
  })
}

async function createList({ openid, payload }) {
  const roomId = roomIdOf(payload)
  const { user } = await requireMembership(openid, roomId, 'member')

  const name = requireString(payload.name, '清单名称', { max: 30 })
  const now = new Date().toISOString()
  const doc = {
    _id: nextId('list'),
    roomId,
    name,
    icon: payload.icon || 'mc:list-check-3',
    sort: toInt(payload.sort, Date.now() % 100000),
    creatorId: user.id,
    deleted: false,
    createdAt: now,
    updatedAt: now
  }
  await insert(COLLECTIONS.taskLists, doc)
  return { id: doc._id, name: doc.name, icon: doc.icon }
}

async function deleteList({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'admin')
  const id = payload.id || query.id
  await update(COLLECTIONS.taskLists, id, { deleted: true })
  return { id, deleted: true }
}

/** 清单关联的记账汇总。 */
async function summary({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'viewer')

  const where = { roomId, deleted: _.neq(true) }
  if (payload.listId) where.listId = payload.listId
  if (payload.taskId) where.taskId = payload.taskId

  const entries = await listAll(COLLECTIONS.ledgers, where)
  const totalExpense = entries.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amountMinor, 0)
  const totalIncome = entries.filter((e) => e.type === 'income').reduce((s, e) => s + e.amountMinor, 0)

  return {
    recordCount: entries.length,
    netExpense: (totalExpense - totalIncome) / 100,
    totalExpense: totalExpense / 100,
    totalIncome: totalIncome / 100
  }
}

/** 清单关联的记账明细。 */
async function records({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'viewer')

  const where = { roomId, deleted: _.neq(true) }
  if (payload.listId) where.listId = payload.listId
  if (payload.taskId) where.taskId = payload.taskId

  const result = await pageQuery(COLLECTIONS.ledgers, where, {
    page: toInt(payload.page, 1),
    pageSize: toInt(payload.pageSize, 20),
    orderBy: 'occurredAt',
    order: 'desc'
  })

  return { total: result.total, rows: result.list }
}

/** 任务统计（供首页徽标使用）。 */
async function stats({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'viewer')

  const [pending, inProgress, completed] = await Promise.all([
    count(COLLECTIONS.tasks, { roomId, status: 'pending', deleted: NOT_DELETED }),
    count(COLLECTIONS.tasks, { roomId, status: 'in_progress', deleted: NOT_DELETED }),
    count(COLLECTIONS.tasks, { roomId, status: 'completed', deleted: NOT_DELETED })
  ])

  return { pending, inProgress, completed, total: pending + inProgress + completed }
}

module.exports = {
  list,
  allStatus,
  completedList,
  add,
  update: edit,
  delete: remove,
  assign,
  complete,
  reset,
  listLists,
  createList,
  deleteList,
  summary,
  records,
  stats,
}
