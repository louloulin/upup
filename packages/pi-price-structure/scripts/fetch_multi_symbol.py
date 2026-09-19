#!/usr/bin/env python3
"""拉取多个主力连续合约 6 年日线数据，保存为统一格式 CSV."""
import os
import time
from typing import Any

import akshare as ak
import pandas as pd

SYMBOLS = [
    ("AU0", "沪金"),
    ("CU0", "沪铜"),
    ("RB0", "螺纹"),
    ("M0",  "豆粕"),
    ("SR0", "白糖"),
    ("Y0",  "豆油"),
    ("CF0", "棉花"),
    ("I0",  "铁矿"),
    ("AG0", "沪银"),
    ("P0",  "棕榈"),
]

# 输出目录：始终相对包根目录解析，避免 cwd 问题
_PKG_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(_PKG_DIR, "data", "multi-symbol")
START = "2020-01-01"
END = "2026-09-30"


def fetch_one(symbol: str, name: str) -> bool:
    """拉单个主力连续合约，返回是否成功"""
    out_path = f"{OUTPUT_DIR}/{symbol}_daily.csv"
    try:
        df_any: Any = ak.futures_main_sina(symbol=symbol)
        # runtime duck-type guard：确保拿到的是 DataFrame
        if not isinstance(df_any, pd.DataFrame):
            print(f"✗ {symbol} ({name}): 接口返回 {type(df_any).__name__} 而非 DataFrame")
            return False

        df = df_any.rename(columns={
            "日期": "date",
            "开盘价": "open",
            "最高价": "high",
            "最低价": "low",
            "收盘价": "close",
        })
        df["date"] = df["date"].astype(str)
        mask = (df["date"] >= START) & (df["date"] <= END)
        sub_raw = df[mask][["date", "open", "high", "low", "close"]]
        # 显式构造 DataFrame，让 LSP 看到正确类型
        sub = pd.DataFrame(sub_raw).reset_index(drop=True)
        sub.to_csv(out_path, index=False, encoding="utf-8-sig")
        first_date = str(sub["date"].iloc[0])
        last_date = str(sub["date"].iloc[-1])
        print(f"✓ {symbol} ({name}): {len(sub)} 条, {first_date} ~ {last_date}")
        return True
    except Exception as e:
        print(f"✗ {symbol} ({name}): 失败 {e}")
        return False


def main() -> None:
    try:
        os.makedirs(OUTPUT_DIR, exist_ok=True)
    except OSError as exc:
        import sys
        print(f"创建目录失败: {exc}", file=sys.stderr)
        return

    print(f"开始拉取 {len(SYMBOLS)} 个主力连续合约...")
    print(f"区间: {START} ~ {END}\n")
    print(f"输出: {OUTPUT_DIR}\n")

    success = 0
    for symbol, name in SYMBOLS:
        if fetch_one(symbol, name):
            success += 1
        time.sleep(0.5)

    print(f"\n完成: {success}/{len(SYMBOLS)}")


if __name__ == "__main__":
    main()
