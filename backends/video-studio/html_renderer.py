"""
HTML 模板渲染服务 — 用 Playwright 渲染 HTML → PNG
"""
import os, re, json, asyncio, uuid
from pathlib import Path
from typing import Optional, Dict, Any, List

TEMPLATES_DIR = Path(__file__).parent / "html_templates"

# 全局 Playwright 浏览器实例（单例）
_playwright = None
_browser = None
_lock = asyncio.Lock()


class TemplateRenderService:
    """HTML 模板 → PNG 帧渲染服务"""

    def __init__(self, template_dir: str = None):
        self.templates_dir = Path(template_dir) if template_dir else TEMPLATES_DIR
        self._cache = {}  # 模板名 → HTML 内容
        self._template_list = None  # 缓存模板列表

    def list_templates(self) -> List[dict]:
        """列出所有可用模板（带缓存，修改后通过 _clear_cache 刷新）"""
        if self._template_list is not None:
            return self._template_list
        results = []
        if not self.templates_dir.exists():
            return results
        for size_dir in sorted(self.templates_dir.iterdir()):
            if not size_dir.is_dir():
                continue
            try:
                w, h = size_dir.name.split("x")
                width, height = int(w), int(h)
            except ValueError:
                continue
            for tpl_file in sorted(size_dir.glob("*.html")):
                # 解析模板参数
                content = self._load_template(tpl_file)
                params = self._parse_params(content)
                results.append({
                    "id": tpl_file.stem,
                    "file": str(tpl_file),
                    "name": tpl_file.stem,
                    "width": width,
                    "height": height,
                    "media_width": self._parse_media_meta(content, "template:media-width") or 1024,
                    "media_height": self._parse_media_meta(content, "template:media-height") or 1024,
                    "params": params,
                })
        self._template_list = results
        return results

    def _clear_template_cache(self):
        """清空列表缓存（保存/删除后调用）"""
        self._template_list = None

    def _load_template(self, path: Path) -> str:
        key = str(path)
        if key not in self._cache:
            self._cache[key] = path.read_text(encoding="utf-8")
        return self._cache[key]

    def _parse_params(self, html: str) -> Dict[str, Any]:
        """解析模板中的 {{param:type=default}} 占位符"""
        pattern = r'\{\{([a-zA-Z_][a-zA-Z0-9_]*)(?::([a-z]+))?(?:=([^}]+))?\}\}'
        params = {}
        PRESET = {"title", "text", "image", "index"}
        for m in re.finditer(pattern, html):
            name = m.group(1)
            if name in PRESET:
                continue
            if name in params:
                continue
            ptype = m.group(2) or "text"
            default = m.group(3) or ""
            if ptype == "number":
                try:
                    default = int(default) if "." not in default else float(default)
                except ValueError:
                    default = 0
            elif ptype == "bool":
                default = default.lower() in ("true", "1", "yes", "on")
            elif ptype == "color":
                default = default if default.startswith("#") else f"#{default}" if default else "#000000"
            params[name] = {"type": ptype, "default": default, "label": name}
        return params

    def _parse_media_meta(self, html: str, name: str) -> Optional[int]:
        m = re.search(f'<meta\\s+name="{name}"\\s+content="(\\d+)"', html)
        return int(m.group(1)) if m else None

    def _render_template_html(self, html: str, title: str, text: str, image: str,
                              ext: Optional[Dict] = None) -> str:
        """替换模板中的占位符"""
        values = {"title": title, "text": text, "image": image}
        if ext:
            values.update(ext)

        def replacer(m):
            name = m.group(1)
            if name in values:
                v = values[name]
                return "true" if isinstance(v, bool) else str(v) if v is not None else ""
            default = m.group(3)
            return default if default else ""
        return re.sub(r'\{\{([a-zA-Z_][a-zA-Z0-9_]*)(?::([a-z]+))?(?:=([^}]+))?\}\}', replacer, html)

    async def render_frame(self, template_id: str, title: str, text: str,
                           image: str = "", ext: Optional[Dict] = None,
                           output_path: Optional[str] = None) -> str:
        """渲染一帧 HTML → PNG"""
        # 找模板
        tpl_info = None
        for t in self.list_templates():
            if t["id"] == template_id:
                tpl_info = t
                break
        if not tpl_info:
            raise ValueError(f"Template '{template_id}' not found")

        tpl_path = Path(tpl_info["file"])
        html_content = self._load_template(tpl_path)
        rendered = self._render_template_html(html_content, title, text, image, ext)

        # 输出路径
        out_dir = Path(output_path).parent if output_path else Path("/home/ubuntu/video-studio/outputs")
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = output_path or str(out_dir / f"html_frame_{uuid.uuid4().hex[:12]}.png")

        # Playwright 渲染
        await self._render_with_playwright(rendered, tpl_info["width"], tpl_info["height"], out_path)
        return out_path

    async def _render_with_playwright(self, html: str, width: int, height: int, out_path: str):
        """用 Playwright 将 HTML 渲染为 PNG"""
        global _playwright, _browser

        async with _lock:
            try:
                needs_restart = _browser is None or not _browser.is_connected()
            except:
                needs_restart = True
            if needs_restart:
                # 创建新浏览器实例
                from playwright.async_api import async_playwright
                try:
                    if _browser:
                        await _browser.close()
                except:
                    pass
                try:
                    if _playwright:
                        await _playwright.stop()
                except:
                    pass
                _playwright = await async_playwright().start()
                _browser = await _playwright.chromium.launch(
                    executable_path="/snap/bin/chromium",
                    args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
                    headless=True,
                )

        page = await _browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
        try:
            await page.set_content(html, wait_until="domcontentloaded")
            # 等图片加载完（最多3秒）
            await page.wait_for_timeout(500)
            # 尝试等待图片，不阻塞
            try:
                await page.wait_for_function("() => document.readyState === 'complete'", timeout=3000)
            except:
                pass
            await page.screenshot(path=out_path, full_page=False)
        finally:
            await page.close()

    def get_template_source(self, template_id: str) -> Optional[dict]:
        """获取某个模板的 HTML 源码"""
        for t in self.list_templates():
            if t["id"] == template_id:
                path = Path(t["file"])
                return {"id": template_id, "html": path.read_text(encoding="utf-8"),
                        "width": t["width"], "height": t["height"]}
        return None

    def save_template(self, template_id: str, html: str,
                      width: int = 1080, height: int = 1920,
                      is_new: bool = False) -> dict:
        """保存或新建模板"""
        template_id = re.sub(r"[^a-zA-Z0-9_-]", "", template_id or "")
        if not template_id:
            raise ValueError("Invalid template id")
        if is_new:
            size_dir = self.templates_dir / f"{width}x{height}"
            size_dir.mkdir(parents=True, exist_ok=True)
            out_path = size_dir / f"{template_id}.html"
            if out_path.exists():
                raise FileExistsError(f"模板 '{template_id}' 已存在")
        else:
            # 查找现有文件
            found = None
            for size_dir in self.templates_dir.iterdir():
                if not size_dir.is_dir():
                    continue
                fp = size_dir / f"{template_id}.html"
                if fp.exists():
                    found = fp
                    break
            if not found:
                raise FileNotFoundError(f"模板 '{template_id}' 不存在")
            out_path = found

        out_path.write_text(html, encoding="utf-8")
        self._cache.pop(str(out_path), None)  # 清内容缓存
        self._clear_template_cache()  # 清列表缓存
        return {"id": template_id, "saved": True}

    def delete_template(self, template_id: str) -> bool:
        """删除模板"""
        template_id = re.sub(r"[^a-zA-Z0-9_-]", "", template_id or "")
        if not template_id:
            return False
        for size_dir in self.templates_dir.iterdir():
            if not size_dir.is_dir():
                continue
            fp = size_dir / f"{template_id}.html"
            if fp.exists():
                fp.unlink()
                self._cache.pop(str(fp), None)
                self._clear_template_cache()
                return True
        return False

    async def close(self):
        """关闭浏览器"""
        global _playwright, _browser
        if _browser:
            try:
                await _browser.close()
            except:
                pass
            _browser = None
        if _playwright:
            try:
                await _playwright.stop()
            except:
                pass
            _playwright = None
