<template>
  <view :class="themeClass" class="join-page">
    <IosNav title="加入账本" @leftClick="goBack" />

    <scroll-view scroll-y class="join-scroll" :show-scrollbar="false">
      <view class="join-inner">
        <view class="hero">
          <view class="hero-icon" :style="{ background: softColor }">
            <AppIcon name="ticket" :size="28" />
          </view>
          <text class="hero-title">输入邀请码</text>
          <text class="hero-sub">向家人或室友要一个 6 位邀请码，填进去就能一起记账</text>
        </view>

        <view class="code-card">
          <text class="code-label">邀请码</text>
          <view class="code-input-wrap" :class="{ 'is-focus': focused, 'is-full': code.length === CODE_LENGTH }">
            <input
              class="code-input"
              :value="code"
              type="text"
              :maxlength="CODE_LENGTH"
              :focus="autoFocus"
              placeholder="输入邀请码"
              placeholder-class="code-placeholder"
              @input="onCodeInput"
              @focus="focused = true"
              @blur="focused = false"
              @confirm="handleJoin"
            />
            <view v-if="code" class="clear-btn" @click="clearCode">
              <AppIcon name="close" :size="13" />
            </view>
          </view>
          <text class="code-tip">6 位字母或数字，不区分大小写（例：Q6FB6S）</text>
        </view>
      </view>
    </scroll-view>

    <!-- 底部操作区 -->
    <view class="footer">
      <button
        class="join-btn"
        :class="{ 'is-disabled': !canSubmit }"
        :disabled="!canSubmit || submitting"
        @click="handleJoin"
      >
        <text class="join-btn-txt">{{ submitting ? '正在加入...' : '加入账本' }}</text>
      </button>
      <view class="safe-area-bottom"></view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAppTheme } from '@/common/themes/useAppTheme.js'
import IosNav from '../../components/nav/ios-nav.vue'
import AppIcon from '../../components/common/AppIcon.vue'
import { roomApi } from '@/common/api'
import { STORAGE_KEYS } from '@/common/config'
import { goBackSafe } from '@/common/utils/nav.js'

const { themeClass, softColor } = useAppTheme()

/** 邀请码固定 6 位，与云端 inviteCode() 生成规则一致 */
const CODE_LENGTH = 6

const code = ref('')
const focused = ref(false)
const autoFocus = ref(true)
const submitting = ref(false)

const canSubmit = computed(() => code.value.length === CODE_LENGTH)

const goBack = () => goBackSafe('/pages/room-list/room-list')

/** 只保留字母数字，顺手转大写——后端拿到的邀请码本身就是大写 */
const onCodeInput = (e) => {
  const raw = (e.detail.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  code.value = raw.slice(0, CODE_LENGTH)
}

const clearCode = () => {
  code.value = ''
  autoFocus.value = false
  // 下一 tick 再聚焦，否则输入框已经处于聚焦态时不会重新弹起键盘
  setTimeout(() => {
    autoFocus.value = true
  }, 50)
}

const handleJoin = async () => {
  if (submitting.value) return
  if (!canSubmit.value) {
    uni.showToast({ title: `请输入 ${CODE_LENGTH} 位邀请码`, icon: 'none' })
    return
  }

  submitting.value = true
  uni.showLoading({ title: '正在加入...', mask: true })
  try {
    const res = await roomApi.joinRoom(code.value)
    if (res.code !== 0) {
      uni.hideLoading()
      return
    }

    const room = res.data || {}
    try {
      uni.setStorageSync(STORAGE_KEYS.CURRENT_ROOM, {
        id: room.id,
        name: room.name,
        avatar: room.avatar || 'mc:notebook-2'
      })
    } catch (error) {
      console.error('[加入账本] 保存当前账本失败', error)
    }

    uni.$emit('refresh_room_data')
    uni.hideLoading()
    uni.showToast({ title: `已加入「${room.name || '账本'}」`, icon: 'none' })

    // 回到「账本」列表，onShow 会重新拉取，新账本直接以「当前」标出来
    setTimeout(() => goBackSafe('/pages/room-list/room-list'), 900)
  } catch (error) {
    // request 层已经弹过业务错误（邀请码无效 / 已过期等），这里只收尾
    uni.hideLoading()
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.join-page {
  min-height: 100vh;
  background: var(--bg-page, #F6F8F8);
  display: flex;
  flex-direction: column;
}

.join-scroll {
  flex: 1;
  min-height: 0;
}

.join-inner {
  padding: 24px 16px 16px;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
}

.hero-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg, 16px);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.hero-title {
  font-size: 19px;
  font-weight: 600;
  color: var(--text-ink, #1E293B);
  letter-spacing: 0;
}

.hero-sub {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-sub, #4E5F74);
  text-align: center;
  padding: 0 24px;
}

.code-card {
  background: var(--bg-card, #FFFFFF);
  border: 1px solid var(--line-hairline, #E8EEEF);
  border-radius: var(--radius-md, 12px);
  padding: 16px;
}

.code-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-sub, #4E5F74);
  margin-bottom: 8px;
}

.code-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 56px;
  padding: 0 14px;
  border-radius: var(--radius-sm, 8px);
  background: var(--primary-soft, #E9F0F2);
  border: 1px solid transparent;
  transition: border-color .2s ease;
}

.code-input-wrap.is-focus {
  border-color: var(--primary-color, #2F5D6B);
}

.code-input-wrap.is-full {
  border-color: var(--primary-color, #2F5D6B);
}

.code-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 4px;
  color: var(--primary-color, #2F5D6B);
  text-align: center;
}

.code-placeholder {
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--text-faint, #66788D);
}

.clear-btn {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--bg-card, #FFFFFF);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.code-tip {
  display: block;
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-muted, #5D6E84);
}

.footer {
  padding: 12px 16px 0;
  background: var(--bg-page, #F6F8F8);
}

.join-btn {
  width: 100%;
  height: 48px;
  border: none;
  border-radius: var(--radius-pill, 999px);
  background: var(--primary-color, #2F5D6B);
  color: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 24px var(--primary-glow, rgba(47, 93, 107, .18));
  transition: opacity .2s ease;
}

.join-btn.is-disabled {
  background: var(--line-hairline, #E8EEEF);
  box-shadow: none;
}
.join-btn.is-disabled .join-btn-txt {
  color: var(--text-faint, #66788D);
}

.join-btn::after {
  border: none;
}

.join-btn-txt {
  color: #FFFFFF;
  font-size: 16px;
  font-weight: 600;
}

.safe-area-bottom {
  height: calc(12px + env(safe-area-inset-bottom));
}
</style>
