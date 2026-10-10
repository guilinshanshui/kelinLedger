/**
 * 看板首屏预热缓存。
 *
 * 问题：进入「空间看板」时，房间详情（roomDetail）必须先返回，页面才知道要渲染哪个 tab，
 * 之后 tab 组件才发起自己的数据请求 —— 两次云调用是串行的，每次约 0.5s，首屏就要 1s+。
 *
 * 做法：在 onLoad 拿到 roomId 的那一刻，就把默认首屏（家庭账本）的数据请求一起发出去，
 * 和 roomDetail 并行；组件挂载时通过 withWarmup 把这份结果取走，不再重复请求。
 *
 * 只缓存几秒、且取一次就失效，避免读到过期数据；房间切换用 roomId 作 key，不会串数据。
 */
const store = new Map()
const TTL = 8000

/** 预热一个请求，key 建议用 `action:roomId` 这种能唯一定位的写法。 */
export function warmup(key, factory) {
  if (!key || store.has(key)) return
  let promise
  try {
    promise = Promise.resolve(factory())
  } catch (error) {
    return
  }
  store.set(key, promise)
  setTimeout(() => {
    if (store.get(key) === promise) store.delete(key)
  }, TTL)
}

/**
 * 取预热结果；有就复用，没有（或预热失败）就现发一次。
 * 无论如何都返回同样的响应结构，调用方不需要区分来源。
 */
export async function withWarmup(key, factory) {
  const cached = store.get(key)
  if (cached) {
    store.delete(key)
    try {
      return await cached
    } catch (error) {
      // 预热失败就退回实时请求，不把错误暴露给页面
    }
  }
  return factory()
}
