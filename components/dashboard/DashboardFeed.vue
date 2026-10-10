<template>
  <view class="feed-wrap" :class="themeClass">
    <!-- 加载骨架 -->
    <view v-if="isLoading" class="skeleton-stack">
      <view v-for="i in 3" :key="i" class="feed-card skeleton-mode">
        <view class="sk-row">
          <view class="sk-avatar shimmer"></view>
          <view class="sk-lines">
            <view class="sk-line shimmer" style="width: 96px"></view>
            <view class="sk-line shimmer" style="width: 52px; height: 10px; margin-top: 8px"></view>
          </view>
        </view>
        <view class="sk-line shimmer" style="width: 100%; height: 14px; margin-top: 16px"></view>
        <view class="sk-line shimmer" style="width: 62%; height: 14px; margin-top: 8px"></view>
      </view>
    </view>

    <!-- 加载失败 -->
    <view v-else-if="isError" class="feed-state">
      <view class="state-icon"><AppIcon name="alert" :size="30" /></view>
      <text class="state-title">动态加载失败</text>
      <text class="state-sub">检查一下网络，然后重试</text>
      <view class="state-btn" @tap="loadFeed"><text class="state-btn-txt">重新加载</text></view>
    </view>

    <!-- 空态：动态是记账 / 任务 / 日程 / 成员加入自动生成的，所以这里要讲清楚怎么才会有 -->
    <view v-else-if="!feedList.length" class="feed-state">
      <view class="state-icon"><AppIcon name="sparkles-2" :size="30" /></view>
      <text class="state-title">还没有动态</text>
      <text class="state-sub">记账、完成任务、新建日程或邀请成员后，这里会自动留下记录</text>
    </view>

    <!-- 动态流 -->
    <view v-else class="feed-list">
      <!-- 清空整个列表：仅创建者/管理员可见，云函数还会再校验一次权限 -->
      <view v-if="canClearAll" class="feed-toolbar">
        <text class="feed-clear-btn" @tap="onClearAll">清空全部</text>
      </view>
      <view v-for="item in feedList" :key="item.id" class="feed-card" @longpress="onLongPress(item)">
        <view class="feed-head">
          <UserAvatar :src="item.authorAvatar" :name="item.authorName" :size="36" radius="12px" />
          <view class="feed-head-main">
            <view class="feed-name-row">
              <text class="feed-name">{{ item.authorName }}</text>
              <text v-if="item.typeLabel" class="feed-tag">{{ item.typeLabel }}</text>
            </view>
            <text class="feed-time">{{ formatTime(item.createTime) }}</text>
          </view>
        </view>

        <text v-if="item.content" class="feed-content">{{ item.content }}</text>

        <view v-if="item.images && item.images.length" class="feed-images">
          <image
            v-for="(img, idx) in item.images.slice(0, 3)"
            :key="idx"
            class="feed-image"
            :src="img"
            mode="aspectFill"
            @tap="previewImage(item.images, idx)"
          />
        </view>

        <view class="feed-foot">
          <view class="like-btn" :class="{ liked: item.liked }" @tap="toggleLike(item)">
            <AppIcon name="love" :size="15" :color="item.liked ? '#C4554D' : ''" />
            <text class="like-txt">{{ item.likeCount || 0 }}</text>
          </view>
        </view>
      </view>

      <view v-if="hasMore" class="feed-more" @tap="loadMore">
        <text class="feed-more-txt">{{ isLoadingMore ? '加载中…' : '加载更多' }}</text>
      </view>
      <view v-else class="feed-end"><text class="feed-end-txt">已看完所有动态</text></view>
    </view>
  </view>
</template>

<script setup>
/**
 * 空间看板 · 家庭动态。
 *
 * 动态不是手写的，是后端在记账 / 完成任务 / 新建日程 / 成员加入时自动写入的
 * （见 cloudfunctions/lib/activity.js），所以这里只做「读取 + 点赞」，
 * 空态要说清楚"怎么才会有动态"，而不是干摆一片白。
 */
import { ref, onMounted, watch } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import UserAvatar from '../common/UserAvatar.vue'
import { feedApi } from '@/common/api'
import { useAppTheme } from '@/common/themes/useAppTheme.js'

const { themeClass } = useAppTheme()

const props = defineProps({
  roomId: { type: String, default: '' }
})

const PAGE_SIZE = 20

const feedList = ref([])
const isLoading = ref(true)
const isLoadingMore = ref(false)
const isError = ref(false)
const page = ref(1)
const hasMore = ref(false)
// 是否显示「清空全部」入口（由服务端按角色下发）
const canClearAll = ref(false)

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / 昨天 / MM-DD */
const formatTime = (value) => {
  if (!value) return ''
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`
  const d = new Date(then)
  const pad = (n) => String(n).padStart(2, '0')
  const today = new Date()
  const isYesterday =
    new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1).toDateString() ===
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).toDateString()
  if (isYesterday) return '昨天'
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const loadFeed = async (append = false) => {
  if (!props.roomId) {
    feedList.value = []
    isLoading.value = false
    return
  }
  if (append) isLoadingMore.value = true
  else isLoading.value = true
  isError.value = false

  try {
    const targetPage = append ? page.value + 1 : 1
    const res = await feedApi.getFeedList({ roomId: props.roomId, page: targetPage, pageSize: PAGE_SIZE })
    if (res && res.code === 0 && res.data) {
      const list = res.data.list || []
      feedList.value = append ? [...feedList.value, ...list] : list
      page.value = targetPage
      canClearAll.value = !!res.data.canClearAll
      hasMore.value = list.length >= PAGE_SIZE
    } else {
      if (!append) isError.value = true
    }
  } catch (error) {
    console.error('[动态] 加载失败', (error && error.message) || String(error))
    if (!append) isError.value = true
  } finally {
    isLoading.value = false
    isLoadingMore.value = false
  }
}

const loadMore = () => {
  if (isLoadingMore.value) return
  loadFeed(true)
}

const toggleLike = async (item) => {
  if (!props.roomId) return
  // 先本地翻转，失败再回滚 —— 点赞要立刻有反馈，不能等一次云函数往返
  const liked = !item.liked
  const delta = liked ? 1 : -1
  item.liked = liked
  item.likeCount = Math.max(0, (item.likeCount || 0) + delta)
  try {
    const res = await feedApi.likeFeed(item.id, props.roomId)
    if (!res || res.code !== 0) throw new Error('like failed')
  } catch (error) {
    item.liked = !liked
    item.likeCount = Math.max(0, (item.likeCount || 0) - delta)
    uni.showToast({ title: '操作失败，请重试', icon: 'none' })
  }
}

/** 长按清除一条动态：仅创建者本人与 owner/admin 可删（服务端已校验，这里同步给提示）。 */
/** 清空当前空间的所有动态（仅 owner/admin，服务端校验）。 */
const onClearAll = () => {
  uni.showModal({
    title: '清空动态',
    content: '将清除本空间全部动态，且不可恢复，确定吗？',
    confirmColor: '#B84A42',
    success: async (res) => {
      if (!res.confirm) return
      try {
        const r = await feedApi.clearFeed(props.roomId)
        if (r && r.code === 0) {
          feedList.value = []
          page.value = 1
          hasMore.value = false
          uni.showToast({ title: '已清空', icon: 'success' })
        } else {
          uni.showToast({ title: '清空失败', icon: 'none' })
        }
      } catch (error) {
        uni.showToast({ title: '清空失败', icon: 'none' })
      }
    }
  })
}

const onLongPress = (item) => {
  if (!item.canDelete) {
    uni.showToast({ title: '只有创建者或管理员可清除', icon: 'none' })
    return
  }
  uni.showModal({
    title: '清除这条动态',
    content: '清除后不可恢复，确定吗？',
    confirmColor: '#B84A42',
    success: async (res) => {
      if (!res.confirm) return
      try {
        const r = await feedApi.deleteFeed(item.id, props.roomId)
        if (r && r.code === 0) {
          feedList.value = feedList.value.filter((f) => f.id !== item.id)
          uni.showToast({ title: '已清除', icon: 'success' })
        } else {
          uni.showToast({ title: '清除失败', icon: 'none' })
        }
      } catch (error) {
        uni.showToast({ title: '清除失败', icon: 'none' })
      }
    }
  })
}

const previewImage = (images, index) => {
  uni.previewImage({ urls: images, current: images[index] })
}

onMounted(() => loadFeed())

// 切换账本后要重新拉，否则会看到上一个空间的动态
watch(
  () => props.roomId,
  () => {
    page.value = 1
    hasMore.value = false
    loadFeed()
  }
)
</script>

<style scoped>
@import '../../common/styles/theme-tokens.css';
.feed-wrap {
  padding: 4px 0 96px;
}

.feed-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.feed-toolbar {
  display: flex;
  justify-content: flex-end;
}

.feed-clear-btn {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-sub, #64748B);
  background: var(--bg-card, #fff);
  border: 1px solid var(--line-hairline, #EEF2F7);
  border-radius: var(--radius-pill, 999px);
  padding: 5px 14px;
  line-height: 1.2;
}

.feed-clear-btn:active { opacity: 0.7; }

.feed-card {
  background: var(--bg-card, #fff);
  border: 1px solid var(--primary-soft, #E9F0F2);
  border-radius: var(--radius-lg, 16px);
  padding: 14px 16px;
  box-shadow: 0 8px 24px var(--primary-glow, rgba(47, 93, 107, 0.05));
}

.feed-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.feed-head-main {
  flex: 1;
  min-width: 0;
}

.feed-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.feed-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-ink, #1E293B);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feed-tag {
  flex: none;
  font-size: 10px;
  font-weight: 600;
  color: var(--primary-color, #2F5D6B);
  background: var(--primary-soft, #E9F0F2);
  border-radius: var(--radius-sm, 8px);
  padding: 2px 7px;
}

.feed-time {
  display: block;
  font-size: 11px;
  color: var(--text-muted, #5D6E84);
  margin-top: 3px;
}

.feed-content {
  display: block;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-ink, #1E293B);
  margin-top: 12px;
}

.feed-images {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.feed-image {
  flex: 1;
  height: 92px;
  border-radius: var(--radius-md, 12px);
  background: var(--primary-soft, #E9F0F2);
}

.feed-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-top: 12px;
}

.like-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: var(--radius-pill, 999px);
  background: var(--primary-soft, #E9F0F2);
}

.like-txt {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-sub, #4E5F74);
}

.like-btn.liked .like-txt {
  color: var(--color-expense, #B84A42);
}

/* ---- 空态 / 错误态 ---- */
.feed-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 56px 32px;
  text-align: center;
}

.state-icon {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-lg, 16px);
  background: var(--primary-soft, #E9F0F2);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 18px;
}

.state-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-ink, #1E293B);
}

.state-sub {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted, #5D6E84);
  margin-top: 8px;
  max-width: 260px;
}

.state-btn {
  margin-top: 20px;
  padding: 10px 24px;
  border-radius: var(--radius-pill, 999px);
  background: var(--primary-color, #2F5D6B);
  box-shadow: 0 8px 20px var(--primary-glow, rgba(47, 93, 107, 0.2));
}

.state-btn-txt {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
}

/* ---- 列表尾 ---- */
.feed-more,
.feed-end {
  display: flex;
  justify-content: center;
  padding: 16px 0 8px;
}

.feed-more-txt {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary-color, #2F5D6B);
}

.feed-end-txt {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-faint, #66788D);
}

/* ---- 骨架 ---- */
.skeleton-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-mode {
  pointer-events: none;
}

.sk-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sk-avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md, 12px);
  flex: none;
}

.sk-lines {
  flex: 1;
}

.sk-line {
  height: 14px;
  border-radius: var(--radius-sm, 8px);
}

.shimmer {
  position: relative;
  overflow: hidden;
  background: var(--primary-soft, #E9F0F2) !important;
}

.shimmer::after {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  transform: translateX(-100%);
  background-image: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent);
  animation: shimmerAnim 1.8s infinite;
  content: '';
}

@keyframes shimmerAnim {
  100% {
    transform: translateX(100%);
  }
}
</style>
