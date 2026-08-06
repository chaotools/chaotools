"""四大分析维度引擎。输入日期区间，输出聚合结果（纯 SQL + Python）。

维度：
  1) 个股上榜频次   analyze_stocks
  2) 游资动向汇总   analyze_youzi
  3) 营业部协同买卖 analyze_collab
  4) 资金净流入排名 analyze_netinflow
"""
import os
import sys
from collections import defaultdict
from itertools import combinations

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.database import get_conn, get_records, get_records_branches, expand_branches
from core.youzi import normalize_branch, list_mappings


def _youzi_map():
    """构建 归一化营业部名 → 映射记录 的查询表，避免逐条 SQL。"""
    m = {}
    for r in list_mappings():
        m[normalize_branch(r["branch_name"])] = r
    return m


def _resolve_youzi(branch_name, ymap):
    """把营业部名解析为游资信息（name/type），未知返回 None。"""
    r = ymap.get(normalize_branch(branch_name))
    if r:
        return r["youzi_name"], r["youzi_type"]
    return None, None


# ---------------------------------------------------------------------------
# 0) 单日下钻明细（游资↔股票 双向）
# ---------------------------------------------------------------------------
def _branches_resolving_to(name):
    """把游资名/营业部名反查为 lhb_records 中真实存在的营业部名（含 #n 变体）。

    用与每日排行 build_daily_report 相同的「归一化正向解析」做反向反查，
    保证下钻口径与排行完全一致：排行能识别出的游资，下钻必然能查到持仓。
    注意必须用归一化后的「相等匹配」，不能用模糊包含——否则会误把
    「华泰证券股份有限公司」这类根营业部名当成「交易猿」旗下而漏算/多算。
    """
    ymap = _youzi_map()
    conn = get_conn()
    try:
        cur = conn.execute("SELECT DISTINCT branch_name FROM lhb_records")
        actual = [r["branch_name"] for r in cur.fetchall()]
    finally:
        conn.close()
    matched = []
    for b in actual:
        if b == name:                      # 直接就是营业部名（含 #n 变体）
            matched.append(b)
            continue
        yn, _ = _resolve_youzi(b, ymap)
        if yn == name:                     # 该席位归一化后归属于此游资
            matched.append(b)
    return expand_branches(matched)


def analyze_youzi_on_date(name, date):
    """某游资/营业部在指定交易日买了哪些股票（按净额排序）。"""
    branches = _branches_resolving_to(name) or ([name] if name else [])
    recs = get_records_branches(date, branches)
    stocks = {}
    for r in recs:
        s = stocks.setdefault(
            r["stock_code"],
            {"stock_code": r["stock_code"], "stock_name": r["stock_name"], "buy": 0.0, "sell": 0.0},
        )
        if r["side"] == "buy":
            s["buy"] += r["amount"]
        else:
            s["sell"] += r["amount"]
    for s in stocks.values():
        s["net"] = s["buy"] - s["sell"]
    items = sorted(stocks.values(), key=lambda x: x["net"], reverse=True)
    return {
        "youzi": name,
        "date": date,
        "stocks": items,
        "totals": {"buy": sum(s["buy"] for s in items), "sell": sum(s["sell"] for s in items)},
    }


def analyze_stock_on_date(code, date):
    """某股票在指定交易日的龙虎榜：买入金额前5席位 + 卖出金额前5席位。"""
    recs = get_records(date=date, stock=code)
    ymap = _youzi_map()
    buy, sell, reason, pct = {}, {}, None, None
    for r in recs:
        if reason is None:
            reason, pct = r["reason"], r["pct_change"]
        yn, yt = _resolve_youzi(r["branch_name"], ymap)
        key = yn or r["branch_name"]
        base = {"name": key, "is_youzi": bool(yn), "type": yt or "其他", "branch_name": r["branch_name"]}
        if r["side"] == "buy":
            d = buy.setdefault(key, {**base, "amount": 0.0})
            d["amount"] += r["amount"]
        else:
            d = sell.setdefault(key, {**base, "amount": 0.0})
            d["amount"] += r["amount"]
    buy_top5 = sorted([v for v in buy.values() if v["amount"] > 0], key=lambda x: x["amount"], reverse=True)[:5]
    sell_top5 = sorted([v for v in sell.values() if v["amount"] > 0], key=lambda x: x["amount"], reverse=True)[:5]
    tot_buy = sum(v["amount"] for v in buy.values())
    tot_sell = sum(v["amount"] for v in sell.values())
    return {
        "stock_code": code,
        "stock_name": recs[0]["stock_name"] if recs else None,
        "date": date,
        "reason": reason,
        "pct_change": pct,
        "buy_top5": buy_top5,
        "sell_top5": sell_top5,
        "totals": {"buy": tot_buy, "sell": tot_sell, "net": tot_buy - tot_sell},
    }


# ---------------------------------------------------------------------------
# 1) 个股上榜频次
# ---------------------------------------------------------------------------
def analyze_stocks(start=None, end=None, limit=50):
    """个股上榜天数、买卖总额、净流入、涉及营业部数。按上榜天数+净流入排序。"""
    conn = get_conn()
    try:
        cur = conn.execute(
            """
            SELECT stock_code, stock_name,
                   COUNT(DISTINCT trade_date) AS listed_days,
                   SUM(CASE WHEN side='buy'  THEN amount ELSE 0 END) AS buy_sum,
                   SUM(CASE WHEN side='sell' THEN amount ELSE 0 END) AS sell_sum,
                   COUNT(DISTINCT branch_name) AS branch_cnt,
                   AVG(pct_change) AS avg_pct
            FROM lhb_records
            WHERE (? IS NULL OR trade_date >= ?)
              AND (? IS NULL OR trade_date <= ?)
            GROUP BY stock_code, stock_name
            """,
            (start, start, end, end),
        )
        rows = []
        for r in cur.fetchall():
            d = dict(r)
            d["net"] = (d["buy_sum"] or 0) - (d["sell_sum"] or 0)
            rows.append(d)
        rows.sort(key=lambda x: (x["listed_days"], x["net"]), reverse=True)
        return rows[:limit]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 4) 资金净流入排名（独立查询）
# ---------------------------------------------------------------------------
def analyze_netinflow(start=None, end=None, limit=50):
    """按个股净额 net = Σbuy − Σsell 降序排名。"""
    conn = get_conn()
    try:
        cur = conn.execute(
            """
            SELECT stock_code, stock_name,
                   SUM(CASE WHEN side='buy'  THEN amount ELSE 0 END) AS buy_sum,
                   SUM(CASE WHEN side='sell' THEN amount ELSE 0 END) AS sell_sum
            FROM lhb_records
            WHERE (? IS NULL OR trade_date >= ?)
              AND (? IS NULL OR trade_date <= ?)
            GROUP BY stock_code, stock_name
            """,
            (start, start, end, end),
        )
        rows = []
        for r in cur.fetchall():
            d = dict(r)
            d["net"] = (d["buy_sum"] or 0) - (d["sell_sum"] or 0)
            rows.append(d)
        rows.sort(key=lambda x: x["net"], reverse=True)
        return rows[:limit]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 2) 游资动向汇总
# ---------------------------------------------------------------------------
def analyze_youzi(start=None, end=None, youzi_type=None):
    """JOIN 映射后按 youzi_name 聚合：买入/卖出/净额、活跃天数、交易笔数、关联个股数、重点个股。"""
    ymap = _youzi_map()
    conn = get_conn()
    try:
        cur = conn.execute(
            """
            SELECT trade_date, stock_code, stock_name, branch_name, side, amount
            FROM lhb_records
            WHERE (? IS NULL OR trade_date >= ?)
              AND (? IS NULL OR trade_date <= ?)
            """,
            (start, start, end, end),
        )
        agg = defaultdict(lambda: {
            "youzi_name": None, "youzi_type": None,
            "buy": 0.0, "sell": 0.0, "trades": 0,
            "active_days": set(), "stocks": set(), "top_stocks": defaultdict(float),
        })
        for r in cur.fetchall():
            yname, ytype = _resolve_youzi(r["branch_name"], ymap)
            if not yname:
                continue
            a = agg[yname]
            a["youzi_name"] = yname
            a["youzi_type"] = ytype
            a["active_days"].add(r["trade_date"])
            a["stocks"].add(r["stock_code"])
            a["top_stocks"][r["stock_name"]] += (r["amount"] if r["side"] == "buy" else 0)
            a["trades"] += 1
            if r["side"] == "buy":
                a["buy"] += r["amount"]
            else:
                a["sell"] += r["amount"]
        result = []
        for yname, a in agg.items():
            if youzi_type and a["youzi_type"] != youzi_type:
                continue
            a["net"] = a["buy"] - a["sell"]
            a["active_days"] = len(a["active_days"])
            a["stock_cnt"] = len(a["stocks"])
            a["name"] = yname        # 前端 renderYouziBar 用 x.name 做标签/下钻，补齐别名
            top = sorted(a["top_stocks"].items(), key=lambda x: x[1], reverse=True)[:5]
            a["top_stocks"] = [{"stock_name": s, "buy": v} for s, v in top]
            del a["stocks"]
            result.append(a)
        result.sort(key=lambda x: x["buy"], reverse=True)
        return result
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 3) 营业部协同买卖
# ---------------------------------------------------------------------------
def analyze_collab(start=None, end=None, top=300, youzi_type=None):
    """统计每个 (trade_date, stock_code) 的买方营业部两两共现（协同买入）；
    另算「对手盘」（一买一卖同票同日）共现。返回 Top 协同对 + 对手盘对。
    youzi_type 给定时只保留涉及该类型游资的协同/对手盘（单边匹配）。
    """
    ymap = _youzi_map()
    conn = get_conn()
    try:
        cur = conn.execute(
            """
            SELECT trade_date, stock_code, branch_name, side
            FROM lhb_records
            WHERE (? IS NULL OR trade_date >= ?)
              AND (? IS NULL OR trade_date <= ?)
            """,
            (start, start, end, end),
        )
        # 按 (date, stock) 聚合买/卖营业部集合
        buy_groups = defaultdict(set)
        sell_groups = defaultdict(set)
        for r in cur.fetchall():
            key = (r["trade_date"], r["stock_code"])
            # 用展示名（剥离 #n 后缀）聚合，避免「机构专用」与其 #n 变体被当成两个不同席位
            b = _branch_disp(r["branch_name"])
            if r["side"] == "buy":
                buy_groups[key].add(b)
            else:
                sell_groups[key].add(b)

        collab = defaultdict(int)   # 协同买入共现次数
        rival = defaultdict(int)    # 对手盘共现次数
        for key, buyers in buy_groups.items():
            for a, b in combinations(sorted(buyers), 2):
                collab[(a, b)] += 1
            # 对手盘：买集合 ∩ 卖集合（同票同日既买又卖）
            sellers = sell_groups.get(key, set())
            for x in buyers:
                if x in sellers:
                    rival[x] += 1

        def _type_of(branch):
            _, t = _resolve_youzi(branch, ymap)
            return t
        collab_list = [
            {"branch_a": a, "branch_b": b, "co_count": c}
            for (a, b), c in collab.items()
            if not youzi_type or _type_of(a) == youzi_type or _type_of(b) == youzi_type
        ]
        collab_list.sort(key=lambda x: x["co_count"], reverse=True)

        rival_list = [
            {"branch": x, "rival_count": c}
            for x, c in rival.items()
            if not youzi_type or _type_of(x) == youzi_type
        ]
        rival_list.sort(key=lambda x: x["rival_count"], reverse=True)

        return {
            "collab": collab_list[:top],
            "rival": rival_list[:top],
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 5) 历史趋势时间序列
# ---------------------------------------------------------------------------
def analyze_history(stock=None, youzi=None, start=None, end=None):
    """按交易日返回净额/买入/卖出时间序列。

    stock: 按股票代码筛选；youzi: 按游资称号筛选（需 JOIN 映射解析营业部）。
    两者都不传时返回全部营业部的每日汇总。
    """
    ymap = _youzi_map() if youzi else None
    target_branches = None
    if youzi and ymap:
        target_branches = {
            b for b, r in ymap.items()
            if r["youzi_name"] == youzi or r["branch_name"] == youzi
        }

    conn = get_conn()
    try:
        cur = conn.execute(
            """
            SELECT trade_date, branch_name, side, amount
            FROM lhb_records
            WHERE (? IS NULL OR trade_date >= ?)
              AND (? IS NULL OR trade_date <= ?)
              AND (? IS NULL OR stock_code = ?)
            """,
            (start, start, end, end, stock, stock),
        )
        series = defaultdict(lambda: {"buy": 0.0, "sell": 0.0})
        for r in cur.fetchall():
            if target_branches is not None:
                if normalize_branch(r["branch_name"]) not in target_branches:
                    continue
            s = series[r["trade_date"]]
            if r["side"] == "buy":
                s["buy"] += r["amount"]
            else:
                s["sell"] += r["amount"]
        result = []
        for d in sorted(series):
            s = series[d]
            s["trade_date"] = d
            s["net"] = s["buy"] - s["sell"]
            result.append(s)
        return result
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 6) 上榜原因归类分布
# ---------------------------------------------------------------------------
def _classify_reason(reason):
    """把 20+ 种原始上榜原因归一成大类，反映市场风格。"""
    r = reason or ""
    if "连续三个交易日" in r or "三个交易日内" in r:
        if "涨幅" in r:
            return "三日累计·涨幅"
        if "跌幅" in r:
            return "三日累计·跌幅"
        return "三日累计"
    if "换手" in r:
        return "换手率"
    if "振幅" in r:
        return "振幅"
    if "跌幅" in r:
        return "跌幅偏离"
    if "涨幅" in r:
        return "涨幅偏离"
    return "其他"


def analyze_reasons(start=None, end=None):
    """上榜原因归类分布（按上榜记录计）。"""
    conn = get_conn()
    try:
        cur = conn.execute(
            "SELECT reason FROM lhb_records "
            "WHERE (? IS NULL OR trade_date >= ?) AND (? IS NULL OR trade_date <= ?)",
            (start, start, end, end),
        )
        cats = defaultdict(int)
        for r in cur.fetchall():
            cats[_classify_reason(r["reason"])] += 1
        items = [{"cat": k, "cnt": v} for k, v in cats.items()]
        items.sort(key=lambda x: x["cnt"], reverse=True)
        return items
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 7) 资金阵营多空对比（按 youzi_type）
# ---------------------------------------------------------------------------
def analyze_camp(start=None, end=None, youzi_type=None):
    """按游资类型聚合买/卖/净额；未映射分支归为「其他营业部」。"""
    ymap = _youzi_map()
    conn = get_conn()
    try:
        cur = conn.execute(
            "SELECT branch_name, side, amount FROM lhb_records "
            "WHERE (? IS NULL OR trade_date >= ?) AND (? IS NULL OR trade_date <= ?)",
            (start, start, end, end),
        )
        agg = defaultdict(lambda: {"buy": 0.0, "sell": 0.0})
        for r in cur.fetchall():
            _, yt = _resolve_youzi(r["branch_name"], ymap)
            key = yt or "其他营业部"
            if youzi_type and key != youzi_type:
                continue
            a = agg[key]
            if r["side"] == "buy":
                a["buy"] += r["amount"]
            else:
                a["sell"] += r["amount"]
        result = [
            {"type": t, "buy": a["buy"], "sell": a["sell"], "net": a["buy"] - a["sell"]}
            for t, a in agg.items()
        ]
        result.sort(key=lambda x: x["buy"], reverse=True)
        return result
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 8) 每日龙虎榜热度（情绪温度计）
# ---------------------------------------------------------------------------
def analyze_heat(start=None, end=None):
    """按交易日聚合：上榜家数(listed) + 买卖总额 + 净额。"""
    conn = get_conn()
    try:
        cur = conn.execute(
            """
            SELECT trade_date,
                   COUNT(DISTINCT stock_code) AS listed,
                   SUM(CASE WHEN side='buy'  THEN amount ELSE 0 END) AS buy_sum,
                   SUM(CASE WHEN side='sell' THEN amount ELSE 0 END) AS sell_sum
            FROM lhb_records
            WHERE (? IS NULL OR trade_date >= ?) AND (? IS NULL OR trade_date <= ?)
            GROUP BY trade_date ORDER BY trade_date
            """,
            (start, start, end, end),
        )
        items = []
        for r in cur.fetchall():
            d = dict(r)
            d["net"] = (d["buy_sum"] or 0) - (d["sell_sum"] or 0)
            items.append(d)
        return items
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 9) 游资协同关系网络（力导向图数据）
# ---------------------------------------------------------------------------
def _node_identity(branch, ymap):
    """返回 (节点名, 类型)：优先游资名，否则剥离 '#n' 后缀的原营业部名。"""
    base = branch.split(" #")[0] if " #" in branch else branch
    yn, yt = _resolve_youzi(base, ymap)
    return (yn or base), (yt or "其他营业部")


def analyze_collab_graph(start=None, end=None, youzi_type=None, top=40):
    """构建协同关系网络：节点=游资/营业部，边=同票同日协同买入次数。

    返回 {nodes:[{name,value,type,symbolSize}], links:[{source,target,value}]}。
    仅保留度数 Top `top` 的节点及其连边；youzi_type 给定时只留涉及该类型的边。
    """
    ymap = _youzi_map()
    conn = get_conn()
    try:
        cur = conn.execute(
            "SELECT trade_date, stock_code, branch_name, side FROM lhb_records "
            "WHERE (? IS NULL OR trade_date >= ?) AND (? IS NULL OR trade_date <= ?)",
            (start, start, end, end),
        )
        buy_groups = defaultdict(set)
        for r in cur.fetchall():
            if r["side"] != "buy":
                continue
            key = (r["trade_date"], r["stock_code"])
            buy_groups[key].add(r["branch_name"])

        def _type_of_name(name):
            _, yt = _resolve_youzi(name, ymap)
            return yt or "其他营业部"

        edges = defaultdict(int)
        for buyers in buy_groups.values():
            # 折叠为节点身份名（游资名 / 剥离 #n 的营业部名），避免同名席位被拆成多节点
            names = sorted(_node_identity(b, ymap)[0] for b in buyers)
            for a, b in combinations(names, 2):
                edges[(a, b)] += 1

        if youzi_type:
            edges = {
                (a, b): c for (a, b), c in edges.items()
                if _type_of_name(a) == youzi_type or _type_of_name(b) == youzi_type
            }

        deg = defaultdict(int)
        for (a, b), c in edges.items():
            deg[a] += c
            deg[b] += c

        top_nodes = {n for n, _ in sorted(deg.items(), key=lambda x: x[1], reverse=True)[:top]}
        nodes_set, links = set(), []
        for (a, b), c in edges.items():
            if a in top_nodes and b in top_nodes:
                links.append({"source": a, "target": b, "value": c})
                nodes_set.add(a)
                nodes_set.add(b)

        nodes = []
        for n in nodes_set:
            _, yt = _node_identity(n, ymap)
            d = deg.get(n, 0)
            nodes.append({
                "name": n, "value": d, "type": yt or "其他营业部",
                "symbolSize": max(12, min(60, 8 + d ** 0.5 * 4)),
            })
        return {"nodes": nodes, "links": links}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 10) 买方集中度（识别「一家独大」vs「游资合力」）
# ---------------------------------------------------------------------------
def analyze_concentration(start=None, end=None, limit=50):
    """每只龙虎榜上榜记录（交易日×个股）的「最大单一席位买入占比」(CR1)。

    交易所每侧仅披露最多 5 个席位，故 top5≈100% 无区分度；改用最大席位
    占该票总买入比：越高 = 买盘被单一席位主导（一家独大），越低 = 多席位合力。
    返回 {summary:{avg_conc, concentrated, total}, items:[...]}（按 conc 降序）。
    """
    conn = get_conn()
    try:
        cur = conn.execute(
            "SELECT trade_date, stock_code, stock_name, branch_name, amount "
            "FROM lhb_records WHERE (? IS NULL OR trade_date >= ?) "
            "AND (? IS NULL OR trade_date <= ?) AND side='buy'",
            (start, start, end, end),
        )
        seat_amt = defaultdict(float)      # (date, stock, branch) -> 买入额
        total_buy = defaultdict(float)     # (date, stock) -> 总买入
        meta = {}
        for r in cur.fetchall():
            key = (r["trade_date"], r["stock_code"])
            seat_amt[(key, r["branch_name"])] += r["amount"]
            total_buy[key] += r["amount"]
            meta[key] = (r["stock_code"], r["stock_name"])

        per_stock = defaultdict(list)
        for (key, _b), amt in seat_amt.items():
            per_stock[key].append(amt)

        rows = []
        for key, amts in per_stock.items():
            tb = total_buy[key]
            if tb <= 0:
                continue
            top1 = max(amts)
            code, name = meta[key]
            rows.append({
                "stock_code": code, "stock_name": name,
                "conc": top1 / tb, "top1": top1, "buy_sum": tb, "seat_cnt": len(amts),
            })
        rows.sort(key=lambda x: x["conc"], reverse=True)
        total = len(rows)
        summary = {
            "avg_conc": round(sum(r["conc"] for r in rows) / total, 4) if total else 0,
            "concentrated": sum(1 for r in rows if r["conc"] >= 0.5),
            "total": total,
        }
        return {"summary": summary, "items": rows[:limit]}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 11) 营业部活跃榜（纯席位级，含未映射营业部）
# ---------------------------------------------------------------------------
def _branch_disp(branch):
    """展示用营业部名：剥离 '#n' 后缀（多个「机构专用」合并为一）。"""
    return branch.split(" #")[0] if " #" in branch else branch


def analyze_branch_activity(start=None, end=None, youzi_type=None, limit=50):
    """按营业部（席位）聚合活跃度：活跃天数、涉及个股数、买卖总额、净额。

    含未映射席位（如拉萨天团）。youzi_type 给定时只留该类型对应营业部。
    按净额降序返回 Top `limit`。
    """
    ymap = _youzi_map()
    conn = get_conn()
    try:
        cur = conn.execute(
            "SELECT trade_date, stock_code, branch_name, side, amount FROM lhb_records "
            "WHERE (? IS NULL OR trade_date >= ?) AND (? IS NULL OR trade_date <= ?)",
            (start, start, end, end),
        )
        agg = {}
        for r in cur.fetchall():
            b = _branch_disp(r["branch_name"])
            if youzi_type:
                _, yt = _resolve_youzi(b, ymap)
                if (yt or "其他营业部") != youzi_type:
                    continue
            a = agg.setdefault(b, {
                "branch": b, "active_days": set(), "stocks": set(),
                "buy": 0.0, "sell": 0.0, "trades": 0,
            })
            a["active_days"].add(r["trade_date"])
            a["stocks"].add(r["stock_code"])
            a["trades"] += 1
            if r["side"] == "buy":
                a["buy"] += r["amount"]
            else:
                a["sell"] += r["amount"]
        items = []
        for b, a in agg.items():
            items.append({
                "branch": b,
                "active_days": len(a["active_days"]),
                "stock_cnt": len(a["stocks"]),
                "buy_sum": a["buy"], "sell_sum": a["sell"],
                "net": a["buy"] - a["sell"], "trades": a["trades"],
            })
        items.sort(key=lambda x: x["net"], reverse=True)
        return items[:limit]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 12) 连板 / 连续上榜识别
# ---------------------------------------------------------------------------
def analyze_limit_up(start=None, end=None):
    """识别区间内的连板 / 连续上榜个股。

    - 以区间内全部交易日为轴，统计每只票连续上榜的最大天数（连板高度）。
    - 若某日 reason 含「连续三个交易日」视为连板股（is_ztu）。
    返回 {summary:{max_streak, streak_ge2, ztu}, items:[连板高度>=2 的票]}。
    """
    conn = get_conn()
    try:
        cur = conn.execute(
            "SELECT trade_date, stock_code, stock_name, reason FROM lhb_records "
            "WHERE (? IS NULL OR trade_date >= ?) AND (? IS NULL OR trade_date <= ?)",
            (start, start, end, end),
        )
        rows = cur.fetchall()
        all_dates = sorted({r["trade_date"] for r in rows})
        idx_of = {d: i for i, d in enumerate(all_dates)}

        stock_idx = defaultdict(set)
        stock_name = {}
        stock_ztu = defaultdict(bool)
        for r in rows:
            code = r["stock_code"]
            name = r["stock_name"] or ""
            # 退市整理期个股每日交易，会污染「连板高度」，排除
            if "退" in name:
                continue
            stock_idx[code].add(idx_of[r["trade_date"]])
            stock_name[code] = name
            if "连续三个交易日" in (r["reason"] or ""):
                stock_ztu[code] = True

        def max_streak(idxs):
            s = sorted(idxs)
            if not s:
                return 0
            best = cur = 1
            for i in range(1, len(s)):
                if s[i] == s[i - 1] + 1:
                    cur += 1
                    best = max(best, cur)
                else:
                    cur = 1
            return best

        items = []
        for code, idxs in stock_idx.items():
            st = max_streak(idxs)
            if st < 2:
                continue
            sorted_idx = sorted(idxs)
            last = all_dates[sorted_idx[-1]]
            items.append({
                "stock_code": code, "stock_name": stock_name[code],
                "streak": st, "last_date": last, "is_ztu": stock_ztu[code],
            })
        # 交易所认定的连板(is_ztu)优先，其次按连板高度
        items.sort(key=lambda x: (x["is_ztu"], x["streak"]), reverse=True)
        summary = {
            "max_streak": max((x["streak"] for x in items), default=0),
            "streak_ge2": len(items),
            "ztu": sum(1 for x in items if x["is_ztu"]),
        }
        return {"summary": summary, "items": items}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 13) 净买入额 vs 当日涨跌幅 散点
# ---------------------------------------------------------------------------
def analyze_netpct(start=None, end=None):
    """每只票每日的 (涨跌幅, 净买入额) 散点数据，看主买强度与涨幅关系。"""
    conn = get_conn()
    try:
        cur = conn.execute(
            """
            SELECT trade_date, stock_code, stock_name, pct_change,
                   SUM(CASE WHEN side='buy'  THEN amount ELSE 0 END) AS buy_sum,
                   SUM(CASE WHEN side='sell' THEN amount ELSE 0 END) AS sell_sum
            FROM lhb_records
            WHERE (? IS NULL OR trade_date >= ?) AND (? IS NULL OR trade_date <= ?)
            GROUP BY trade_date, stock_code, stock_name, pct_change
            """,
            (start, start, end, end),
        )
        items = []
        for r in cur.fetchall():
            pct = r["pct_change"]
            if pct is None:
                continue
            net = (r["buy_sum"] or 0) - (r["sell_sum"] or 0)
            items.append({
                "trade_date": r["trade_date"], "stock_code": r["stock_code"],
                "stock_name": r["stock_name"], "pct": pct, "net": net,
            })
        return items
    finally:
        conn.close()


if __name__ == "__main__":
    import os, sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from core.fetcher import load_demo
    load_demo()
    print("stocks:", len(analyze_stocks(limit=5)))
    print("netinflow top1:", analyze_netinflow(limit=1))
    print("youzi top3:", [y["youzi_name"] for y in analyze_youzi()[:3]])
    print("collab top3:", analyze_collab()["collab"][:3])
