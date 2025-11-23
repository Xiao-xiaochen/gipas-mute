/**
 * 数据库扩展和模型定义
 */

import { Context } from 'koishi';
import { MuteState } from './types';

/**
 * 扩展 Koishi Database 类型
 */
declare module 'koishi' {
  interface Tables {
    mute_states: MuteState;
  }
}

/**
 * 初始化数据库模型
 * @param ctx Koishi 上下文
 */
export async function initDatabase(ctx: Context): Promise<void> {
  // 定义 mute_states 表
  ctx.model.extend('mute_states', {
    // 主键：群号
    guildId: 'string',
    // 当前禁言状态
    isMuted: 'boolean',
    // 最后更新时间戳
    lastUpdated: 'unsigned',
    // 应用的禁言组名称
    appliedMuteGroup: 'string',
  }, {
    primary: 'guildId',
  });
}

/**
 * 获取群的当前禁言状态
 * @param ctx Koishi 上下文
 * @param guildId 群号
 * @returns 禁言状态，如果不存在则返回 null
 */
export async function getMuteState(
  ctx: Context,
  guildId: string
): Promise<MuteState | null> {
  const states = await ctx.database.get('mute_states', { guildId } as any);
  return states.length > 0 ? states[0] as MuteState : null;
}

/**
 * 更新群的禁言状态
 * @param ctx Koishi 上下文
 * @param guildId 群号
 * @param isMuted 是否禁言
 * @param appliedMuteGroup 应用的禁言组名称
 */
export async function updateMuteState(
  ctx: Context,
  guildId: string,
  isMuted: boolean,
  appliedMuteGroup: string
): Promise<MuteState> {
  const now = Date.now();
  
  // 尝试更新，如果不存在则创建
  const existing = await getMuteState(ctx, guildId);
  
  if (existing) {
    // 更新现有记录
    await ctx.database.set('mute_states', { guildId } as any, {
      isMuted,
      lastUpdated: now,
      appliedMuteGroup,
    });
  } else {
    // 创建新记录
    await ctx.database.create('mute_states', {
      guildId,
      isMuted,
      lastUpdated: now,
      appliedMuteGroup,
    } as any);
  }

  return {
    guildId,
    isMuted,
    lastUpdated: now,
    appliedMuteGroup,
  };
}

/**
 * 获取所有群的禁言状态
 * @param ctx Koishi 上下文
 * @returns 所有状态
 */
export async function getAllMuteStates(
  ctx: Context
): Promise<MuteState[]> {
  return await ctx.database.get('mute_states', {} as any) as MuteState[];
}
