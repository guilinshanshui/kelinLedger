/**
 * 图标迁移：把历史数据里的 emoji 统一换成 `mc:` 前缀的 MingCute 图标名。
 *
 * 背景：分类、支付方式、账户、账本头像这些 icon 字段早期存的是 emoji，
 * 新房间已经改成写 `mc:名称`。但老房间不迁移的话，界面里就会一半矢量
 * 图标、一半彩色 emoji，风格是割裂的。
 *
 * 这里只改 icon / avatar 两个字段，不碰任何业务数据，且可重复执行
 * （已经是 mc: 的值会被跳过）。
 */

const { COLLECTIONS, listAll, update } = require('./db')

/**
 * emoji → MingCute 图标名。
 * key 统一用「去掉变体选择符」的写法，匹配前会先规范化。
 */
const EMOJI_TO_ICON = {
  // 支出分类
  '🍜': 'dinner',
  '🚗': 'car',
  '🛍': 'shopping-bag-3',
  '🏠': 'home-5',
  '💡': 'flash',
  '💊': 'first-aid-kit',
  '📚': 'book-2',
  '🎮': 'game-2',
  '🎁': 'gift-2',
  '🐾': 'cat',
  '📦': 'puzzled',
  '🧩': 'puzzled',
  // 收入分类
  '💰': 'receive-money',
  '🏆': 'trophy',
  '📈': 'chart-line',
  '🧾': 'ticket',
  '🧧': 'red-packet',
  '🧮': 'counter-2',
  '➕': 'add-circle',
  '🐷': 'pig-money',
  // 支付方式 / 账户
  '💚': 'wechat',
  '💙': 'alipay',
  '💳': 'bank-card',
  '💵': 'cash-2',
  '🪙': 'coin',
  // 空间
  '🏡': 'home-2',
  '👨‍👩‍👧': 'group-2',
  '💞': 'love',
  '🛋': 'sofa',
  '✈': 'airplane',
  '🍼': 'baby',
  '💼': 'briefcase',
  '🏃': 'run',
  '🧳': 'luggage',
  '⭐': 'star-2',
  '🌱': 'leaf',
  '🍃': 'leaf',
  '🎨': 'palette-2',
  '🎯': 'aiming-2',
  '📒': 'notebook-2',
  // 功能与页面
  '📋': 'list-check-3',
  '📅': 'calendar-2',
  '✨': 'sparkles-2',
  '👤': 'user-2',
  '🙋': 'user-2',
  '🛡': 'safe-shield',
  '🔐': 'safe-shield',
  '👁': 'eye',
  '🚪': 'exit-door',
  '🔔': 'notification',
  '📊': 'chart-pie',
  '📥': 'download-2',
  '📤': 'file-upload',
  '⚙': 'settings-3',
  '📸': 'camera',
  '🚀': 'rocket',
  '🐞': 'bug',
  '🔥': 'fire',
  '⚠': 'alert',
  '👑': 'vip-2',
  '📬': 'mail',
  '📩': 'mail',
  '📭': 'mail-open',
  '☀': 'sun',
  '🌙': 'moon',
  '📄': 'file',
  '📎': 'attachment',
  '✏': 'pencil',
  '✓': 'check-2',
  '🎂': 'cake',
  '⏰': 'clock-2',
  '⏳': 'clock-2',
  '🏷': 'tag',
  '🛒': 'shopping-cart-2',
  '🚨': 'alert-octagon',
  '✎': 'pencil',
  '✕': 'close'
}

/** 需要迁移的集合与字段。 */
const TARGETS = [
  { collection: COLLECTIONS.categories, field: 'icon' },
  { collection: COLLECTIONS.payMethods, field: 'icon' },
  { collection: COLLECTIONS.accounts, field: 'icon' },
  { collection: COLLECTIONS.rooms, field: 'avatar' },
  { collection: COLLECTIONS.tasks, field: 'icon' },
  { collection: COLLECTIONS.taskLists, field: 'icon' },
  { collection: COLLECTIONS.budgets, field: 'icon' },
  { collection: COLLECTIONS.notifications, field: 'icon' }
]

/** 去掉变体选择符与首尾空白，让 '🛍️' 与 '🛍' 都能命中同一项。 */
function normalizeIconValue(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/\uFE0F/g, '').trim()
}

/** 返回该值对应的 `mc:名称`；不需要迁移时返回空串。 */
function toVectorIcon(value) {
  const key = normalizeIconValue(value)
  if (!key) return ''
  const name = EMOJI_TO_ICON[key]
  return name ? `mc:${name}` : ''
}

/**
 * 扫描并迁移已知集合里的 emoji 图标。
 * 云函数超时只有几秒，因此支持只传一个集合名，让调用方分次执行。
 * @param {string[]} [onlyCollections] 限定只迁移这些集合
 */
async function migrateIcons(onlyCollections) {
  const summary = {}
  const wanted = Array.isArray(onlyCollections) && onlyCollections.length
    ? TARGETS.filter((item) => onlyCollections.includes(item.collection))
    : TARGETS

  for (const { collection, field } of wanted) {
    let rows = []
    try {
      rows = await listAll(collection, {})
    } catch (error) {
      summary[collection] = { error: error.message }
      continue
    }

    let scanned = 0
    let changed = 0
    for (const row of rows) {
      scanned += 1
      const next = toVectorIcon(row[field])
      if (!next) continue
      await update(collection, row._id, { [field]: next })
      changed += 1
    }
    summary[collection] = { scanned, changed }
  }

  return summary
}

module.exports = { EMOJI_TO_ICON, TARGETS, normalizeIconValue, toVectorIcon, migrateIcons }
