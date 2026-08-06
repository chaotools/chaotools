"""项目入口。

用法：
    python run.py                # 仅启动 Web 服务（端口 8000）
    python run.py --schedule     # 启动服务 + 后台定时每日 17:30 抓取当日
    python run.py --fetch-today  # 抓取当日数据后退出（配合 crontab 使用）

注意：定时任务的 17:30 按「运行机器的本地时间」判断，生产环境请让机器
时区设为 Asia/Shanghai（北京时间）。实时抓取需已 pip install akshare 且联网。
"""
import os
import sys
import time
import threading
from datetime import datetime, date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
from db.database import init_db
from server.app import run_server
from core.fetcher import fetch_akshare_date, load_demo
from db.database import upsert_records


def fetch_today():
    """抓取当日龙虎榜。接口返回空（非交易日）则跳过。"""
    today = date.today().strftime("%Y-%m-%d")
    try:
        rows = fetch_akshare_date(today)
    except RuntimeError as e:
        print(f"[schedule] 跳过：{e}")
        return 0
    if not rows:
        print(f"[schedule] {today} 无数据（可能非交易日），跳过")
        return 0
    n = upsert_records(rows)
    print(f"[schedule] {today} 已写入 {n} 条")
    return n


def _scheduler_loop():
    """每分钟检查一次，命中 17:30 则触发抓取（每天一次）。"""
    target_h, target_m = map(int, config.SCHEDULE_TIME.split(":"))
    done_mark = ""
    while True:
        now = datetime.now()
        if now.hour == target_h and now.minute == target_m:
            mark = now.strftime("%Y-%m-%d")
            if mark != done_mark:          # 当天只抓一次
                done_mark = mark
                try:
                    fetch_today()
                except Exception as e:      # 单日失败不影响循环
                    print(f"[schedule] 抓取异常：{e}")
        time.sleep(30)


def main():
    args = sys.argv[1:]
    if "--fetch-today" in args:
        init_db()
        n = fetch_today()
        print(f"fetch-today done: {n} rows")
        return

    # 启动服务
    init_db()
    if "--schedule" in args:
        t = threading.Thread(target=_scheduler_loop, daemon=True)
        t.start()
        print(f"[schedule] 已启用，每日 {config.SCHEDULE_TIME}（本地时间）自动抓取")
    run_server(config.SERVER_HOST, config.SERVER_PORT)


if __name__ == "__main__":
    main()
