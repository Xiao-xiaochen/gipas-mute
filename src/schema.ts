/**
 * Koishi Schema 定义
 * 包含完整的配置界面定义
 * 
 * 设计原则：
 * - 使用 Union 类型进行状态选择，提供直观的前端展示
 * - 使用 .role('table') 将数组显示为表格形式
 * - 禁言时间使用直观的时间选择器
 */

import { Schema } from 'koishi';
import {
  MuteGroup,
  WeekGroup,
  GroupConfig,
  GlobalConfig,
  MuteRule,
  WeekdayConfig,
} from './types';

/**
 * MuteRule Schema - 单条禁言规则 (表格行)
 * 以表格形式展示，每行一个规则
 */
export const MuteRuleSchema: Schema<MuteRule> = Schema.object({
  time: Schema.string()
    .default('07:00')
    .pattern(/^\d{2}:\d{2}$/)
    .description('触发时间'),
  isMuted: Schema.boolean()
    .default(true)
    .description('禁言'),
});

/**
 * MuteGroup Schema - 禁言组
 * 定义一组时间规则，支持配置联动（开启通知时显示通知内容）
 */
export const MuteGroupSchema: Schema<MuteGroup> = Schema.object({
  name: Schema.string()
    .required()
    .description('禁言组 ID'),
  rules: Schema.array(MuteRuleSchema)
    .role('table')
    .default([
      { time: '07:00', isMuted: true },
      { time: '18:00', isMuted: false },
    ])
    .description('时间规则表'),
  sendNotification: Schema.boolean()
    .default(false)
    .description('发送通知消息'),
  message: Schema.string()
    .default('群已禁言')
    .max(100)
    .description('通知消息'),
});

/**
 * WeekdayConfig Schema - 星期配置
 * 每天选择一个禁言组（由配置中的禁言组列表动态提供）
 */
export function createWeekdayConfigSchema(muteGroupNames: string[]): Schema<WeekdayConfig> {
  return Schema.object({
    monday: Schema.union(
      muteGroupNames.map((name) => Schema.const(name).description(name))
    )
      .default('default')
      .description('周一禁言组'),
    tuesday: Schema.union(
      muteGroupNames.map((name) => Schema.const(name).description(name))
    )
      .default('default')
      .description('周二禁言组'),
    wednesday: Schema.union(
      muteGroupNames.map((name) => Schema.const(name).description(name))
    )
      .default('default')
      .description('周三禁言组'),
    thursday: Schema.union(
      muteGroupNames.map((name) => Schema.const(name).description(name))
    )
      .default('default')
      .description('周四禁言组'),
    friday: Schema.union(
      muteGroupNames.map((name) => Schema.const(name).description(name))
    )
      .default('default')
      .description('周五禁言组'),
    saturday: Schema.union(
      muteGroupNames.map((name) => Schema.const(name).description(name))
    )
      .default('weekend')
      .description('周六禁言组'),
    sunday: Schema.union(
      muteGroupNames.map((name) => Schema.const(name).description(name))
    )
      .default('weekend')
      .description('周日禁言组'),
  });
}

/**
 * WeekGroup Schema 构造函数 - 星期组
 * 定义一周的禁言安排（禁言组动态选择）
 */
export function createWeekGroupSchema(muteGroupNames: string[]): Schema<WeekGroup> {
  return Schema.object({
    name: Schema.string()
      .required()
      .pattern(/^[a-zA-Z0-9_-]+$/)
      .description('星期组 ID (英文和数字)'),
    weekdays: createWeekdayConfigSchema(muteGroupNames)
      .description('每天使用的禁言组'),
  }).description('定义一周的禁言安排');
}

/**
 * 群组配置 Schema 构造函数
 */
export function createGroupConfigSchema(
  muteGroupNames: string[],
  weekGroupNames: string[]
): Schema<GroupConfig> {
  return Schema.object({
    guildId: Schema.string()
      .required()
      .pattern(/^\d+$/)
      .description('QQ 群号'),
    enableHoliday: Schema.union([
      Schema.const(true).description('启用'),
      Schema.const(false).description('禁用'),
    ])
      .default(true)
      .description('是否启用节假日/调休判断'),
    compensationMuteGroup: Schema.union(
      muteGroupNames.map((name) => Schema.const(name).description(name))
    )
      .default('compensation')
      .description('调休工作日使用的禁言组'),
    defaultWeekGroup: Schema.union(
      weekGroupNames.map((name) => Schema.const(name).description(name))
    )
      .default('default')
      .description('默认的星期调度组'),
  });
}

/**
 * 旧的 GroupConfigSchema (保留向后兼容)
 */
export const GroupConfigSchema: Schema<GroupConfig> = Schema.object({
  guildId: Schema.string()
    .required()
    .pattern(/^\d+$/)
    .description('QQ 群号'),
  enableHoliday: Schema.union([
    Schema.const(true).description('启用'),
    Schema.const(false).description('禁用'),
  ])
    .default(true)
    .description('是否启用节假日/调休判断'),
  compensationMuteGroup: Schema.string()
    .default('compensation')
    .description('调休工作日使用的禁言组'),
  defaultWeekGroup: Schema.string()
    .default('default')
    .description('默认的星期调度组'),
});

/**
 * 全局配置 Schema 构造函数
 * 根据已配置的禁言组和星期组动态生成选择器
 */
export function createConfigSchema(): Schema<GlobalConfig> {
  // 默认禁言组名称
  const defaultMuteGroupNames = ['default', 'weekend', 'compensation'];
  // 默认星期组名称
  const defaultWeekGroupNames = ['default'];

  return Schema.object({

    muteGroups: Schema.array(MuteGroupSchema)
      .collapse()
      .default([
        {
          name: 'default',
          sendNotification: false,
          message: '群已禁言',
          rules: [
            { time: '07:00', isMuted: true },
            { time: '18:00', isMuted: false },
          ],
        },
        {
          name: 'weekend',
          sendNotification: false,
          message: '周末禁言',
          rules: [
            { time: '08:00', isMuted: true },
            { time: '22:00', isMuted: false },
          ],
        },
        {
          name: 'compensation',
          sendNotification: false,
          message: '调休工作日禁言',
          rules: [
            { time: '07:00', isMuted: true },
            { time: '18:00', isMuted: false },
          ],
        },
      ])
      .description('禁言组定义'),

    weekGroups: Schema.array(
      Schema.object({
        name: Schema.string()
          .required()
          .description('星期组 ID'),
        weekdays: Schema.object({
          monday: Schema.union(
            defaultMuteGroupNames.map((name) => Schema.const(name).description(name))
          )
            .default('default')
            .description('周一'),
          tuesday: Schema.union(
            defaultMuteGroupNames.map((name) => Schema.const(name).description(name))
          )
            .default('default')
            .description('周二'),
          wednesday: Schema.union(
            defaultMuteGroupNames.map((name) => Schema.const(name).description(name))
          )
            .default('default')
            .description('周三'),
          thursday: Schema.union(
            defaultMuteGroupNames.map((name) => Schema.const(name).description(name))
          )
            .default('default')
            .description('周四'),
          friday: Schema.union(
            defaultMuteGroupNames.map((name) => Schema.const(name).description(name))
          )
            .default('default')
            .description('周五'),
          saturday: Schema.union(
            defaultMuteGroupNames.map((name) => Schema.const(name).description(name))
          )
            .default('weekend')
            .description('周六'),
          sunday: Schema.union(
            defaultMuteGroupNames.map((name) => Schema.const(name).description(name))
          )
            .default('weekend')
            .description('周日'),
        }),
      }).description('星期安排配置')
    )
      .collapse()
      .default([
        {
          name: 'default',
          weekdays: {
            monday: 'default',
            tuesday: 'default',
            wednesday: 'default',
            thursday: 'default',
            friday: 'default',
            saturday: 'weekend',
            sunday: 'weekend',
          },
        },
      ])
      .description('星期组定义'),

    groupConfigs: Schema.array(
      Schema.object({
        guildId: Schema.string()
          .required()
          .pattern(/^\d+$/)
          .description('QQ 群号'),
        enableHoliday: Schema.boolean()
          .default(true)
          .description('启用调休判断'),
        compensationMuteGroup: Schema.union(
          defaultMuteGroupNames.map((name) => Schema.const(name).description(name))
        )
          .default('compensation')
          .description('调休禁言组'),
        defaultWeekGroup: Schema.union(
          defaultWeekGroupNames.map((name) => Schema.const(name).description(name))
        )
          .default('default')
          .description('星期调度组'),
      })
    )
      .collapse()
      .role('table')
      .default([])
      .description('群组配置'),

    holidayMethod: Schema.union([
      Schema.const('offline').description('离线 (npm 包)'),
      Schema.const('online').description('在线 (API)'),
    ])
      .default('offline')
      .description('节假日检查方法'),

  });
}

/**
 * 默认导出配置 Schema
 */
export const ConfigSchema = createConfigSchema();
