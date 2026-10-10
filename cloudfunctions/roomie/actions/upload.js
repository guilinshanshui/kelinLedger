const cloud = require('wx-server-sdk')
const { requireUser } = require('../lib/context')
const { badRequest } = require('../lib/errors')

/**
 * 文件上传。
 *
 * 文件本身由前端通过 wx.cloud.uploadFile 直接进云存储，
 * 这里只做校验与登记：确认调用者已登录，并返回可用于 <image> 的地址。
 */

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']
const MAX_SIZE = 10 * 1024 * 1024

function extOf(name = '') {
  return String(name).split('.').pop().toLowerCase()
}

async function handleUpload({ openid, payload, type }) {
  await requireUser(openid)

  const fileID = payload.fileID || payload.fileId
  if (!fileID) throw badRequest('缺少文件，请重新上传')

  const filename = payload.filename || fileID
  const size = Number(payload.size || 0)

  if (size && size > MAX_SIZE) throw badRequest('文件不能超过 10MB')
  if (type === 'image' && !IMAGE_EXT.includes(extOf(filename))) {
    throw badRequest('仅支持 jpg / png / gif / webp 图片')
  }

  // cloud:// 开头的 fileID 可直接用于 <image src>，无需再换取临时链接。
  return { url: fileID, fileID, filename }
}

/** 图片上传登记。/upload/image */
const image = (ctx) => handleUpload({ ...ctx, type: 'image' })

/** 通用文件上传登记。/upload/file */
const file = (ctx) => handleUpload({ ...ctx, type: 'file' })

/** 换取临时可访问链接（需要外链分享时使用）。 */
async function tempUrl({ openid, payload }) {
  await requireUser(openid)
  const fileList = Array.isArray(payload.fileIDs) ? payload.fileIDs : [payload.fileID].filter(Boolean)
  if (!fileList.length) throw badRequest('缺少文件标识')

  const res = await cloud.getTempFileURL({ fileList })
  return (res.fileList || []).map((item) => ({
    fileID: item.fileID,
    url: item.tempFileURL || '',
    status: item.status
  }))
}

module.exports = { image, file, tempUrl }
