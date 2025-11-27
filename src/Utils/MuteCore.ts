
import { Context, Logger } from 'koishi';

const logger = new Logger('gipas-mute');

/**
 * 设置群禁言状态
 * @param ctx Koishi 上下文
 * @param guildId 群号
 * @param enable 是否启用禁言
 */
export async function setGroupMute(
  ctx: Context,
  guildId: string,
  enable: boolean
): Promise<void> {
  const numericGuildId = Number(guildId);
  if (isNaN(numericGuildId)) {
    logger.warn(`[设置群禁言] 无效的群号: ${guildId}`);
    return;
  }

  const bots = ctx.bots.filter((b) => b.platform === 'onebot');
  if (!bots.length) {
    logger.warn('[设置群禁言] OneBot 未找到');
    return;
  }

  let lastError: any = null;
  for (const bot of bots) {
    try {
      await bot.internal.setGroupWholeBan(numericGuildId, enable);
      logger.debug(
        `[设置群禁言] 群 ${guildId} 使用 bot(${bot.sid || bot.selfId || 'unknown'}) ${enable ? '禁言' : '解禁'}成功`
      );
      return;
    } catch (error) {
      lastError = error;
      logger.debug(
        `[设置群禁言] bot(${(bot as any).sid || bot.selfId || 'unknown'}) 调用失败，尝试下一个。`
      );
    }
  }

  logger.error(`[设置群禁言] 所有 OneBot 尝试均失败，群 ${guildId} 未${enable ? '禁言' : '解禁'}:`, lastError);
  throw lastError ?? new Error('setGroupWholeBan failed');
}

/**
 * 发送群消息
 * @param ctx Koishi 上下文
 * @param guildId 群号
 * @param message 消息内容
 */
export async function sendGroupMessage(
  ctx: Context,
  guildId: string,
  message: string
): Promise<void> {
  const numericGuildId = Number(guildId);
  if (isNaN(numericGuildId)) {
    logger.warn(`[发送群消息] 无效的群号: ${guildId}`);
    return;
  }

  const bots = ctx.bots.filter((b) => b.platform === 'onebot');
  if (!bots.length) {
    logger.warn('[发送群消息] OneBot bot 未找到');
    return;
  }

  let lastError: any = null;
  for (const bot of bots) {
    try {
      await bot.internal.sendGroupMsg(numericGuildId, message);
      logger.debug(`[发送群消息] 群 ${guildId} 使用 bot(${bot.sid || bot.selfId || 'unknown'}) 消息发送成功`);
      return;
    } catch (error) {
      lastError = error;
      logger.debug(`[发送群消息] bot(${(bot as any).sid || bot.selfId || 'unknown'}) 调用失败，尝试下一个。`);
    }
  }

  logger.error(`[发送群消息] 所有 OneBot 尝试均失败，群 ${guildId} 消息未发送:`, lastError);
  throw lastError ?? new Error('sendGroupMsg failed');
}
