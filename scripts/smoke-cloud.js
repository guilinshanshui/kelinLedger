#!/usr/bin/env node
/**
 * 云函数冒烟测试。
 *
 * 用内存数据库替换 wx-server-sdk，驱动 cloudfunctions/roomie 跑通完整业务链路：
 *   登录 → 建房 → 邀请加入 → 改权限 → 记账 → 建任务 → 完成任务 → 动态 → 通知 → 移除成员
 *
 * 用途：在没有云环境的机器上验证路由、权限与核心业务逻辑是否自洽。
 * 运行：node scripts/smoke-cloud.js
 */

const Module = require('module')
const path = require('path')

// ---------- 内存数据库 ----------

const store = new Map()
const table = (name) => {
  if (!store.has(name)) store.set(name, [])
  return store.get(name)
}

const op = (kind, value) => ({
  __op: kind,
  value,
  and(other) {
    return { __op: 'and', parts: [this, other] }
  }
})

const command = {
  aggregate: {},
  neq: (v) => op('neq', v),
  in: (v) => op('in', v),
  inc: (v) => op('inc', v),
  gte: (v) => op('gte', v),
  lte: (v) => op('lte', v)
}

function evalOp(actual, cond) {
  if (!cond || typeof cond !== 'object' || !cond.__op) return undefined

  switch (cond.__op) {
    case 'neq':
      return actual !== cond.value
    case 'in':
      return Array.isArray(cond.value) && cond.value.includes(actual)
    case 'gte':
      return actual >= cond.value
    case 'lte':
      return actual <= cond.value
    case 'and':
      return cond.parts.every((part) => evalOp(actual, part))
    default:
      return undefined
  }
}

function matches(doc, where = {}) {
  return Object.keys(where).every((key) => {
    const expected = where[key]
    const actual = doc[key]
    const result = evalOp(actual, expected)
    if (result !== undefined) return result
    if (Array.isArray(expected)) return Array.isArray(actual) && expected.every((v) => actual.includes(v))
    return actual === expected
  })
}

function makeQuery(name) {
  const state = { where: {}, order: null, skip: 0, limit: 20 }

  const api = {
    where(cond) {
      state.where = cond || {}
      return api
    },
    orderBy(field, direction) {
      state.order = { field, direction }
      return api
    },
    skip(n) {
      state.skip = n
      return api
    },
    limit(n) {
      state.limit = n
      return api
    },
    async get() {
      let rows = table(name).filter((doc) => matches(doc, state.where))
      if (state.order) {
        const { field, direction } = state.order
        rows = rows.slice().sort((a, b) => {
          const av = a[field] || ''
          const bv = b[field] || ''
          return direction === 'desc' ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv))
        })
      }
      return { data: rows.slice(state.skip, state.skip + state.limit).map((doc) => ({ ...doc })) }
    },
    async count() {
      return { total: table(name).filter((doc) => matches(doc, state.where)).length }
    },
    async add({ data }) {
      table(name).push({ ...data })
      return { _id: data._id }
    },
    async update({ data }) {
      let updated = 0
      table(name).forEach((doc, index) => {
        if (!matches(doc, state.where)) return
        const next = { ...doc }
        Object.keys(data).forEach((key) => {
          const value = data[key]
          if (value && typeof value === 'object' && value.__op === 'inc') {
            next[key] = (next[key] || 0) + value.value
          } else {
            next[key] = value
          }
        })
        table(name)[index] = next
        updated += 1
      })
      return { stats: { updated } }
    },
    async remove() {
      const keep = []
      let removed = 0
      table(name).forEach((doc) => {
        if (matches(doc, state.where)) removed += 1
        else keep.push(doc)
      })
      store.set(name, keep)
      return { stats: { removed } }
    }
  }

  return api
}

let currentOpenId = 'openid_a'

const fakeSdk = {
  init() {},
  DYNAMIC_CURRENT_ENV: 'test-env',
  database: () => ({
    collection: makeQuery,
    createCollection: async (name) => {
      // 模拟真实云：重复创建集合时返回“已存在”错误，用于验证补建逻辑能吞掉它
      if (store.has(name)) {
        const error = new Error(
          'createCollection:fail -501001 resource system error. [ResourceUnavailable.ResourceExist] Table exist.'
        )
        error.errCode = -501001
        error.errMsg = error.message
        throw error
      }
      table(name)
      return { ok: true }
    },
    command
  }),
  getWXContext: () => ({ OPENID: currentOpenId, APPID: 'wxtest', UNIONID: '' }),
  downloadFile: async () => ({ fileContent: Buffer.from('') }),
  getTempFileURL: async ({ fileList }) => ({ fileList: fileList.map((fileID) => ({ fileID, tempFileURL: fileID })) })
}

const originalLoad = Module._load
Module._load = function patched(request) {
  if (request === 'wx-server-sdk') return fakeSdk
  return originalLoad.apply(this, arguments)
}

const entry = require(path.join(__dirname, '..', 'cloudfunctions', 'roomie', 'index.js'))

// ---------- 断言 ----------

let passed = 0
const failures = []

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`  ✓ ${label}`)
  } else {
    failures.push(label)
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

async function call(action, payload = {}, query = {}, openid = currentOpenId) {
  currentOpenId = openid
  const res = await entry.main({ action, payload, query })
  return res
}

async function callOk(action, payload = {}, query = {}, openid = currentOpenId) {
  const res = await call(action, payload, query, openid)
  if (res.code !== 0) {
    throw new Error(`${action} 失败: [${res.code}] ${res.message}`)
  }
  return res.data
}

/** 预期失败的调用：屏蔽云函数内部的错误堆栈，避免干扰测试输出。 */
async function callExpectFailure(action, payload = {}, query = {}, openid = currentOpenId) {
  const originalError = console.error
  console.error = () => {}
  try {
    return await call(action, payload, query, openid)
  } finally {
    console.error = originalError
  }
}

// ---------- 业务流程 ----------

async function main() {
  console.log('\n[1] 用户登录')
  // 新用户首次登录：资料未完善 → 云函数返回 333，登录页据此弹出资料完善弹窗
  const firstA = await call('/user/wxEmoteLogin', {}, {}, 'openid_a')
  check('新用户首次登录返回 333', firstA.code === 333, `code=${firstA.code}`)
  check('333 返回用户数据供资料弹窗使用', !!(firstA.data && firstA.data.id))
  check('333 不发放登录态 token', !(firstA.data && firstA.data.token))

  const completedA = await callOk(
    '/user/update',
    { nickname: '小林', avatar: 'cloud://avatar-a.png' },
    {},
    'openid_a'
  )
  check('完善资料后下发 token', !!completedA.token)
  check('完善资料后昵称已落库', completedA.nickname === '小林', `${completedA.nickname}`)
  check('完善资料后头像已落库', completedA.avatar === 'cloud://avatar-a.png')

  // 资料完善后再次登录：直接成功，不再拦截
  const userA = await callOk('/user/wxEmoteLogin', {}, {}, 'openid_a')
  const userB = await callOk(
    '/user/wxEmoteLogin',
    { nickname: '小陈', avatar: 'cloud://avatar-b.png' },
    {},
    'openid_b'
  )
  check('两个账号分别建档', userA.id !== userB.id, `${userA.id} / ${userB.id}`)
  check('登录返回 token', !!userA.token)
  check('首次登录标记 isNewUser', userB.isNewUser === true)
  check('返回 userId 兼容字段（前端历史命名）', userA.userId === userA.id, `${userA.userId}`)
  check('返回房间数字段', userA.roomCount === 0 && userA.roomsCount === 0, `${userA.roomCount}`)

  console.log('\n[2] 创建空间')
  const room = await callOk('/room/createRoom', { name: '幸福一家', currentUserId: userA.id }, {}, 'openid_a')
  check('空间已创建', !!room.id)
  check('创建者角色为 owner', room.role === 'owner', room.role)

  const categories = await callOk('/ledger/category/list', {}, { roomId: room.id }, 'openid_a')
  check('建房时初始化了分类', categories.length > 10, `分类数 ${categories.length}`)

  const refreshed = await callOk('/user/info', {}, {}, 'openid_a')
  check('用户资料包含空间数', refreshed.roomCount === 1, `${refreshed.roomCount}`)

  const payMethods = await callOk('/ledger/category/list', {}, { roomId: room.id, type: 'transfer' }, 'openid_a')
  check('初始化了支付方式', payMethods.length >= 4, `支付方式数 ${payMethods.length}`)

  console.log('\n[3] 邀请与加入')
  const invite = await callOk('/room/invite', { roomId: room.id }, {}, 'openid_a')
  check('生成了邀请码', /^[A-Z0-9]{6}$/.test(invite.code), invite.code)

  const joined = await callOk('/room/join', { inviteCode: invite.code }, {}, 'openid_b')
  check('成员通过邀请码加入', joined.id === room.id)

  let members = await callOk('/roomDetail/members', {}, { roomId: room.id }, 'openid_a')
  check('空间有 2 名成员', members.length === 2, `实际 ${members.length}`)

  console.log('\n[4] 成员权限管理')
  const promoted = await callOk(
    '/room/permission/updateRole',
    { roomId: room.id, userId: userB.id, role: 'admin' },
    {},
    'openid_a'
  )
  check('提升成员为管理员', promoted.role === 'admin')

  const detail = await callOk('/room/permission/detail', {}, { roomId: room.id }, 'openid_b')
  check('管理员可管理成员', detail.canManage === true)

  // 越权：普通成员不能改角色
  const outsider = await callExpectFailure('/room/permission/updateRole', { roomId: room.id, userId: userA.id, role: 'member' }, {}, 'openid_b')
  check('不能修改创建者角色', outsider.code !== 0, `code=${outsider.code}`)

  console.log('\n[5] 记账')
  const smokeAccounts = await callOk('/ledger/account/list', {}, { roomId: room.id }, 'openid_a')
  const entry1 = await callOk(
    '/ledger/add',
    { roomId: room.id, type: 'expense', amount: 128.5, categoryId: categories[0].id, payMethodId: payMethods[0].id, accountId: smokeAccounts[0].id, note: '买菜' },
    {},
    'openid_a'
  )
  check('金额以分为单位存储', entry1.amountMinor === 12850, `${entry1.amountMinor}`)

  await callOk(
    '/ledger/add',
    { roomId: room.id, type: 'income', amount: 8000, categoryId: categories.find((c) => c.type === 'income').id, accountId: smokeAccounts[0].id, note: '工资' },
    {},
    'openid_b'
  )

  const month = await callOk('/ledger/month', {}, { roomId: room.id, year: new Date().getFullYear(), month: new Date().getMonth() + 1 }, 'openid_a')
  check('本月支出汇总正确', month.summary.totalExpense === 128.5, `${month.summary.totalExpense}`)
  check('本月收入汇总正确', month.summary.totalIncome === 8000, `${month.summary.totalIncome}`)
  check('按日分组存在', month.groups.length >= 1)

  console.log('\n[6] 任务管理')
  const task = await callOk(
    '/task/add',
    { roomId: room.id, title: '交房租', assigneeId: userA.id, priority: 'high' },
    {},
    'openid_b'
  )
  check('任务创建成功', task.status === 'pending')
  check('任务记录了负责人', task.assigneeId === userA.id)

  const beforeComplete = await callOk('/task/allStatus', {}, { roomId: room.id }, 'openid_a')
  check('待办列表有 1 条', beforeComplete.pending.length === 1, `${beforeComplete.pending.length}`)

  await callOk('/task/complete', { id: task.id, roomId: room.id }, {}, 'openid_a')
  const afterComplete = await callOk('/task/allStatus', {}, { roomId: room.id }, 'openid_a')
  check('完成任务后进入已完成分组', afterComplete.completed.length === 1)
  check('待办清空', afterComplete.pending.length === 0)

  await callOk('/task/reset', { id: task.id, roomId: room.id }, {}, 'openid_a')
  const afterReset = await callOk('/task/allStatus', {}, { roomId: room.id }, 'openid_a')
  check('任务可恢复为待办', afterReset.pending.length === 1)

  const taskStats = await callOk('/task/stats', {}, { roomId: room.id }, 'openid_a')
  check('任务统计可用', taskStats.total === 1)

  console.log('\n[7] 动态')
  const feeds = await callOk('/feed/list', {}, { roomId: room.id }, 'openid_a')
  check('自动生成了动态', feeds.list.length >= 4, `动态数 ${feeds.list.length}`)
  check('任务完成/创建产生动态', feeds.list.some((f) => f.type === 'task_create'))
  check('成员加入产生动态', feeds.list.some((f) => f.type === 'member_join'))
  check('记账产生动态', feeds.list.some((f) => f.type === 'ledger_add'))

  const liked = await callOk('/feed/like', { feedId: feeds.list[0].id, roomId: room.id }, {}, 'openid_b')
  check('点赞成功', liked.liked === true && liked.likeCount === 1)

  const manualFeed = await callOk('/feed/create', { roomId: room.id, content: '今天大扫除' }, {}, 'openid_a')
  check('手动发布动态', manualFeed.content === '今天大扫除')

  console.log('\n[8] 通知')
  const notifications = await callOk('/notifications/list', {}, { roomId: room.id }, 'openid_a')
  check('产生了站内通知', notifications.list.length >= 1, `通知数 ${notifications.list.length}`)

  const unread = await callOk('/notifications/unreadCount', {}, { roomId: room.id }, 'openid_a')
  check('未读数可查询', typeof unread.count === 'number')

  await callOk('/notifications/markRead', {}, { roomId: room.id }, 'openid_a')
  const afterRead = await callOk('/notifications/unreadCount', {}, { roomId: room.id }, 'openid_a')
  check('全部标记已读后未读归零', afterRead.count === 0, `${afterRead.count}`)

  console.log('\n[9] 首页概览')
  const dashboard = await callOk('/room/dashboard/overview', {}, { roomId: room.id }, 'openid_a')
  check('概览包含本月支出', dashboard.totalExpense === 128.5, `${dashboard.totalExpense}`)
  check('概览包含任务数', dashboard.pendingTasks === 1, `${dashboard.pendingTasks}`)
  check('概览包含成员/流水数', dashboard.entryCount === 2, `${dashboard.entryCount}`)

  console.log('\n[10] 移除成员与数据隔离')
  await callOk('/roomNumber/removeMember', { roomId: room.id, userId: userB.id }, {}, 'openid_a')
  members = await callOk('/roomDetail/members', {}, { roomId: room.id }, 'openid_a')
  check('成员已被移除', members.length === 1, `实际 ${members.length}`)

  const blocked = await callExpectFailure('/ledger/list', {}, { roomId: room.id }, 'openid_b')
  check('被移除成员无法再读写空间数据', blocked.code === 403, `code=${blocked.code}`)

  const outsiderRoom = await callOk('/room/createRoom', { name: '外部空间' }, {}, 'openid_b')
  const crossRoom = await callExpectFailure('/task/add', { roomId: room.id, title: '越权任务' }, {}, 'openid_b')
  check('非成员不能向其他空间写数据', crossRoom.code === 403, `code=${crossRoom.code}`)
  check('独立空间互不影响', outsiderRoom.id !== room.id)

  console.log('\n[11] 未实现接口的降级')
  const unknown = await callExpectFailure('/not/exist')
  check('未知接口返回可读错误', unknown.code === 404, `code=${unknown.code}`)

  console.log('\n[19] 分类按维度过滤（GET 参数走 query）')
  // 前端 get() 把参数放进 query，这里按同样方式验证后端能读到并过滤
  const expenseCats = await callOk('/ledger/category/list', {}, { roomId: room.id, type: 'expense' }, 'openid_a')
  const incomeCats = await callOk('/ledger/category/list', {}, { roomId: room.id, type: 'income' }, 'openid_a')
  const dimPayMethods = await callOk('/ledger/category/list', {}, { roomId: room.id, type: 'transfer' }, 'openid_a')

  check('支出分类非空', expenseCats.length > 0, expenseCats.length + ' 条')
  check('收入分类非空', incomeCats.length > 0, incomeCats.length + ' 条')
  check('支出分类全部是 expense 类型', expenseCats.every((c) => c.type === 'expense'), expenseCats.map((c) => c.name + ':' + c.type).join(','))
  check('收入分类全部是 income 类型', incomeCats.every((c) => c.type === 'income'), incomeCats.map((c) => c.name + ':' + c.type).join(','))
  check('支付方式全部是 transfer 类型', dimPayMethods.every((c) => c.type === 'transfer'), dimPayMethods.map((c) => c.name + ':' + c.type).join(','))

  // 三个维度不能有交集（这正是之前串数据的表现）
  const expenseIds = new Set(expenseCats.map((c) => c.id))
  const incomeIds = new Set(incomeCats.map((c) => c.id))
  const overlap = [...expenseIds].filter((id) => incomeIds.has(id))
  check('支出与收入分类不重叠', overlap.length === 0, overlap.join(','))

  // ---------- 汇总 ----------
  console.log('\n[17] 统计分析：四种查询范围')
  const room3 = await callOk('/room/createRoom', { name: '统计测试空间' }, {}, 'openid_a')
  const cats3 = await callOk('/ledger/category/list', {}, { roomId: room3.id }, 'openid_a')
  const acc3 = await callOk('/ledger/account/list', {}, { roomId: room3.id }, 'openid_a')

  // 刻意跨月、跨年造三笔，用于验证范围过滤真的生效
  const seedPlan = [
    { occurredAt: '2026-10-04T12:00:00.000Z', amount: 100, note: '本月' },
    { occurredAt: '2026-09-15T12:00:00.000Z', amount: 200, note: '上月' },
    { occurredAt: '2025-12-20T12:00:00.000Z', amount: 400, note: '去年' }
  ]
  for (const item of seedPlan) {
    await callOk(
      '/ledger/add',
      {
        roomId: room3.id,
        type: 'expense',
        amount: item.amount,
        note: item.note,
        categoryId: cats3[0].id,
        accountId: acc3[0].id,
        occurredAt: item.occurredAt
      },
      {},
      'openid_a'
    )
  }

  const byMonth = await callOk('/ledger/stats',
    { roomId: room3.id, rangeType: 'month', year: 2026, month: 10 }, {}, 'openid_a')
  check('自然月：只统计该月', byMonth.summary.expense === 100 && byMonth.summary.count === 1,
    `支出 ${byMonth.summary.expense} / 笔数 ${byMonth.summary.count}`)
  check('自然月：区间标签可读', byMonth.range.label.includes('2026') && byMonth.range.label.includes('10'),
    byMonth.range.label)

  const byYear = await callOk('/ledger/stats',
    { roomId: room3.id, rangeType: 'year', year: 2026 }, {}, 'openid_a')
  check('自然年：统计整年（10 月 + 9 月）', byYear.summary.expense === 300 && byYear.summary.count === 2,
    `支出 ${byYear.summary.expense} / 笔数 ${byYear.summary.count}`)
  check('自然年：按月聚合', byYear.granularity === 'month', byYear.granularity)

  const byAll = await callOk('/ledger/stats',
    { roomId: room3.id, rangeType: 'all' }, {}, 'openid_a')
  check('全部：包含跨年数据', byAll.summary.expense === 700 && byAll.summary.count === 3,
    `支出 ${byAll.summary.expense} / 笔数 ${byAll.summary.count}`)
  check('全部：区间标签为「全部」', byAll.range.label === '全部', byAll.range.label)

  const byCustom = await callOk('/ledger/stats',
    { roomId: room3.id, rangeType: 'custom', startDate: '2026-09-01', endDate: '2026-09-30' },
    {},
    'openid_a'
  )
  check('自定义：只统计区间内', byCustom.summary.expense === 200 && byCustom.summary.count === 1,
    `支出 ${byCustom.summary.expense} / 笔数 ${byCustom.summary.count}`)

  const tooWide = await callExpectFailure('/ledger/stats',
    { roomId: room3.id, rangeType: 'custom', startDate: '2024-01-01', endDate: '2026-12-31' },
    {},
    'openid_a'
  )
  check('自定义：超过 12 个月被拒绝', tooWide.code === 400, `code=${tooWide.code}`)

  check('分类排行按金额降序且合计等于总支出',
    byAll.expenseCategories.length >= 1 &&
      Math.round(byAll.expenseCategories.reduce((s, c) => s + c.amount, 0)) === 700,
    `分类合计 ${byAll.expenseCategories.reduce((s, c) => s + c.amount, 0)}`)
  check('成员维度可聚合', Array.isArray(byAll.members) && byAll.members.length === 1,
    `成员数 ${byAll.members.length}`)

  // 时间轴完整性：不能只画有数据的时段，否则间隔月份会被画成相邻
  check('自然年：趋势补全 12 个月桶', byYear.trend.length === 12,
    `桶数 ${byYear.trend.length}`)
  check('自然年：空月份标记为 empty 而不是 0',
    byYear.trend.filter((p) => p.empty).length === 10 &&
      byYear.trend.filter((p) => !p.empty).length === 2,
    `空 ${byYear.trend.filter((p) => p.empty).length} / 有数据 ${byYear.trend.filter((p) => !p.empty).length}`)
  check('自然月：趋势补全当月每一天', byMonth.trend.length === 31,
    `桶数 ${byMonth.trend.length}`)
  check('有数据的桶带具体金额，空桶为 null',
    byYear.trend.find((p) => p.raw === '2026-10').expense === 100 &&
      byYear.trend.find((p) => p.raw === '2026-01').expense === null,
    JSON.stringify(byYear.trend.find((p) => p.raw === '2026-01')))
  check('空区间返回 isEmpty 供前端显示空态',
    (await callOk('/ledger/stats',
      { roomId: room3.id, rangeType: 'month', year: 2020, month: 1 }, {}, 'openid_a')).isEmpty === true)

  // ---------- 汇总 ----------
  console.log('\n[12] 账户与余额联动')
  const room2 = await callOk('/room/createRoom', { name: '财务测试空间' }, {}, 'openid_a')
  const seededAccounts = await callOk('/ledger/account/list', {}, { roomId: room2.id }, 'openid_a')
  check('建房时初始化了默认账户', seededAccounts.length >= 4, `${seededAccounts.length}`)
  check('默认账户余额为 0', seededAccounts.every((a) => a.balance === 0))

  const wallet = await callOk(
    '/ledger/account/save',
    { roomId: room2.id, name: '测试银行卡', type: 'bank', initial: 1000 },
    {},
    'openid_a'
  )
  check('新建账户初始余额正确', wallet.balance === 1000, `${wallet.balance}`)

  const cats2 = await callOk('/ledger/category/list', {}, { roomId: room2.id }, 'openid_a')
  const expenseEntry = await callOk(
    '/ledger/add',
    { roomId: room2.id, type: 'expense', amount: 288.5, accountId: wallet.id, categoryId: cats2[0].id },
    {},
    'openid_a'
  )
  let accs = await callOk('/ledger/account/list', {}, { roomId: room2.id }, 'openid_a')
  check('支出后余额减少', accs.find((a) => a.id === wallet.id).balance === 711.5,
    `${accs.find((a) => a.id === wallet.id).balance}`)

  await callOk('/ledger/add',
    { roomId: room2.id, type: 'income', amount: 500, accountId: wallet.id, categoryId: cats2.find((c) => c.type === 'income').id },
    {}, 'openid_a')
  accs = await callOk('/ledger/account/list', {}, { roomId: room2.id }, 'openid_a')
  check('收入后余额增加', accs.find((a) => a.id === wallet.id).balance === 1211.5,
    `${accs.find((a) => a.id === wallet.id).balance}`)

  const target = await callOk('/ledger/account/save',
    { roomId: room2.id, name: '备用金', type: 'cash', initial: 0 }, {}, 'openid_a')
  await callOk('/ledger/add',
    { roomId: room2.id, type: 'transfer', amount: 200, accountId: wallet.id, toAccountId: target.id },
    {}, 'openid_a')
  accs = await callOk('/ledger/account/list', {}, { roomId: room2.id }, 'openid_a')
  check('转账：转出账户减少', accs.find((a) => a.id === wallet.id).balance === 1011.5,
    `${accs.find((a) => a.id === wallet.id).balance}`)
  check('转账：转入账户增加', accs.find((a) => a.id === target.id).balance === 200,
    `${accs.find((a) => a.id === target.id).balance}`)

  await callOk('/ledger/delete', { roomId: room2.id, id: expenseEntry.id }, {}, 'openid_a')
  accs = await callOk('/ledger/account/list', {}, { roomId: room2.id }, 'openid_a')
  check('删除流水后余额回滚', accs.find((a) => a.id === wallet.id).balance === 1300,
    `${accs.find((a) => a.id === wallet.id).balance}`)

  const overview = await callOk('/ledger/assetOverview', {}, { roomId: room2.id }, 'openid_a')
  check('资产总览返回总余额', overview.asset.total_balance === 1500,
    `${overview.asset.total_balance}`)
  check('资产总览包含账户分类', overview.asset.categories.length >= 5, `${overview.asset.categories.length}`)
  check('资产总览包含最近流水', overview.history.length >= 1)

  console.log('\n[12.1] 账本列表（账本 Tab 卡片数据）')
  const roomList = await callOk('/room/rooms', {}, {}, 'openid_a')
  const card = roomList.find((item) => item.id === room2.id)
  check('账本列表返回支/收/结', !!card && !!card.stats, JSON.stringify(card && card.stats))
  check('账本卡片结余等于收减支',
    card.stats.balance === card.stats.income - card.stats.expense,
    `收${card.stats.income} 支${card.stats.expense} 结${card.stats.balance}`)
  check('账本卡片返回可管理标记', typeof card.canManage === 'boolean', `${card.canManage}`)

  console.log('\n[13] 预算')
  const budgetMonth = new Date().toISOString().slice(0, 7)
  await callOk('/ledger/budget/save',
    { roomId: room2.id, month: budgetMonth, amount: 1000 }, {}, 'openid_a')
  await callOk('/ledger/budget/save',
    { roomId: room2.id, month: budgetMonth, categoryId: cats2[0].id, amount: 100 },
    {}, 'openid_a')
  await callOk('/ledger/add',
    { roomId: room2.id, type: 'expense', amount: 150, accountId: target.id, categoryId: cats2[0].id },
    {}, 'openid_a')

  const progress = await callOk('/ledger/budget/progress', {}, { roomId: room2.id, month: budgetMonth }, 'openid_a')
  check('总预算进度已计算', progress.total.spent === 150, `${progress.total.spent}`)
  check('分类超支被识别', progress.categories[0].over === true, `percent=${progress.categories[0].percent}`)
  check('超支产生预警', progress.alerts.length >= 1, `${progress.alerts.length}`)

  console.log('\n[14] 分摊结算')
  const invite2 = await callOk('/room/invite', { roomId: room2.id }, {}, 'openid_a')
  await callOk('/room/join', { inviteCode: invite2.code }, {}, 'openid_b')
  const settle = await callOk('/ledger/settlement', {}, { roomId: room2.id, month: budgetMonth }, 'openid_a')
  check('结算返回每个成员的净额', settle.members.length === 2, `${settle.members.length}`)
  check('付款方标记为应收', settle.members[0].status === 'receivable', settle.members[0].status)
  check('另一方标记为应付', settle.members[1].status === 'payable', settle.members[1].status)
  const netSum = settle.members.reduce((s, m) => s + Math.round(m.net * 100), 0)
  check('净额总和为零（账平）', Math.abs(netSum) <= 1, `${netSum}`)
  check('每个应付人只对应一笔转账', settle.transfers.length === 1, `${settle.transfers.length}`)

  console.log('\n[15] 周期账单')
  const rule = await callOk('/ledger/recurring/save',
    { roomId: room2.id, title: '房租', type: 'expense', amount: 2000, dayOfMonth: 1, accountId: wallet.id },
    {}, 'openid_a')
  check('周期账单创建成功', rule.title === '房租' && rule.enabled === true)

  const gen = await callOk('/ledger/recurring/generate', { roomId: room2.id }, {}, 'openid_a')
  check('到期的周期账单已生成', gen.count === 1, `${gen.count}`)
  const genAgain = await callOk('/ledger/recurring/generate', { roomId: room2.id }, {}, 'openid_a')
  check('重复触发不会重复入账（幂等）', genAgain.count === 0, `${genAgain.count}`)
  accs = await callOk('/ledger/account/list', {}, { roomId: room2.id }, 'openid_a')
  check('周期账单已影响账户余额', accs.find((a) => a.id === wallet.id).balance === -700,
    `${accs.find((a) => a.id === wallet.id).balance}`)

  console.log('\n[16] 导出')
  const csv = await callOk('/ledger/exportCsv', {}, { roomId: room2.id }, 'openid_a')
  check('导出包含表头', csv.content.includes('日期') && csv.content.includes('金额'))
  check('导出条数与流水一致', csv.count >= 2, `${csv.count}`)
  check('导出带 BOM 便于 Excel 识别', csv.content.charCodeAt(0) === 0xfeff)

  console.log('\n[17] 转让创建者与解散清理')
  const transferRoom = await callOk('/room/createRoom', { name: '转让测试空间' }, {}, 'openid_a')
  const transferInvite = await callOk('/room/invite', { roomId: transferRoom.id }, {}, 'openid_a')
  await callOk('/room/join', { inviteCode: transferInvite.code }, {}, 'openid_b')
  const permission = await callOk('/room/permission/detail', {}, { roomId: transferRoom.id }, 'openid_a')
  check('权限详情返回 owner/teamMembers/members 三种结构',
    !!permission.owner && Array.isArray(permission.teamMembers) && Array.isArray(permission.members),
    JSON.stringify(Object.keys(permission)))
  check('权限详情返回当前角色', permission.currentRole === 'owner', permission.currentRole)

  const transferred = await callOk('/room/transferOwner',
    { roomId: transferRoom.id, targetUserId: userB.id }, {}, 'openid_a')
  check('转让后原创建者变为管理员', transferred.userRole === 'admin', transferred.userRole)
  const transferDetail = await callOk('/room/permission/detail', {}, { roomId: transferRoom.id }, 'openid_b')
  check('新创建者获得 owner 权限', transferDetail.currentRole === 'owner', transferDetail.currentRole)

  const transferListBefore = await callOk('/room/rooms', {}, {}, 'openid_a')
  check('解散前账本仍在列表中', transferListBefore.some((item) => item.id === transferRoom.id))
  await callOk('/room/delete', { roomId: transferRoom.id }, {}, 'openid_b')
  const transferListAfter = await callOk('/room/rooms', {}, {}, 'openid_a')
  check('解散后账本从成员列表移除', !transferListAfter.some((item) => item.id === transferRoom.id))
  const deletedRead = await callExpectFailure('/room/detail', { roomId: transferRoom.id }, {}, 'openid_a')
  check('解散后无法继续读取账本', deletedRead.code === 404, `code=${deletedRead.code}`)

  console.log('\n[18] 账单导入入账与余额联动')
  const importRoom = await callOk('/room/createRoom', { name: '导入测试空间' }, {}, 'openid_a')
  const importCats = await callOk('/ledger/category/list', {}, { roomId: importRoom.id }, 'openid_a')
  const importAccounts = await callOk('/ledger/account/list', {}, { roomId: importRoom.id }, 'openid_a')
  const importAccount = importAccounts[0]
  const importResult = await callOk('/ledger/import/confirm', {
    roomId: importRoom.id,
    accountId: importAccount.id,
    rows: [{
      rowId: 'row_test',
      selected: true,
      type: 'expense',
      amount: 66.6,
      amountMinor: 6660,
      categoryId: importCats[0].id,
      merchant: '测试商户',
      merchantKey: '测试商户',
      occurredAt: new Date().toISOString()
    }]
  }, {}, 'openid_a')
  check('账单导入返回成功数量', importResult.success === 1, JSON.stringify(importResult))
  const importedAccounts = await callOk('/ledger/account/list', {}, { roomId: importRoom.id }, 'openid_a')
  check('账单导入会扣减账户余额',
    importedAccounts.find((item) => item.id === importAccount.id).balance === -66.6,
    `${importedAccounts.find((item) => item.id === importAccount.id).balance}`)
  const importedMissingAccount = await callExpectFailure('/ledger/import/confirm', {
    roomId: importRoom.id,
    rows: [{ selected: true, type: 'expense', amount: 1 }]
  }, {}, 'openid_a')
  check('未选择账户时拒绝导入', importedMissingAccount.code === 400, `code=${importedMissingAccount.code}`)

  // ---------- 汇总 ----------
  console.log('='.repeat(56))
  console.log(`通过 ${passed} 项，失败 ${failures.length} 项`)
  if (failures.length) {
    console.log('失败项：')
    failures.forEach((f) => console.log(`  - ${f}`))
    process.exitCode = 1
  } else {
    console.log('云函数业务链路全部通过')
  }
}

main().catch((error) => {
  console.error('\n冒烟测试中断：', error)
  process.exitCode = 1
})
