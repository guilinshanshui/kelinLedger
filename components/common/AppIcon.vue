<template>
  <view class="app-icon" :style="boxStyle">
    <image
      v-if="imageSrc"
      class="app-icon-img"
      :src="imageSrc"
      mode="aspectFit"
      @error="handleError"
    />
    <text v-else class="app-icon-emoji" :style="textStyle">{{ emojiText }}</text>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useAppTheme } from '@/common/themes/useAppTheme.js'
import { buildIconDataUri, resolveIcon } from '@/common/utils/icon.js'

/**
 * 统一图标渲染。
 *
 * 数据库里的 icon 字段可能是三种东西，这里一次性收口：
 * - `mc:` 前缀 → 渲染 MingCute 矢量图标，颜色跟随主题或 color 属性；
 * - 图片地址 → 原样交给 `<image>`；
 * - 其余（老数据的 emoji）→ 渲染文本。
 *
 * 矢量图标用内联 SVG 的 data URI 渲染，颜色在生成时注入，
 * 因此换肤时图标颜色会自动跟着变，不需要为每套主题准备一套图片。
 */
const props = defineProps({
  /** 数据库里的原始 icon 字段 */
  value: { type: String, default: '' },
  /** 直接指定 MingCute 图标名（不带 mc: 前缀），优先级高于 value */
  name: { type: String, default: '' },
  /** 尺寸，单位 px */
  size: { type: Number, default: 24 },
  /** 图标颜色，留空则跟随当前主题主色 */
  color: { type: String, default: '' },
  /**
   * 语义色调，取值：primary | secondary | ink | sub | muted | faint |
   * income | expense | warning。优先级低于 color、高于主题主色。
   * 图标是内联 SVG，颜色在生成时注入，吃不了 CSS 变量，所以用 tone 把
   * 主题色搬到 JS 侧，保证换肤后图标颜色也跟着切。
   */
  tone: { type: String, default: '' },
  /** 矢量图标不可用时的兜底字符 */
  fallback: { type: String, default: '📦' },
  /** 圆角，主要给带底色的场景用 */
  radius: { type: String, default: '0' }
})

const { primaryColor, expenseColor, incomeColor, warningColor, theme } = useAppTheme()

const TONES = {
  primary: () => primaryColor.value,
  secondary: () => theme.value.secondary,
  ink: () => theme.value.textInk,
  sub: () => theme.value.textSub,
  muted: () => theme.value.textMuted,
  faint: () => theme.value.textFaint,
  income: () => incomeColor.value,
  expense: () => expenseColor.value,
  warning: () => warningColor.value
}

const loadFailed = ref(false)

watch(
  () => [props.value, props.name],
  () => {
    loadFailed.value = false
  }
)

const resolved = computed(() => resolveIcon(props.value))
const activeColor = computed(() => {
  if (props.color) return props.color
  const pick = TONES[props.tone]
  if (pick) return pick() || primaryColor.value
  return primaryColor.value
})

const imageSrc = computed(() => {
  if (loadFailed.value) return ''
  if (props.name) return buildIconDataUri(props.name, activeColor.value)
  if (resolved.value.kind === 'vector') {
    return buildIconDataUri(resolved.value.name, activeColor.value)
  }
  if (resolved.value.kind === 'image') return resolved.value.src
  return ''
})

const emojiText = computed(() =>
  resolved.value.kind === 'emoji' ? resolved.value.text : props.fallback
)

const boxStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  borderRadius: props.radius
}))

const textStyle = computed(() => ({
  fontSize: `${Math.round(props.size * 0.88)}px`
}))

/** 矢量图标解码失败时退回 emoji，保证界面不出现空白。 */
function handleError() {
  loadFailed.value = true
}
</script>

<style scoped>
.app-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  overflow: hidden;
}

.app-icon-img {
  width: 100%;
  height: 100%;
}

.app-icon-emoji {
  line-height: 1;
}
</style>
