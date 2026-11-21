const LUNAR_MONTH_NAMES = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const DAY_NUMS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 1900-2100 农历数据 */
const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5d0, 0x14573, 0x052d0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056d0,
  0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, 0x14b63, 0x09370,
  0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a654, 0x0ab60, 0x095b0, 0x174d2,
  0x09690, 0x054ae, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x1d558, 0x0b540, 0x0b6a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada8,
  0x04b60, 0x0aae6, 0x0a930, 0x052f2, 0x04970, 0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0,
  0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, 0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4,
  0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, 0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5d0,
  0x14573, 0x052d0, 0x0a9a8, 0x0e950, 0x06aa0, 0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570,
  0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50,
  0x1b255, 0x06d20, 0x0ada0, 0x14b63
];

function leapMonth(year) {
  return LUNAR_INFO[year - 1900] & 0xf;
}

function leapDays(year) {
  if (leapMonth(year)) {
    return (LUNAR_INFO[year - 1900] & 0x10000) ? 30 : 29;
  }
  return 0;
}

function monthDays(year, month) {
  return (LUNAR_INFO[year - 1900] & (0x10000 >> month)) ? 30 : 29;
}

function lunarYearDays(year) {
  let sum = 348;
  for (let i = 0x8000; i > 0x8; i >>= 1) {
    sum += (LUNAR_INFO[year - 1900] & i) ? 1 : 0;
  }
  return sum + leapDays(year);
}

function solarToLunar(year, month, day) {
  const baseDate = new Date(1900, 0, 31);
  const objDate = new Date(year, month - 1, day);
  let offset = Math.floor((objDate - baseDate) / 86400000);

  let i;
  let temp = 0;
  for (i = 1900; i < 2101 && offset > 0; i++) {
    temp = lunarYearDays(i);
    offset -= temp;
  }
  if (offset < 0) {
    offset += temp;
    i--;
  }

  const lunarYear = i;
  const leap = leapMonth(i);
  let isLeap = false;

  let j;
  for (j = 1; j < 13 && offset > 0; j++) {
    if (leap > 0 && j === leap + 1 && !isLeap) {
      j--;
      isLeap = true;
      temp = leapDays(i);
    } else {
      temp = monthDays(i, j);
    }
    if (isLeap && j === leap + 1) isLeap = false;
    offset -= temp;
  }

  if (offset === 0 && leap > 0 && j === leap + 1) {
    if (isLeap) {
      isLeap = false;
    } else {
      isLeap = true;
      j--;
    }
  }
  if (offset < 0) {
    offset += temp;
    j--;
  }

  return {
    year: lunarYear,
    month: j,
    day: offset + 1,
    isLeap
  };
}

export function formatLunarDayName(day) {
  const d = parseInt(day, 10);
  if (!d || d < 1 || d > 30) return '';
  if (d === 10) return '初十';
  if (d < 10) return `初${DAY_NUMS[d]}`;
  if (d < 20) return `十${DAY_NUMS[d - 10]}`;
  if (d === 20) return '二十';
  if (d < 30) return `二十${DAY_NUMS[d - 20]}`;
  return '三十';
}

export function formatLunarMonthName(month, isLeap = false) {
  const name = LUNAR_MONTH_NAMES[month - 1] || String(month);
  return isLeap ? `闰${name}` : name;
}

/** 农历月日完整文案，如「四月二十三」 */
export function formatLunarMonthDay(month, day, isLeap = false) {
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);
  if (!m || !d) return '';
  const dayName = formatLunarDayName(d);
  if (!dayName) return '';
  return `${formatLunarMonthName(m, isLeap)}月${dayName}`;
}

/** 带前缀的完整农历，如「农历四月二十三」 */
export function formatLunarFull(month, day, isLeap = false) {
  const text = formatLunarMonthDay(month, day, isLeap);
  return text ? `农历${text}` : '';
}

/** 公历 YYYY-MM-DD 转农历月日结构 */
export function getLunarPartsFromSolarDate(dateStr) {
  const parts = (dateStr || '').split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (!year || !month || !day || year < 1900 || year > 2100) return null;

  const lunar = solarToLunar(year, month, day);
  return {
    year: lunar.year,
    month: lunar.month,
    day: lunar.day,
    isLeap: lunar.isLeap
  };
}

/** 根据存储的农历月日（生日录入） */
export function formatLunarFromDateStr(dateStr) {
  const parts = (dateStr || '').split('-');
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  return formatLunarFull(month, day);
}

/** 公历 YYYY-MM-DD 转农历完整文案 */
export function formatSolarDateLunar(dateStr) {
  const parts = (dateStr || '').split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (!year || !month || !day) return '';
  if (year < 1900 || year > 2100) return '';

  const lunar = solarToLunar(year, month, day);
  return formatLunarFull(lunar.month, lunar.day, lunar.isLeap);
}

/** 日历格子里用的短农历：仅日名，如「廿三」 */
export function formatLunarDayShort(dateStr) {
  const parts = (dateStr || '').split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (!year || !month || !day || year < 1900 || year > 2100) return '';

  const lunar = solarToLunar(year, month, day);
  return formatLunarDayName(lunar.day);
}

/**
 * 农历 -> 公历 Date。
 * 若当年无该闰月则自动退回对应平月，若当月仅 29 天而生日为 30 则取当月最后一天。
 */
export function lunarToSolar(lunarYear, month, day, isLeap = false) {
  if (lunarYear < 1900 || lunarYear >= 2100) return null;
  const m = Number(month);
  const d = Number(day);
  if (!m || !d || m < 1 || m > 12 || d < 1 || d > 30) return null;

  let offset = 0;
  for (let y = 1900; y < lunarYear; y++) offset += lunarYearDays(y);

  const leap = leapMonth(lunarYear);
  const effectiveLeap = Boolean(isLeap && leap === m);
  let placed = false;

  for (let i = 1; i <= 12; i++) {
    if (leap > 0 && i === leap + 1 && !placed) {
      const lDays = leapDays(lunarYear);
      if (effectiveLeap && m === leap) {
        offset += Math.min(d, lDays) - 1;
        return new Date(1900, 0, 31 + offset);
      }
      offset += lDays;
      placed = true;
      i--;
      continue;
    }
    const mDays = monthDays(lunarYear, i);
    if (i === m && !effectiveLeap) {
      offset += Math.min(d, mDays) - 1;
      return new Date(1900, 0, 31 + offset);
    }
    offset += mDays;
  }
  return null;
}

/** 农历生日在指定公历年份里的公历日期（YYYY-MM-DD） */
export function lunarBirthdayInSolarYear(solarYear, month, day, isLeap = false) {
  const pad2 = (n) => String(n).padStart(2, '0');
  for (const ly of [solarYear - 1, solarYear, solarYear + 1]) {
    const solar = lunarToSolar(ly, month, day, isLeap);
    if (!solar) continue;
    if (solar.getFullYear() === solarYear) {
      return `${solar.getFullYear()}-${pad2(solar.getMonth() + 1)}-${pad2(solar.getDate())}`;
    }
  }
  return '';
}
