"""对比 2026-07-22 重新抓取的龙虎榜数据与库中已存数据，不写入 DB。"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core.fetcher import fetch_akshare_date
from db.database import get_conn
from collections import defaultdict

DATE = "2026-07-22"

print(f"[1/3] 正在重新抓取 {DATE} 全量席位明细（只读，不写库）...")
fresh = fetch_akshare_date(DATE)
print(f"     重新抓取到 {len(fresh)} 条记录")

print("[2/3] 读取库中已存数据...")
con = get_conn()
cur = con.cursor()
cur.execute("SELECT trade_date, stock_code, stock_name, branch_name, side, amount FROM lhb_records WHERE trade_date=?", (DATE,))
stored = cur.fetchall()
con.close()
print(f"     库中已存 {len(stored)} 条记录")

def key(r):
    return (r["stock_code"], r["branch_name"], r["side"])

fresh_map = {}
for r in fresh:
    fresh_map[(r["stock_code"], r["branch_name"], r["side"])] = r["amount"]
stored_map = {}
for r in stored:
    stored_map[(r["stock_code"], r["branch_name"], r["side"])] = r["amount"]

# 股票集合对比
fresh_stocks = {r["stock_code"] for r in fresh}
stored_stocks = {r["stock_code"] for r in stored}

only_fresh_stocks = fresh_stocks - stored_stocks
only_stored_stocks = stored_stocks - fresh_stocks
common_stocks = fresh_stocks & stored_stocks

# 记录级差异
only_fresh = set(fresh_map) - set(stored_map)
only_stored = set(stored_map) - set(fresh_map)
amount_diff = []
for k in set(fresh_map) & set(stored_map):
    fa, sa = fresh_map[k], stored_map[k]
    if abs(fa - sa) > 1.0:  # 金额差异超过 1 元视为变化
        amount_diff.append((k, sa, fa, fa - sa))

print("[3/3] 对比结果")
print("=" * 60)
print(f"股票数: 重新抓取={len(fresh_stocks)}  库中={len(stored_stocks)}")
print(f"  仅重新抓取有、库中没有的股票: {sorted(only_fresh_stocks)}")
print(f"  仅库中有、重新抓取没有的股票: {sorted(only_stored_stocks)}")
print(f"  共同股票数: {len(common_stocks)}")
print(f"记录条数: 重新抓取={len(fresh)}  库中={len(stored)}")
print(f"  仅重新抓取多出的记录(新席位/新方向): {len(only_fresh)}")
print(f"  仅库中有、重新抓取缺失的记录: {len(only_stored)}")
print(f"  双方都有但金额不同的记录: {len(amount_diff)}")

# 每股票总额对比（共同股票）
def stock_total(m, stocks):
    d = defaultdict(float)
    for (code, branch, side), amt in m.items():
        d[code] += amt
    return d

ft = stock_total(fresh_map, common_stocks)
st = stock_total(stored_map, common_stocks)
stock_amt_diff = []
for code in sorted(common_stocks):
    if abs(ft[code] - st[code]) > 1.0:
        stock_amt_diff.append((code, st[code], ft[code], ft[code]-st[code]))
print(f"  共同股票中'买卖总额'不同的股票数: {len(stock_amt_diff)}")

result = {
    "date": DATE,
    "fresh_count": len(fresh), "stored_count": len(stored),
    "fresh_stocks": len(fresh_stocks), "stored_stocks": len(stored_stocks),
    "only_fresh_stocks": sorted(only_fresh_stocks),
    "only_stored_stocks": sorted(only_stored_stocks),
    "common_stocks": len(common_stocks),
    "only_fresh_records": len(only_fresh),
    "only_stored_records": len(only_stored),
    "amount_diff_count": len(amount_diff),
    "stock_amt_diff_count": len(stock_amt_diff),
    "only_fresh": [list(k) + [v] for k, v in [(k, fresh_map[k]) for k in only_fresh]],
    "only_stored": [list(k) + [v] for k, v in [(k, stored_map[k]) for k in only_stored]],
    "amount_diff": [(k[0], k[1], k[2], sa, fa, d) for (k, sa, fa, d) in amount_diff[:200]],
    "stock_amt_diff": stock_amt_diff[:200],
}
with open("data/compare_20260722.json", "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2, default=str)

# 打印明细样本
if only_fresh:
    print("\n--- 重新抓取多出记录(前20) ---")
    for row in result["only_fresh"][:20]:
        print("  ", row)
if only_stored:
    print("\n--- 库中多出(重新抓取缺失)记录(前20) ---")
    for row in result["only_stored"][:20]:
        print("  ", row)
if amount_diff:
    print("\n--- 金额变化记录(前30) [代码,营业部,方向,库值,新值,差值] ---")
    for row in result["amount_diff"][:30]:
        print("  ", row[0], row[1], row[2], row[3], row[4], row[5])
print("\n明细已写入 data/compare_20260722.json")
print("=" * 60)
same = not (only_fresh_stocks or only_stored_stocks or only_fresh or only_stored or amount_diff)
print("结论:", "完全一致 ✅" if same else "存在差异 ⚠️")
