/**
 * 辅助函数库
 */

import { HolidayCheckResult, MuteGroup, ExpectedState } from './types';

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

/**
 * 检查是否是节假日或调休工作日
 * @param date 待检查的日期
 * @param method 检查方法：'offline' 使用 npm 包，'online' 使用 API
 * @returns 节假日检查结果
 */
export async function checkHoliday(
  date: Date,
  method: 'offline' | 'online' = 'offline'
): Promise<HolidayCheckResult> {
  if (method === 'offline') {
    return checkHolidayOffline(date);
  } else {
    return checkHolidayOnline(date);
  }
}

/**
 * 离线节假日检查 (使用 chinese-days npm 包)
 */
function checkHolidayOffline(date: Date): HolidayCheckResult {
  try {
    const chineseDays = loadChineseDaysOffline();
    if (!chineseDays) {
      // 如果 chinese-days 未安装，返回默认值
      return {
        isHoliday: false,
        isCompensationDay: false,
      };
    }

    // chinese-days 的 API 通常是：
    // festival(date) 返回节假日信息或 null
    const result = chineseDays.festival(date);

    if (result) {
      return {
        isHoliday: true,
        isCompensationDay: result.type === 'workingDay' || result.type === 'compensationDay',
        holidayName: result.name,
      };
    }

    return {
      isHoliday: false,
      isCompensationDay: false,
    };
  } catch (e) {
    console.error('[gipas-mute] Error checking holiday offline:', e);
    return {
      isHoliday: false,
      isCompensationDay: false,
    };
  }
}

/**
 * 在线节假日检查 (使用 API)
 * 这是一个示例实现，可根据实际 API 调整
 */
async function checkHolidayOnline(date: Date): Promise<HolidayCheckResult> {
  try {
    // 示例：使用公开的节假日 API
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // 这里需要替换为实际的 API 端点
    const response = await fetch(`https://api.example.com/holiday/${dateStr}`);
    if (!response.ok) {
      return {
        isHoliday: false,
        isCompensationDay: false,
      };
    }

    const data = await response.json();
    return {
      isHoliday: data.isHoliday || false,
      isCompensationDay: data.isCompensationDay || false,
      holidayName: data.name,
    };
  } catch (e) {
    console.error('[gipas-mute] Error checking holiday online:', e);
    return {
      isHoliday: false,
      isCompensationDay: false,
    };
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
    throw new Error(`Invalid time format: ${timeStr}`);
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
    throw new Error(`MuteGroup "${muteGroup.name}" has no rules defined`);
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
