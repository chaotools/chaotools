"""SQLite 数据库层：建表 + 读写封装。

单文件数据库 data/lhb.db，零部署。所有写入操作线程安全由调用方保证
（本项目为单机单进程 + 后台调度线程，连接各自创建，互不共享）。
"""
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import DATA_DIR, DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS lhb_records (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_date  TEXT NOT NULL,          -- YYYY-MM-DD
    stock_code  TEXT NOT NULL,
    stock_name  TEXT,
    branch_name TEXT NOT NULL,          -- 营业部名称
    branch_code TEXT,
    side        TEXT NOT NULL,          -- 'buy' | 'sell'
    amount      REAL NOT NULL DEFAULT 0,
    reason      TEXT,                   -- 上榜原因
    pct_change  REAL,
    close_price REAL,
    raw_json    TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(trade_date, stock_code, branch_name, side)
);
CREATE INDEX IF NOT EXISTS idx_lhb_date   ON lhb_records(trade_date);
CREATE INDEX IF NOT EXISTS idx_lhb_stock  ON lhb_records(stock_code, trade_date);
CREATE INDEX IF NOT EXISTS idx_lhb_branch ON lhb_records(branch_name);

CREATE TABLE IF NOT EXISTS youzi_mapping (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_name TEXT NOT NULL,
    branch_code TEXT,
    youzi_name  TEXT NOT NULL,          -- 游资称号
    youzi_type  TEXT DEFAULT '其他',    -- 一线游资/知名游资/量化基金/机构/机构联动
    note        TEXT,
    source      TEXT DEFAULT 'manual',  -- seed / manual
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(branch_name, youzi_name)
);
CREATE INDEX IF NOT EXISTS idx_youzi_branch ON youzi_mapping(branch_name);

CREATE TABLE IF NOT EXISTS daily_reports (
    trade_date  TEXT PRIMARY KEY,
    report_json TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now'))
);
"""


def get_conn():
    """返回一个 row_factory 已设置的连接。调用方负责 close。"""
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """建表（幂等）。"""
    conn = get_conn()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def normalize_record(row):
    """把 dict / Row 规范成 upsert 需要的字段集合。

    允许缺省字段，补齐默认值。
    """
    return (
        row.get("trade_date"),
        row.get("stock_code"),
        row.get("stock_name"),
        row.get("branch_name"),
        row.get("branch_code"),
        row.get("side"),
        float(row.get("amount") or 0),
        row.get("reason"),
        row.get("pct_change"),
        row.get("close_price"),
        row.get("raw_json"),
    )


def upsert_records(rows):
    """批量写入龙虎榜记录，按 (trade_date, stock_code, branch_name, side) 去重覆盖。

    返回新写入/覆盖的行数。
    """
    if not rows:
        return 0
    sql = """
    INSERT INTO lhb_records
        (trade_date, stock_code, stock_name, branch_name, branch_code,
         side, amount, reason, pct_change, close_price, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(trade_date, stock_code, branch_name, side)
    DO UPDATE SET
        stock_name  = excluded.stock_name,
        branch_code = excluded.branch_code,
        amount      = excluded.amount,
        reason      = excluded.reason,
        pct_change  = excluded.pct_change,
        close_price = excluded.close_price,
        raw_json    = excluded.raw_json
    """
    conn = get_conn()
    try:
        conn.executemany(sql, [normalize_record(r) for r in rows])
        conn.commit()
        return conn.total_changes
    finally:
        conn.close()


def list_dates():
    """返回已有交易日的去重排序列表。"""
    conn = get_conn()
    try:
        cur = conn.execute(
            "SELECT DISTINCT trade_date FROM lhb_records ORDER BY trade_date DESC"
        )
        return [r["trade_date"] for r in cur.fetchall()]
    finally:
        conn.close()


def get_records(date=None, start=None, end=None, stock=None, branch=None):
    """按条件查询 lhb_records，返回 list[dict]。"""
    sql = "SELECT * FROM lhb_records WHERE 1=1"
    params = []
    if date:
        sql += " AND trade_date = ?"
        params.append(date)
    if start:
        sql += " AND trade_date >= ?"
        params.append(start)
    if end:
        sql += " AND trade_date <= ?"
        params.append(end)
    if stock:
        sql += " AND stock_code = ?"
        params.append(stock)
    if branch:
        sql += " AND branch_name = ?"
        params.append(branch)
    sql += " ORDER BY trade_date, stock_code, side"
    conn = get_conn()
    try:
        cur = conn.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_records_branches(date, branches):
    """按日期 + 多个营业部(IN) 查询 lhb_records，下钻反查某游资旗下席位持仓。"""
    if not branches:
        return []
    conn = get_conn()
    try:
        ph = ",".join("?" * len(branches))
        cur = conn.execute(
            f"SELECT stock_code, stock_name, branch_name, side, amount, reason, pct_change "
            f"FROM lhb_records WHERE trade_date = ? AND branch_name IN ({ph}) "
            f"ORDER BY stock_code, side",
            [date, *branches],
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def expand_branches(branches):
    """把一个营业部名列表扩展为其全部去重变体（含 ` #2` ` #3` 等同席位后缀）。

    交易所会对同一席位在同一票同日同侧多次披露，入库时加 ` #n` 后缀区分。
    下钻反查某游资/营业部时，需把基础名 `机构专用` 与其 `机构专用 #2 …` 一并查回，
    否则会漏算绝大多数金额。
    """
    if not branches:
        return []
    result, seen = [], set()
    conn = get_conn()
    try:
        for b in branches:
            # 以去重后缀前的基础名为准，避免传入已是 ` #n` 变体时漏掉基础名
            base = b.split(" #")[0] if " #" in b else b
            cur = conn.execute(
                "SELECT DISTINCT branch_name FROM lhb_records "
                "WHERE branch_name = ? OR branch_name LIKE ?",
                (base, base + " #%"),
            )
            for r in cur.fetchall():
                if r["branch_name"] not in seen:
                    seen.add(r["branch_name"])
                    result.append(r["branch_name"])
    finally:
        conn.close()
    return result


def count_records():
    conn = get_conn()
    try:
        return conn.execute("SELECT COUNT(*) AS c FROM lhb_records").fetchone()["c"]
    finally:
        conn.close()


if __name__ == "__main__":
    init_db()
    print("database initialized at", DB_PATH)
