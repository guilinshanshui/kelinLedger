import { onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import { getCurrentInstance } from 'vue'

/** 分享卡片图：好友是 5:4，朋友圈是 1:1，两套比例不一样，别混用 */
const SHARE_IMAGE_CARD = '/static/share-5x4.png'
const SHARE_IMAGE_TIMELINE = '/static/share-1x1.png'



export function useGlobalShare(options = {}) {
  const instance = getCurrentInstance()
  console.log("分享打印:",instance);
  if (!instance) return

  // 页面级随机一次（重要）
  // const fixedRandomTitle = getRandomTitle()

  /* ================= 分享给好友 ================= */
  onShareAppMessage((res) => {
    const title =
      typeof options.title === 'function'
        ? options.title()
        : options.title

    const path =
      typeof options.path === 'function'
        ? options.path()
        : options.path

    const inviteCode =
      typeof options.inviteCode === 'function'
        ? options.inviteCode()
        : options.inviteCode

    // 按钮分享（邀请）
    if (res.from === 'button' && inviteCode) {
      return {
        title: title || '',
        path: `/pages/index/index?roomInviteCode=${inviteCode}&from=share`,
        imageUrl: options.imageUrl || SHARE_IMAGE_CARD
      }
    }

    // 右上角菜单分享
    return {
      title: title || '',
      path: (path || '/pages/index/index') + '?from=share',
      // 不给图片时微信会截屏当卡片，滚动容器页面经常截成空白，统一用品牌图
      imageUrl: options.imageUrl || SHARE_IMAGE_CARD
    }
  })

  /* ================= 分享到朋友圈 ================= */
  onShareTimeline(() => {
    const title =
      typeof options.title === 'function'
        ? options.title()
        : options.title

    const path =
      typeof options.path === 'function'
        ? options.path()
        : options.path

    const inviteCode =
      typeof options.inviteCode === 'function'
        ? options.inviteCode()
        : options.inviteCode

    // 朋友圈没有 path，只有 query
    let query = 'from=timeline'

    if (inviteCode) {
      query += `&roomInviteCode=${inviteCode}`
    }

    return {
      title: title || '',
      query,
      // 朋友圈卡片是 1:1，用方形版本，避免被裁掉品牌名
      imageUrl: options.imageUrl || SHARE_IMAGE_TIMELINE
    }
  })
}
