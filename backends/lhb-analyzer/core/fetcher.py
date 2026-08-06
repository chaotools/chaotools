"""数据抓取层：AkShare 实时抓取 / CSV·JSON 导入 / 离线演示数据。

统一输出规范记录：
{trade_date, stock_code, stock_name, branch_name, branch_code,
 side, amount, reason, pct_change, close_price, raw_json}
"""
import csv
import json
import os
import random
import sys
import time
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import DEMO_DATES
from db.database import upsert_records


def _fetch_detail(ak, symbol, ymd, flag, retries=3, backoff=1.5):
    """带重试地取单只票单方向的席位明细，规避东方财富限流（否则会被静默跳过导致席位缺失）。"""
    last = None
    for attempt in range(retries):
        try:
            df = ak.stock_lhb_stock_detail_em(symbol=symbol, date=ymd, flag=flag)
            return df
        except Exception as e:
            last = e
            if attempt < retries - 1:
                time.sleep(backoff * (attempt + 1))
    print(f"[fetch] detail {symbol}/{flag} 失败（已重试 {retries} 次）: {last}")
    return None

# AkShare 接口列名（不同版本可能有差异，关键词容错见 _pick 系列）
BUY_BRANCH_KEYS = ["买入营业部", "买入席位", "买方营业部", "买入机构"]
BUY_AMOUNT_KEYS = ["买入金额", "买入额度", "买入总计"]
SELL_BRANCH_KEYS = ["卖出营业部", "卖出席位", "卖方营业部", "卖出机构"]
SELL_AMOUNT_KEYS = ["卖出金额", "卖出额度", "卖出总计"]


def _pick(d, keys):
    """从 dict 中按候选键名取第一个存在的值。"""
    if not isinstance(d, dict):
        return None
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return d[k]
    # 退而求其次：包含关键词的列
    for k in list(d.keys()):
        for kw in keys:
            if kw in str(k):
                return d[k]
    return None


def _to_float(v):
    try:
        return float(str(v).replace(",", "").replace("万", "0000").replace("亿", "00000000"))
    except (TypeError, ValueError):
        return 0.0


# ---------------------------------------------------------------------------
# 1) AkShare 实时抓取
# ---------------------------------------------------------------------------
def fetch_akshare_date(date):
    """抓取指定日期龙虎榜明细。需联网且已安装 akshare (>=1.x)。

    适配 akshare 1.18+：
      - 上榜清单用 stock_lhb_detail_em(start_date, end_date)（区间）
      - 买卖席位用 stock_lhb_stock_detail_em(symbol, date, flag='买入'/'卖出')

    返回规范记录列表；接口异常或无数据返回空列表。
    """
    try:
        import akshare as ak
    except ImportError:
        raise RuntimeError("未安装 akshare，请先 `pip install akshare` 后再用 akshare 模式")

    ymd = date.replace("-", "")          # akshare 日期参数用 YYYYMMDD
    records = []

    # 1) 当日上榜清单
    try:
        detail = ak.stock_lhb_detail_em(start_date=ymd, end_date=ymd)
    except Exception as e:
        print(f"[fetch] detail failed: {e}")
        return records
    if detail is None or len(detail) == 0:
        return records

    code_col = _col(detail, "代码", "code")
    name_col = _col(detail, "名称", "name")
    reason_col = _col(detail, "上榜原因", "原因")
    pct_col = _col(detail, "涨跌幅")
    close_col = _col(detail, "收盘价")

    for _, row in detail.iterrows():
        stock_code = str(row[code_col]).strip() if code_col else ""
        if not stock_code:
            continue
        stock_name = str(row[name_col]).strip() if name_col else ""
        reason = str(row[reason_col]).strip() if reason_col else ""
        pct = _to_float(row[pct_col]) if pct_col else None
        close = _to_float(row[close_col]) if close_col else None

        # 2) 逐只票取买卖席位明细（买入 / 卖出 两次调用，带重试+节流）
        bcount = {}  # (side, branch_name) -> 出现次数，用于同名席位去重
        for flag, side in (("买入", "buy"), ("卖出", "sell")):
            stat = _fetch_detail(ak, stock_code, ymd, flag, 4, 0.5)
            if stat is None or len(stat) == 0:
                continue
            amt_col = "买入金额" if side == "buy" else "卖出金额"
            branch_col = _col(stat, "交易营业部名称", "营业部", "branch")
            if branch_col is None:
                continue
            for _, s in stat.iterrows():
                branch = str(s.get(branch_col, "")).strip()
                if not branch:
                    continue
                amt = _to_float(s.get(amt_col))
                if amt == 0:
                    continue
                # 同一 (股票,方向) 下营业部名可能重复(如多个"机构专用"),
                # 需加序号去重,否则 UNIQUE 约束会把同名列合并成一条。
                key = (side, branch)
                n = bcount.get(key, 0) + 1
                bcount[key] = n
                bname = f"{branch} #{n}" if n > 1 else branch
                records.append(_mk(date, stock_code, stock_name, bname, side,
                                   amt, reason, pct, close, s.to_dict()))
            time.sleep(0.5)  # 放慢节奏，避免连续请求被限流
    return records


def _col(df, *cands):
    """从 DataFrame 中按候选列名取第一个存在的列。"""
    cols = list(df.columns)
    for c in cands:
        if c in cols:
            return c
    # 包含匹配兜底
    for c in cols:
        for kw in cands:
            if kw in str(c):
                return c
    return None


def _mk(date, code, name, branch, side, amount, reason, pct, close, raw):
    return {
        "trade_date": date,
        "stock_code": code,
        "stock_name": name,
        "branch_name": str(branch),
        "branch_code": None,
        "side": side,
        "amount": amount,
        "reason": reason,
        "pct_change": pct,
        "close_price": close,
        "raw_json": json.dumps(raw, ensure_ascii=False, default=str),
    }


# ---------------------------------------------------------------------------
# 2) 导入
# ---------------------------------------------------------------------------
def _field(row, *cands):
    """从一行（dict）中按中英文候选键取字段。"""
    lower = {str(k).lower(): v for k, v in row.items()}
    for c in cands:
        if c in row and row[c] not in (None, ""):
            return row[c]
        if str(c).lower() in lower and lower[str(c).lower()] not in (None, ""):
            return lower[str(c).lower()]
    return None


def import_json(path):
    """导入 JSON。支持 [ {记录}, ... ] 或 { "records": [...] } 两种结构。"""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    rows = data.get("records", data) if isinstance(data, dict) else data
    records = []
    for r in rows:
        records.append(_mk(
            _field(r, "trade_date", "日期", "date"),
            _field(r, "stock_code", "代码", "code"),
            _field(r, "stock_name", "名称", "name"),
            _field(r, "branch_name", "营业部", "branch", "席位"),
            _field(r, "side", "方向", "买卖") or "buy",
            _to_float(_field(r, "amount", "金额")),
            _field(r, "reason", "原因", "上榜原因"),
            _to_float(_field(r, "pct_change", "涨跌幅")),
            _to_float(_field(r, "close_price", "收盘价")),
            r,
        ))
    return upsert_records(records)


def import_csv(path):
    """导入 CSV，表头容忍中英文，兼容两种格式：

    1) 规范式：每行一个 (营业部, 方向)，含 `side`(方向/买卖) + `amount`(金额) 列；
    2) 东方财富式：买/卖金额同列，含 `买入金额`/`卖出金额`（无 side 列），
       自动拆成「买」「卖」两条记录。

    日期字段兼容 trade_date/日期/date/成交日期；代码兼容 stock_code/代码/股票代码。
    """
    records = []
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for r in reader:
            date = _field(r, "trade_date", "日期", "date", "成交日期")
            code = _field(r, "stock_code", "代码", "code", "股票代码")
            name = _field(r, "stock_name", "名称", "name", "股票名称")
            branch = _field(r, "branch_name", "营业部", "branch", "席位",
                            "上榜营业部", "营业部名称")
            reason = _field(r, "reason", "原因", "上榜原因")
            pct = _to_float(_field(r, "pct_change", "涨跌幅"))
            close = _to_float(_field(r, "close_price", "收盘价"))

            buy_amt = _to_float(_field(r, "buy_amount", "买入金额", "买入额"))
            sell_amt = _to_float(_field(r, "sell_amount", "卖出金额", "卖出额"))
            side = _field(r, "side", "方向", "买卖")
            amount = _to_float(_field(r, "amount", "金额"))

            if buy_amt or sell_amt:
                # 东方财富式：买/卖金额在同一条记录 → 拆成两条
                if buy_amt:
                    records.append(_mk(date, code, name, branch, "buy",
                                       buy_amt, reason, pct, close, dict(r)))
                if sell_amt:
                    records.append(_mk(date, code, name, branch, "sell",
                                       sell_amt, reason, pct, close, dict(r)))
            else:
                # 规范式：side + amount（中文方向归一）
                s = "buy"
                if side:
                    if str(side) in ("买", "买入", "Buy", "B"):
                        s = "buy"
                    elif str(side) in ("卖", "卖出", "Sell", "S"):
                        s = "sell"
                records.append(_mk(date, code, name, branch, s,
                                   amount, reason, pct, close, dict(r)))
    return upsert_records(records)


# ---------------------------------------------------------------------------
# 3) 演示数据（稳定可复现）
# ---------------------------------------------------------------------------
_STOCKS = [
    ("600519", "贵州茅台"), ("000858", "五粮液"), ("300750", "宁德时代"),
    ("002594", "比亚迪"), ("601012", "隆基绿能"), ("000001", "平安银行"),
    ("600036", "招商银行"), ("300059", "东方财富"), ("002230", "科大讯飞"),
    ("688981", "中芯国际"), ("600900", "长江电力"), ("000625", "长安汽车"),
]
# 已知营业部（对应种子游资）
_KNOWN = [
    ("兴业证券陕西分公司", "方新侠"),
    ("华鑫证券上海宛平南路证券营业部", "炒股养家"),
    ("国泰君安证券南京太平南路证券营业部", "作手新一"),
    ("中信证券上海溧阳路证券营业部", "上海溧阳路"),
    ("国盛证券宁波桑田路证券营业部", "宁波桑田路"),
    ("国泰君安证券上海江苏路证券营业部", "章盟主"),
    ("中国银河证券绍兴证券营业部", "赵老哥"),
    ("南京证券南京大钟亭证券营业部", "小鳄鱼"),
    ("光大证券佛山绿景路证券营业部", "佛山系"),
    ("国泰君安证券成都北一环路证券营业部", "成都系"),
    ("华鑫证券有限责任公司上海分公司", "华鑫量化"),
    ("招商证券北京车公庄西路证券营业部", "宋庄路"),
    ("机构专用", "机构专用"),
    ("沪股通专用", "机构联动"),
    ("深股通专用", "深股通专用"),
    ("华泰证券天津东丽开发区二纬路证券营业部", "交易猿"),
    ("财通证券杭州上塘路证券营业部", "上塘路"),
]
# 通用营业部（拉萨/沪深股通等，无明确游资）
_GENERIC = [
    ("东方财富证券拉萨团结路第一营业部", None),
    ("东方财富证券拉萨东环路第二营业部", None),
    ("东方财富证券拉萨金融城南环路营业部", None),
    ("中信证券上海分公司", None),
    ("国泰君安证券总部", None),
]


def demo_data(dates=None):
    """生成稳定演示数据。

    用日期作随机种子，相同日期结果一致。人为注入两组协同买入组合：
    方新侠+作手新一、炒股养家+上海溧阳路。
    """
    dates = dates or DEMO_DATES
    records = []
    for d in dates:
        rng = random.Random(d)  # 以日期为种子 → 可复现
        for code, name in _STOCKS:
            # 随机选 4~7 个营业部参与，含已知+通用
            n_known = rng.randint(2, 4)
            known_pick = rng.sample(_KNOWN, n_known)
            generic_pick = rng.sample(_GENERIC, rng.randint(1, 3))
            pct = round(rng.uniform(-9.5, 10.0), 2)
            close = round(rng.uniform(5, 1800), 2)
            reason = rng.choice(["日涨幅偏离值达7%", "日换手率达20%", "连续三个交易日涨幅偏离20%", "振幅值达15%"])
            for bname, yname in known_pick + generic_pick:
                buy_amt = round(rng.uniform(500, 8000), 2) * 10000
                sell_amt = round(rng.uniform(200, 4000), 2) * 10000
                records.append(_mk(d, code, name, bname, "buy", buy_amt, reason, pct, close, {"y": yname}))
                records.append(_mk(d, code, name, bname, "sell", sell_amt, reason, pct, close, {"y": yname}))

        # 注入协同组合 A：方新侠 + 作手新一 同买 600519
        _inject_collab(records, d, "600519", "贵州茅台", "兴业证券陕西分公司", "国泰君安证券南京太平南路证券营业部")
        # 注入协同组合 B：炒股养家 + 上海溧阳路 同买 300750
        _inject_collab(records, d, "300750", "宁德时代", "华鑫证券上海宛平南路证券营业部", "中信证券上海溧阳路证券营业部")
    return records


def _inject_collab(records, date, code, name, b1, b2):
    pct, close = 9.5, 1700.0
    for b in (b1, b2):
        records.append(_mk(date, code, name, b, "buy", 60000000 + hash(b) % 20000000, "日涨幅偏离值达7%", pct, close, {}))
        records.append(_mk(date, code, name, b, "sell", 10000000 + hash(b) % 5000000, "日涨幅偏离值达7%", pct, close, {}))


def load_demo():
    """生成并写入演示数据，返回写入行数。"""
    return upsert_records(demo_data())


if __name__ == "__main__":
    n = load_demo()
    print(f"demo data loaded: {n} rows")
