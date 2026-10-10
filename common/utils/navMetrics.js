/**
 * 自定义导航栏尺寸。
 *
 * 微信小程序使用 navigationStyle: custom 时，页面内容会从屏幕顶部开始绘制，
 * 必须自己给状态栏和右上角胶囊按钮留出空间，否则标题会被状态栏 / 胶囊压住。
 *
 * 这里统一计算，避免各页面写死 44px 在不同机型上错位。
 */
export function getNavMetrics() {
  let statusBarHeight = 20
  let navBarHeight = 44

  try {
    const sys = uni.getSystemInfoSync()
    if (sys && sys.statusBarHeight) statusBarHeight = sys.statusBarHeight
  } catch (error) {
    // 读取失败时退回默认值
  }

  try {
    const menu = typeof uni.getMenuButtonBoundingClientRect === 'function'
      ? uni.getMenuButtonBoundingClientRect()
      : null
    if (menu && menu.top && menu.height) {
      // 胶囊上下留白对称，反推导航栏内容高度
      navBarHeight = (menu.top - statusBarHeight) * 2 + menu.height
    }
  } catch (error) {
    // 非小程序端或接口不可用时退回默认值
  }

  if (!(navBarHeight > 0)) navBarHeight = 44

  return {
    statusBarHeight,
    navBarHeight,
    /** 导航栏总高度（状态栏 + 内容区） */
    totalHeight: statusBarHeight + navBarHeight
  }
}
