/**
 * 核心业务逻辑 - 状态维持和心跳循环
 */

import { Context, Logger } from 'koishi';
import {
  MuteGroup,
  WeekGroup,
  GroupConfig,
  GlobalConfig,
  ExpectedState,
  HolidayCheckResult,
} from '../types';
import {
  checkHoliday,
  getExpectedState,
  getDayOfWeek,
  formatDate,
} from '../Utils/utils';
import {
  setGroupMute,
  sendGroupMessage,
} from '../Utils/MuteCore';
import {
  getMuteState,
  updateMuteState,
} from '../database';

const logger = new Logger('gipas-mute');

/**
 * 核心业务逻辑服务
 */
export class MuteCore {
  private config: GlobalConfig;
  private ctx: Context;

  // 缓存，减少重复查询
  private muteGroupMap: Map<string, MuteGroup> = new Map();
  private weekGroupMap: Map<string, WeekGroup> = new Map();
  private groupConfigMap: Map<string, GroupConfig> = new Map();

  constructor(ctx: Context, config: GlobalConfig) {
    this.ctx = ctx;
    this.config = config;
    this.buildMaps();
  }

  /**
   * 重新加载配置（在配置更新时调用）
   */
  public updateConfig(config: GlobalConfig): void {
    this.config = config;
    this.buildMaps();
  }

  /**
   * 构建查询 Map，加快查询速度
   */
  private buildMaps(): void {
    this.muteGroupMap.clear();
    this.weekGroupMap.clear();
    this.groupConfigMap.clear();

    for (const mg of this.config.muteGroups) {
      this.muteGroupMap.set(mg.name, mg);
    }

    for (const wg of this.config.weekGroups) {
      this.weekGroupMap.set(wg.name, wg);
    }

    for (const gc of this.config.groupConfigs) {
      this.groupConfigMap.set(gc.guildId, gc);
    }
  }

  /**
   * 获取指定名称的禁言组
   */
  private getMuteGroup(name: string): MuteGroup | null {
    return this.muteGroupMap.get(name) ?? null;
  }

  /**
   * 获取指定名称的星期组
   */
  private getWeekGroup(name: string): WeekGroup | null {
    return this.weekGroupMap.get(name) ?? null;
  }

  /**
   * 获取指定群号的配置
   */
  private getGroupConfig(guildId: string): GroupConfig | null {
    return this.groupConfigMap.get(guildId) ?? null;
  }

  /**
   * 根据日期和调休情况，确定应用的禁言组
   */
  private getApplicableMuteGroupName(
    date: Date,
    groupConfig: GroupConfig,
    holidayResult: HolidayCheckResult
  ): string {
    // 如果启用了调休判断
    if (groupConfig.enableHoliday) {
      // 优先检查是否是调休工作日
      if (holidayResult.isCompensationDay) {
        logger.debug(
          `[${groupConfig.guildId}] 检测到调休工作日 (${holidayResult.holidayName}), 使用调休禁言组`
        );
        return groupConfig.compensationMuteGroup;
      }

      // 其次检查是否是节假日
      if (holidayResult.isHoliday) {
        logger.debug(
          `[${groupConfig.guildId}] 检测到节假日 (${holidayResult.holidayName}), 使用节假日禁言组`
        );
        return groupConfig.holidayMuteGroup;
      }
    }

    // 普通工作日/休息日，根据星期获取禁言组
    const weekGroup = this.getWeekGroup(groupConfig.defaultWeekGroup);
    if (!weekGroup) {
      logger.warn(`WeekGroup not found: ${groupConfig.defaultWeekGroup}`);
      return 'default'; // 降级到默认禁言组
    }

    const dayOfWeek = getDayOfWeek(date);
    const muteGroupName = weekGroup.weekdays[dayOfWeek];

    return muteGroupName || 'default';
  }

  /**
   * 计算单个群的期望状态
   */
  private computeExpectedState(
    now: Date,
    groupConfig: GroupConfig,
    holidayResult: HolidayCheckResult
  ): ExpectedState | null {
    try {
      // 确定应用的禁言组名称
      const muteGroupName = this.getApplicableMuteGroupName(
        now,
        groupConfig,
        holidayResult
      );

      const muteGroup = this.getMuteGroup(muteGroupName);
      if (!muteGroup) {
        logger.warn(`MuteGroup not found: ${muteGroupName}`);
        return null;
      }

      // 计算期望状态
      const expectedState = getExpectedState(now, muteGroup);
      return expectedState;
    } catch (e) {
      logger.error(
        `[${groupConfig.guildId}] Error computing expected state:`,
        e
      );
      return null;
    }
  }

  /**
   * 执行单个群的状态对齐
   */
  private async reconcileMuteState(
    guildId: string,
    groupConfig: GroupConfig,
    expectedState: ExpectedState
  ): Promise<void> {
    try {
      // 获取数据库中的当前状态
      const dbState = await getMuteState(this.ctx, guildId);
      const currentIsMuted = dbState?.isMuted ?? null;

      // 检查是否需要更新
      if (currentIsMuted === expectedState.isMuted) {
        logger.debug(
          `[${guildId}] 状态已对齐，无需更新 (isMuted: ${expectedState.isMuted})`
        );
        return;
      }

      // 调用 OneBot API 执行禁言/解禁
      await this.executeGroupMute(guildId, expectedState.isMuted);

      // 更新数据库
      await updateMuteState(
        this.ctx,
        guildId,
        expectedState.isMuted,
        expectedState.muteGroupName
      );

      logger.info(
        `[${guildId}] 禁言状态已更新: ${expectedState.isMuted ? '禁言' : '解禁'} (规则: ${expectedState.muteGroupName})`
      );

      // 发送通知消息
      if (groupConfig.guildId) {
        const muteGroup = this.getMuteGroup(expectedState.muteGroupName);
        if (muteGroup?.sendNotification) {
          await this.sendNotification(guildId, muteGroup.message || '群已禁言');
        }
      }
    } catch (e) {
      logger.error(`[${guildId}] Error reconciling mute state:`, e);
    }
  }

  /**
   * 调用 OneBot API 执行禁言/解禁
   */
  private async executeGroupMute(
    guildId: string,
    isMuted: boolean
  ): Promise<void> {
    await setGroupMute(this.ctx, guildId, isMuted);
  }

  /**
   * 发送通知消息到群
   */
  private async sendNotification(
    guildId: string,
    message: string
  ): Promise<void> {
    await sendGroupMessage(this.ctx, guildId, message);
  }

  /**
   * 主循环：处理所有群的状态对齐
   * 每分钟调用一次
   */
  public async run(): Promise<void> {
    const now = new Date();
    logger.debug(`[心跳循环] 开始于 ${now.toISOString()}`);

    // 遍历所有配置的群
    for (const groupConfig of this.config.groupConfigs) {
      try {
        // 检查节假日状态
        const holidayResult = await checkHoliday(
          now,
          this.config.holidayMethod
        );

        // 计算期望状态
        const expectedState = this.computeExpectedState(
          now,
          groupConfig,
          holidayResult
        );

        if (!expectedState) {
          logger.warn(
            `[${groupConfig.guildId}] 无法计算期望状态，跳过`
          );
          continue;
        }

        // 执行状态对齐
        await this.reconcileMuteState(
          groupConfig.guildId,
          groupConfig,
          expectedState
        );
      } catch (e) {
        logger.error(
          `[${groupConfig.guildId}] Error in heartbeat loop:`,
          e
        );
      }
    }

    logger.debug(
      `[心跳循环] 完成于 ${new Date().toISOString()}`
    );
  }

  /**
   * 手动触发单个群的状态检查（用于测试或管理员命令）
   */
  public async checkGroupNow(guildId: string): Promise<{
    success: boolean;
    message: string;
    expectedState?: ExpectedState;
  }> {
    try {
      const groupConfig = this.getGroupConfig(guildId);
      if (!groupConfig) {
        return {
          success: false,
          message: `群 ${guildId} 未配置`,
        };
      }

      const now = new Date();
      const holidayResult = await checkHoliday(
        now,
        this.config.holidayMethod
      );

      const expectedState = this.computeExpectedState(
        now,
        groupConfig,
        holidayResult
      );

      if (!expectedState) {
        return {
          success: false,
          message: `无法计算期望状态`,
        };
      }

      // 执行对齐
      await this.reconcileMuteState(guildId, groupConfig, expectedState);

      return {
        success: true,
        message: `状态检查完成: ${expectedState.isMuted ? '禁言' : '解禁'}`,
        expectedState,
      };
    } catch (e) {
      logger.error(`[${guildId}] Error checking group:`, e);
      return {
        success: false,
        message: `错误: ${String(e)}`,
      };
    }
  }
}
