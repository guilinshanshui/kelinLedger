const { COLLECTIONS, getOne, getById } = require('./db')
const { forbidden, notFound, unauthorized } = require('./errors')

/** 角色权限等级，数值越大权限越高。默认拒绝：未登记角色没有任何权限。 */
const ROLE_RANK = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4
}

const ROLE_LABEL = {
  owner: '创建者',
  admin: '管理员',
  member: '成员',
  viewer: '只读成员'
}

function rankOf(role) {
  return ROLE_RANK[role] || 0
}

/** 当前 openid 对应的用户档案；不存在返回 null。 */
async function findUser(openid) {
  if (!openid) return null
  return getOne(COLLECTIONS.users, { openid })
}

/** 必须登录。 */
async function requireUser(openid) {
  if (!openid) throw unauthorized('缺少微信身份，请重新登录')
  const user = await findUser(openid)
  if (!user) throw unauthorized('账号不存在，请重新登录')
  if (user.status === 'disabled') throw forbidden('账号已被禁用')
  return user
}

async function requireRoom(roomId) {
  if (!roomId) throw notFound('缺少房间标识')
  const room = await getById(COLLECTIONS.rooms, roomId)
  if (!room || room.status === 'deleted') throw notFound('房间不存在或已解散')
  return room
}

async function findMembership(roomId, userId) {
  return getOne(COLLECTIONS.members, { roomId, userId })
}

/**
 * 校验用户在房间内的成员身份与最低角色要求。
 * 所有涉及房间数据的读写都必须经过这里，禁止只靠前端传参。
 */
async function requireMembership(openid, roomId, minRole = 'viewer') {
  const user = await requireUser(openid)

  // 房间存在性和成员关系互不依赖，同时发起，省一次数据库往返。
  // 这条路径每个接口都要走，A/B 实测每个请求能省 50-110ms。
  // 仍旧先 await room：报错优先级和改前完全一致（房间不存在 > 不是成员）。
  const roomPromise = requireRoom(roomId)
  const memberPromise = findMembership(roomId, user.id)
  const room = await roomPromise
  const member = await memberPromise

  if (!member || member.status === 'removed') {
    throw forbidden('你不是该房间成员')
  }
  if (rankOf(member.role) < rankOf(minRole)) {
    throw forbidden(`需要${ROLE_LABEL[minRole] || minRole}权限`)
  }

  return { user, room, member }
}

/** 前台展示用的成员快照，避免把 openid 等敏感字段返回客户端。 */
function publicUser(user) {
  if (!user) return null
  return {
    id: user.id,
    nickname: user.nickname,
    avatar: user.avatar || '',
    phone: user.phone || '',
    status: user.status || 'active'
  }
}

function publicMember(member, user) {
  return {
    id: member._id,
    userId: member.userId,
    roomId: member.roomId,
    role: member.role,
    roleLabel: ROLE_LABEL[member.role] || member.role,
    nickname: (user && user.nickname) || member.nickname || '成员',
    avatar: (user && user.avatar) || member.avatar || '',
    joinedAt: member.joinedAt
  }
}

module.exports = {
  ROLE_RANK,
  ROLE_LABEL,
  rankOf,
  findUser,
  requireUser,
  requireRoom,
  findMembership,
  requireMembership,
  publicUser,
  publicMember
}
