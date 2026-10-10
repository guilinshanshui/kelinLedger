export const APP_THEME_STORAGE_KEY = 'app_theme'
/** 用户是否在换肤弹窗中主动选择过主题 */
export const APP_THEME_USER_SET_KEY = 'app_theme_user_set'

export interface AppThemePreset {
  id: 'daiqing' | 'nuanzhe'
  name: string
  primary: string
  soft: string
  secondary: string
  /** 文字阶，与 App.vue 的 --text-* 一一对应 */
  textInk: string
  textSub: string
  textMuted: string
  textFaint: string
  /** 支出 / 收入在图表、金额、图例里当色卡用，跟主题一起切 */
  expense: string
  income: string
  /** 同上，用于图标底、标签底一类的浅色块 */
  expenseSoft: string
  incomeSoft: string
  /** 警示（超支 / 导入异常）文案色，必须是能压白底的深琥珀 */
  warning: string
  warningSoft: string
}

/**
 * 主题唯一来源。
 * 颜色值与 App.vue 中的 CSS 变量一一对应；换色时两处一起改。
 * - 黛青：冷调、克制，默认主题
 * - 暖赭：暖调、纸本账本气质
 */
export const APP_THEME_PRESETS: AppThemePreset[] = [
  {
    id: 'daiqing',
    name: '黛青',
    primary: '#2F5D6B',
    soft: '#E9F0F2',
    secondary: '#416F7B',
    textInk: '#1E293B',
    textSub: '#4E5F74',
    textMuted: '#5D6E84',
    textFaint: '#66788D',
    expense: '#B84A42',
    income: '#317F62',
    expenseSoft: '#F6E7E5',
    incomeSoft: '#E6F0EB',
    warning: '#B45309',
    warningSoft: '#FFFBEB'
  },
  {
    id: 'nuanzhe',
    name: '暖赭',
    primary: '#6F5643',
    soft: '#F3EDE7',
    secondary: '#8A6B53',
    textInk: '#2E2A26',
    textSub: '#665D55',
    textMuted: '#746A60',
    textFaint: '#80746A',
    expense: '#A9483F',
    income: '#3F7D5B',
    expenseSoft: '#F7E7E4',
    incomeSoft: '#E8F0E9',
    warning: '#A94A08',
    warningSoft: '#FDF6EC'
  }
]

export const DEFAULT_APP_THEME_ID: AppThemePreset['id'] = 'daiqing'

export function isValidAppThemeId(id: unknown): id is AppThemePreset['id'] {
  return typeof id === 'string' && APP_THEME_PRESETS.some((t) => t.id === id)
}

export function getAppThemeById(id?: string): AppThemePreset {
  return APP_THEME_PRESETS.find((t) => t.id === id) || APP_THEME_PRESETS[0]
}

/**
 * 应用启动时解析主题：
 * - 存储值命中黛青 / 暖赭 -> 保留
 * - 旧主题 id 或非法值 -> 清除并回到黛青
 */
export function initAppThemeOnLaunch(): AppThemePreset['id'] {
  const stored = uni.getStorageSync(APP_THEME_STORAGE_KEY)
  if (isValidAppThemeId(stored)) {
    return stored
  }
  uni.removeStorageSync(APP_THEME_STORAGE_KEY)
  uni.removeStorageSync(APP_THEME_USER_SET_KEY)
  return DEFAULT_APP_THEME_ID
}

export function getStoredAppThemeId(): AppThemePreset['id'] {
  const stored = uni.getStorageSync(APP_THEME_STORAGE_KEY)
  return isValidAppThemeId(stored) ? stored : DEFAULT_APP_THEME_ID
}

export function hasUserSetAppTheme(): boolean {
  return (
    !!uni.getStorageSync(APP_THEME_USER_SET_KEY) &&
    isValidAppThemeId(uni.getStorageSync(APP_THEME_STORAGE_KEY))
  )
}

/**
 * tabBar 位置与图标文件编号的对应关系。
 * 图标文件名里的编号沿用了设计稿命名（0/2/3），和数组下标不是一一对应。
 */
const TAB_BAR_ICONS = [
  { index: 0, base: 'tn-tabbar0' },
  { index: 1, base: 'tn-tabbar2' },
  { index: 2, base: 'tn-tabbar3' }
]

/**
 * 原生 tabBar 的选中图标是静态 PNG，不会跟随 CSS 变量变色，
 * 所以切肤时用 setTabBarItem 换一套同主题色的图标。
 */
export function applyTabBarTheme(id: string): void {
  const themeId = isValidAppThemeId(id) ? id : DEFAULT_APP_THEME_ID
  TAB_BAR_ICONS.forEach(({ index, base }) => {
    try {
      uni.setTabBarItem({
        index,
        selectedIconPath: `/static/tabbar/${base}-cur-${themeId}.png`,
        fail: () => {}
      })
    } catch (error) {
      // 非 tabBar 页面或平台不支持时忽略，不影响主题本身
    }
  })
}

export function setAppThemeId(id: string, options?: { emit?: boolean }): AppThemePreset {
  const theme = getAppThemeById(id)
  uni.setStorageSync(APP_THEME_STORAGE_KEY, theme.id)
  uni.setStorageSync(APP_THEME_USER_SET_KEY, true)
  applyTabBarTheme(theme.id)
  if (options?.emit !== false) {
    uni.$emit('update_theme', theme.id)
  }
  return theme
}
