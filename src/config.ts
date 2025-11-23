/**
 * Koishi Schema 定义
 * 包含完整的配置界面定义
 * 
 * 设计原则：
 * - 使用 Schema.dynamic() 进行动态类型选择
 * - 使用 .role('table') 将数组显示为表格形式
 * - 禁言时间使用时间字符串校验
 * - 高内聚：所有 schema 定义集中在此文件
 * - 低耦合：仅依赖类型定义，不依赖业务逻辑
 */

import { Schema } from 'koishi';
import { GlobalConfig } from './types';

/**
 * 创建主配置 Schema
 * 使用动态类型，通过 ctx.schema.set() 在运行时更新下拉列表
 */
export function createConfigSchema(): Schema<GlobalConfig> {
  return Schema.object({

    muteGroups: Schema.array(
      Schema.object({
        name: Schema.string()
          .required()
          .description('禁言组 ID'),
        rules: Schema.array(
          Schema.object({
            time: Schema.string()
              .default('07:00')
              .pattern(/^\d{2}:\d{2}$/)
              .description('触发时间'),
            isMuted: Schema.boolean()
              .default(true)
              .description('禁言'),
          })
        )
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
      })
    )
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
          monday: Schema.string()
            .default('default')
            .description('周一'),
          tuesday: Schema.string()
            .default('default')
            .description('周二'),
          wednesday: Schema.string()
            .default('default')
            .description('周三'),
          thursday: Schema.string()
            .default('default')
            .description('周四'),
          friday: Schema.string()
            .default('default')
            .description('周五'),
          saturday: Schema.string()
            .default('weekend')
            .description('周六'),
          sunday: Schema.string()
            .default('weekend')
            .description('周日'),
        }),
      })
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
        holidayMuteGroup: Schema.string()
          .default('default')
          .description('节假日禁言组'),
        compensationMuteGroup: Schema.string()
          .default('compensation')
          .description('调休禁言组'),
        defaultWeekGroup: Schema.string()
          .default('default')
          .description('星期调度组'),
      })
    )
      .collapse()
      .role('table')
      .default([])
      .description('群组配置'),

    holidayMethod: Schema.union([
      Schema.const('offline').description('离线 (离线包)'),
      Schema.const('online').description('在线 (API)'),
      Schema.const('hybrid').description('混合 (在线优先，失败退回)'),
    ])
      .default('hybrid')
      .description('节假日检查方法'),

  });
}

/**
 * 默认导出配置
 * 提供 schema（给 Koishi）和 config（给业务逻辑）两个导出
 */
export const schema = createConfigSchema();
