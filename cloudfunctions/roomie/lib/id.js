const crypto = require('crypto')

/**
 * 生成带前缀的业务 ID。
 * 使用自增 ID 而非云数据库默认 _id，方便跨集合引用与前端可读。
 */
function nextId(prefix) {
  const stamp = Date.now().toString(36)
  const random = crypto.randomBytes(6).toString('hex')
  return `${prefix}_${stamp}${random}`
}

/** 生成家庭邀请码：6 位大写字母数字，去掉易混淆字符。 */
function inviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[crypto.randomInt(0, alphabet.length)]
  }
  return code
}

/** 生成 8 位数字房间号（游戏/牌局场景）。 */
function roomNumber() {
  return String(crypto.randomInt(10000000, 99999999))
}

module.exports = { nextId, inviteCode, roomNumber }
