import { Context } from 'koishi';
import { MuteCore } from '../MuteCore';
import { setGroupMute } from './MuteCore';
import { getMuteState, updateMuteState } from '../database';
import { checkHoliday, formatDate } from './utils';

type TestMode = 'auto' | 'mute' | 'unmute' | 'state';

export function registerMuteTestCommand(ctx: Context, muteCore: MuteCore): void {
  const root = ctx
    .command('gipas.mute', 'GIPAS 禁言调试工具', { authority: 2 })
    .usage('gipas.mute test <群号> [mode] / gipas.mute holiday <日期>');

  root
    .subcommand('.test <guildId:string> [mode:string]', '测试单群禁言逻辑')
    .option('message', '-m <text:string>')
    .action(async ({ session, options }, guildId, mode = 'auto') => {
      if (!guildId) {
        return '请提供群号，例如：gipas.mute test 123456 auto';
      }

      const normalizedMode = (mode.toLowerCase() as TestMode) || 'auto';
      const customMessage = options?.message as string | undefined;

      try {
        if (normalizedMode === 'auto') {
          const result = await muteCore.checkGroupNow(guildId);
          if (!result.success) {
            return `执行失败：${result.message}`;
          }

          if (customMessage) {
            await session?.send(customMessage);
          }

          return `执行成功：${result.message}`;
        }

        if (normalizedMode === 'mute' || normalizedMode === 'unmute') {
          const enable = normalizedMode === 'mute';
          await setGroupMute(ctx, guildId, enable);
          await updateMuteState(ctx, guildId, enable, 'manual');
          return `已${enable ? '禁言' : '解禁'}群 ${guildId}`;
        }

        if (normalizedMode === 'state') {
          const state = await getMuteState(ctx, guildId);
          if (!state) {
            return '数据库中暂无该群的记录。';
          }
          return `群 ${guildId} 状态：${state.isMuted ? '禁言中' : '未禁言'}，规则 ${state.appliedMuteGroup}，更新时间 ${new Date(state.lastUpdated).toLocaleString()}`;
        }

        return '无效的 mode，请使用 auto/mute/unmute/state';
      } catch (error) {
        ctx.logger('gipas-mute').error('[测试命令] 执行失败:', error);
        return `指令执行出错：${(error as Error).message}`;
      }
    });

  root
    .subcommand('.holiday <date:string>', '测试节假日在线/离线检测')
    .option('method', '-m <method:string>', { fallback: 'both' })
    .usage('默认同时测试 online/offline，可用 -m online/offline/hybrid 指定单项')
    .action(async (_, date, method = 'both') => {
      if (!date) {
        return '请提供日期，例如：gipas.mute holiday 2024-05-01';
      }

      const targetDate = new Date(date);
      if (Number.isNaN(targetDate.getTime())) {
        return `无法解析日期：${date}`;
      }

      const normalizedMethod = method.toLowerCase();
      const tasks: Array<'online' | 'offline' | 'hybrid'> =
        normalizedMethod === 'online' || normalizedMethod === 'offline' || normalizedMethod === 'hybrid'
          ? [normalizedMethod]
          : ['online', 'offline'];

      const results: string[] = [];
      for (const task of tasks) {
        try {
          const res = await checkHoliday(targetDate, task);
          results.push(
            `[${task}] date=${formatDate(targetDate)} isHoliday=${res.isHoliday} isCompensation=${res.isCompensationDay}${
              res.holidayName ? ` holiday=${res.holidayName}` : ''
            }`
          );
        } catch (err) {
          results.push(`[${task}] 失败: ${(err as Error).message}`);
        }
      }

      return results.join('\n');
    });

  root
    .subcommand('.cron', '手动触发一次定时禁言心跳循环')
    .action(async () => {
      try {
        const start = Date.now();
        await muteCore.run();
        const duration = Date.now() - start;
        return `已执行一次心跳循环，耗时 ${duration}ms`;
      } catch (err) {
        ctx.logger('gipas-mute').error('[测试命令] 心跳循环触发失败:', err);
        return `心跳循环执行失败：${(err as Error).message}`;
      }
    });

  root
    .subcommand('.explain <guildId:string>', '解释当前为何是禁言/解禁')
    .action(async (_, guildId) => {
      if (!guildId) return '请提供群号，例如：gipas.mute explain 123456';
      const result = await muteCore.previewGroupNow(guildId);
      if (!result.success || !result.expectedState) return `失败：${result.message}`;
      const s = result.expectedState;
      return `组=${s.muteGroupName} 状态=${s.isMuted ? '禁言' : '解禁'} 触发=${s.triggerTime} 前日回溯=${s.isFromPreviousDay ? '是' : '否'}`;
    });
}
