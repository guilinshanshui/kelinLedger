/**
 * 统一的「返回」行为。
 *
 * 小程序里 `uni.navigateBack()` 在页面栈只有一页时会直接失败并打印
 *   navigateBack:fail cannot navigate back at first page
 * 从分享卡片、扫码、`reLaunch` 进来的页面都属于这种情况——用户点了左上角
 * 返回却毫无反应，控制台还报错。
 *
 * 这里统一兜底：有上一页就正常返回，没有就切到明细 tab，保证「返回」永远有去处。
 */

/** 兜底落地页必须是 tabBar 页面，switchTab 只能跳 tab。 */
export const BACK_FALLBACK_URL = '/pages/home/home'

export function goBackSafe(fallbackUrl = BACK_FALLBACK_URL) {
  let stack = []
  try {
    stack = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  } catch (error) {
    stack = []
  }

  if (stack && stack.length > 1) {
    uni.navigateBack()
    return
  }

  uni.switchTab({
    url: fallbackUrl,
    fail: () => {
      // 兜底目标不是 tab 页时（理论上不会走到）退回首页 tab，避免静默失败
      uni.switchTab({ url: BACK_FALLBACK_URL, fail: () => {} })
    }
  })
}
