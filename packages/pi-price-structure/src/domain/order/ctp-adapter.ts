/**
 * CTP（综合交易平台）适配器
 *
 * 用法：
 *   1. 申请期货公司 CTP 仿真/生产账号（broker_id, user_id, password, auth_code, app_id）
 *   2. 设置环境变量：
 *      export CTP_BROKER_ID=<your broker id>
 *      export CTP_USER_ID=<your user id>
 *      export CTP_PASSWORD=<your password>     # 由券商提供，不要硬编码
 *      export CTP_AUTH_CODE=<your auth code>
 *      export CTP_APP_ID=<your app id>
 *      export CTP_MD_FRONT=tcp://<md front host>  # 行情前置
 *      export CTP_TD_FRONT=tcp://<td front host>  # 交易前置
 *      export CTP_ENV=sim                       # sim=仿真 / live=生产
 *   3. import 这个适配器调用 placeOrder / queryPositions
 *
 * 注意：本适配器**只发送订单请求**，实际成交依赖 CTP 柜台。
 *        生产环境需走 CTP 官方 SDK（ctp 或者 openctp）。
 *
 * 安全：所有凭证通过环境变量提供，**绝不**硬编码到源码中。
 */
export interface CtpConfig {
  brokerId: string;
  userId: string;
  password: string;
  authCode: string;
  appId: string;
  mdFront: string;   // 行情前置
  tdFront: string;   // 交易前置
  env: "sim" | "live";
}

export function loadCtpConfig(): CtpConfig | null {
  const env = process.env;
  const cfg: CtpConfig = {
    brokerId: env.CTP_BROKER_ID ?? "",
    userId: env.CTP_USER_ID ?? "",
    password: env.CTP_PASSWORD ?? "",
    authCode: env.CTP_AUTH_CODE ?? "",
    appId: env.CTP_APP_ID ?? "",
    mdFront: env.CTP_MD_FRONT ?? "",
    tdFront: env.CTP_TD_FRONT ?? "",
    env: (env.CTP_ENV as "sim" | "live") ?? "sim",
  };
  if (!cfg.brokerId || !cfg.userId || !cfg.password) {
    return null;
  }
  return cfg;
}

export interface OrderRequest {
  symbol: string;        // 合约代码，如 "I2501"
  direction: "long" | "short";  // 多/空
  /** 开/平：OPEN / CLOSE / CLOSE_TODAY */
  offset: "OPEN" | "CLOSE" | "CLOSE_TODAY";
  /** 数量（手） */
  quantity: number;
  /** 价格（限价单；市价单传 -1） */
  price: number;
  /** 限价单/市价单/止损单 */
  type: "LIMIT" | "MARKET" | "STOP";
}

export interface OrderResponse {
  orderId: string;
  accepted: boolean;
  message: string;
  timestamp: string;
}

/**
 * 发送订单（Mock — 真实环境需接入 CTP SDK）
 *
 * 当前为 Mock 实现，返回模拟订单 ID。
 * 真实接入需要：
 *   1. 安装 ctp 包：pip install ctp 或者用 openctp
 *   2. 调用 CTP TraderApi.SubscribePrivateTopic / ReqOrderInsert
 *   3. 处理 OnRtnOrder / OnRtnTrade 回调
 */
export async function placeOrder(
  config: CtpConfig,
  request: OrderRequest,
): Promise<OrderResponse> {
  // SAFETY: 这里是 Mock，真实接入需要 CTP SDK
  if (config.env === "live") {
    console.warn(`[CTP] ⚠️ LIVE 环境：即将真实下单 ${request.symbol} ${request.direction} ${request.quantity}手 @${request.price}`);
    // 生产前必须人工确认！
    const confirmed = await confirmLiveOrder(request);
    if (!confirmed) {
      return {
        orderId: "",
        accepted: false,
        message: "人工未确认，取消下单",
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Mock：返回模拟订单 ID
  const orderId = `MOCK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  console.log(`[CTP-MOCK] 下单 ${request.symbol} ${request.direction} ${request.offset} ${request.quantity}手 @${request.price} → ${orderId}`);

  return {
    orderId,
    accepted: true,
    message: "Mock 订单已接收（真实接入需 CTP SDK）",
    timestamp: new Date().toISOString(),
  };
}

async function confirmLiveOrder(req: OrderRequest): Promise<boolean> {
  // 真实生产环境应该弹一个用户确认框（Pi agent ask_confirm）
  // 这里默认 false（保护）
  console.warn(`[CTP] 生产环境需要用户确认: ${JSON.stringify(req)}`);
  return false;
}

/**
 * 查询持仓（Mock）
 */
export async function queryPositions(_config: CtpConfig): Promise<Array<{
  symbol: string;
  direction: "long" | "short";
  quantity: number;
  avgPrice: number;
}>> {
  console.log(`[CTP-MOCK] 查询持仓`);
  return [];
}

/**
 * 撤单（Mock）
 */
export async function cancelOrder(
  _config: CtpConfig,
  orderId: string,
): Promise<{ success: boolean }> {
  console.log(`[CTP-MOCK] 撤单 ${orderId}`);
  return { success: true };
}

/**
 * Paper → Live 切换示例：
 *
 * ```typescript
 * import { placeOrder, loadCtpConfig } from "@upup/pi-price-structure/ctp-adapter";
 *
 * const cfg = loadCtpConfig();
 * if (!cfg) {
 *   console.log("未配置 CTP，进入 paper trading");
 * } else {
 *   const result = await placeOrder(cfg, {
 *     symbol: "I2501",
 *     direction: "long",
 *     offset: "OPEN",
 *     quantity: 1,
 *     price: 950,
 *     type: "LIMIT",
 *   });
 *   console.log(result);
 * }
 * ```
 */