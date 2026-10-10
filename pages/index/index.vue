<template>
  <view :class="themeClass" class="launch-page">
    <view class="launch-logo">
      <image class="launch-logo-img" src="/static/brand/logo-144.png" mode="aspectFit" />
    </view>
    <text class="launch-title">可林记账本</text>
    <text class="launch-sub">记录点滴，连接家庭</text>

    <view class="launch-loading">
      <view class="loading-dot"></view>
      <view class="loading-dot"></view>
      <view class="loading-dot"></view>
    </view>
  </view>
</template>

<script setup>
/**
 * 启动页。
 *
 * 只做两件事：留存邀请参数、把用户送到正确的页面。
 * 底部导航由 pages.json 的原生 tabBar 负责（账本 / 明细 / 我的），
 * 这里不再自行实现 tab 壳，避免出现两套并行的导航结构。
 */
import { onLoad, onShow } from '@dcloudio/uni-app'
// 品牌图直接用 <image> 渲染，不引入 AppIcon
import { useAppTheme } from '@/common/themes/useAppTheme.js'
import { hasSession } from '@/common/utils/session'
import { useGlobalShare } from '../js/useGlobalShare.js'

const { themeClass } = useAppTheme()

const SHARE_TITLES = [
  '我们用这个一起记账，再也没为钱吵过架',
  '钱到底花哪了？我用这个终于看明白了',
  '不记账不知道，一记账吓一跳',
  '这个记账方式，真的比我以前用的都简单',
  '一起把账算清楚，其实没那么难'
]

const randomTitle = () => SHARE_TITLES[Math.floor(Math.random() * SHARE_TITLES.length)]

useGlobalShare({
  title: () => randomTitle(),
  path: () => '/pages/index/index'
})

/** 保存邀请参数，后续加入流程会读取 storage 里的 inviteCode */
const saveInviteCode = (code) => {
  if (!code) return
  try {
    uni.setStorageSync('inviteCode', decodeURIComponent(code))
  } catch (error) {
    console.error('[启动] 保存邀请参数失败', error)
  }
}

onLoad((options) => {
  saveInviteCode(options && options.roomInviteCode)
})

onShow(async () => {
  // 兼容从分享卡片直接进入、参数挂在页面 options 上的情况
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  saveInviteCode(current && current.options && current.options.roomInviteCode)

  // 启动页不再调用任何登录接口：
  // 本地已有 openid 登录态才进主界面，否则一律去登录页，
  // 由用户自己点「微信一键登录」，新微信号不会在这里被静默建档。
  // 留一点时间展示品牌，再进入主界面
  setTimeout(() => {
    if (hasSession()) {
      uni.switchTab({ url: '/pages/home/home' })
    } else {
      uni.reLaunch({ url: '/pages/login/login' })
    }
  }, 400)
})
</script>

<style scoped>
.launch-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #FFFFFF;
}

/* 品牌图按小程序头像的实际形态展示：圆角方 + 自带米白底 */
.launch-logo {
  /* 与登录页一致：logo 是透明底插图，不再套方卡片、不加方形阴影 */
  width: 84px;
  height: 84px;
}
.launch-logo-img {
  width: 100%;
  height: 100%;
  display: block;
}

.launch-title {
  margin-top: 18px;
  font-size: 22px;
  font-weight: 600;
  color: var(--text-ink, #1E293B);
}
.launch-sub {
  margin-top: 6px;
  font-size: 13px;
  color: var(--text-muted, #94A3B8);
}

.launch-loading {
  display: flex;
  gap: 6px;
  margin-top: 28px;
}
.loading-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary-color, #2F5D6B);
  animation: dotPulse 1.2s ease-in-out infinite;
}
.loading-dot:nth-child(2) {
  animation-delay: 0.15s;
}
.loading-dot:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes dotPulse {
  0%, 100% { opacity: 0.25; transform: translateY(0); }
  50% { opacity: 1; transform: translateY(-3px); }
}
</style>
