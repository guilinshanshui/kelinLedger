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
const { badRequest, notFound, forbidden } = require('../lib/errors')
const { optionalString, toInt } = require('../lib/validate')
const { FEED_TYPES } = require('../lib/activity')

const NOT_DELETED = _.neq(true)
const roomIdOf = (payload = {}, query = {}) => payload.roomId || query.roomId

const TYPE_LABEL = {
  text: '动态',
  image: '图片',
  task_complete: '完成任务',
  task_create: '新建任务',
  ledger_add: '记账',
  schedule_create: '新日程',
  member_join: '新成员'
}

async function enrich(feeds, viewerId, viewerRole = '') {
  const userIds = Array.from(new Set(feeds.map((item) => item.userId).filter(Boolean)))
  const users = await Promise.all(userIds.map((id) => getById(COLLECTIONS.users, id)))
  const userMap = new Map(users.filter(Boolean).map((user) => [user.id || user._id, user]))

  // 创建者本人和管理员可以清除动态，其他人只能看
  const canDeleteAny = ['owner', 'admin'].includes(viewerRole)
  return feeds.map((item) => {
    const author = userMap.get(item.userId)
    const authorName = (author && author.nickname) || item.authorName || '成员'
    // 旧动态把作者昵称写在了正文里，卡片上方已单独展示作者，这里去掉重复前缀，
    // 让新老记录读起来一致（新记录本身已不带昵称）。
    let content = item.content || ''
    if (authorName && content.indexOf(`${authorName} `) === 0) {
      content = content.slice(authorName.length + 1)
    }
    return {
      id: item._id,
      roomId: item.roomId,
      userId: item.userId,
      authorName,
      authorAvatar: (author && author.avatar) || '',
      type: item.type,
      typeLabel: TYPE_LABEL[item.type] || '动态',
      content,
      images: item.images || [],
      meta: item.meta || {},
      refType: item.refType || '',
      refId: item.refId || '',
      likeCount: item.likeCount || 0,
      liked: Array.isArray(item.likedBy) ? item.likedBy.includes(viewerId) : false,
      canDelete: item.userId === viewerId || canDeleteAny,
      createTime: item.createdAt
    }
  })
}

/** 动态流，倒序。 */
async function list({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  const { user, member } = await requireMembership(openid, roomId, 'viewer')

  const result = await pageQuery(
    COLLECTIONS.feeds,
    { roomId, deleted: NOT_DELETED },
    {
      page: toInt(payload.page, 1),
      pageSize: toInt(payload.pageSize, 20),
      orderBy: 'createdAt',
      order: 'desc'
    }
  )

  return {
    ...result,
    list: await enrich(result.list, user.id, member.role),
    // 只有 owner/admin 能清空整个列表，前端据此决定要不要显示入口
    canClearAll: ['owner', 'admin'].includes(member.role)
  }
}

/** 手动发布动态。 */
async function create({ openid, payload }) {
  const roomId = roomIdOf(payload)
  const { user } = await requireMembership(openid, roomId, 'member')

  const content = optionalString(payload.content, 500)
  const images = Array.isArray(payload.images) ? payload.images.slice(0, 9) : []
  if (!content && !images.length) throw badRequest('请输入内容或选择图片')

  const type = images.length ? FEED_TYPES.IMAGE : FEED_TYPES.TEXT
  const now = new Date().toISOString()

  const doc = {
    _id: nextId('feed'),
    roomId,
    userId: user.id,
    type,
    content,
    images,
    meta: {},
    refType: '',
    refId: '',
    likeCount: 0,
    likedBy: [],
    deleted: false,
    createdAt: now
  }

  await insert(COLLECTIONS.feeds, doc)
  const [shaped] = await enrich([doc], user.id)
  return shaped
}

/** 点赞 / 取消点赞。 */
async function like({ openid, payload, params }) {
  const roomId = roomIdOf(payload)
  const { user } = await requireMembership(openid, roomId, 'member')

  const feedId = payload.feedId || payload.id || (params && params[0])
  const feed = await getById(COLLECTIONS.feeds, feedId)
  if (!feed || feed.roomId !== roomId) throw notFound('动态不存在')

  const likedBy = Array.isArray(feed.likedBy) ? feed.likedBy : []
  const hasLiked = likedBy.includes(user.id)
  const nextLikedBy = hasLiked
    ? likedBy.filter((id) => id !== user.id)
    : [...likedBy, user.id]

  await update(COLLECTIONS.feeds, feedId, {
    likedBy: nextLikedBy,
    likeCount: nextLikedBy.length
  })

  return { feedId, liked: !hasLiked, likeCount: nextLikedBy.length }
}

/** 删除自己的动态。 */
async function remove({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  const { user, member } = await requireMembership(openid, roomId, 'member')

  const feedId = payload.feedId || payload.id || query.id
  const feed = await getById(COLLECTIONS.feeds, feedId)
  if (!feed || feed.roomId !== roomId) throw notFound('动态不存在')
  if (feed.userId !== user.id && !['owner', 'admin'].includes(member.role)) {
    throw forbidden('只能删除自己发布的动态')
  }

  await update(COLLECTIONS.feeds, feedId, { deleted: true, deletedAt: new Date().toISOString() })
  return { id: feedId, deleted: true }
}

/** 清空整个动态列表（仅 owner/admin）。 */
async function clear({ openid, payload, query }) {
  const roomId = roomIdOf(payload, query)
  await requireMembership(openid, roomId, 'admin')

  const rows = await listAll(COLLECTIONS.feeds, { roomId, deleted: NOT_DELETED })
  const now = new Date().toISOString()
  await Promise.all(
    rows.map((item) => update(COLLECTIONS.feeds, item._id, { deleted: true, deletedAt: now }))
  )

  return { cleared: rows.length }
}

module.exports = {
  list,
  create,
  like,
  clear,
  delete: remove
}
