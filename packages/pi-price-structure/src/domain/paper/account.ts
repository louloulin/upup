/**
 * 模拟账户（Paper Trading Account）
 *
 * 真实模拟交易所账户：
 *   - 初始资金
 *   - 可用资金（动态变化）
 *   - 持仓（按合约维护）
 *   - 已实现盈亏（平仓累计）
 *   - 未实现盈亏（按最新价浮动）
 *   - 保证金占用
 *
 * 用于回测之外的"逐日模拟"，比单次回测更接近真实交易。
 */
export interface Position {
  symbol: string;              // 合约代码
  direction: "long" | "short";
  quantity: number;            // 当前手数
  avgPrice: number;            // 平均持仓成本
  entryDate: string;           // 首笔建仓日期
  contractMultiplier: number;  // 合约乘数
  marginRate: number;          // 保证金率（13%~15%）
}

export interface Trade {
  symbol: string;
  direction: "long" | "short";
  /** 开/平仓 */
  action: "OPEN" | "CLOSE";
  date: string;
  price: number;
  quantity: number;
  /** 成交金额 = price × mult × qty */
  turnover: number;
  /** 手续费 */
  commission: number;
  /** 平仓时的已实现盈亏 */
  realizedPnl: number;
  /** 累计账户余额（成交后） */
  balanceAfter: number;
  /** 信号来源 */
  source: string;
}

export interface DailySnapshot {
  date: string;
  /** 总资产 = 可用 + 持仓市值 */
  totalEquity: number;
  /** 可用资金 */
  availableCash: number;
  /** 持仓总市值 */
  positionValue: number;
  /** 浮动盈亏 */
  unrealizedPnl: number;
  /** 当日累计盈亏 */
  dailyPnl: number;
  /** 当日交易笔数 */
  tradesToday: number;
}

export interface PaperAccountConfig {
  initialCapital: number;       // 初始资金
  /** 单笔最大风险占总资金比例（默认 2%） */
  maxRiskPerTrade: number;
  /** 保证金率 */
  marginRate: number;
  /** 手续费率（万分之 2.5） */
  commissionBps: number;
  /** 最低手续费 */
  minCommission: number;
}

export class PaperAccount {
  readonly initialCapital: number;
  readonly maxRiskPerTrade: number;
  readonly marginRate: number;
  readonly commissionBps: number;
  readonly minCommission: number;

  /** 可用资金 */
  availableCash: number;
  /** 已实现盈亏累计 */
  realizedPnl: number = 0;
  /** 交易历史 */
  trades: Trade[] = [];
  /** 当前持仓（按 symbol） */
  positions = new Map<string, Position>();
  /** 每日快照（用于画资金曲线） */
  snapshots: DailySnapshot[] = [];

  /** 当前日期（模拟时钟） */
  currentDate: string = "";
  /** 当日盈亏 */
  private todayRealizedPnl: number = 0;
  private todayTrades: number = 0;

  constructor(config: PaperAccountConfig) {
    this.initialCapital = config.initialCapital;
    this.availableCash = config.initialCapital;
    this.maxRiskPerTrade = config.maxRiskPerTrade;
    this.marginRate = config.marginRate;
    this.commissionBps = config.commissionBps;
    this.minCommission = config.minCommission;
  }

  /** 计算最大可开手数（基于风险比例） */
  calcMaxLots(entryPrice: number, stopLoss: number): number {
    const distance = Math.abs(entryPrice - stopLoss);
    if (distance === 0) return 0;
    const maxLossYuan = this.totalEquity() * this.maxRiskPerTrade;
    const lossPerLot = distance * this._lastMultiplier;
    if (lossPerLot === 0) return 0;
    const lots = Math.floor(maxLossYuan / lossPerLot);
    return Math.max(lots, 0);
  }

  /** 临时记录合约乘数（最简单的方式） */
  private _lastMultiplier: number = 1;
  setMultiplier(m: number): void { this._lastMultiplier = m; }

  /** 当前总资产（含浮动盈亏） */
  totalEquity(marketPrices: Record<string, number> = {}): number {
    let upnl = 0;
    for (const [sym, pos] of this.positions) {
      const price = marketPrices[sym] ?? pos.avgPrice;
      const direction = pos.direction === "long" ? 1 : -1;
      upnl += (price - pos.avgPrice) * pos.contractMultiplier * pos.quantity * direction;
    }
    return this.availableCash + this.realizedPnl + upnl;
  }

  /** 持仓总市值（按当前价） */
  positionValue(marketPrices: Record<string, number> = {}): number {
    let v = 0;
    for (const [sym, pos] of this.positions) {
      const price = marketPrices[sym] ?? pos.avgPrice;
      v += price * pos.contractMultiplier * pos.quantity;
    }
    return v;
  }

  /** 浮动盈亏 */
  unrealizedPnl(marketPrices: Record<string, number> = {}): number {
    let upnl = 0;
    for (const [sym, pos] of this.positions) {
      const price = marketPrices[sym] ?? pos.avgPrice;
      const direction = pos.direction === "long" ? 1 : -1;
      upnl += (price - pos.avgPrice) * pos.contractMultiplier * pos.quantity * direction;
    }
    return upnl;
  }

  /** 开仓 */
  openPosition(args: {
    symbol: string;
    direction: "long" | "short";
    price: number;
    quantity: number;
    contractMultiplier: number;
    date: string;
    source: string;
  }): { success: boolean; reason?: string; trade?: Trade } {
    const turnover = args.price * args.contractMultiplier * args.quantity;
    const margin = turnover * this.marginRate;
    const commission = Math.max(turnover * this.commissionBps / 10000, this.minCommission);

    // 检查可用资金（保证金 + 手续费）
    if (margin + commission > this.availableCash) {
      return { success: false, reason: `可用资金不足（需 ${margin.toFixed(0)}，有 ${this.availableCash.toFixed(0)}）` };
    }

    // 检查现有持仓（同方向加仓 vs 反向平仓）
    const existing = this.positions.get(args.symbol);
    let netQty: number;
    if (existing && existing.direction === args.direction) {
      // 加仓
      const totalCost = existing.avgPrice * existing.quantity + args.price * args.quantity;
      netQty = existing.quantity + args.quantity;
      existing.avgPrice = totalCost / netQty;
      existing.quantity = netQty;
    } else if (existing && existing.direction !== args.direction) {
      // 反向：先平仓再开仓
      const closeQty = Math.min(existing.quantity, args.quantity);
      const pnl = (args.price - existing.avgPrice) * existing.contractMultiplier * closeQty *
        (existing.direction === "long" ? 1 : -1);
      this.availableCash += pnl - commission;
      this.realizedPnl += pnl;
      this.todayRealizedPnl += pnl;
      existing.quantity -= closeQty;
      if (existing.quantity === 0) {
        this.positions.delete(args.symbol);
      }
      const remainQty = args.quantity - closeQty;
      if (remainQty > 0) {
        this.positions.set(args.symbol, {
          symbol: args.symbol,
          direction: args.direction,
          quantity: remainQty,
          avgPrice: args.price,
          entryDate: args.date,
          contractMultiplier: args.contractMultiplier,
          marginRate: this.marginRate,
        });
      }
      netQty = remainQty;
    } else {
      // 新建仓
      this.positions.set(args.symbol, {
        symbol: args.symbol,
        direction: args.direction,
        quantity: args.quantity,
        avgPrice: args.price,
        entryDate: args.date,
        contractMultiplier: args.contractMultiplier,
        marginRate: this.marginRate,
      });
      netQty = args.quantity;
    }

    this.availableCash -= margin + commission;

    const trade: Trade = {
      symbol: args.symbol,
      direction: args.direction,
      action: "OPEN",
      date: args.date,
      price: args.price,
      quantity: args.quantity,
      turnover,
      commission,
      realizedPnl: 0,
      balanceAfter: this.totalEquity(),
      source: args.source,
    };
    this.trades.push(trade);
    this.todayTrades += 1;
    return { success: true, trade };
  }

  /** 平仓 */
  closePosition(args: {
    symbol: string;
    price: number;
    quantity?: number; // 默认全部平
    date: string;
    reason: string;
  }): { success: boolean; reason?: string; trade?: Trade } {
    const pos = this.positions.get(args.symbol);
    if (!pos) {
      return { success: false, reason: `无 ${args.symbol} 持仓` };
    }
    const qty = args.quantity ?? pos.quantity;
    if (qty > pos.quantity) {
      return { success: false, reason: `平仓手数 ${qty} > 持仓 ${pos.quantity}` };
    }

    const direction = pos.direction === "long" ? 1 : -1;
    const pnl = (args.price - pos.avgPrice) * pos.contractMultiplier * qty * direction;
    const turnover = args.price * pos.contractMultiplier * qty;
    const margin = turnover * this.marginRate;
    const commission = Math.max(turnover * this.commissionBps / 10000, this.minCommission);

    this.availableCash += margin + pnl - commission;
    this.realizedPnl += pnl;
    this.todayRealizedPnl += pnl;

    pos.quantity -= qty;
    if (pos.quantity === 0) {
      this.positions.delete(args.symbol);
    }

    const trade: Trade = {
      symbol: args.symbol,
      direction: pos.direction,
      action: "CLOSE",
      date: args.date,
      price: args.price,
      quantity: qty,
      turnover,
      commission,
      realizedPnl: pnl,
      balanceAfter: this.totalEquity(),
      source: args.reason,
    };
    this.trades.push(trade);
    this.todayTrades += 1;
    return { success: true, trade };
  }

  /** 每日结算快照 */
  takeSnapshot(date: string, marketPrices: Record<string, number> = {}): DailySnapshot {
    const snap: DailySnapshot = {
      date,
      totalEquity: this.totalEquity(marketPrices),
      availableCash: this.availableCash,
      positionValue: this.positionValue(marketPrices),
      unrealizedPnl: this.unrealizedPnl(marketPrices),
      dailyPnl: this.todayRealizedPnl,
      tradesToday: this.todayTrades,
    };
    this.snapshots.push(snap);
    this.todayRealizedPnl = 0;
    this.todayTrades = 0;
    return snap;
  }

  /** 累计收益率 */
  totalReturn(): number {
    return (this.totalEquity() - this.initialCapital) / this.initialCapital;
  }

  /** 最大回撤（基于快照） */
  maxDrawdown(): { amount: number; pct: number } {
    if (this.snapshots.length === 0) return { amount: 0, pct: 0 };
    let peak = this.initialCapital;
    let maxDD = 0;
    let maxDDPct = 0;
    for (const s of this.snapshots) {
      if (s.totalEquity > peak) peak = s.totalEquity;
      const dd = peak - s.totalEquity;
      const ddPct = peak > 0 ? dd / peak : 0;
      if (dd > maxDD) maxDD = dd;
      if (ddPct > maxDDPct) maxDDPct = ddPct;
    }
    return { amount: maxDD, pct: maxDDPct };
  }
}