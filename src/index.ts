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

import { Context, Logger } from 'koishi';
import { MuteCore } from './MuteCore';
import { initDatabase } from './database';
import { ConfigSchema } from './schema';
import { GlobalConfig } from './types';

const logger = new Logger('gipas-mute');

/**
 * 插件导出
 */
export const name = 'gipas-mute';
export const usage = `
# 定时禁言插件

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
export const schema = ConfigSchema;

/**
 * 插件主函数
 */
export async function apply(ctx: Context, config: GlobalConfig) {
  logger.info('插件已加载');

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

  // 插件卸载时清理定时器
  ctx.on('dispose', () => {
    clearInterval(heartbeatInterval);
    logger.info('插件已卸载，定时器已清理');
  });

  // 插件加载完成
  logger.info('插件初始化完成');
}
