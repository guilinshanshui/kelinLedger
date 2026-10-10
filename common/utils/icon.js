/**
 * 统一图标解析。
 *
 * 分类 / 支付方式 / 账户 / 空间图标在数据库里以字符串保存，历史上是 emoji，
 * 现在开始写入 `mc:` 前缀的 MingCute 图标名。两种格式会长期并存：
 * - 老房间的数据仍是 emoji，直接渲染文本；
 * - 新房间发 `mc:xxx`，渲染成跟随主题色的矢量图标；
 * - 用户自定义的图片地址（http / data:image / 本地路径）保持原样。
 *
 * 这样替换过程零迁移风险：老数据不变，新数据自动升级。
 */

import { MINGCUTE_ICONS, MINGCUTE_VIEW_BOX, hasMingcuteIcon } from '@/common/icons/mingcute.js'

/** 新格式前缀。 */
export const ICON_PREFIX = 'mc:'

/** 兜底 emoji，与旧数据的「其他」分类保持一致。 */
export const FALLBACK_EMOJI = '📦'

/** 默认图标色，取黛青主题主色。 */
const DEFAULT_COLOR = '#2F5D6B'

/** 内联 SVG 的数据地址前缀。 */
const IMAGE_URI_PREFIX = 'data:' + 'image/svg+xml;base64,'

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']

/** 把 `mc:name` 拼成规范写法。 */
export function vectorIcon(name) {
  return `${ICON_PREFIX}${name}`
}

/** 判断是不是 MingCute 矢量图标名。 */
export function isVectorIcon(value) {
  return typeof value === 'string' && value.indexOf(ICON_PREFIX) === 0
}

/** 判断是不是图片地址（网络图 / base64 / 项目内静态资源）。 */
export function isImageSource(value) {
  if (typeof value !== 'string') return false
  const text = value.trim().toLowerCase()
  if (!text) return false
  if (text.indexOf('http://') === 0 || text.indexOf('https://') === 0) return true
  if (text.indexOf('data:image') === 0) return true
  if (text.indexOf('/') === 0) return true
  return IMAGE_EXTENSIONS.some((ext) => text.indexOf(ext) !== -1)
}

/**
 * 把数据库里的图标字段解析成渲染层能理解的结构。
 * @param {string} value 数据库中的 icon 字段
 * @returns {{kind:'vector',name:string}|{kind:'image',src:string}|{kind:'emoji',text:string}}
 */
export function resolveIcon(value) {
  if (isVectorIcon(value)) {
    const name = value.slice(ICON_PREFIX.length)
    if (hasMingcuteIcon(name)) return { kind: 'vector', name }
    return { kind: 'emoji', text: FALLBACK_EMOJI }
  }
  if (isImageSource(value)) return { kind: 'image', src: value }
  const text = typeof value === 'string' ? value.trim() : ''
  return { kind: 'emoji', text: text || FALLBACK_EMOJI }
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** 只处理 ASCII 的 base64 编码，小程序环境没有 btoa / Buffer。 */
function base64Encode(input) {
  let out = ''
  for (let i = 0; i < input.length; i += 3) {
    const c1 = input.charCodeAt(i)
    const c2 = input.charCodeAt(i + 1)
    const c3 = input.charCodeAt(i + 2)
    const hasC2 = !Number.isNaN(c2)
    const hasC3 = !Number.isNaN(c3)

    out += BASE64_CHARS[c1 >> 2]
    out += BASE64_CHARS[((c1 & 0x03) << 4) | (hasC2 ? c2 >> 4 : 0)]
    out += hasC2 ? BASE64_CHARS[((c2 & 0x0f) << 2) | (hasC3 ? c3 >> 6 : 0)] : '='
    out += hasC3 ? BASE64_CHARS[c3 & 0x3f] : '='
  }
  return out
}

function normalizeColor(color) {
  if (typeof color !== 'string') return DEFAULT_COLOR
  const text = color.trim()
  if (!text) return DEFAULT_COLOR
  // SVG 属性里出现的特殊字符全部挡掉，避免拼出坏标记
  return /^[#a-zA-Z0-9(),.%\s-]+$/.test(text) ? text : DEFAULT_COLOR
}

const dataUriCache = {}

/**
 * 把 MingCute 图标渲染成 `<image>` 可用的 data URI。
 * 颜色在生成时注入，因此同一个图标可以随主题切换任意颜色。
 * @param {string} name MingCute 图标名（不带前缀）
 * @param {string} [color] 目标颜色，默认取主题主色
 */
export function buildIconDataUri(name, color) {
  if (!hasMingcuteIcon(name)) return ''
  const safeColor = normalizeColor(color)
  const cacheKey = `${name}|${safeColor}`
  if (dataUriCache[cacheKey]) return dataUriCache[cacheKey]

  const body = MINGCUTE_ICONS[name].replace(/currentColor/g, safeColor)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MINGCUTE_VIEW_BOX}" ` +
    `width="24" height="24">${body}</svg>`

  const uri = IMAGE_URI_PREFIX + base64Encode(svg)
  dataUriCache[cacheKey] = uri
  return uri
}

/**
 * 一步到位：把数据库里的 icon 字段转成可直接塞进 `<image src>` 的值。
 * 非矢量图标返回空串，调用方据此回退到 emoji 渲染。
 */
export function iconImageSource(value, color) {
  if (!isVectorIcon(value)) return ''
  return buildIconDataUri(value.slice(ICON_PREFIX.length), color)
}
