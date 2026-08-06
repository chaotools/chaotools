"""
证件照换底色 API 服务
基于 HivisionIDPhotos，单端口多路由
启动: ./venv/bin/uvicorn server:app --host 0.0.0.0 --port 8000
"""
import sys, os, re, base64, cv2, numpy as np, functools, json
print = functools.partial(print, flush=True)
from collections import defaultdict
from fastapi import FastAPI, UploadFile, Form, File, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.formparsers import MultiPartParser

# 引入 HivisionIDPhotos
sys.path.insert(0, '/home/ubuntu/hivision-idphotos')
from hivision import IDCreator
from hivision.creator.choose_handler import choose_handler
from hivision.utils import add_background, hex_to_rgb, bytes_2_base64, save_image_dpi_to_bytes

MultiPartParser.max_file_size = 20 * 1024 * 1024  # 20MB

app = FastAPI()
ALLOWED_ORIGINS = [
    "https://chaotools.tech",
    "https://www.chaotools.tech",
    "https://api.chaotools.tech",
]
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["*"], allow_headers=["*"])

_RATE: dict[str, list[float]] = defaultdict(list)


def _client_ip(req: Request) -> str:
    xff = req.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return req.client.host if req.client else "unknown"


def _check_rate(key: str, limit: int, window: float = 60.0) -> None:
    now = time.monotonic()
    bucket = _RATE[key]
    bucket[:] = [t for t in bucket if t > now - window]
    if len(bucket) >= limit:
        raise HTTPException(429, "Too many requests, please try again later")
    bucket.append(now)


@app.middleware("http")
async def _rate_middleware(req: Request, call_next):
    ip = _client_ip(req)
    path = req.url.path
    if path.startswith("/api/id-photo"):
        _check_rate(f"{ip}:id", 6, 60)
    elif path.startswith("/api/error-report"):
        _check_rate(f"{ip}:err", 20, 60)
    elif path.startswith("/api/security"):
        _check_rate(f"{ip}:sec", 30, 60)
    else:
        _check_rate(f"{ip}:all", 120, 60)
    return await call_next(req)

creator = IDCreator()
choose_handler(creator, "modnet_photographic_portrait_matting", "mtcnn")


@app.post("/api/id-photo")
async def id_photo(
    file: UploadFile = File(...),
    bgColor: str = Form("#ffffff"),
    size: str = Form("1inch"),
):
    """证件照换底色: 上传图片 → 抠图 → 换底色 → 返回 base64"""
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", bgColor or ""):
        raise HTTPException(400, "bgColor 必须是 #RRGGBB 格式")
    # 1. 读取上传图片
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(400, "空文件")
    if len(image_bytes) > 20 * 1024 * 1024:
        raise HTTPException(413, "图片过大（上限 20MB）")
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "无法解析图片")
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    # 2. 抠图（仅换底，不裁剪尺寸）
    result = creator(img, change_bg_only=True)
    matted = result.standard  # RGBA numpy
    a_ch = matted[:,:,3]
    print(f'[DEBUG] matted: {matted.shape}, alpha: min={a_ch.min()} max={a_ch.max()} mean={a_ch.mean():.1f}')
    print(f'[DEBUG] alpha>0: {(a_ch>0).sum()/a_ch.size*100:.1f}%, alpha>200: {(a_ch>200).sum()/a_ch.size*100:.1f}%, alpha=255: {(a_ch==255).sum()/a_ch.size*100:.1f}%')

    # 3. 优化 alpha 通道：边缘腐蚀去掉原背景残留
    alpha = matted[:,:,3].copy()
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    # 先腐蚀去掉边缘过渡区的原背景残留
    alpha_eroded = cv2.erode(alpha, kernel, iterations=1)
    # 再轻微膨胀恢复边缘
    alpha_clean = cv2.dilate(alpha_eroded, kernel, iterations=1)
    matted[:,:,3] = alpha_clean

    # 4. 添加目标底色（add_background 需要 BGRA 输入）
    matted_bgra = cv2.cvtColor(matted, cv2.COLOR_RGBA2BGRA)
    color = hex_to_rgb(bgColor)
    bgr = (color[2], color[1], color[0])
    final = add_background(matted_bgra, bgr=bgr)
    print(f'[DEBUG] final: {final.shape}, dtype={final.dtype}, min={final.min():.1f}, max={final.max():.1f}')

    # 5. BGR → RGB → JPEG base64
    final = final.clip(0, 255).astype(np.uint8)
    final_rgb = cv2.cvtColor(final, cv2.COLOR_BGR2RGB)
    jpg_bytes = save_image_dpi_to_bytes(final_rgb, None, 300)
    b64 = bytes_2_base64(jpg_bytes)

    return {"status": True, "base64": b64}


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "id-photo"}


@app.post("/api/error-report")
async def error_report(req: Request):
    """小程序错误上报 — 工具失效时快速定位
    接收批量错误，写入 /var/log/miniapp-errors.log
    """
    try:
        cl = req.headers.get("content-length")
        if cl and cl.isdigit() and int(cl) > 200 * 1024:
            return {"ok": False, "error": "payload too large"}
        body = await req.json()
        errors = body.get('errors', [])
        if not isinstance(errors, list) or len(errors) > 50:
            return {"ok": False, "error": "invalid errors payload"}
        log_dir = '/var/log'
        log_path = os.path.join(log_dir, 'miniapp-errors.log')
        os.makedirs(log_dir, exist_ok=True)

        def safe_str(v):
            if isinstance(v, str):
                return v.replace("\r", " ").replace("\n", " ")[:500]
            return v

        with open(log_path, 'a', encoding='utf-8') as f:
            for e in errors:
                if not isinstance(e, dict):
                    continue
                line = json.dumps({
                    'time': safe_str(e.get('timestamp')),
                    'tool': safe_str(e.get('toolId')),
                    'type': safe_str(e.get('errorType')),
                    'msg': safe_str(e.get('message')),
                    'device': safe_str(e.get('device')),
                    'sys': safe_str(e.get('system')),
                    'SDK': safe_str(e.get('SDK')),
                    'page': safe_str(e.get('page')),
                    'openid': safe_str(e.get('openid')),
                    'extra': safe_str(e.get('extra')),
                }, ensure_ascii=False)
                f.write(line + '\n')
        print(f'[ERROR-REPORT] received {len(errors)} errors', flush=True)
        return {"ok": True, "count": len(errors)}
    except Exception as e:
        print(f'[ERROR-REPORT] failed: {e}', flush=True)
        return {"ok": False, "error": str(e)}
import time, threading, urllib.request, urllib.error

# ============ 微信内容安全（msg_sec_check / img_sec_check）============
_WX_APPID = os.getenv("WX_APPID", "")
_WX_APPSECRET = os.getenv("WX_APPSECRET", "")
_SEC_TOKEN = {"token": None, "expire": 0.0}
_SEC_LOCK = threading.Lock()



def _code2openid(code):
    if not code or not _WX_APPSECRET:
        return None
    url = ("https://api.weixin.qq.com/sns/jscode2session?appid=" + _WX_APPID +
           "&secret=" + _WX_APPSECRET + "&js_code=" + code +
           "&grant_type=authorization_code")
    try:
        with urllib.request.urlopen(url, timeout=8) as resp:
            d = json.loads(resp.read().decode("utf-8"))
        if "openid" in d:
            return d["openid"]
        print("[SEC] code2openid err: " + str(d), flush=True)
    except Exception as e:
        print("[SEC] code2openid failed: " + str(e), flush=True)
    return None

def _get_wx_token():
    now = time.time()
    with _SEC_LOCK:
        if _SEC_TOKEN["token"] and now < _SEC_TOKEN["expire"] - 300:
            return _SEC_TOKEN["token"]
    if not _WX_APPSECRET:
        return None
    url = ("https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential"
           "&appid=" + _WX_APPID + "&secret=" + _WX_APPSECRET)
    try:
        with urllib.request.urlopen(url, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        if "access_token" in data:
            with _SEC_LOCK:
                _SEC_TOKEN["token"] = data["access_token"]
                _SEC_TOKEN["expire"] = now + float(data.get("expires_in", 7200))
            return data["access_token"]
    except Exception as e:
        print("[SEC] get token failed: " + str(e), flush=True)
    return None


def _wx_post(path, body_bytes, content_type):
    token = _get_wx_token()
    if not token:
        return None
    url = "https://api.weixin.qq.com" + path + "?access_token=" + token
    req = urllib.request.Request(url, data=body_bytes,
                                 headers={"Content-Type": content_type})
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode("utf-8"))
        except Exception:
            return {"errcode": -1, "errmsg": str(e)}
    except Exception as e:
        print("[SEC] call failed: " + str(e), flush=True)
        return None


def _img_multipart(img_bytes):
    boundary = "----secboundary7ma4yw"
    body = b""
    body += ("--" + boundary + "\r\n").encode()
    body += b'Content-Disposition: form-data; name="media"; filename="sec.jpg"\r\n'
    body += b"Content-Type: image/jpeg\r\n\r\n"
    body += img_bytes + b"\r\n"
    body += ("--" + boundary + "--\r\n").encode()
    return body, "multipart/form-data; boundary=" + boundary


@app.post("/api/security/check")
async def security_check(req: Request):
    """内容安全检测：文本(msg_sec_check) + 图片(img_sec_check)。
    返回 {risky, degraded, detail}。degraded=true 表示检测服务不可用（异常降级放行，不误伤正常用户）。"""
    try:
        body = await req.json()
    except Exception:
        body = {}
    text = (body.get("text") or "").strip()
    openid = (body.get("openid") or "").strip()
    code = (body.get("code") or "").strip()
    if not openid and code:
        openid = _code2openid(code)
    image_b64 = body.get("image_base64") or body.get("image") or ""
    if "," in image_b64:
        image_b64 = image_b64.split(",", 1)[1]
    result = {"risky": False, "degraded": False, "detail": {}}
    if text:
        r = _wx_post("/wxa/msg_sec_check",
                     json.dumps({"content": text, "version": 2, "scene": 2, "openid": openid}).encode("utf-8"),
                     "application/json")
        if r is None:
            result["degraded"] = True
            result["risky"] = True
            result["detail"]["text"] = "service_unavailable_blocked"
        elif r.get("errcode") == 87014:
            result["risky"] = True
            result["detail"]["text"] = "blocked"
        elif r.get("errcode", 0) != 0:
            result["degraded"] = True
            result["risky"] = True
            result["detail"]["text"] = "service_error_blocked"
    if image_b64:
        try:
            img_bytes = base64.b64decode(image_b64)
        except Exception:
            img_bytes = b""
        if img_bytes:
            if len(img_bytes) > 1024 * 1024:
                result["detail"]["image"] = "too_large"
                result["degraded"] = True
            else:
                body_b, ctype = _img_multipart(img_bytes)
                r = _wx_post("/wxa/img_sec_check", body_b, ctype)
                if r is None:
                    result["degraded"] = True
                    result["risky"] = True
                    result["detail"]["image"] = "service_unavailable_blocked"
                elif r.get("errcode") == 87014:
                    result["risky"] = True
                    result["detail"]["image"] = "blocked"
                elif r.get("errcode", 0) != 0:
                    result["degraded"] = True
                    result["risky"] = True
                    result["detail"]["image"] = "service_error_blocked"
    return result


@app.get("/api/security/health")
async def security_health():
    return {"ok": True, "appid": _WX_APPID, "has_secret": bool(_WX_APPSECRET)}

# ============ 登录态：code 换 token ============
def _mint_token(openid):
    import hmac, hashlib, time, base64
    exp = int(time.time()) + 60 * 60 * 24 * 30  # 30 天有效期
    payload = "%s.%d" % (openid, exp)
    sig = hmac.new(_WX_APPSECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    raw = ("%s.%s" % (payload, sig)).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("utf-8")


def _verify_token(token):
    import hmac, hashlib, time, base64
    try:
        raw = base64.urlsafe_b64decode(token.encode("utf-8")).decode("utf-8")
        parts = raw.split(".")
        if len(parts) != 3:
            return None
        openid, exp, sig = parts
        if int(exp) < time.time():
            return None
        expect = hmac.new(_WX_APPSECRET.encode("utf-8"), ("%s.%s" % (openid, exp)).encode("utf-8"), hashlib.sha256).hexdigest()
        if hmac.compare_digest(expect, sig):
            return openid
    except Exception:
        pass
    return None


@app.post("/api/auth/login")
async def auth_login(req: Request):
    """登录：code -> openid -> 签发 HMAC token。返回 {ok, token, openid}。"""
    try:
        body = await req.json()
    except Exception:
        body = {}
    code = (body.get("code") or "").strip()
    openid = _code2openid(code)
    if not openid:
        return {"ok": False, "msg": "invalid code"}
    token = _mint_token(openid)
    return {"ok": True, "token": token, "openid": openid, "profile": None}

__PATCH_AUTH_OK__ = True

import time as _time
import urllib.request as _urllib_req
import json as _json
from datetime import datetime, timezone as _tz

_RATE_CACHE = {"ts": 0.0, "data": None, "updatedAt": None, "ttl": 3600}  # 缓存1小时
_RATE_URL = "https://open.er-api.com/v6/latest/USD"


@app.get("/api/rate")
def rate():
    """汇率代理：拉取相对 USD 的实时汇率，服务端缓存1小时。
    前端走 chaotools.tech/api/rate（已白名单），零新增域名。"""
    now = _time.time()
    if _RATE_CACHE["data"] and (now - _RATE_CACHE["ts"]) < _RATE_CACHE["ttl"]:
        return {
            "ok": True,
            "base": "USD",
            "rates": _RATE_CACHE["data"],
            "updatedAt": _RATE_CACHE["updatedAt"],
        }
    try:
        req = _urllib_req.Request(_RATE_URL, headers={"User-Agent": "miniapp-toolbox"})
        with _urllib_req.urlopen(req, timeout=8) as resp:
            payload = _json.loads(resp.read().decode("utf-8"))
        rates = payload.get("rates", {})
        if not rates:
            raise ValueError("empty rates")
        _RATE_CACHE["data"] = rates
        _RATE_CACHE["ts"] = now
        updated = payload.get("time_last_update_utc") or datetime.now(_tz.utc).isoformat()
        _RATE_CACHE["updatedAt"] = updated
        return {"ok": True, "base": "USD", "rates": rates, "updatedAt": updated}
    except Exception as e:
        print(f"[RATE] fetch failed: {e}", flush=True)
        if _RATE_CACHE["data"]:
            return {
                "ok": True,
                "base": "USD",
                "rates": _RATE_CACHE["data"],
                "updatedAt": _RATE_CACHE["updatedAt"],
                "stale": True,
            }
        return {"ok": False, "error": str(e)}
