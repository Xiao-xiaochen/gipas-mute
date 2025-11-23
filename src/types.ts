/**
 * 定时禁言插件 - 类型定义和数据结构
 */

/**
 * 单条禁言规则
 */
export interface MuteRule {
  /** 触发时间，格式 "HH:mm" 例如 "07:15" */
  time: string;
  /** 是否禁言（true=禁言，false=解禁） */
  isMuted: boolean;
}

/**
 * 禁言组 (Layer 1)
 * 定义一组禁言时间表
 */
export interface MuteGroup {
  /** 唯一标识 */
  name: string;
  /** 是否发送通知 */
  sendNotification: boolean;
  /** 通知消息 (可选) */
  message?: string;
  /** 禁言规则列表，按时间排序 */
  rules: MuteRule[];
}

/**
 * 星期配置
 */
export interface WeekdayConfig {
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
}

/**
 * 星期组 (Layer 2)
 * 定义星期与禁言组的映射关系
 */
export interface WeekGroup {
  /** 唯一标识 */
  name: string;
  /** 每天使用的禁言组 ID/Name */
  weekdays: WeekdayConfig;
}

/**
 * 群组配置 (Layer 3)
 * 绑定群号与调度策略
 */
export interface GroupConfig {
  /** 群号 */
  guildId: string;
  /** 是否启用法定节假日/调休判断 */
  enableHoliday: boolean;
  /** 当检测到节假日时使用的禁言组 ID */
  holidayMuteGroup: string;
  /** 当检测到调休工作日时使用的禁言组 ID */
  compensationMuteGroup: string;
  /** 关联的星期组 ID */
  defaultWeekGroup: string;
}

/**
 * 数据库模型 - 禁言状态追踪
 */
export interface MuteState {
  /** 群号，主键 */
  guildId: string;
  /** 当前实际禁言状态 */
  isMuted: boolean;
  /** 最后更新时间戳 (ms) */
  lastUpdated: number;
  /** 对应的 MuteGroup 名称 (用于审计) */
  appliedMuteGroup?: string;
}

/**
 * 期望状态计算结果
 */
export interface ExpectedState {
  /** 期望的禁言状态 */
  isMuted: boolean;
  /** 触发该状态的时间点 */
  triggerTime: string;
  /** 应用的 MuteGroup 名称 */
  muteGroupName: string;
  /** 是否是回溯昨日的状态 */
  isFromPreviousDay: boolean;
}

/**
 * 全局配置
 */
export interface GlobalConfig {
  /** 节假日检查方法：'offline' 使用 npm 包，'online' 使用 API，'hybrid' 在线优先+缓存回退离线 */
  holidayMethod: 'offline' | 'online' | 'hybrid';
  /** 禁言组列表 */
  muteGroups: MuteGroup[];
  /** 星期组列表 */
  weekGroups: WeekGroup[];
  /** 群组配置列表 */
  groupConfigs: GroupConfig[];
}

/**
 * 节假日检查结果
 */
export interface HolidayCheckResult {
  /** 是否是节假日 */
  isHoliday: boolean;
  /** 是否是调休工作日 */
  isCompensationDay: boolean;
  /** 节假日名称 (如果适用) */
  holidayName?: string;
}
