"""游资映射库：营业部 ⇄ 游资 的 CRUD、种子数据、智能匹配。

注意：种子映射来自社区公开传闻，席位会随迁址/租用变化，正式使用前请人工核验。
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.database import get_conn

# 券商全称里常夹带「股份/有限/责任/公司/营业部/分公司」等插入词，归一化时整体去掉，
# 使「财通证券股份有限公司杭州上塘路证券营业部」与种子「财通证券杭州上塘路证券营业部」
# 能被识别为同一营业部（同时去空格）。
_FILLER_RE = re.compile(r"(股份|有限|责任|公司|营业部|分公司|\s+)")
# 同一个营业部在同一票同日同侧被交易所多次披露时，入库会用 ` #2` ` #3` … 去重后缀，
# 归一化时一并去掉，否则「机构专用 #2」无法命中「机构专用」的映射。
_DEDUP_RE = re.compile(r"#\d+$")


def normalize_branch(name):
    """营业部名称归一化：去掉插入词与空格，便于模糊匹配。

    同时剥离 ` #n` 去重后缀（如「机构专用 #2」→「机构专用」）。
    """
    if not name:
        return ""
    s = _FILLER_RE.sub("", str(name))
    s = _DEDUP_RE.sub("", s)
    return s


# 社区公开席位映射（seed）。youzi_type 用于前端分类筛选。
# 使用前需人工核验，仅供参考。
SEED_YOUZI = [
    ("方新侠",            "一线游资", "兴业证券陕西分公司"),
    ("赵老哥",            "一线游资", "中国银河证券绍兴证券营业部"),
    ("章盟主",            "一线游资", "国泰君安证券上海江苏路证券营业部"),
    ("炒股养家",          "一线游资", "华鑫证券上海宛平南路证券营业部"),
    ("宁波桑田路",        "知名游资", "国盛证券宁波桑田路证券营业部"),
    ("作手新一",          "知名游资", "国泰君安证券南京太平南路证券营业部"),
    ("小鳄鱼",            "知名游资", "南京证券南京大钟亭证券营业部"),
    ("佛山系",            "知名游资", "光大证券佛山绿景路证券营业部"),
    ("成都系",            "知名游资", "国泰君安证券成都北一环路证券营业部"),
    ("上海溧阳路",        "知名游资", "中信证券上海溧阳路证券营业部"),
    ("华鑫量化",          "量化基金", "华鑫证券有限责任公司上海分公司"),
    ("宋庄路",            "其他",     "招商证券北京车公庄西路证券营业部"),
    ("机构专用",          "机构",     "机构专用"),
    ("机构联动",          "机构联动", "沪股通专用"),
    ("深股通专用",        "机构联动", "深股通专用"),
    ("交易猿",            "一线游资", "华泰证券天津东丽开发区二纬路证券营业部"),
    ("上塘路",            "知名游资", "财通证券杭州上塘路证券营业部"),
]


def seed_mapping():
    """首次建库写入种子映射。已存在则跳过（按 UNIQUE 去重）。"""
    conn = get_conn()
    try:
        cur = conn.executemany(
            """INSERT OR IGNORE INTO youzi_mapping
                   (branch_name, youzi_name, youzi_type, source)
               VALUES (?, ?, ?, 'seed')""",
            [(b, n, t) for (n, t, b) in SEED_YOUZI],
        )
        conn.commit()
        return conn.total_changes
    finally:
        conn.close()


def _match_exact(branch_code, branch_name):
    conn = get_conn()
    try:
        if branch_code:
            cur = conn.execute(
                "SELECT * FROM youzi_mapping WHERE branch_code = ?", (branch_code,)
            )
            row = cur.fetchone()
            if row:
                return dict(row)
        if branch_name:
            cur = conn.execute(
                "SELECT * FROM youzi_mapping WHERE branch_name = ?", (branch_name,)
            )
            row = cur.fetchone()
            if row:
                return dict(row)
        return None
    finally:
        conn.close()


def match_youzi(branch_name, branch_code=None):
    """三级匹配：代码精确 → 名称精确 → 归一化模糊包含。

    返回 {youzi_name, youzi_type, source, matched} 或 None。
    matched 表示命中的级别，便于前端标注置信度。
    """
    # 1) 代码/名称精确
    exact = _match_exact(branch_code, branch_name)
    if exact:
        exact["matched"] = "exact"
        return exact

    # 2) 归一化模糊包含（双向）
    nb = normalize_branch(branch_name)
    if not nb:
        return None
    conn = get_conn()
    try:
        rows = conn.execute("SELECT * FROM youzi_mapping").fetchall()
        for r in rows:
            db_n = normalize_branch(r["branch_name"])
            if not db_n:
                continue
            if nb == db_n or nb in db_n or db_n in nb:
                d = dict(r)
                d["matched"] = "fuzzy"
                return d
        return None
    finally:
        conn.close()


def branches_of_youzi(youzi_name):
    """某个游资名对应的所有营业部 branch_name 列表（用于下钻反查旗下席位）。"""
    conn = get_conn()
    try:
        cur = conn.execute(
            "SELECT branch_name FROM youzi_mapping WHERE youzi_name = ?", (youzi_name,)
        )
        return [r["branch_name"] for r in cur.fetchall()]
    finally:
        conn.close()


def create_mapping(branch_name, youzi_name, youzi_type="其他",
                   branch_code=None, note=None):
    """新增映射，返回新记录 id。"""
    conn = get_conn()
    try:
        cur = conn.execute(
            """INSERT INTO youzi_mapping
                   (branch_name, branch_code, youzi_name, youzi_type, note, source)
               VALUES (?, ?, ?, ?, ?, 'manual')""",
            (branch_name, branch_code, youzi_name, youzi_type, note),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def update_mapping(mid, **fields):
    """更新映射字段（branch_name/youzi_name/youzi_type/branch_code/note）。"""
    allowed = {"branch_name", "youzi_name", "youzi_type", "branch_code", "note"}
    sets = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if not sets:
        return 0
    sql = "UPDATE youzi_mapping SET " + ", ".join(f"{k} = ?" for k in sets) + ", updated_at = datetime('now') WHERE id = ?"
    params = list(sets.values()) + [mid]
    conn = get_conn()
    try:
        cur = conn.execute(sql, params)
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


def delete_mapping(mid):
    conn = get_conn()
    try:
        cur = conn.execute("DELETE FROM youzi_mapping WHERE id = ?", (mid,))
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


def list_mappings(search=None, youzi_type=None):
    """映射列表，支持名称搜索与类型筛选。"""
    sql = "SELECT * FROM youzi_mapping WHERE 1=1"
    params = []
    if search:
        sql += " AND (branch_name LIKE ? OR youzi_name LIKE ?)"
        params += [f"%{search}%", f"%{search}%"]
    if youzi_type:
        sql += " AND youzi_type = ?"
        params.append(youzi_type)
    sql += " ORDER BY youzi_type, youzi_name"
    conn = get_conn()
    try:
        rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def mapping_stats():
    """命中率统计：已映射营业部数 / 总映射条数 / 各类型数量。"""
    conn = get_conn()
    try:
        total = conn.execute("SELECT COUNT(*) AS c FROM youzi_mapping").fetchone()["c"]
        by_type = conn.execute(
            "SELECT youzi_type, COUNT(*) AS c FROM youzi_mapping GROUP BY youzi_type"
        ).fetchall()
        return {
            "total": total,
            "by_type": {r["youzi_type"]: r["c"] for r in by_type},
        }
    finally:
        conn.close()


if __name__ == "__main__":
    seed_mapping()
    print("seed done:", mapping_stats())
    print(match_youzi("华鑫证券上海宛平南路证券营业部"))
    print(match_youzi("华鑫证券上海宛平南路某营业部"))  # 模糊
