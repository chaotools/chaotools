"""每日分析报告：游资活跃度排行 + 重点个股游资参与。结果缓存进 daily_reports。"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.database import get_conn
from core.youzi import normalize_branch, list_mappings
from core.analyzer import analyze_netinflow


def _youzi_map():
    m = {}
    for r in list_mappings():
        m[normalize_branch(r["branch_name"])] = r
    return m


def build_daily_report(date, top_n=100000):
    """构建指定日期的报告。

    top_n 为「展示全部」预留的实际上限（单日营业部/个股数远低于此）。
    返回 {
        trade_date,
        youzi_ranking:  [当日游资按买入额排序],
        key_stocks:     [当日按净流入/游资参与度取 Top 个股及其参与游资],
    }
    """
    ymap = _youzi_map()
    conn = get_conn()
    try:
        cur = conn.execute(
            """
            SELECT stock_code, stock_name, branch_name, side, amount, reason, pct_change
            FROM lhb_records WHERE trade_date = ?
            """,
            (date,),
        )
        rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        return {"trade_date": date, "youzi_ranking": [], "key_stocks": [], "empty": True}

    # 按游资聚合当日买入/卖出
    youzi_agg = {}
    # 按个股聚合
    stock_agg = {}
    for r in rows:
        bname = r["branch_name"]
        yname, ytype = _resolve(ymap, bname)
        key_y = yname or bname
        if key_y not in youzi_agg:
            youzi_agg[key_y] = {
                "name": key_y, "is_youzi": yname is not None,
                "type": ytype or "其他", "buy": 0.0, "sell": 0.0,
            }
        if r["side"] == "buy":
            youzi_agg[key_y]["buy"] += r["amount"]
        else:
            youzi_agg[key_y]["sell"] += r["amount"]

        scode = r["stock_code"]
        if scode not in stock_agg:
            stock_agg[scode] = {
                "stock_code": scode, "stock_name": r["stock_name"],
                "buy": 0.0, "sell": 0.0, "youzi": {}, "reason": r["reason"],
                "pct_change": r["pct_change"],
            }
        sa = stock_agg[scode]
        if r["side"] == "buy":
            sa["buy"] += r["amount"]
        else:
            sa["sell"] += r["amount"]
        # 该个股参与的游资
        if yname:
            sa["youzi"].setdefault(yname, {"buy": 0.0, "sell": 0.0})
            sa["youzi"][yname][r["side"]] += r["amount"]

    youzi_ranking = sorted(youzi_agg.values(), key=lambda x: x["buy"], reverse=True)[:top_n]

    # 重点个股：按游资参与度（参与游资数）+ 净流入排序
    for sa in stock_agg.values():
        sa["net"] = sa["buy"] - sa["sell"]
        sa["youzi_cnt"] = len(sa["youzi"])
        sa["youzi_list"] = [
            {"name": k, "buy": v["buy"], "sell": v["sell"],
             "net": v["buy"] - v["sell"]}
            for k, v in sa["youzi"].items()
        ]
        sa["youzi_list"].sort(key=lambda x: x["buy"], reverse=True)
        del sa["youzi"]
    key_stocks = sorted(
        stock_agg.values(),
        key=lambda x: (x["youzi_cnt"], x["net"]),
        reverse=True,
    )[:top_n]

    return {
        "trade_date": date,
        "youzi_ranking": youzi_ranking,
        "key_stocks": key_stocks,
        "empty": False,
    }


def _resolve(ymap, branch_name):
    r = ymap.get(normalize_branch(branch_name))
    if r:
        return r["youzi_name"], r["youzi_type"]
    return None, None


def get_report(date, top_n=100000, force=False):
    """取当日报告：命中缓存直接返回，否则构建并缓存。"""
    if not force:
        conn = get_conn()
        try:
            row = conn.execute(
                "SELECT report_json FROM daily_reports WHERE trade_date = ?",
                (date,),
            ).fetchone()
            if row:
                return json.loads(row["report_json"])
        finally:
            conn.close()
    report = build_daily_report(date, top_n)
    conn = get_conn()
    try:
        conn.execute(
            "INSERT INTO daily_reports (trade_date, report_json) VALUES (?, ?) "
            "ON CONFLICT(trade_date) DO UPDATE SET report_json = excluded.report_json",
            (date, json.dumps(report, ensure_ascii=False)),
        )
        conn.commit()
    finally:
        conn.close()
    return report


if __name__ == "__main__":
    import core.fetcher as f
    f.load_demo()
    from core.youzi import seed_mapping
    seed_mapping()
    rep = get_report("2024-06-18")
    print(json.dumps(rep, ensure_ascii=False, indent=2)[:800])
