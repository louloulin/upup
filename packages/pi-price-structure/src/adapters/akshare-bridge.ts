/**
 * AkShare Python 桥接。
 *
 * 通过 subprocess 调用 Python 脚本，
 * 抓取新浪期货历史日线数据。
 *
 * 数据格式：CSV stdout，由 TypeScript 解析。
 */
import { spawn } from "node:child_process";
import type { Bar } from "../domain/types.js";

export interface FetchInput {
  symbol: string;
  startDate: string;
  endDate: string;
}

export interface FetchResult {
  daily: Bar[];
  weekly: Bar[];
}

const PYTHON_SCRIPT = `
import sys
import json
import akshare as ak

symbol, start, end = sys.argv[1], sys.argv[2], sys.argv[3]

try:
    df = ak.futures_zh_daily_sina(symbol=symbol)
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)

df["date"] = df["date"].astype(str)
mask = (df["date"] >= start) & (df["date"] <= end)
sub = df[mask][["date", "open", "high", "low", "close"]].copy()
sub.columns = ["date", "open", "high", "low", "close"]
daily = sub.to_dict(orient="records")

# 简版周线：按周五切分
weekly = []
if len(daily) > 0:
    bucket = []
    for bar in daily:
        d = __import__("datetime").datetime.strptime(bar["date"], "%Y-%m-%d")
        bucket.append(bar)
        if d.weekday() == 4:
            weekly.append({
                "date": bar["date"],
                "open": bucket[0]["open"],
                "high": max(b["high"] for b in bucket),
                "low": min(b["low"] for b in bucket),
                "close": bucket[-1]["close"],
            })
            bucket = []
    if bucket:
        weekly.append({
            "date": bucket[-1]["date"],
            "open": bucket[0]["open"],
            "high": max(b["high"] for b in bucket),
            "low": min(b["low"] for b in bucket),
            "close": bucket[-1]["close"],
        })

print(json.dumps({"daily": daily, "weekly": weekly}, ensure_ascii=False))
`;

export async function fetchViaAkShare(input: FetchInput): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "python3",
      ["-c", PYTHON_SCRIPT, input.symbol, input.startDate, input.endDate],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`AkShare 调用失败 (code=${code}): ${stderr}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        if (parsed.error) {
          reject(new Error(`AkShare 错误: ${parsed.error}`));
          return;
        }
        resolve({ daily: parsed.daily, weekly: parsed.weekly });
      } catch (err) {
        reject(new Error(`解析 AkShare 输出失败: ${(err as Error).message}\nstdout=${stdout}`));
      }
    });

    proc.on("error", (err) => reject(err));
  });
}

export async function fetchViaCsv(path: string): Promise<FetchResult> {
  try {
    const fs = await import("node:fs/promises");
    const content = await fs.readFile(path, "utf-8");
    const lines = content.trim().split("\n");
    if (lines.length < 2) throw new Error("CSV 内容为空");

    const header = lines[0].replace(/^\uFEFF/, "").split(",");
    const idxOf = (name: string) => header.indexOf(name);
    const daily: Bar[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      daily.push({
        date: cols[idxOf("date")],
        open: parseFloat(cols[idxOf("open")]),
        high: parseFloat(cols[idxOf("high")]),
        low: parseFloat(cols[idxOf("low")]),
        close: parseFloat(cols[idxOf("close")]),
      });
    }

    const weekly: Bar[] = [];
    let bucket: Bar[] = [];
    for (const bar of daily) {
      const d = new Date(bar.date);
      bucket.push(bar);
      if (d.getUTCDay() === 5) {
        weekly.push(mergeBucket(bucket));
        bucket = [];
      }
    }
    if (bucket.length > 0) weekly.push(mergeBucket(bucket));
    return { daily, weekly };
  } catch (err) {
    throw new Error(`fetchViaCsv 失败: ${(err as Error).message}`);
  }
}

function mergeBucket(bucket: Bar[]): Bar {
  return {
    date: bucket.at(-1)!.date,
    open: bucket[0].open,
    high: Math.max(...bucket.map((b) => b.high)),
    low: Math.min(...bucket.map((b) => b.low)),
    close: bucket.at(-1)!.close,
  };
}