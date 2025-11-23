


/**
 * Koishi 定时禁言插件 - 主入口
 * 
 * 三层配置架构 + 状态维持 + 心跳循环
 * 
 * Usage:
 * 1. 在 Koishi 配置中添加该插件
 * 2. 配置禁言组、星期组、群组信息
 * 3. 插件自动每分钟检查一次状态并自动纠正
 */

import { Context, Logger, Schema } from 'koishi';
import { MuteCore } from './MuteCore';
import { initDatabase } from './database';
import { GlobalConfig } from './types';

const logger = new Logger('gipas-mute');



/**
 * 插件导出
 */
export const name = 'gipas-mute';
export const usage = `
# 定时禁言插件

!!!我不知道怎么做动态schema，所有只能手动输入组名

此插件80%由AI编写，经大量人工调试和完善，已稳定可用

通过三层配置架构管理 QQ 群的定时禁言任务。

## 功能特性

- **三层配置** : 禁言时间表 → 星期调度 → 群组绑定
- **状态维持** : 心跳检测 + 状态回溯，即使宕机重启也能自动纠正
- **持久化** : 使用数据库记录当前状态
- **调休支持** : 支持中国法定节假日/调休逻辑

## 配置示例

参见管理面板 > 插件配置 > gipas-mute

## 命令

无需手动命令，插件自动运行。

## 状态管理

- 每分钟执行一次心跳循环
- 检查配置的所有群
- 计算每个群的期望禁言状态
- 与数据库状态对比并自动调整
`;

export const inject = ['database'];

// 导出 schema 给 Koishi 使用（必须）
export { schema } from './config';

// 存储当前配置，用于动态类型更新
let currentConfig: GlobalConfig | null = null;

/**
 * 插件主函数
 */
export async function apply(ctx: Context, config: GlobalConfig) {
  // 确保配置对象有必要的字段
  if (!config.muteGroups) config.muteGroups = [];
  if (!config.weekGroups) config.weekGroups = [];
  if (!config.groupConfigs) config.groupConfigs = [];

  // 数据清理和验证：填充缺失的字段
  config.muteGroups.forEach(mg => {
    if (!mg.name) mg.name = 'unnamed_group';
    if (!mg.rules) mg.rules = [];
    if (mg.sendNotification === null || mg.sendNotification === undefined) mg.sendNotification = false;
    if (!mg.message) mg.message = '群已禁言';
    
    // 确保每条规则都有 isMuted 字段
    mg.rules.forEach(rule => {
      if (rule.isMuted === null || rule.isMuted === undefined) {
        rule.isMuted = true;
      }
    });
  });

  config.weekGroups.forEach(wg => {
    if (!wg.name) wg.name = 'unnamed_week_group';
    if (!wg.weekdays) {
      wg.weekdays = {
        monday: 'default',
        tuesday: 'default',
        wednesday: 'default',
        thursday: 'default',
        friday: 'default',
        saturday: 'weekend',
        sunday: 'weekend',
      };
    }
    // 填充缺失的星期配置
    const defaultWeekdays = {
      monday: 'default',
      tuesday: 'default',
      wednesday: 'default',
      thursday: 'default',
      friday: 'default',
      saturday: 'weekend',
      sunday: 'weekend',
    };
    Object.keys(defaultWeekdays).forEach(day => {
      if (!wg.weekdays[day as keyof typeof wg.weekdays]) {
        wg.weekdays[day as keyof typeof wg.weekdays] = defaultWeekdays[day as keyof typeof defaultWeekdays];
      }
    });
  });

  config.groupConfigs.forEach(gc => {
    if (!gc.guildId) gc.guildId = '0';
    if (gc.enableHoliday === null || gc.enableHoliday === undefined) gc.enableHoliday = true;
    if (!gc.holidayMuteGroup) gc.holidayMuteGroup = 'default';
    if (!gc.compensationMuteGroup) gc.compensationMuteGroup = 'compensation';
    if (!gc.defaultWeekGroup) gc.defaultWeekGroup = 'default';
  });

  // 保存当前配置
  currentConfig = config;

  // 生成禁言组名称列表和星期组名称列表
  const muteGroupNames = config.muteGroups.map(g => g.name);
  const weekGroupNames = config.weekGroups.map(g => g.name);

  logger.info('插件已加载，当前禁言组:', muteGroupNames.join(', ') || '(无)');
  logger.info('插件已加载，当前星期组:', weekGroupNames.join(', ') || '(无)');

  // 注册动态类型供下拉菜单使用
  const muteGroupSchemaOptions = (muteGroupNames.length > 0
    ? muteGroupNames.map((name) => Schema.const(name).description(name))
    : [Schema.const('default').description('default')]) as Schema<string>[];
  ctx.schema.set('mute-group-names', Schema.union(muteGroupSchemaOptions));

  const weekGroupSchemaOptions = (weekGroupNames.length > 0
    ? weekGroupNames.map((name) => Schema.const(name).description(name))
    : [Schema.const('default').description('default')]) as Schema<string>[];
  ctx.schema.set('week-group-names', Schema.union(weekGroupSchemaOptions));

  logger.info('插件已加载，当前禁言组:', muteGroupNames.join(', ') || '(无)');
  logger.info('插件已加载，当前星期组:', weekGroupNames.join(', ') || '(无)');

  // 初始化数据库模型
  await initDatabase(ctx);
  logger.info('数据库模型已初始化');

  // 创建核心业务逻辑实例
  const muteCore = new MuteCore(ctx, config);

  // 注册心跳循环 - 每分钟执行一次
  // 使用定时器每 60 秒检查一次状态
  const heartbeatInterval = setInterval(() => {
    muteCore.run().catch((e) => {
      logger.error('心跳循环出错:', e);
    });
  }, 60 * 1000); // 60秒执行一次

  logger.info('心跳循环已启动 (每 60 秒执行一次)');

  // 当配置更新时，更新全局 currentConfig、动态类型和 MuteCore 的配置
  ctx.on('config', () => {
    currentConfig = config;
    
    // 重新生成并更新动态类型
    const updatedMuteGroupNames = config.muteGroups.map(g => g.name);
    const updatedWeekGroupNames = config.weekGroups.map(g => g.name);

    const updatedMuteGroupSchemaOptions = (updatedMuteGroupNames.length > 0
      ? updatedMuteGroupNames.map((name) => Schema.const(name).description(name))
      : [Schema.const('default').description('default')]) as Schema<string>[];
    ctx.schema.set('mute-group-names', Schema.union(updatedMuteGroupSchemaOptions));

    const updatedWeekGroupSchemaOptions = (updatedWeekGroupNames.length > 0
      ? updatedWeekGroupNames.map((name) => Schema.const(name).description(name))
      : [Schema.const('default').description('default')]) as Schema<string>[];
    ctx.schema.set('week-group-names', Schema.union(updatedWeekGroupSchemaOptions));

    muteCore.updateConfig(config);
    logger.info('配置已更新，当前禁言组:', updatedMuteGroupNames.join(', '));
  });

  // 插件卸载时清理定时器
  ctx.on('dispose', () => {
    clearInterval(heartbeatInterval);
    currentConfig = null;
    logger.info('插件已卸载，定时器已清理');
  });

  // 插件加载完成
  logger.info('插件初始化完成');
}
