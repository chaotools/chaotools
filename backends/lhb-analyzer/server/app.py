"""标准库 http.server 实现的 JSON API + 静态前端。

零 Web 框架依赖。支持 GET/POST/PUT/DELETE，统一 JSON 响应，
错误统一为 {"ok": false, "error": "..."}。
"""
import json
import os
import sys
import time as _time
from collections import defaultdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config
from db.database import init_db, list_dates, count_records, get_records_branches
from core.fetcher import fetch_akshare_date, import_json, import_csv, load_demo
from core.youzi import (
    seed_mapping, list_mappings, create_mapping,
    update_mapping, delete_mapping, mapping_stats,
)
from core.analyzer import (
    analyze_stocks, analyze_youzi, analyze_collab,
    analyze_netinflow, analyze_history,
    analyze_youzi_on_date, analyze_stock_on_date,
    analyze_reasons, analyze_camp, analyze_heat, analyze_collab_graph,
    analyze_concentration, analyze_branch_activity,
    analyze_limit_up, analyze_netpct,
)
from core.report import get_report

ALLOWED_ORIGINS = {"https://chaotools.tech", "https://www.chaotools.tech"}
_RATE: dict = defaultdict(list)

# 路由表：method -> {path_prefix: handler}
# handler(self, params, body) -> dict


class APIHandler(BaseHTTPRequestHandler):
    # ---- 基础工具 ----
    def _client_ip(self):
        xff = self.headers.get("X-Forwarded-For", "")
        if xff:
            return xff.split(",")[0].strip()
        return self.client_address[0]

    def _check_rate(self, bucket, limit, window=60):
        ip = self._client_ip()
        key = f"{ip}:{bucket}"
        now = _time.monotonic()
        lst = _RATE[key]
        lst[:] = [t for t in lst if t > now - window]
        if len(lst) >= limit:
            self._err("rate limit exceeded", 429)
            return False
        lst.append(now)
        return True

    def _q_int(self, key, default, maxv=100000):
        try:
            v = int(self._q(key, default))
        except (TypeError, ValueError):
            return default
        return max(1, min(v, maxv))

    def _send_json(self, obj, status=200):
        data = json.dumps(obj, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(data)

    def _ok(self, data=None, **kw):
        self._send_json({"ok": True, **(data if isinstance(data, dict) else {"data": data}), **kw})

    def _err(self, msg, status=400):
        self._send_json({"ok": False, "error": msg}, status)

    def _body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, TypeError):
            return {}

    def _params(self):
        return parse_qs(urlparse(self.path).query)

    def _q(self, key, default=None):
        v = self._params().get(key)
        return v[0] if v else default

    def _opt(self, *keys, default=None):
        for k in keys:
            v = self._q(k)
            if v is not None:
                return v
        return default

    def log_message(self, fmt, *args):
        sys.stdout.write("[api] " + (fmt % args) + "\n")

    # ---- 路由 ----
    def do_OPTIONS(self):
        self._send_json({})

    def do_GET(self):
        try:
            if not self._check_rate("all", 120):
                return
            self._route("GET")
        except Exception as e:  # noqa
            self._err(f"{type(e).__name__}: {e}", 500)

    def do_POST(self):
        try:
            if not self._check_rate("all", 120):
                return
            self._route("POST")
        except Exception as e:  # noqa
            self._err(f"{type(e).__name__}: {e}", 500)

    def do_PUT(self):
        try:
            if not self._check_rate("all", 120):
                return
            self._route("PUT")
        except Exception as e:  # noqa
            self._err(f"{type(e).__name__}: {e}", 500)

    def do_DELETE(self):
        try:
            if not self._check_rate("all", 120):
                return
            self._route("DELETE")
        except Exception as e:  # noqa
            self._err(f"{type(e).__name__}: {e}", 500)

    def _route(self, method):
        path = urlparse(self.path).path
        body = self._body() if method in ("POST", "PUT") else {}

        # 静态首页
        if method == "GET" and path in ("/", "/index.html"):
            return self._serve_index()

        # 映射路径参数：/api/mappings/<id>
        if path.startswith("/api/mappings/"):
            mid = path.rsplit("/", 1)[-1]
            if not mid.isdigit():
                return self._err("invalid mapping id")
            if method == "PUT":
                if not self._check_rate("map_write", 10):
                    return
                n = update_mapping(int(mid), **body)
                return self._ok({"updated": n}) if n else self._err("not found", 404)
            if method == "DELETE":
                if not self._check_rate("map_write", 10):
                    return
                n = delete_mapping(int(mid))
                return self._ok({"deleted": n}) if n else self._err("not found", 404)
            return self._err("method not allowed", 405)

        if not path.startswith("/api/"):
            return self._err("not found", 404)

        # 精确路由
        handlers = {
            ("GET", "/api/health"): self._h_health,
            ("POST", "/api/fetch"): self._h_fetch,
            ("GET", "/api/dates"): self._h_dates,
            ("GET", "/api/report"): self._h_report,
            ("GET", "/api/analysis/stocks"): self._h_stocks,
            ("GET", "/api/analysis/youzi"): self._h_youzi,
            ("GET", "/api/analysis/collab"): self._h_collab,
            ("GET", "/api/analysis/netinflow"): self._h_netinflow,
            ("GET", "/api/analysis/youzi-detail"): self._h_youzi_detail,
            ("GET", "/api/analysis/stock-detail"): self._h_stock_detail,
            ("GET", "/api/analysis/reasons"): self._h_reasons,
            ("GET", "/api/analysis/camp"): self._h_camp,
            ("GET", "/api/analysis/heat"): self._h_heat,
            ("GET", "/api/analysis/collab-graph"): self._h_collab_graph,
            ("GET", "/api/analysis/concentration"): self._h_concentration,
            ("GET", "/api/analysis/branch-activity"): self._h_branch_activity,
            ("GET", "/api/analysis/limit-up"): self._h_limit_up,
            ("GET", "/api/analysis/net-pct"): self._h_net_pct,
            ("GET", "/api/mappings"): self._h_mappings,
            ("POST", "/api/mappings"): self._h_mapping_create,
            ("GET", "/api/history"): self._h_history,
        }
        h = handlers.get((method, path))
        if not h:
            return self._err("no such api", 404)
        return h(body)

    # ---- 各接口 ----
    def _serve_index(self):
        with open(config.FRONTEND_INDEX, "r", encoding="utf-8") as f:
            html = f.read().encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(html)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(html)

    def _h_health(self, body):
        self._ok({"status": "up", "records": count_records()})

    def _h_fetch(self, body):
        mode = body.get("mode", "demo")
        date = body.get("date")
        if mode == "import":
            return self._err("import mode disabled", 403)
        if not self._check_rate("fetch", 5):
            return
        if mode == "akshare":
            if not date:
                return self._err("akshare 模式需要 date")
            try:
                rows = fetch_akshare_date(date)
            except RuntimeError as e:
                return self._err(str(e))
            n = load_rows(rows)
            self._ok({"inserted": n, "mode": mode})
        else:  # demo
            n = load_demo() if not date else load_rows(load_demo_dates([date]))
            self._ok({"inserted": n, "mode": "demo"})

    def _h_dates(self, body):
        self._ok({"dates": list_dates()})

    def _h_report(self, body):
        date = self._q("date")
        if not date:
            dates = list_dates()
            date = dates[0] if dates else None
        if not date:
            return self._err("无数据，请先抓取/导入")
        top_n = self._q_int("top_n", 100000, 100000)
        force = self._q("force") == "1"
        rep = get_report(date, top_n=top_n, force=force)
        self._ok(rep)

    def _h_stocks(self, body):
        start, end = self._q("start"), self._q("end")
        limit = self._q_int("limit", 50, 5000)
        self._ok({"items": analyze_stocks(start, end, limit)})

    def _h_youzi(self, body):
        start, end = self._q("start"), self._q("end")
        youzi_type = self._q("youzi_type")
        self._ok({"items": analyze_youzi(start, end, youzi_type)})

    def _h_collab(self, body):
        start, end = self._q("start"), self._q("end")
        top = self._q_int("top", 300, 5000)
        youzi_type = self._q("youzi_type")
        self._ok(analyze_collab(start, end, top, youzi_type))

    def _h_netinflow(self, body):
        start, end = self._q("start"), self._q("end")
        limit = self._q_int("limit", 50, 5000)
        self._ok({"items": analyze_netinflow(start, end, limit)})

    def _h_youzi_detail(self, body):
        name = self._q("name")
        date = self._q("date")
        if not name or not date:
            return self._err("need name and date")
        self._ok(analyze_youzi_on_date(name, date))

    def _h_stock_detail(self, body):
        code = self._q("code")
        date = self._q("date")
        if not code or not date:
            return self._err("need code and date")
        self._ok(analyze_stock_on_date(code, date))

    def _h_reasons(self, body):
        start, end = self._q("start"), self._q("end")
        self._ok({"items": analyze_reasons(start, end)})

    def _h_camp(self, body):
        start, end = self._q("start"), self._q("end")
        youzi_type = self._q("youzi_type")
        self._ok({"items": analyze_camp(start, end, youzi_type)})

    def _h_heat(self, body):
        start, end = self._q("start"), self._q("end")
        self._ok({"items": analyze_heat(start, end)})

    def _h_collab_graph(self, body):
        start, end = self._q("start"), self._q("end")
        youzi_type = self._q("youzi_type")
        top = self._q_int("top", 40, 5000)
        self._ok(analyze_collab_graph(start, end, youzi_type, top))

    def _h_concentration(self, body):
        start, end = self._q("start"), self._q("end")
        limit = self._q_int("limit", 50, 5000)
        self._ok(analyze_concentration(start, end, limit))

    def _h_branch_activity(self, body):
        start, end = self._q("start"), self._q("end")
        youzi_type = self._q("youzi_type")
        limit = self._q_int("limit", 50, 5000)
        self._ok({"items": analyze_branch_activity(start, end, youzi_type, limit)})

    def _h_limit_up(self, body):
        start, end = self._q("start"), self._q("end")
        self._ok(analyze_limit_up(start, end))

    def _h_net_pct(self, body):
        start, end = self._q("start"), self._q("end")
        self._ok({"items": analyze_netpct(start, end)})

    def _h_mappings(self, body):
        search = self._q("search")
        ytype = self._q("youzi_type")
        if self._q("stats") == "1":
            self._ok({"stats": mapping_stats(), "items": list_mappings(search, ytype)})
        else:
            self._ok({"items": list_mappings(search, ytype)})

    def _h_mapping_create(self, body):
        if not self._check_rate("map_write", 10):
            return
        if not body.get("branch_name") or not body.get("youzi_name"):
            return self._err("branch_name 与 youzi_name 必填")
        mid = create_mapping(
            body["branch_name"], body["youzi_name"],
            body.get("youzi_type", "其他"),
            body.get("branch_code"), body.get("note"),
        )
        self._ok({"id": mid})

    def _h_history(self, body):
        stock = self._q("stock")
        youzi = self._q("youzi")
        start, end = self._q("start"), self._q("end")
        self._ok({"items": analyze_history(stock, youzi, start, end)})


def load_rows(rows):
    """把 fetcher 产出的规范记录写入库（内部使用 upsert）。"""
    from db.database import upsert_records
    return upsert_records(rows)


def load_demo_dates(dates):
    from core.fetcher import demo_data
    return demo_data(dates)


def run_server(host=config.SERVER_HOST, port=config.SERVER_PORT):
    init_db()
    server = ThreadingHTTPServer((host, port), APIHandler)
    print(f"龙虎榜分析服务已启动: http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n正在关闭...")
        server.shutdown()


if __name__ == "__main__":
    run_server()
