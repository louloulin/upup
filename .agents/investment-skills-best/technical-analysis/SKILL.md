---
name: technical-analysis
description: |
  技术分析专家技能。专注于价格形态、技术指标、趋势判断、买卖信号。
  当用户询问技术分析、MACD、RSI、布林带、均线、金叉死叉、趋势、买卖点时必须使用。
---

# Technical Analysis - 技术分析专家

## 技术分析框架

```
┌─────────────────────────────────────────────────────────────────┐
│                     技术分析体系                                 │
├─────────────────┬─────────────────┬─────────────────┬──────────┤
│  趋势分析       │  动量指标       │  波动指标       │  信号   │
│  均线/趋势线   │  MACD/RSI       │  布林带/ATR     │  形态   │
│  道氏理论      │  随机指标       │  肯特纳通道     │  综合   │
└─────────────────┴─────────────────┴─────────────────┴──────────┘
```

## 趋势分析

### 移动平均线

```python
def moving_averages(prices: list[float], periods: list[int] = [20, 50, 200]) -> dict:
    """计算移动平均线
    
    返回:
    {
        'sma_20': float,
        'sma_50': float,
        'sma_200': float,
        'ema_12': float,
        'ema_26': float,
        'alignment': "bullish|neutral|bearish",
        'golden_cross': bool,     # SMA50上穿SMA200
        'death_cross': bool        # SMA50下穿SMA200
    }
    """
```

### 趋势线

```python
def trend_analysis(prices: list[float], volumes: list[int] = None) -> dict:
    """趋势分析
    
    返回:
    {
        'trend': "uptrend|downtrend|sideways",
        'trend_strength': float,   # 0-100
        'support_levels': [float],
        'resistance_levels': [float],
        'breakout_signals': {
            'bullish_breakout': bool,
            'bearish_breakout': bool,
            'breakout_volume_confirm': bool
        }
    }
    """
```

### 道氏理论

```python
def dow_theory_analysis(prices: list[float]) -> dict:
    """道氏理论分析
    
    验证:
    1. Primary trend(主要趋势) - 长期方向
    2. Secondary reaction(次级反应) - 中期回调
    3. Minor movement(短期波动) - 日常波动
    
    返回:
    {
        'primary_trend': "bullish|bearish",
        'secondary_trend': "advance|decline",
        'confirmation': {
            'industrial': bool,
            'transportation': bool
        },
        'volume_confirmation': bool
    }
    """
```

## 动量指标

### MACD

```python
def analyze_macd(prices: list[float], fast: int = 12, slow: int = 26, 
                signal: int = 9) -> dict:
    """MACD分析
    
    MACD = EMA12 - EMA26
    Signal = EMA9(MACD)
    Histogram = MACD - Signal
    
    返回:
    {
        'macd_line': float,
        'signal_line': float,
        'histogram': float,
        'histogram_slope': "positive|negative|flat",
        'signal': "bullish|cross|bearish",  # 金叉/交叉/死叉
        'divergence': {
            'type': "bullish|bearish|none",
            'severity': "strong|moderate|weak",
            'price_action': "lower_highs|higher_lows"
        }
    }
    """
    
def detect_macd_divergence(prices: list[float], lookback: int = 60) -> dict:
    """MACD背离检测
    
    看涨背离: 价格创新低,但MACD没有创新低
    看跌背离: 价格创新高,但MACD没有创新高
    """
```

### RSI

```python
def analyze_rsi(prices: list[float], period: int = 14) -> dict:
    """RSI分析
    
    RSI = 100 - (100 / (1 + RS))
    RS = 平均涨幅 / 平均跌幅
    
    返回:
    {
        'rsi': float,              # 0-100
        'status': "overbought|neutral|oversold",
        'overbought_threshold': 70,
        'oversold_threshold': 30,
        'divergence': "bullish|bearish|none",
        'momentum': "strong|moderate|weak"
    }
    """
```

### 随机指标(KD)

```python
def analyze_stochastic(prices: list[float], k_period: int = 14, 
                      d_period: int = 3) -> dict:
    """随机指标分析
    
    %K = (Close - Lowest Low) / (Highest High - Lowest Low) * 100
    %D = SMA(%K, d_period)
    
    返回:
    {
        'k': float,
        'd': float,
        'signal': "overbought|cross|oversold",
        'k_d_cross': "golden_cross|death_cross|none"
    }
    """
```

## 波动指标

### 布林带

```python
def analyze_bollinger(prices: list[float], period: int = 20, 
                     std_dev: float = 2.0) -> dict:
    """布林带分析
    
    中轨 = SMA(收盘价, 20)
    上轨 = 中轨 + 2 * 标准差
    下轨 = 中轨 - 2 * 标准差
    
    返回:
    {
        'upper': float,
        'middle': float,
        'lower': float,
        'bandwidth': float,        # (上轨 - 下轨) / 中轨
        'position': float,         # 价格在布林带中的位置(0-1)
        'status': "near_upper|near_middle|near_lower|outside",
        'squeeze': bool,          # 布林带收窄(突破前兆)
        'breakout_direction': "up|down|none"
    }
    """
```

### ATR

```python
def calculate_atr(highs: list[float], lows: list[float], 
                  closes: list[float], period: int = 14) -> dict:
    """计算ATR(平均真实波幅)
    
    TR = max(High-Low, |High-Close_prev|, |Low-Close_prev|)
    ATR = SMA(TR, 14)
    
    返回:
    {
        'atr': float,
        'atr_percent': float,      # ATR/价格, 相对波动率
        'rank': "high|medium|low"  # 与历史ATR比较
    }
    """
```

### 肯特纳通道

```python
def keltner_channels(prices: list[float], period: int = 20, 
                     multiplier: float = 2.0) -> dict:
    """肯特纳通道
    
    中轨 = EMA(收盘价, period)
    上轨 = 中轨 + multiplier * ATR
    下轨 = 中轨 - multiplier * ATR
    
    用于判断突破和假突破
    """
```

## 形态分析

### K线形态

```python
def candlestick_patterns(candles: list[dict]) -> dict:
    """K线形态识别
    
    candle: {open, high, low, close, volume}
    
    单根形态:
    - Doji(十字星): 开盘=收盘
    - Hammer(锤子线): 下影线很长
    - Inverted Hammer(倒锤线): 上影线很长
    - Marubozu(光头光脚): 无影线
    
    双根形态:
    - Engulfing(吞没): 后K线实体覆盖前K线
    - Harami(孕育): 后K线被前K线包含
    
    三根形态:
    - Morning Star(早晨之星): 下跌反转
    - Evening Star(黄昏之星): 上涨反转
    - Three White Soldiers(三白兵): 连续上涨
    
    返回:
    {
        'patterns': [{
            name: string,
            type: "bullish|bearish|neutral",
            confidence: "high|medium|low",
            position: int  # 在序列中的位置
        }]
    }
    """
```

### 形态识别

```python
def chart_patterns(prices: list[float], lookback: int = 100) -> dict:
    """识别常见图表形态
    
    反转形态:
    - Head and Shoulders(头肩顶/底)
    - Double Top/Bottom(双顶/双底)
    - Triple Top/Bottom(三顶/三底)
    - Rounding Bottom(圆底)
    
    持续形态:
    - Triangle(三角形): 对称/上升/下降
    - Flag(旗形): 上升/下降
    - Wedge(楔形): 上升/下降
    - Rectangle(矩形)
    
    返回:
    {
        'patterns': [{
            name: string,
            type: "reversal|continuation",
            direction: "bullish|bearish",
            completion: float,      # 完成度 0-100%
            target_price': float,   # 目标价位
            confidence': float
        }]
    }
    """
```

## 综合信号

```python
def comprehensive_technical_analysis(symbol: str, period: str = "3m") -> dict:
    """综合技术分析
    
    返回:
    {
        'trend': {...},            # 趋势分析
        'momentum': {...},          # 动量指标
        'volatility': {...},       # 波动指标
        'signals': {
            'overall': "strong_buy|buy|neutral|sell|strong_sell",
            'score': float,        # -100 to +100
            'buy_signals': [string],
            'sell_signals': [string],
            'conflicting_signals': [string]
        },
        'support_resistance': {
            's1': float, 's2': float, 's3': float,
            'r1': float, 'r2': float, 'r3': float
        },
        'recommendation': {
            'action': "buy|sell|hold",
            'entry': float,
            'stop_loss': float,
            'target': float,
            'risk_reward': float
        }
    }
    """
```

## 技术报告模板

```markdown
# [股票] 技术分析报告

## 1. 综合评分
| 指标 | 数值 | 信号 |
|------|------|------|
| 综合评分 | XX/100 | [买入/中性/卖出] |
| 趋势 | [上升/下降/横盘] | 中性 |
| MACD | [金叉/死叉] | 偏多 |
| RSI | XX | [超买/中性/超卖] |

## 2. 趋势判断
- 短期(20日均线): [上穿/下穿/走平]
- 中期(50日均线): [上穿/下穿/走平]
- 长期(200日均线): [上穿/下穿/走平]
- 趋势强度: XX%

## 3. 关键价位
| 类型 | 价格 | 距离现价 |
|------|------|----------|
| 阻力R3 | ¥XXX | +XX% |
| 阻力R2 | ¥XXX | +XX% |
| 阻力R1 | ¥XXX | +XX% |
| 当前价 | ¥XXX | - |
| 支撑S1 | ¥XXX | -XX% |
| 支撑S2 | ¥XXX | -XX% |
| 支撑S3 | ¥XXX | -XX% |

## 4. 买卖信号
### 看涨信号:
- ✅ [信号1]
- ✅ [信号2]

### 看跌信号:
- ⚠️ [信号1]

## 5. 操作建议
- 买入区间: ¥XXX - ¥XXX
- 止损位: ¥XXX (-XX%)
- 目标位1: ¥XXX (+XX%)
- 目标位2: ¥XXX (+XX%)
- 风险收益比: 1:XX

## 6. 风险提示
[说明技术分析局限性]
```

## 示例分析

### 示例1: MACD金叉买入信号

```
苹果(AAPL) 日线分析:

MACD分析:
- MACD线: 2.35
- Signal线: 1.82
- Histogram: +0.53 (正值且扩大)
- 信号: 金叉形成中

其他指标:
- RSI: 58 (中性偏强)
- 20日均线: 175 (价格上方,支撑)
- 布林带: 中轨173,价格在中轨附近

结论:
- 多个指标共振,买入信号较强
- 建议: ¥175买入, 止损¥170, 目标¥185
```

### 示例2: 布林带挤压突破

```
特斯拉(TSLA) 日线分析:

布林带状态:
- 带宽: 3.2% (近期压缩,历史低位)
- 价格位置: 0.45 (接近中轨)
- 挤压指标: True (布林带收窄)

成交量:
- 挤压期间成交量下降
- 突破时需要放量确认

预判:
- 挤压后通常有大幅波动
- 结合趋势方向判断突破方向
- 当前: 上升趋势中的挤压 → 向上突破概率大
```

## 关键原则

1. **指标共振**: 多指标一致时信号更可靠
2. **结合趋势**: 逆势操作风险大
3. **量价配合**: 突破需要量能确认
4. **灵活周期**: 不同周期互相验证
5. **止损纪律**: 技术信号也会出错
