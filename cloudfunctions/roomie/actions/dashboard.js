const room = require('./room')
const ledger = require('./ledger')

/**
 * 看板首屏聚合接口。
 *
 * 首屏原来要发 4 次云调用：房间详情 / 成员 / 流水列表 / 流水汇总。
 * 每次往返约 0.5s，而且「房间详情」必须先返回，页面才知道渲染哪个 tab，
 * 等于又串行了一次。这里在云端用 Promise.all 并行取好，一次返回，
 * 前端首屏只发 1 次请求。
 *
 * 返回结构对齐各接口原有的 data：
 *   room         -> room.detail 的返回值
 *   members      -> room.members 的返回值
 *   ledgerList   -> ledger.list 的返回值（{ list, total }）
 *   ledgerSummary-> ledger.summary 的返回值
 */
async function home({ openid, payload = {}, query = {} }) {
  const roomId = payload.roomId || query.roomId
  // 每个子接口都按自己的签名读 payload/query/params，这里统一喂一个最小上下文
  const ctx = () => ({ openid, payload: { roomId }, query: { roomId }, params: [] })

  const [roomDetail, members, ledgerList, ledgerSummary] = await Promise.all([
    room.detail(ctx()),
    room.members(ctx()),
    ledger.list(ctx()),
    ledger.summary(ctx())
  ])

  return { room: roomDetail, members, ledgerList, ledgerSummary }
}

module.exports = { home }
