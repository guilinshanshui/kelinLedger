/**
 * 统一的弹层过渡动画参数（iOS sheet 风格）。
 *
 * 所有底部弹层（BottomPicker / CategoryPicker / ThemePickerModal /
 * ProfileEditModal / InviteModal / GlobalDrawer）共用这一组参数，
 * 保证全项目弹层打开 / 关闭 / 拖拽的动效一致。
 *
 * 设计基准：
 * - 打开 380ms，曲线 cubic-bezier(0.32, 0.72, 0, 1)（Apple sheet 使用的减速曲线）
 * - 关闭 260ms，同曲线（位移短，时间随之缩短）
 * - 遮罩淡入 250ms / 淡出 200ms
 * - 拖拽跟手，松手后回弹或关闭走同一条曲线
 */

export const SHEET_OPEN_MS = 380
export const SHEET_CLOSE_MS = 260
export const SHEET_CURVE = 'cubic-bezier(0.32, 0.72, 0, 1)'
export const MASK_FADE_MS = 250

/** 面板打开时的 transform（入口起点：完全在屏幕下方） */
export const SHEET_HIDDEN_TRANSFORM = 'translateY(100%)'
/** 面板归位后的 transform */
export const SHEET_SHOWN_TRANSFORM = 'translateY(0)'
/** 关闭时面板的位移（滑出屏幕即可，不必精确到 100%） */
export const SHEET_EXIT_TRANSFORM = 'translateY(105%)'

/**
 * 生成面板的 transition 样式值。
 * @param {boolean} closing 是否处于关闭过程
 * @param {boolean} dragging 是否正在拖拽（拖拽时不需要 transition）
 */
export function sheetPanelTransition(closing = false, dragging = false) {
  if (dragging) return 'none'
  return `transform ${closing ? SHEET_CLOSE_MS : SHEET_OPEN_MS}ms ${SHEET_CURVE}`
}

/** 遮罩的 transition */
export const sheetMaskTransition = `opacity ${MASK_FADE_MS}ms ease-out`

/**
 * 打开弹层：把面板从隐藏位推到归位。
 * Vue 的响应式在下一帧才渲染，这里用两个 rAF 保证 transition 一定触发。
 * @param {import('vue').Ref} target 面板 transform 所绑定的 ref（绑定到 :style 的对象）
 */
export function playSheetOpen(target) {
  target.value = { transform: SHEET_HIDDEN_TRANSFORM, transition: 'none' }
  // #ifdef MP-WEIXIN
  setTimeout(() => {
    target.value = { transform: SHEET_SHOWN_TRANSFORM, transition: sheetPanelTransition() }
  }, 30)
  // #endif
  // #ifndef MP-WEIXIN
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      target.value = { transform: SHEET_SHOWN_TRANSFORM, transition: sheetPanelTransition() }
    })
  })
  // #endif
}

/**
 * 关闭弹层：面板滑出，返回关闭动画时长，调用方据此延时 emit(false)。
 */
export function playSheetClose(target) {
  target.value = { transform: SHEET_EXIT_TRANSFORM, transition: sheetPanelTransition(true) }
  return SHEET_CLOSE_MS
}
