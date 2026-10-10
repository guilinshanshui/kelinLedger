const { COLLECTIONS, insert } = require('./db')
const { nextId } = require('./id')

/**
 * 系统默认支出分类。
 * icon 字段用 `mc:图标名` 指向 MingCute 矢量图标，由前端 AppIcon 渲染成主题色；
 * 老房间遗留的 emoji 仍然照常显示，两种格式长期共存。
 */
const EXPENSE_CATEGORIES = [
  { name: '餐饮', icon: 'mc:dinner' },
  { name: '交通', icon: 'mc:car' },
  { name: '购物', icon: 'mc:shopping-bag-3' },
  { name: '居住', icon: 'mc:home-5' },
  { name: '水电', icon: 'mc:flash' },
  { name: '医疗', icon: 'mc:first-aid-kit' },
  { name: '教育', icon: 'mc:book-2' },
  { name: '娱乐', icon: 'mc:game-2' },
  { name: '人情', icon: 'mc:gift-2' },
  { name: '宠物', icon: 'mc:cat' },
  { name: '其他', icon: 'mc:puzzled' }
]

/** 系统默认收入分类。 */
const INCOME_CATEGORIES = [
  { name: '工资', icon: 'mc:receive-money' },
  { name: '奖金', icon: 'mc:trophy' },
  { name: '投资收益', icon: 'mc:chart-line' },
  { name: '兼职', icon: 'mc:file-certificate' },
  { name: '红包', icon: 'mc:red-packet' },
  { name: '报销', icon: 'mc:counter-2' },
  { name: '其他', icon: 'mc:add-circle' }
]

/** 默认支付方式。 */
const PAY_METHODS = [
  { name: '微信', icon: 'mc:wechat' },
  { name: '支付宝', icon: 'mc:alipay' },
  { name: '银行卡', icon: 'mc:bank-card' },
  { name: '现金', icon: 'mc:cash-2' },
  { name: '其他', icon: 'mc:puzzled' }
]

const SORT_STEP = 10

/**
 * 为房间初始化分类与支付方式。
 * 只在建房时调用一次，之后房间数据与系统默认解耦，允许成员自行增删改。
 */
async function seedRoom(roomId, ownerUserId) {
  const now = new Date().toISOString()

  const categories = [
    ...EXPENSE_CATEGORIES.map((item, index) => ({ ...item, type: 'expense', order: index })),
    ...INCOME_CATEGORIES.map((item, index) => ({ ...item, type: 'income', order: index }))
  ]

  await Promise.all([
    ...categories.map((item) =>
      insert(COLLECTIONS.categories, {
        _id: nextId('cat'),
        roomId,
        type: item.type,
        name: item.name,
        icon: item.icon,
        sort: item.order * SORT_STEP,
        system: true,
        createdAt: now,
        createdBy: ownerUserId
      })
    ),
    ...PAY_METHODS.map((item, index) =>
      insert(COLLECTIONS.payMethods, {
        _id: nextId('pay'),
        roomId,
        name: item.name,
        icon: item.icon,
        sort: index * SORT_STEP,
        system: true,
        createdAt: now
      })
    )
  ])
}

module.exports = {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PAY_METHODS,
  seedRoom
}
