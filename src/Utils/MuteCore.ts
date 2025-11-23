
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
  try {
    // 获取 OneBot bot 实例
    const bot = ctx.bots.find((b) => b.platform === 'onebot');
    if (!bot) {
      logger.warn('[设置群禁言] OneBot 未找到');
      return;
    }

    const numericGuildId = Number(guildId);
    if (isNaN(numericGuildId)) {
      logger.warn(`[设置群禁言] 无效的群号: ${guildId}`);
      return;
    }

    await bot.internal.setGroupWholeBan(numericGuildId, enable);

    logger.debug(
      `[设置群禁言] 群 ${guildId} ${enable ? '禁言' : '解禁'}成功`
    );
  } catch (error) {
    logger.error(`[设置群禁言] 设置群 ${guildId} 禁言失败:`, error);
    throw error;
  }
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
  try {
    const bot = ctx.bots.find((b) => b.platform === 'onebot');
    if (!bot) {
      logger.warn('[发送群消息] OneBot bot 未找到');
      return;
    }

    const numericGuildId = Number(guildId);
    if (isNaN(numericGuildId)) {
      logger.warn(`[发送群消息] 无效的群号: ${guildId}`);
      return;
    }

    // 调用 OneBot API 发送群消息
    await bot.internal.send_group_msg(numericGuildId, message);

    logger.debug(`[发送群消息] 群 ${guildId} 消息发送成功`);
  } catch (error) {
    logger.error(`[发送群消息] 群 ${guildId} 消息发送失败:`, error);
    throw error;
  }
}