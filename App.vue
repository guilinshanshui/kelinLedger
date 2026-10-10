<template>
  <!-- uni-app 应用壳：页面由 pages.json 路由，此处仅满足组件模板要求 -->
  <view class="app-root" />
</template>

<script>
import { useUserStore } from '@/store/user'
import { applyTabBarTheme, getAppThemeById, getStoredAppThemeId, initAppThemeOnLaunch, setAppThemeId } from '@/common/themes/appTheme'
import { initCloud, isCloudAvailable } from '@/common/utils/cloud'


/** 同步小程序原生 tabBar 的选中色；H5 端不支持时静默跳过 */
function syncNativeTheme(id) {
  const theme = getAppThemeById(id)
  // 选中图标是静态 PNG，不会跟随 CSS 变量，需要换一套同主题色的
  applyTabBarTheme(id)
  if (typeof uni.setTabBarStyle !== 'function') return
  try {
    uni.setTabBarStyle({
      color: '#94A3B8',
      selectedColor: theme.primary,
      backgroundColor: '#FFFFFF',
      borderStyle: 'white',
      fail: () => {}
    })
  } catch (error) {
    console.warn('同步 tabBar 主题色失败：', error)
  }
}


export default {
  onLaunch() {
    // 初始化微信云开发（H5 端会自动跳过）
    initCloud()

    const userStore = useUserStore()
    // 先恢复本机登录态：本机存有 openid 身份才算已登录。
    userStore.initUser()
    // 只有「本机曾经登录过」才静默刷新云端资料；
    // 新设备 / 新微信号一律由 pages/index 引导到登录页，这里绝不静默建档。
    if (isCloudAvailable() && userStore.isLoggedIn) {
      userStore.refreshProfile().catch((error) => {
        console.warn('[auth] 资料刷新失败', error)
      })
    }

    const themeId = initAppThemeOnLaunch()
    syncNativeTheme(themeId)
    uni.$emit('update_theme', themeId)

    uni.$on('update_theme', (id) => {
      setAppThemeId(id, { emit: false })
      syncNativeTheme(id)
    })

    // #ifdef MP-WEIXIN
    if (typeof wx !== 'undefined' && wx.canIUse('getUpdateManager')) {
      const updateManager = wx.getUpdateManager()

      updateManager.onCheckForUpdate((res) => {
        console.log('是否有新版本：', res.hasUpdate)
      })

      updateManager.onUpdateReady(() => {
        uni.showModal({
          title: '更新提示',
          content: '新版本已经准备好，是否立即重启应用？',
          showCancel: false,
          success: () => {
            updateManager.applyUpdate()
          }
        })
      })

      updateManager.onUpdateFailed(() => {
        uni.showModal({
          title: '更新失败',
          content: '新版本下载失败，请检查网络后重试',
          showCancel: false
        })
      })
    }
    // #endif
  },

  onShow() {
    syncNativeTheme(getStoredAppThemeId())
  },

  onHide() {
  }
}
</script>

<style>
/* --- 主题变量定义池（与 common/themes/appTheme.ts 一一对应）--- */

/* 主题色 token 抽到 common/styles/theme-tokens.css，组件端同样 @import 该文件，
   避免真机上自定义组件拿不到变量而回落到旧兜底色。 */
@import './common/styles/theme-tokens.css';

:root,
page {
  /* ===== 全局设计 token（DESIGN.md 唯一刻度）=====
     新增样式必须引用变量，不要另写近似值。 */

  /* 圆角只允许这四档 */
  --radius-sm: 8px;      /* 图标底、条形槽、小标签 */
  --radius-md: 12px;     /* 标准卡片 */
  --radius-lg: 16px;     /* 弹窗、大面积容器 */
  --radius-pill: 999px;  /* 胶囊按钮 */

  --bg-card: #FFFFFF;
}

.app-root {
  display: none;
}

/* --- 全局基础样式 --- */
page {
  background-color: var(--bg-page, #F6F8F8);
  color: var(--text-ink, #1E293B);
  /* 中文系统字体栈：零体积、渲染最优；不引入中文 webfont */
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", "Noto Sans SC", sans-serif;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
}

.animate-fade-in {
  animation: fadeIn 0.5s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 全站统一的减弱动效降级：系统开启后只保留必要的状态反馈 */
@media (prefers-reduced-motion: reduce) {
  page,
  view,
  text,
  button,
  input,
  textarea,
  image,
  scroll-view,
  .animate-fade-in {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
