<template>
  <view class="compose-bar field-shell" :class="[themeClass, { 'field-shell-focus': isInputFocus }]">
    <view class="compose-main">
      <input
        :value="modelValue"
        class="compose-input"
        :disabled="loading"
        :placeholder="placeholder"
        confirm-type="done"
        @input="$emit('update:modelValue', $event.detail.value)"
        @confirm="$emit('submit')"
        @focus="isInputFocus = true"
        @blur="isInputFocus = false"
      />
      <view class="compose-add" :class="{ on: modelValue.trim() && !loading }" @tap="$emit('submit')">
        <text v-if="!loading" class="add-icon">+</text>
        <view v-else class="mini-spinner dark"></view>
      </view>
    </view>
    <scroll-view scroll-x class="chip-scroll" :show-scrollbar="false" enable-flex>
      <view class="chip-inner">
        <view class="chip" :class="{ on: quickToday }" @tap.stop="$emit('update:quickToday', !quickToday)">
          <text class="chip-label">今天</text>
        </view>
        <view class="chip chip-urgent" :class="{ on: quickUrgent }" @tap.stop="$emit('update:quickUrgent', !quickUrgent)">
          <text class="chip-label">紧急</text>
        </view>
        <view class="chip" :class="{ on: !!quickAssignee }" @tap.stop="$emit('pickAssignee')">
          <text class="chip-label">{{ assigneeLabel }}</text>
        </view>
        <view v-if="modelValue.trim() && showMoreChip" class="chip chip-ghost" @tap.stop="$emit('more')">
          <text class="chip-label">更多</text>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { useAppTheme } from '@/common/themes/useAppTheme.js'

// 根节点带主题类，组件内部的 var(--primary-color) 才会跟着换肤走
const { themeClass } = useAppTheme()

defineProps({
  modelValue: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  quickToday: { type: Boolean, default: true },
  quickUrgent: { type: Boolean, default: false },
  quickAssignee: { type: Object, default: null },
  assigneeLabel: { type: String, default: '经办人' },
  placeholder: { type: String, default: '记一条待办…' },
  showMoreChip: { type: Boolean, default: true }
})

defineEmits([
  'update:modelValue',
  'update:quickToday',
  'update:quickUrgent',
  'submit',
  'more',
  'pickAssignee'
])

const isInputFocus = ref(false)
</script>

<style scoped>
@import '../../common/styles/theme-tokens.css';
.field-shell {
  background: #fff;
  border-radius: 16px;
  border: 1px solid #f1f5f9;
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
  box-sizing: border-box;
}
.field-shell-focus {
  border-color: var(--primary-color, #2f5d6b);
  box-shadow: 0 0 0 3px rgba(47, 93, 107, 0.08);
}
.compose-bar {
  padding: 10px 12px 8px;
  margin-bottom: 10px;
}
.compose-main {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.compose-input {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-ink, #1E293B);
  height: 36px;
}
.compose-add {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.compose-add.on { background: var(--primary-color, #2f5d6b); }
.add-icon { font-size: 20px; font-weight: 300; color: var(--text-muted, #94A3B8); line-height: 1; }
.compose-add.on .add-icon { color: #fff; }
.mini-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(47, 93, 107, 0.2);
  border-top-color: var(--primary-color, #2f5d6b);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.chip-scroll { width: 100%; white-space: nowrap; }
.chip-inner { display: flex; align-items: center; gap: 6px; padding-bottom: 2px; }
.chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  padding: 0 12px;
  border-radius: 999px;
  background: #f8fafc;
  border: 1px solid var(--line-hairline, #E2E8F0);
  flex-shrink: 0;
  box-sizing: border-box;
}
.chip-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-sub, #64748B);
  line-height: 1;
  display: block;
}
.chip.on { background: var(--primary-soft, #e9f0f2); border-color: var(--primary-color, #2f5d6b); }
.chip.on .chip-label { color: var(--primary-color, #2f5d6b); }
.chip-urgent.on { background: var(--color-expense-soft, #FFF1F2); border-color: var(--color-expense-soft, #FECDD3); }
.chip-urgent.on .chip-label { color: var(--color-expense, #F43F5E); }
.chip-ghost { background: transparent; border-style: dashed; }
</style>
