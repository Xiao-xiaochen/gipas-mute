import { Context } from 'koishi';
import { MuteCore } from '../MuteCore';
import { setGroupMute } from './MuteCore';
import { getMuteState, updateMuteState } from '../database';
import { checkHoliday, formatDate } from './utils';

type TestMode = 'auto' | 'mute' | 'unmute' | 'state';

/**
 * 注册测试命令，方便在 Koishi 控制台中手动触发禁言流程
 * 指令：gipas.test <guildId> [mode]
 * mode:
 *  - auto (默认)：触发 MuteCore.checkGroupNow
 *  - mute / unmute：直接设置整群禁言/解禁
 *  - state：查看数据库记录
 */
export function registerMuteTestCommand(ctx: Context, muteCore: MuteCore): void {
  ctx
    .command('gipas.test <guildId:string> [mode:string]', '测试禁言逻辑', { authority: 3 })
    .option('message', '-m <text:string>')
    .action(async ({ session, options }, guildId, mode = 'auto') => {
      if (!guildId) {
        return '请提供群号，例如：gipas.test 123456 auto';
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

  ctx
    .command('gipas.holiday <date:string>', '测试节假日检测', { authority: 3 })
    .option('method', '-m <method:string>', { fallback: 'both' })
    .usage('默认同时测试 online/offline，可用 -m online/offline/hybrid 指定单项')
    .action(async (_, date, method = 'both') => {
      if (!date) {
        return '请提供日期，例如：gipas.holiday 2024-05-01';
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
}
