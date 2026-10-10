<template>
  <view :class="themeClass" class="version-root">
    <IosNav title="更新日志" @leftClick="goBack" />

    <scroll-view scroll-y class="history-scroll" :show-scrollbar="false">
      <view class="history-container">

        <!-- 加载中 -->
        <block v-if="isLoading">
          <view class="toolbar-skeleton shimmer"></view>
          <view v-for="i in 2" :key="i" class="card-skeleton shimmer"></view>
        </block>

        <!-- 加载失败 -->
        <block v-else-if="isError">
          <view class="state-block">
            <view class="state-icon">
              <AppIcon name="alert" :size="30" />
            </view>
            <text class="state-title">暂时读不到更新记录</text>
            <text class="state-desc">请检查网络后重试</text>
            <view class="retry-btn" @click="getVersionList">
              <text class="retry-txt">重新加载</text>
            </view>
          </view>
        </block>

        <!-- 正常内容 -->
        <block v-else-if="updateLogs.length > 0">
          <!-- 当前版本 -->
          <view class="current-bar" v-if="currentVersion">
            <view class="current-left">
              <text class="current-label">当前版本</text>
              <text class="current-version">{{ currentVersion.version }}</text>
            </view>
            <text class="current-date">{{ currentVersion.date }}</text>
          </view>

          <!-- 版本记录列表 -->
          <view class="log-list">
            <view v-for="(item, index) in updateLogs" :key="item.version" class="log-item">
              <view class="log-head">
                <view class="log-head-left">
                  <text class="log-version">{{ item.version }}</text>
                  <text v-if="index === 0" class="log-badge">最新</text>
                </view>
                <text class="log-date">{{ item.date }}</text>
              </view>

              <view v-if="item.features.length > 0" class="log-section">
                <view class="section-title">
                  <AppIcon name="sparkles-2" :size="13" />
                  <text class="section-text">新增</text>
                </view>
                <view class="section-items">
                  <view v-for="(feat, fIdx) in item.features" :key="fIdx" class="item-row">
                    <view class="item-dot"></view>
                    <text class="item-text">{{ feat }}</text>
                  </view>
                </view>
              </view>

              <view v-if="item.fixes.length > 0" class="log-section">
                <view class="section-title fix">
                  <AppIcon name="bug" :size="13" />
                  <text class="section-text">修复</text>
                </view>
                <view class="section-items">
                  <view v-for="(fix, fixIdx) in item.fixes" :key="fixIdx" class="item-row">
                    <view class="item-dot fix"></view>
                    <text class="item-text">{{ fix }}</text>
                  </view>
                </view>
              </view>
            </view>
          </view>

          <view class="footer-note">
            <text class="note-txt">更新会一直继续</text>
          </view>
        </block>

        <!-- 暂无数据 -->
        <block v-else>
          <view class="state-block">
            <view class="state-icon">
              <AppIcon name="mail-open" :size="30" />
            </view>
            <text class="state-title">还没有更新记录</text>
            <text class="state-desc">后续版本的改动会记在这里</text>
          </view>
        </block>

        <view class="safe-area-bottom"></view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { useAppTheme } from '@/common/themes/useAppTheme.js'
const { themeClass } = useAppTheme()

import IosNav from '../../components/nav/ios-nav.vue'
import AppIcon from '../../components/common/AppIcon.vue'
import { ref, onMounted } from 'vue'
import { userApi } from '../../common/api'
import { goBackSafe } from '@/common/utils/nav.js'

const goBack = () => goBackSafe()

const isLoading = ref(true)
const isError = ref(false)
const currentVersion = ref(null)
const updateLogs = ref([])

onMounted(() => {
  getVersionList()
})

const getVersionList = async () => {
  isLoading.value = true
  isError.value = false
  try {
    const res = await userApi.getVersionInfo()
    if (res.code === 0 && Array.isArray(res.data)) {
      updateLogs.value = formatVersionList(res.data)
      currentVersion.value = updateLogs.value.find((item) => item.isCurrent) || null
    } else {
      isError.value = true
    }
  } catch (e) {
    console.error('[version-history] 加载失败', e)
    isError.value = true
  } finally {
    isLoading.value = false
  }
}

/** content 可能是普通字符串，也可能是历史接口那种 "'a', 'b'" 拼接串。 */
function splitContent(content) {
  if (Array.isArray(content)) return content.map((v) => String(v).trim()).filter(Boolean)
  return String(content || '')
    .replace(/^'|'$/g, '')
    .split(/',\s*'/)
    .map((v) => v.trim())
    .filter(Boolean)
}

/** 把接口数据整理成页面结构：版本号、日期、新增项、修复项。 */
function formatVersionList(list = []) {
  if (!Array.isArray(list)) return []

  return list
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const features = []
      const fixes = []

      ;(item.changelogs || []).forEach((log) => {
        if (!log || !log.content) return
        const contents = splitContent(log.content)
        if (log.type === 'NEW_FEATURES') features.push(...contents)
        if (log.type === 'FIXED_ISSUES') fixes.push(...contents)
      })

      return {
        version: `v${item.versionNumber || ''}`,
        date: item.releaseDate || '',
        isCurrent: item.status === 'current',
        features,
        fixes
      }
    })
}
</script>

<style scoped>
.version-root {
  height: 100vh;
  background-color: var(--bg-page, #F6F8F8);
  display: flex;
  flex-direction: column;
}

.history-scroll { flex: 1; height: 0; }
.history-container { padding: 16px 20px 0; }

/* 当前版本条 */
.current-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  margin-bottom: 20px;
  background: var(--primary-color, #2F5D6B);
  border-radius: var(--radius-lg, 14px);
}
.current-left { display: flex; align-items: baseline; gap: 10px; }
.current-label { font-size: 12px; color: rgba(255, 255, 255, 0.78); }
.current-version { font-size: 22px; font-weight: 600; color: #FFFFFF; letter-spacing: 0; }
.current-date { font-size: 12px; color: rgba(255, 255, 255, 0.7); }

/* 版本卡片 */
.log-list { display: flex; flex-direction: column; gap: 12px; }
.log-item {
  background: var(--bg-card, #FFFFFF);
  border-radius: var(--radius-lg, 14px);
  padding: 18px;
  border: 1px solid var(--line-hairline, #EDF1F4);
}

.log-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line-hairline, #EDF1F4);
}
.log-head-left { display: flex; align-items: center; gap: 8px; }
.log-version { font-size: 16px; font-weight: 600; color: var(--text-ink, #1E293B); }
.log-badge {
  font-size: 10px;
  color: var(--primary-color, #2F5D6B);
  background: var(--primary-soft, #E9F0F2);
  padding: 2px 7px;
  border-radius: var(--radius-sm, 6px);
}
.log-date { font-size: 12px; color: var(--text-muted, #94A3B8); }

/* 分组 */
.log-section { margin-top: 14px; }
.section-title {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 8px;
  color: var(--primary-color, #2F5D6B);
}
.section-title.fix { color: var(--color-expense, #B84A42); }
.section-text { font-size: 12px; font-weight: 600; }

.section-items { display: flex; flex-direction: column; gap: 7px; }
.item-row { display: flex; align-items: flex-start; gap: 9px; }
.item-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--primary-color, #2F5D6B);
  opacity: 0.45;
  margin-top: 8px;
  flex-shrink: 0;
}
.item-dot.fix { background: var(--color-expense, #B84A42); }
.item-text {
  flex: 1;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-sub, #475569);
}

/* 骨架屏 */
.toolbar-skeleton { height: 58px; border-radius: var(--radius-lg, 14px); margin-bottom: 20px; }
.card-skeleton { height: 140px; border-radius: var(--radius-lg, 14px); margin-bottom: 12px; }
.shimmer { position: relative; overflow: hidden; background: #EEF2F5; }
.shimmer::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background-image: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.65), transparent);
  animation: shimmerAnim 1.6s infinite;
}
@keyframes shimmerAnim { 100% { transform: translateX(100%); } }

/* 状态视图 */
.state-block {
  padding: 90px 30px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.state-icon {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--bg-card, #FFFFFF);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 18px;
  color: var(--text-muted, #94A3B8);
}
.state-title { font-size: 15px; font-weight: 600; color: var(--text-ink, #1E293B); margin-bottom: 6px; }
.state-desc { font-size: 12px; color: var(--text-muted, #94A3B8); }
.retry-btn {
  margin-top: 24px;
  padding: 10px 30px;
  background: var(--primary-color, #2F5D6B);
  border-radius: var(--radius-pill, 999px);
}
.retry-btn:active { opacity: 0.85; }
.retry-txt { font-size: 13px; font-weight: 600; color: #FFFFFF; }

.footer-note {
  padding: 28px 0 12px;
  display: flex;
  justify-content: center;
}
.note-txt { font-size: 11px; color: var(--text-faint, #B6C0CB); }

.safe-area-bottom { height: calc(env(safe-area-inset-bottom) + 16px); }
</style>
