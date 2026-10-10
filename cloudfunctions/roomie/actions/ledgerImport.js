const cloud = require('wx-server-sdk')
const { COLLECTIONS, insert, update, getOne, listAll } = require('../lib/db')
const { nextId } = require('../lib/id')
const { requireMembership } = require('../lib/context')
const { badRequest } = require('../lib/errors')
const { toMinor, toYuan } = require('../lib/money')
const { optionalString } = require('../lib/validate')
const accounts = require('../lib/accounts')

/**
 * 账单导入。
 *
 * 支持微信 / 支付宝导出的 CSV（GBK 或 UTF-8）与 XLSX。
 * XLSX 与 GBK 解码依赖可选包，缺失时降级为「仅 UTF-8 CSV」并在错误信息里说明，
 * 避免因为一个可选依赖导致整个云函数无法部署。
 */
let XLSX = null
let iconv = null
try {
  // eslint-disable-next-line global-require
  XLSX = require('xlsx')
} catch (error) {
  XLSX = null
}
try {
  // eslint-disable-next-line global-require
  iconv = require('iconv-lite')
} catch (error) {
  iconv = null
}

/** 列名别名表：不同渠道、不同版本导出的表头不一致。 */
const COLUMN_ALIASES = {
  time: ['交易时间', '交易创建时间', '付款时间', '创建时间', '时间', '交易日期'],
  type: ['交易类型', '类型'],
  target: ['交易对方', '对方', '商户名称'],
  product: ['商品', '商品名称', '商品说明'],
  flow: ['收/支', '收支', '收支类型'],
  amount: ['金额(元)', '金额（元）', '金额', '交易金额'],
  payMethod: ['支付方式', '付款方式'],
  status: ['当前状态', '交易状态', '状态'],
  tradeNo: ['交易单号', '交易号', '订单号'],
  merchantNo: ['商户单号', '商家订单号'],
  remark: ['备注', '交易备注']
}

function normalizeHeader(header) {
  const map = {}
  Object.keys(COLUMN_ALIASES).forEach((field) => {
    const index = header.findIndex((cell) =>
      COLUMN_ALIASES[field].some((alias) => String(cell || '').trim().replace(/\s/g, '') === alias.replace(/\s/g, ''))
    )
    map[field] = index
  })
  return map
}

/** 定位真正的表头行：导出的文件前几行通常是标题与账号说明。 */
function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 30); i += 1) {
    const row = rows[i]
    if (!row || !row.length) continue
    const joined = row.map((cell) => String(cell || '')).join(',')
    if (COLUMN_ALIASES.time.some((alias) => joined.includes(alias)) &&
        COLUMN_ALIASES.amount.some((alias) => joined.includes(alias))) {
      return i
    }
  }
  return -1
}

function decodeBuffer(buffer, filename = '') {
  if (filename.toLowerCase().endsWith('.xlsx')) return { kind: 'xlsx', buffer }

  // 优先按 UTF-8 解码；若出现替换字符且存在 iconv，则回退 GBK
  const utf8 = buffer.toString('utf8')
  if (iconv) {
    const gbk = iconv.decode(buffer, 'gbk')
    const utf8Bad = (utf8.match(/\uFFFD/g) || []).length
    const gbkBad = (gbk.match(/\uFFFD/g) || []).length
    if (gbkBad < utf8Bad) return { kind: 'csv', text: gbk }
  }
  return { kind: 'csv', text: utf8 }
}

/** 简易 CSV 解析：支持引号包裹、字段内换行与转义引号。 */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\r') {
      // 忽略，由 \n 处理换行
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((item) => item.some((cell) => String(cell).trim() !== ''))
}

function rowsFromXlsx(buffer) {
  if (!XLSX) {
    throw badRequest('当前环境未安装 XLSX 解析依赖，请改用 CSV 导出后重试')
  }
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })
}

/** 判断收支方向。 */
function resolveDirection(flowText, amountText) {
  const text = String(flowText || '')
  if (text.includes('收入') || text.includes('收')) return 'income'
  if (text.includes('支出') || text.includes('支')) return 'expense'
  if (text.includes('不计收支')) return 'skip'
  // 无法判断时按金额符号推断
  const amount = Number(String(amountText).replace(/[^\d.-]/g, ''))
  return amount < 0 ? 'expense' : 'income'
}

function parseAmountMinor(amountText) {
  const cleaned = String(amountText || '').replace(/[^\d.-]/g, '')
  return Math.abs(toMinor(cleaned))
}

function normalizeTime(value) {
  if (!value) return new Date().toISOString()
  const text = String(value).trim()
  const parsed = new Date(text.replace(/\//g, '-'))
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}

/** 去重键：优先用交易单号，缺失时用 时间+金额+对方。 */
function dedupeKey(row) {
  if (row.tradeNo) return `no:${row.tradeNo}`
  return `sig:${row.occurredAt}|${row.amountMinor}|${row.merchant}`
}

/**
 * 上传文件并解析预览。
 * fileID 由 wx.cloud.uploadFile 得到。
 */
async function importPreview({ openid, payload }) {
  const roomId = payload.roomId
  const fileID = payload.fileID || payload.fileId
  if (!roomId) throw badRequest('缺少房间标识')
  if (!fileID) throw badRequest('缺少文件，请重新选择账单文件')

  await requireMembership(openid, roomId, 'member')

  const download = await cloud.downloadFile({ fileID })
  const buffer = download.fileContent
  const filename = payload.filename || ''

  const decoded = decodeBuffer(buffer, filename)
  const rows = decoded.kind === 'xlsx' ? rowsFromXlsx(buffer) : parseCsv(decoded.text)

  if (!rows.length) throw badRequest('文件内容为空')

  const headerIndex = findHeaderRow(rows)
  if (headerIndex < 0) {
    throw badRequest('未能识别账单表头，请确认上传的是微信或支付宝导出的原始账单文件')
  }

  const columns = normalizeHeader(rows[headerIndex])
  const dataRows = rows.slice(headerIndex + 1)

  const parsed = dataRows
    .map((row) => {
      const amountMinor = parseAmountMinor(columns.amount >= 0 ? row[columns.amount] : '')
      if (!amountMinor) return null

      const direction = resolveDirection(columns.flow >= 0 ? row[columns.flow] : '', row[columns.amount])
      if (direction === 'skip') return null

      const merchant = optionalString(columns.target >= 0 ? row[columns.target] : '', 60)
      const product = optionalString(columns.product >= 0 ? row[columns.product] : '', 60)

      return {
        occurredAt: normalizeTime(columns.time >= 0 ? row[columns.time] : ''),
        type: direction,
        amountMinor,
        amount: toYuan(amountMinor),
        merchant,
        merchantKey: merchant.toLowerCase(),
        note: [product, optionalString(columns.remark >= 0 ? row[columns.remark] : '', 100)]
          .filter(Boolean)
          .join(' '),
        payMethodName: optionalString(columns.payMethod >= 0 ? row[columns.payMethod] : '', 20),
        tradeNo: optionalString(columns.tradeNo >= 0 ? row[columns.tradeNo] : '', 60),
        status: optionalString(columns.status >= 0 ? row[columns.status] : '', 20)
      }
    })
    .filter(Boolean)

  if (!parsed.length) throw badRequest('未能从文件中解析出有效交易记录')

  // 已入库的交易单号，用于标记重复
  const existing = await listAll(COLLECTIONS.ledgers, { roomId, deleted: false })
  const existingKeys = new Set(
    existing.map((item) => (item.tradeNo ? `no:${item.tradeNo}` : `sig:${item.occurredAt}|${item.amountMinor}|${item.merchant}`))
  )

  const merchantRules = await listAll(COLLECTIONS.merchantRules, { roomId })
  const ruleMap = new Map(merchantRules.map((rule) => [rule.merchantKey, rule]))

  const preview = parsed.map((item, index) => {
    const rule = ruleMap.get(item.merchantKey)
    return {
      rowId: `row_${index}`,
      ...item,
      duplicate: existingKeys.has(dedupeKey(item)),
      selected: !existingKeys.has(dedupeKey(item)),
      categoryId: rule ? rule.categoryId : '',
      payMethodId: rule ? rule.payMethodId : '',
      remembered: !!rule
    }
  })

  return {
    batchId: nextId('batch'),
    total: preview.length,
    duplicates: preview.filter((item) => item.duplicate).length,
    rows: preview
  }
}

/** 确认导入勾选的行。 */
async function importConfirm({ openid, payload }) {
  const roomId = payload.roomId
  if (!roomId) throw badRequest('缺少房间标识')
  const { user } = await requireMembership(openid, roomId, 'member')

  const rows = Array.isArray(payload.rows) ? payload.rows : []
  const selected = rows.filter((row) => row && row.selected !== false)
  if (!selected.length) throw badRequest('没有可导入的记录')

  const account = await accounts.requireAccount(roomId, payload.accountId)
  if (!account) throw badRequest('请选择入账账户')

  const categories = await listAll(COLLECTIONS.categories, { roomId })
  const payMethods = await listAll(COLLECTIONS.payMethods, { roomId })
  const categoryMap = new Map(categories.map((item) => [item._id, item]))
  const payMethodMap = new Map(payMethods.map((item) => [item._id, item]))

  const now = new Date().toISOString()
  const batchId = payload.batchId || nextId('batch')
  let success = 0
  let failed = 0

  for (const row of selected) {
    try {
      const amountMinor = row.amountMinor || toMinor(row.amount)
      if (!amountMinor) {
        failed += 1
        continue
      }

      const category = categoryMap.get(row.categoryId)
      const payMethod = payMethodMap.get(row.payMethodId)
      const merchant = optionalString(row.merchant, 60)

      const entry = {
        _id: nextId('led'),
        roomId,
        userId: user.id,
        type: row.type === 'income' ? 'income' : 'expense',
        amountMinor,
        accountId: account._id,
        accountName: account.name,
        categoryId: category ? category._id : '',
        categoryName: category ? category.name : '未分类',
    categoryIcon: category ? category.icon : 'mc:puzzled',
        payMethodId: payMethod ? payMethod._id : '',
        payMethodName: payMethod ? payMethod.name : optionalString(row.payMethodName, 20),
        note: optionalString(row.note, 200),
        merchant,
        merchantKey: optionalString(row.merchantKey, 60),
        tradeNo: optionalString(row.tradeNo, 60),
        occurredAt: row.occurredAt || now,
        source: 'import',
        importBatchId: batchId,
        deleted: false,
        createdAt: now,
        updatedAt: now
      }
      await insert(COLLECTIONS.ledgers, entry)
      await accounts.applyDeltas(roomId, entry, 1)
      success += 1

      // 记住商户分类规则，下次导入同商户自动带入
      if (merchant && category) {
        const existed = await getOne(COLLECTIONS.merchantRules, { roomId, merchantKey: row.merchantKey })
        if (existed) {
          await update(COLLECTIONS.merchantRules, existed._id, {
            categoryId: category._id,
            payMethodId: payMethod ? payMethod._id : '',
            updatedAt: now
          })
        } else {
          await insert(COLLECTIONS.merchantRules, {
            _id: nextId('rule'),
            roomId,
            merchantKey: optionalString(row.merchantKey, 60),
            merchant,
            categoryId: category._id,
            payMethodId: payMethod ? payMethod._id : '',
            createdAt: now,
            updatedAt: now
          })
        }
      }
    } catch (error) {
      console.error('[ledgerImport] 写入失败', error)
      failed += 1
    }
  }

  return { batchId, success, failed, skipped: rows.length - selected.length }
}

/** 商户分类记忆：查询或删除。 */
async function importMerchantRules({ openid, payload, query }) {
  const roomId = payload.roomId || query.roomId
  await requireMembership(openid, roomId, 'viewer')

  const rules = await listAll(COLLECTIONS.merchantRules, { roomId })
  return rules.map((rule) => ({
    id: rule._id,
    merchant: rule.merchant,
    merchantKey: rule.merchantKey,
    categoryId: rule.categoryId,
    payMethodId: rule.payMethodId
  }))
}

module.exports = { importPreview, importConfirm, importMerchantRules }
