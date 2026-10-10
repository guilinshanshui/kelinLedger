/**
 * 空间功能模块字典 —— 唯一来源。
 *
 * 之前这份定义只写在 actions/type.js 里，仅用于「新建空间 → 进阶配置」的下拉；
 * 但创建房间时既没存进库、房间详情也没返回，导致 dashboard 按 featuresList
 * 渲染 tab 的那段逻辑从来没执行过（清单中心因此完全没有入口）。
 * 抽到 lib 里让 actions 与 membership 共用同一份，并在服务端做校验。
 */

const ROOM_FEATURES = [
  { code: 'ledger', label: '家庭账本', icon: 'mc:bill', desc: '收支流水与预算' },
  { code: 'checklist', label: '家庭清单', icon: 'mc:list-check-3', desc: '任务分配与协作' },
  { code: 'schedule', label: '日程提醒', icon: 'mc:calendar-2', desc: '共享日程与生日' },
  { code: 'feed', label: '家庭动态', icon: 'mc:sparkles-2', desc: '共同记录生活' }
]

const FEATURE_CODES = ROOM_FEATURES.map((item) => item.code)

/**
 * 归一化前端传来的功能码。
 * 兼容两种写法：`['ledger','feed']` 或 `[{ code: 'ledger' }]`；
 * 不认识的值、重复值一律丢掉，避免前端传什么就存什么。
 */
function normalizeFeatureCodes(input) {
  const list = Array.isArray(input) ? input : []
  const seen = new Set()
  const out = []

  for (const raw of list) {
    const code = typeof raw === 'string' ? raw.trim() : raw && raw.code
    if (!code || !FEATURE_CODES.includes(code) || seen.has(code)) continue
    seen.add(code)
    out.push(code)
  }

  return out
}

/**
 * 把存库的功能码还原成完整定义。
 * 老房间没有 features 字段（这个功能接线之前建的），按「全开」处理，
 * 否则它们的功能 tab 会突然消失。
 */
function resolveFeatures(codes) {
  const picked = normalizeFeatureCodes(codes)
  const effective = picked.length ? picked : FEATURE_CODES
  return ROOM_FEATURES.filter((item) => effective.includes(item.code))
}

module.exports = {
  ROOM_FEATURES,
  FEATURE_CODES,
  normalizeFeatureCodes,
  resolveFeatures
}
