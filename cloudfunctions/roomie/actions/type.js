/**
 * 类型/选项配置模块。
 *
 * 这些是纯静态字典（空间模板、图标、功能菜单、决策轮盘选项），
 * 没有读写需求，因此在云函数内声明，避免前端各自硬编码导致不一致。
 */

// 功能模块字典已抽到 lib/roomFeatures.js，这里只做转发，避免两处各写一份
const { ROOM_FEATURES } = require('../lib/roomFeatures')

const ROOM_TEMPLATES = [
  { code: 'family', label: '家庭', icon: 'mc:home-5', desc: '一家人的共同空间' },
  { code: 'couple', label: '情侣', icon: 'mc:love', desc: '两个人一起生活' },
  { code: 'roommate', label: '合租', icon: 'mc:sofa', desc: '室友分摊与清单' },
  { code: 'travel', label: '旅行', icon: 'mc:airplane', desc: '出行 AA 与行程' },
  { code: 'custom', label: '自定义', icon: 'mc:palette-2', desc: '自己定义名称与图标' }
]

const ROOM_ICONS = [
  { label: '家庭', icon: 'mc:home-5' },
  { label: '情侣', icon: 'mc:love' },
  { label: '合租', icon: 'mc:sofa' },
  { label: '旅行', icon: 'mc:airplane' },
  { label: '宝宝', icon: 'mc:baby' },
  { label: '宠物', icon: 'mc:cat' },
  { label: '工作', icon: 'mc:briefcase' },
  { label: '学习', icon: 'mc:book-2' },
  { label: '运动', icon: 'mc:run' },
  { label: '美食', icon: 'mc:dinner' },
  { label: '游戏', icon: 'mc:game-2' },
  { label: '存钱', icon: 'mc:pig-money' },
  { label: '礼物', icon: 'mc:gift-2' },
  { label: '旅行箱', icon: 'mc:luggage' },
  { label: '星星', icon: 'mc:star-2' },
  { label: '植物', icon: 'mc:leaf' }
]

const WHEEL_PRESETS = [
  { id: 'food', label: '今天吃什么', options: ['火锅', '烧烤', '日料', '炒菜', '面条', '外卖'] },
  { id: 'chore', label: '谁来做家务', options: ['我', '你', '一起', '明天', '石头剪刀布'] },
  { id: 'reward', label: '奖励什么', options: ['奶茶', '电影', '游戏时间', '购物', '睡懒觉'] },
  { id: 'yesno', label: '要不要做', options: ['要', '不要', '再想想'] }
]

const all = () => Promise.resolve(ROOM_FEATURES)

module.exports = {
  // /roomFeature/all
  roomFeatureAll: () => ROOM_FEATURES,
  // /roomTemplate/all
  roomTemplateAll: () => ROOM_TEMPLATES,
  // /roomIcon/all
  roomIconAll: () => ROOM_ICONS,
  // /decisionWheel/list?priorityId=xxx
  decisionWheelList: ({ query }) => {
    const priorityId = (query && query.priorityId) || ''
    if (priorityId) {
      const matched = WHEEL_PRESETS.find((item) => item.id === priorityId)
      return matched ? matched.options.map((label, index) => ({ id: `${matched.id}_${index}`, label })) : []
    }
    return WHEEL_PRESETS
  },
  all
}
