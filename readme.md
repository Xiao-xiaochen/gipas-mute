# koishi-plugin-gipas-mute

[![npm](https://img.shields.io/npm/v/koishi-plugin-gipas-mute?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-gipas-mute)

基于 Koishi 框架的 QQ 群定时禁言管理插件，采用**三层配置架构** + **状态维持机制**，即使机器人重启也能自动纠正禁言状态。

## 功能特性

✅ **三层配置架构**：禁言时间表 → 星期调度 → 群组绑定  
✅ **状态维持机制**：心跳检测 + 状态回溯，防止漏禁言  
✅ **中国法定节假日支持**：自动识别调休工作日  
✅ **API 优化**：状态一致则不发送重复 API 调用  
✅ **离线 + 在线两种节假日方案**

## 架构设计

### 三层配置

#### Layer 1: MuteGroup (禁言组)
定义禁言的时间点和状态：
```json
{
  "name": "workday",
  "sendNotification": true,
  "message": "工作时间禁言已启用",
  "rules": [
    { "time": "09:00", "isMuted": true },
    { "time": "12:00", "isMuted": false },
    { "time": "14:00", "isMuted": true },
    { "time": "18:00", "isMuted": false }
  ]
}
```

#### Layer 2: WeekGroup (周调度组)
定义每周日程和对应的 MuteGroup：
```json
{
  "name": "standard",
  "weekdays": {
    "monday": "workday",
    "tuesday": "workday",
    "wednesday": "workday",
    "thursday": "workday",
    "friday": "workday",
    "saturday": "weekend",
    "sunday": "weekend"
  }
}
```

#### Layer 3: GroupConfig (群组配置)
绑定具体的 QQ 群：
```json
{
  "guildId": "123456789",
  "enableHoliday": true,
  "compensationMuteGroup": "workday",
  "defaultWeekGroup": "standard"
}
```

### 核心算法：状态维持

1. **全局心跳**：每分钟触发一次检查循环
2. **期望状态计算**：
   - 检查是否为调休工作日（若启用）
   - 根据周日程获取今日 MuteGroup
   - 在规则列表中查找 ≤ 当前时间 的最后一个时间点
   - **关键**：如果今天无匹配规则，回溯到前一天
3. **状态对齐**：
   - 比较数据库中的实际状态与期望状态
   - 若不一致，调用 OneBot API 更新禁言状态
   - 更新数据库记录

**示例**：
- 当前时间：凌晨 02:00
- 最早规则：今天 09:00 禁言
- 回溯到昨天，获取昨天最后规则的状态（如 18:00 解禁）
- 即使机器人刚启动，也能推算出正确的状态

## 数据库模型

插件自动创建 `mute_states` 表：
```typescript
interface MuteState {
  id: string          // QQ 群号
  isMuted: boolean    // 当前禁言状态
  lastUpdated: number // 上次更新时间戳
}
```

## 使用示例

### 基础配置
```yaml
gipas-mute:
  holidayMethod: offline  # 或 'online'
  
  muteGroups:
    - name: workday
      sendNotification: true
      message: "禁言状态已更新"
      rules:
        - time: "09:00"
          isMuted: true
        - time: "18:00"
          isMuted: false
  
  weekGroups:
    - name: standard
      weekdays:
        monday: workday
        tuesday: workday
        wednesday: workday
        thursday: workday
        friday: workday
        saturday: ''      # 周末不禁言
        sunday: ''
  
  groupConfigs:
    - guildId: "123456789"
      enableHoliday: true
      compensationMuteGroup: workday
      defaultWeekGroup: standard
```

### 高级场景

**多群差异化配置**：
```yaml
muteGroups:
  - name: strict
    rules:
      - time: "08:00"
        isMuted: true
      - time: "20:00"
        isMuted: false
  
  - name: relaxed
    rules:
      - time: "10:00"
        isMuted: true
      - time: "17:00"
        isMuted: false

groupConfigs:
  - guildId: "111111111"
    defaultWeekGroup: standard  # 普通群
  
  - guildId: "222222222"
    enableHoliday: false         # 不启用节假日
    compensationMuteGroup: relaxed
    defaultWeekGroup: relaxed
```

## 依赖

### 必需
- `koishi >= 4.18.7`

### 可选
- `chinese-days` (离线节假日计算)
  - 安装: `npm install chinese-days`
  - 提供准确的中国法定节假日和调休数据
  - 不安装时自动降级到在线模式或简单周日期判断

## 工作流程

```
┌─────────────────────────────────────────┐
│      Global Heartbeat (每分钟)          │
└──────────────┬──────────────────────────┘
               │
               ├─→ 遍历所有 GroupConfig
               │
               └─→ 对于每个群:
                   ├─→ 确定今日 MuteGroup
                   │   ├─ 检查节假日
                   │   ├─ 查询 WeekGroup
                   │   └─ 获取对应 MuteGroup
                   │
                   ├─→ 计算期望状态
                   │   ├─ 获取当前时间
                   │   ├─ 查找 ≤ Now 的最后规则
                   │   └─ [关键] 如无，回溯前一天
                   │
                   ├─→ 读取数据库状态
                   │
                   └─→ 状态对齐
                       ├─ 比较 DB vs Expected
                       ├─ 若不同：调用 OneBot API
                       └─ 更新 DB & 发送通知
```

## 日志示例

```
[gipas-mute] Plugin loaded, initializing services...
[gipas-mute] Database initialized
[gipas-mute] Holiday service initialized (method: offline)
[gipas-mute] Global heartbeat started
[gipas-mute] [Heartbeat] Executing at 2025-11-23T14:30:00.000Z
[gipas-mute:state] Guild 123456789: Using compensation MuteGroup 'workday' (补班日)
[gipas-mute:state] Guild 123456789: State already consistent (muted)
```

## 故障排查

### 问题：禁言状态未生效
**可能原因**：
- 群号配置错误
- WeekGroup/MuteGroup 名称不匹配
- Bot 无法访问 OneBot API

**排查**：
1. 检查日志中的警告信息
2. 验证配置中 guildId、defaultWeekGroup、compensationMuteGroup 是否存在
3. 确保 Bot 具有群管理权限

### 问题：节假日识别不准确
**解决**：
- 安装 `chinese-days` 包：`npm install chinese-days`
- 切换到 `holidayMethod: offline` 模式

## 开发者指南

### 核心类

- **StateManager**: 状态计算和对齐核心
  - `getExpectedState()`: 计算期望状态（含回溯逻辑）
  - `decideTodayMuteGroup()`: 确定今日 MuteGroup
  - `reconcileState()`: 执行状态变更

- **HolidayService**: 节假日判断
  - `isWorkday()`: 检查是否工作日
  - `isCompensationWorkday()`: 检查是否调休工作日

### 扩展点

可在心跳循环中添加自定义逻辑，例如：
```typescript
// 在 executeHeartbeat 中添加
const onExecute = async (guildId, isMuted, message) => {
  // 自定义处理逻辑
  logger.info(`Custom action: Guild ${guildId} -> ${isMuted}`)
}
```

## 许可证

MIT
