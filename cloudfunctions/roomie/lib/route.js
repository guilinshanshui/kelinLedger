const { badRequest } = require('./errors')

/**
 * 模块别名：把前端历史遗留的路径段折叠到实际 action 模块。
 * 例如 /roomDetail/detail 与 /room/detail 语义相同。
 */
const MODULE_ALIAS = {
  version: 'user',
  wechat: 'notification',
  notifications: 'notification',
  roomDetail: 'room',
  roomNumber: 'member',
  taskLedger: 'task'
}

/**
 * 少数接口无法用通用规则推导，显式登记。
 * key 为去掉首尾斜杠后的路径，value 为 `模块.方法`。
 */
const ROUTE_OVERRIDES = {
  'version/list': 'user.versionList',
  'roomIcon/all': 'type.roomIconAll',
  'roomTemplate/all': 'type.roomTemplateAll',
  'roomFeature/all': 'type.roomFeatureAll',
  'decisionWheel/list': 'type.decisionWheelList'
}

const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1)

/**
 * 把前端请求路径解析成 { module, method }。
 *
 * 支持的写法：
 *   /room/createRoom            -> room.createRoom
 *   /ledger/import/preview      -> ledger.importPreview
 *   /task/allStatus             -> task.allStatus
 *   room.createRoom             -> room.createRoom
 *   https://host/api/x/y?...    -> x.y
 */
function resolveRoute(rawAction) {
  if (typeof rawAction !== 'string' || !rawAction.trim()) {
    throw badRequest('接口地址不能为空')
  }

  let path = rawAction.trim().split('?')[0].split('#')[0]

  if (extraOverridden(path)) {
    return splitOverride(ROUTE_OVERRIDES[extraOverridden(path)])
  }

  // 已经是 module.method 形式
  if (!path.includes('/')) {
    const [module, ...rest] = path.split('.')
    if (module && rest.length) {
      const alias = MODULE_ALIAS[module] || module
      if (rest.length === 1) {
        return { module: alias, method: rest[0] }
      }
      return { module: alias, method: buildCamel(rest) }
    }
    throw badRequest(`无法识别的接口地址: ${rawAction}`)
  }

  // 去掉协议与域名
  path = path.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]+/, '')
  // 去掉查询串与多余斜杠
  const segments = path.split('/').filter(Boolean)
  if (!segments.length) {
    throw badRequest(`无法识别的接口地址: ${rawAction}`)
  }

  // 兼容带一段固定上下文前缀的部署路径（如 /api/room/list）
  if (segments.length > 1 && ['api', 'apis'].includes(segments[0])) {
    segments.shift()
  }

  const module = MODULE_ALIAS[segments[0]] || segments[0]
  let rest = segments.slice(1)
  if (!rest.length) {
    throw badRequest(`接口缺少方法名: ${rawAction}`)
  }

  // 兼容 REST 风格尾部路径参数，如 /room/invite/room_abc -> room.invite
  // 解析出的参数会原样回传给 handler，避免前端漏传 ID。
  const params = []
  while (rest.length > 1 && looksLikeId(rest[rest.length - 1])) {
    params.unshift(rest.pop())
  }

  return { module, method: buildCamel(rest), params }
}

function buildCamel(segments) {
  return segments
    .map((segment, index) => {
      // 连字符转驼峰：merchant-rules -> merchantRules
      const camel = segment.replace(/-([a-zA-Z0-9])/g, (_, char) => char.toUpperCase())
      return index === 0 ? camel : capitalize(camel)
    })
    .join('')
}

/** 判断路径段是否像实体 ID：带下划线前缀或纯数字。 */
function looksLikeId(segment) {
  return /^[a-z]{2,12}_[A-Za-z0-9]+$/.test(segment) || /^\d+$/.test(segment)
}

function extraOverridden(path) {
  const normalized = path.replace(/^\/+/, '').replace(/\/+/g, '/')
  return Object.prototype.hasOwnProperty.call(ROUTE_OVERRIDES, normalized) ? normalized : null
}

function splitOverride(value) {
  const [module, method] = value.split('.')
  return { module, method }
}

module.exports = { resolveRoute }
