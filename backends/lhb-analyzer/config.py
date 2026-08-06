"""全局配置：路径、调度时间、金额格式化。

所有模块共用，避免把绝对路径/魔法数字散落到各处。
"""
import os

# ---- 路径 ----
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "lhb.db")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
FRONTEND_INDEX = os.path.join(FRONTEND_DIR, "index.html")

# ---- Web 服务 ----
SERVER_HOST = "127.0.0.1"
SERVER_PORT = 8000

# ---- 定时任务（北京时间，收盘后）----
SCHEDULE_TIME = "17:30"
# 非交易日接口返回空则跳过；这里只做"空结果跳过"，不依赖交易日历接口。

# ---- 演示/拉取控制 ----
DEMO_DATES = [
    "2024-06-12", "2024-06-13", "2024-06-14",
    "2024-06-17", "2024-06-18",
]


def fmt_amount(x):
    """金额格式化：自动切换 元 / 万 / 亿。

    >>> fmt_amount(123456789)
    '1.23亿'
    """
    if x is None:
        return "—"
    try:
        x = float(x)
    except (TypeError, ValueError):
        return "—"
    abs_x = abs(x)
    if abs_x >= 1e8:
        return f"{x / 1e8:.2f}亿"
    if abs_x >= 1e4:
        return f"{x / 1e4:.2f}万"
    return f"{x:.2f}"


def fmt_pct(x):
    """涨跌幅格式化，带正负号。"""
    if x is None:
        return "—"
    try:
        x = float(x)
    except (TypeError, ValueError):
        return "—"
    return f"{x:+.2f}%"


if __name__ == "__main__":
    print("BASE_DIR   :", BASE_DIR)
    print("DB_PATH    :", DB_PATH)
    print("fmt_amount :", fmt_amount(123456789), fmt_amount(12345), fmt_amount(123))
