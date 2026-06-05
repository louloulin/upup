/**
 * 公开 re-export: 投研 Coach 推送渠道。
 *
 * 设计(来自 v3 design.md § 3.3):
 *   - KAIROS cron 调度 -> ChannelRegistry.broadcast()
 *   - ChannelRegistry 持有多个 PushChannel(cli / wechat / feishu / dingtalk / email)
 *   - 编译开关受 isChannelsCompiledIn() 控制
 */
export type { PushChannel, PushPayload, PushResult } from './types.js';
export { isChannelsCompiledIn, readEnv, readEnvBool } from './types.js';
export { CliChannel } from './cli.js';
export { WechatChannel } from './wechat.js';
export { FeishuChannel } from './feishu.js';
export { DingtalkChannel } from './dingtalk.js';
export { EmailChannel } from './email.js';
export { ChannelRegistry } from './registry.js';
export type { BroadcastReport } from './registry.js';
