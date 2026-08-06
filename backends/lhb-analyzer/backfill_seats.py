"""回填 2026-07-01 ~ 2026-07-17 缺失的龙虎榜席位（营业部）。

问题根因：原抓取时东方财富限流，部分个股的买/卖席位明细被静默跳过，
导致单只票席位不足 5 家。本脚本针对「当前仍不足 5 家」的个股，
直接调用 stock_lhb_stock_detail_em 补齐买/卖席位，带强重试 + 节流，
多轮循环直到稳定。
"""
import os
import sys
import time
import sqlite3

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import DATA_DIR, DB_PATH
from db.database import upsert_records
from core.fetcher import _mk, _to_float, _col

DATES = [f"2026-07-{d:02d}" for d in (1, 2, 3, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17)]
LOG = os.path.join(DATA_DIR, "backfill_seats.log")


def log(*a):
    msg = " ".join(str(x) for x in a)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(msg + "\n")
    print(msg, flush=True)


def side_seats(date):
    """返回 {side: {stock_code: distinct_branch_count}}。"""
    db = sqlite3.connect(DB_PATH)
    cur = db.cursor()
    out = {"buy": {}, "sell": {}}
    cur.execute(
        "SELECT stock_code, side, COUNT(DISTINCT branch_name) c "
        "FROM lhb_records WHERE trade_date=? GROUP BY stock_code, side",
        (date,),
    )
    for code, side, c in cur.fetchall():
        out[side][code] = c
    db.close()
    return out


def stock_meta(date, code):
    db = sqlite3.connect(DB_PATH)
    cur = db.cursor()
    cur.execute(
        "SELECT stock_name, reason, pct_change, close_price FROM lhb_records "
        "WHERE trade_date=? AND stock_code=? LIMIT 1",
        (date, code),
    )
    r = cur.fetchone()
    db.close()
    return r


def robust_detail(ak, symbol, ymd, flag, retries=10, backoff=1.0):
    """带重试地取单只票单方向席位明细，规避限流。"""
    last = None
    for attempt in range(retries):
        try:
            df = ak.stock_lhb_stock_detail_em(symbol=symbol, date=ymd, flag=flag)
            if df is not None and len(df) > 0:
                return df
            # 返回空：可能是限流，也可能是该方向确实无席位
            if attempt < 3:  # 前几次空结果也重试（限流常返回空）
                time.sleep(backoff * (attempt + 1))
                continue
            return df
        except Exception as e:
            last = e
            if attempt < retries - 1:
                time.sleep(backoff * (attempt + 1))
    log(f"  [warn] detail {symbol}/{flag} 失败（重试 {retries} 次）: {last}")
    return None


def main():
    import akshare as ak

    for date in DATES:
        ymd = date.replace("-", "")
        log(f"==== {date} 开始 ====")
        for _pass in range(4):  # 最多 4 轮，捕捉瞬时限流
            seats = side_seats(date)
            # 找不足 5 家的个股（按方向）
            todo = []  # (code, side, flag)
            for side, flag in (("buy", "买入"), ("sell", "卖出")):
                for code, c in seats[side].items():
                    if c < 5:
                        todo.append((code, side, flag))
            if not todo:
                log(f"  第{_pass}轮：已完整，无需补")
                break
            log(f"  第{_pass}轮：待补 {len(todo)} 个(个股×方向)")
            recs = []
            for code, side, flag in todo:
                meta = stock_meta(date, code)
                if not meta:
                    continue
                name, reason, pct, close = meta
                stat = robust_detail(ak, code, ymd, flag)
                if stat is None or len(stat) == 0:
                    time.sleep(0.3)
                    continue
                branch_col = _col(stat, "交易营业部名称", "营业部", "branch")
                amt_col = "买入金额" if side == "buy" else "卖出金额"
                if branch_col is None:
                    continue
                bcount = {}
                for _, s in stat.iterrows():
                    branch = str(s.get(branch_col, "")).strip()
                    if not branch:
                        continue
                    amt = _to_float(s.get(amt_col))
                    if amt == 0:
                        continue
                    key = (side, branch)
                    n = bcount.get(key, 0) + 1
                    bcount[key] = n
                    bname = f"{branch} #{n}" if n > 1 else branch
                    recs.append(_mk(date, code, name, bname, side, amt,
                                   reason, pct, close, s.to_dict()))
                time.sleep(0.4)  # 放慢节奏，避免连续请求被限流
            if recs:
                n = upsert_records(recs)
                log(f"  第{_pass}轮：写入 {n} 条")
            else:
                log(f"  第{_pass}轮：无新数据")
        # 末轮统计
        seats = side_seats(date)
        inc = sum(1 for code, c in seats["buy"].items() if c < 5) + \
              sum(1 for code, c in seats["sell"].items() if c < 5)
        total = len(seats["buy"]) + len(seats["sell"])
        log(f"==== {date} 结束：仍不足5家的(个股×方向) = {inc} / {total} ====")


if __name__ == "__main__":
    main()
