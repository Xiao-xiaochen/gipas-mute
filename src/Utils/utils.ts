/**
 * 辅助函数库
 */

import { HolidayCheckResult, MuteGroup, ExpectedState } from '../types';

// 节假日缓存，key: YYYY-MM-DD，value: HolidayCheckResult
const holidayCache = new Map<string, HolidayCheckResult>();

// 缓存过期时间（毫秒）：24小时
const CACHE_DURATION = 24 * 60 * 60 * 1000;

// 缓存时间戳，key: YYYY-MM-DD，value: 缓存时间
const cacheTimestamp = new Map<string, number>();

// 在线节假日 API（按年返回）的缓存
type OnlineHolidayDay = {
  name?: string;
  date: string;
  isOffDay: boolean;
};

const onlineYearCache = new Map<number, { fetchedAt: number; days: OnlineHolidayDay[] }>();
const ONLINE_YEAR_CACHE_DURATION = 12 * 60 * 60 * 1000;

/**
 * 尝试加载 chinese-days 包进行离线节假日检查
 */
function loadChineseDaysOffline(): any {
  try {
    // 尝试动态导入 chinese-days
    return require('chinese-days');
  } catch (e) {
    return null;
  }
}

async function fetchHolidayYearFromApi(
  year: number,
  signal?: AbortSignal
): Promise<OnlineHolidayDay[]> {
  const cached = onlineYearCache.get(year);
  if (cached && Date.now() - cached.fetchedAt < ONLINE_YEAR_CACHE_DURATION) {
    return cached.days;
  }

  const response = await fetch(`https://holiday.cyi.me/api/holidays?year=${year}`, {
    signal,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'gipas-mute/1.0',
    },
  });

  const rawBody = await response.text();

  if (!response.ok) {
    const snippet = rawBody.slice(0, 120);
    throw new Error(`API 返回错误: ${response.status} ${snippet}`);
  }

  let data: any;
  try {
    data = JSON.parse(rawBody);
  } catch (parseErr) {
    const snippet = rawBody.slice(0, 120);
    throw new Error(`API 返回非 JSON 响应: ${snippet}`);
  }

  if (!Array.isArray(data?.days)) {
    throw new Error('API 数据格式异常: 缺少 days');
  }

  const normalized: OnlineHolidayDay[] = data.days
    .filter((item: any) => typeof item?.date === 'string')
    .map((item: any) => ({
      date: item.date,
      name: typeof item.name === 'string' ? item.name : undefined,
      isOffDay: Boolean(item.isOffDay),
    }));

  onlineYearCache.set(year, {
    fetchedAt: Date.now(),
    days: normalized,
  });

  return normalized;
}

/**
 * 检查是否是节假日或调休工作日
 * @param date 待检查的日期
 * @param method 检查方法：
 *   - 'offline' 仅使用离线 npm 包
 *   - 'online' 仅使用在线 API
 *   - 'hybrid' 先在线获取并缓存，在线不行就离线（默认）
 * @returns 节假日检查结果
 */
export async function checkHoliday(
  date: Date,
  method: 'offline' | 'online' | 'hybrid' = 'hybrid'
): Promise<HolidayCheckResult> {
  if (method === 'offline') {
    return checkHolidayOffline(date);
  } else if (method === 'online') {
    return checkHolidayOnline(date);
  } else {
    // 混合模式：先在线，失败则离线
    return checkHolidayHybrid(date);
  }
}

/**
 * 混合模式：先在线获取并缓存，失败则回退到离线
 */
async function checkHolidayHybrid(date: Date): Promise<HolidayCheckResult> {
  const dateStr = formatDate(date);
  
  // 检查缓存是否有效
  if (holidayCache.has(dateStr)) {
    const timestamp = cacheTimestamp.get(dateStr) || 0;
    if (Date.now() - timestamp < CACHE_DURATION) {
      return holidayCache.get(dateStr)!;
    } else {
      // 缓存过期，删除
      holidayCache.delete(dateStr);
      cacheTimestamp.delete(dateStr);
    }
  }

  try {
    // 先尝试在线获取
    const result = await checkHolidayOnline(date);
    // 缓存结果
    holidayCache.set(dateStr, result);
    cacheTimestamp.set(dateStr, Date.now());
    return result;
  } catch (e) {
    console.warn('[gipas-mute] 在线节假日检查失败，切换到离线模式:', e);
    // 在线失败，回退到离线
    return checkHolidayOffline(date);
  }
}

/**
 * 离线节假日检查 (使用 chinese-days npm 包)
 */
function checkHolidayOffline(date: Date): HolidayCheckResult {
  try {
    const chineseDaysModule = loadChineseDaysOffline();
    if (!chineseDaysModule) {
      return {
        isHoliday: false,
        isCompensationDay: false,
      };
    }

    // 支持 CommonJS 与 ESM 默认导出
    const chineseDays = (chineseDaysModule.default ?? chineseDaysModule) as any;

    const isHolidayFn = typeof chineseDays?.isHoliday === 'function'
      ? chineseDays.isHoliday.bind(chineseDays)
      : null;
    const isInLieuFn = typeof chineseDays?.isInLieu === 'function'
      ? chineseDays.isInLieu.bind(chineseDays)
      : null;
    const getDayDetailFn = typeof chineseDays?.getDayDetail === 'function'
      ? chineseDays.getDayDetail.bind(chineseDays)
      : null;

    if (!isHolidayFn || !isInLieuFn) {
      throw new Error('chinese-days 缺少 isHoliday/isInLieu 方法');
    }

    const isHoliday = Boolean(isHolidayFn(date));
    const isCompensationDay = Boolean(isInLieuFn(date));

    let holidayName: string | undefined;
    if (getDayDetailFn) {
      const detail = getDayDetailFn(date);
      if (detail && detail.name && !detail.work) {
        holidayName = detail.name;
      }
    }

    return {
      isHoliday,
      isCompensationDay,
      holidayName,
    };
  } catch (e) {
    console.error('[gipas-mute] 离线调休检查失败:', e);
    return {
      isHoliday: false,
      isCompensationDay: false,
    };
  }
}

/**
 * 在线节假日检查 (使用公开 API: https://holiday.cyi.me/api/holidays)
 */
async function checkHolidayOnline(date: Date): Promise<HolidayCheckResult> {
  try {
    const year = date.getFullYear();
    const dateStr = formatDate(date);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const candidateYears = new Set<number>([year]);
      // 涉及跨年补班/调休时，下一年的数据可能包含上一年的日期，反之亦然
      if (date.getMonth() === 11) {
        candidateYears.add(year + 1);
      }
      if (date.getMonth() === 0) {
        candidateYears.add(year - 1);
      }

      for (const candidateYear of candidateYears) {
        if (candidateYear <= 0) {
          continue;
        }
        const days = await fetchHolidayYearFromApi(
          candidateYear,
          controller.signal
        );
        const match = days.find((day) => day.date === dateStr);
        if (match) {
          return {
            isHoliday: match.isOffDay,
            isCompensationDay: !match.isOffDay,
            holidayName: match.name,
          };
        }
      }

      return {
        isHoliday: false,
        isCompensationDay: false,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error('[gipas-mute] 在线节假日检查失败:', errorMsg);
    throw e;
  }
}

/**
 * 将时间字符串 "HH:mm" 解析为分钟数
 * @param timeStr 时间字符串，格式 "HH:mm"
 * @returns 从午夜开始的分钟数
 */
export function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) {
    throw new Error(`错误时间格式: ${timeStr}`);
  }
  return hours * 60 + minutes;
}

/**
 * 获取日期的 HH:mm 字符串
 */
export function getTimeString(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * 计算期望的禁言状态
 * 
 * 算法：
 * 1. 在给定的 MuteGroup 中查找所有规则
 * 2. 找出小于等于当前时间的最后一个规则作为"触发点"
 * 3. 如果今天没有任何规则被触发（即当前时间小于第一个规则时间），
 *    则回溯到昨天，查找昨天的最后一个规则
 * 
 * @param now 当前时间
 * @param muteGroup 禁言组
 * @returns 期望状态
 */
export function getExpectedState(
  now: Date,
  muteGroup: MuteGroup
): ExpectedState {
  const nowMinutes = parseTimeToMinutes(getTimeString(now));
  
  // 按时间排序规则
  const sortedRules = [...muteGroup.rules].sort((a, b) => {
    return parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
  });

  if (sortedRules.length === 0) {
    throw new Error(`禁言组 "${muteGroup.name}" 没有定义`);
  }

  // 查找今天小于等于当前时间的最后一个规则
  let matchedRule = null;
  let isFromPreviousDay = false;

  for (let i = sortedRules.length - 1; i >= 0; i--) {
    const ruleMinutes = parseTimeToMinutes(sortedRules[i].time);
    if (ruleMinutes <= nowMinutes) {
      matchedRule = sortedRules[i];
      break;
    }
  }

  // 如果没有找到今天的规则，使用昨天的最后一个规则
  if (!matchedRule) {
    matchedRule = sortedRules[sortedRules.length - 1];
    isFromPreviousDay = true;
  }

  return {
    isMuted: matchedRule.isMuted,
    triggerTime: matchedRule.time,
    muteGroupName: muteGroup.name,
    isFromPreviousDay,
  };
}

/**
 * 获取一周的第几天 (0-6, 其中 0 是周日)
 * 返回一个更直观的值，其中周一 = 1, ..., 周日 = 0
 */
export function getDayOfWeek(date: Date): 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday' {
  const days: Array<'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday'> = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  return days[date.getDay()] as any;
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 延迟函数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
