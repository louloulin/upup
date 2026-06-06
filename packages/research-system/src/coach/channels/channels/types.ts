/**
 * 投研 Coach 推送渠道接口 (Sprint 1.3 of top-tier-investment-claude-code).
 *
 * 设计(来自 v3 design.md § 3.3 coach-channels + spec coach-mode REQ-5):
 *   - 5 个内置渠道: cli / wechat (Server酱) / feishu (Lark) / dingtalk / email
 *   - 软失败: send() 不抛错,返回 { ok, error, channelMessageId }
 *   - 渠道配置: 走 env var(每个渠道独立),不配置则 no-op
 *   - 健康检查: healthCheck() 验证可达性(可选实现)
 *   - 编译开关: feature('COACH_MODE') 启用整组,feature('KAIROS_CHANNELS') 启用推送
 */
import { isFeatureCompiledIn } from '../../agent/feature-gates.js';

// ---------------------------------------------------------------------------
// 推送 payload
// ---------------------------------------------------------------------------

/** 推送渠道 payload。Markdown 格式,各渠道自行渲染。 */
export interface PushPayload {
  /** 推送标题(短) */
  title: string;
  /** Markdown 主体 */
  body: string;
  /** 可选:深链 URL(网页 / 移动端) */
  url?: string;
  /** 标签/分类(用于多渠道路由) */
  tags?: string[];
  /** 优先级(0=低,1=中,2=高) */
  priority?: 0 | 1 | 2;
}

/** 单次推送结果。 */
export interface PushResult {
  ok: boolean;
  /** 渠道返回的消息 ID(可用于撤回 / 查询) */
  channelMessageId?: string;
  /** 错误信息(失败时) */
  error?: string;
  /** 耗时 ms */
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// 渠道接口
// ---------------------------------------------------------------------------

export interface PushChannel {
  /** 渠道 ID(用于 env / registry) */
  readonly name: string;
  /** 是否在运行期启用(环境变量 + 编译开关都满足) */
  isEnabled(): boolean;
  /** 发送一次推送。不抛错,失败返回 { ok: false, error } */
  send(payload: PushPayload): Promise<PushResult>;
  /** 可选: 健康检查(用于 KAIROS 自检) */
  healthCheck?(): Promise<{ ok: boolean; detail?: string }>;
}

// ---------------------------------------------------------------------------
// 编译开关
// ---------------------------------------------------------------------------

/** 整个 coach 推送系统是否编译期启用(DCE) */
export function isChannelsCompiledIn(): boolean {
  return isFeatureCompiledIn('COACH_MODE') && isFeatureCompiledIn('KAIROS_CHANNELS');
}

// ---------------------------------------------------------------------------
// 公共 env 解析 helpers
// ---------------------------------------------------------------------------

/** 读取 trim 后非空 env,否则返回 undefined */
export function readEnv(name: string): string | undefined {
  const v = process.env[name];
  if (v === undefined || v === null) return undefined;
  const t = String(v).trim();
  return t.length > 0 ? t : undefined;
}

/** boolean env: 1/true/yes/on -> true; 0/false/no/off -> false; 其他 -> default */
export function readEnvBool(name: string, defaultValue: boolean): boolean {
  const v = readEnv(name);
  if (v === undefined) return defaultValue;
  const s = v.toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
  if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  return defaultValue;
}
