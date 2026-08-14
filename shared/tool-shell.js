(function () {
  'use strict';

  var THEME_KEY = 'chaotools-theme';
  var root = document.documentElement;
  var body = document.body;

  function storedTheme() {
    try { return localStorage.getItem(THEME_KEY) || 'light'; } catch (_) { return 'light'; }
  }

  function resolvedTheme(mode) {
    if (mode === 'dark' || mode === 'light') return mode;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(mode) {
    var value = mode || 'light';
    var resolved = resolvedTheme(value);
    root.setAttribute('data-theme', resolved);
    root.setAttribute('data-theme-mode', value);
    body.setAttribute('data-theme', resolved);
    var toggle = document.querySelector('.ct-theme-toggle');
    if (toggle) {
      toggle.textContent = resolved === 'dark' ? '浅色' : '深色';
      toggle.setAttribute('aria-label', resolved === 'dark' ? '切换到浅色模式' : '切换到深色模式');
    }
  }

  function saveTheme(mode) {
    try { localStorage.setItem(THEME_KEY, mode); } catch (_) {}
    applyTheme(mode);
  }

  function createLink(href, text) {
    var link = document.createElement('a');
    link.href = href;
    link.textContent = text;
    return link;
  }

  function ensureShell() {
    var bar = document.querySelector('.ct-unibar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'ct-unibar';
      body.insertBefore(bar, body.firstChild);
    }
    bar.classList.add('ct-tool-shell');
    bar.replaceChildren();

    var brand = createLink('/', 'Chaotools');
    brand.className = 'ct-unibar__brand';
    brand.setAttribute('aria-label', 'Chaotools 首页');
    var mark = document.createElement('span');
    mark.className = 'ct-unibar__mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = 'CT';
    var name = document.createElement('span');
    name.textContent = 'Chaotools';
    brand.replaceChildren(mark, name);

    var menu = document.createElement('button');
    menu.type = 'button';
    menu.className = 'ct-unibar__menu';
    menu.textContent = '菜单';
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-controls', 'ct-tool-nav');

    var links = document.createElement('nav');
    links.id = 'ct-tool-nav';
    links.className = 'ct-unibar__links is-collapsed';
    links.setAttribute('aria-label', '工具导航');
    links.append(
      createLink('/', '首页'),
      createLink('/explore', '探索'),
      createLink('/my-tools', '我的工具')
    );

    var theme = document.createElement('button');
    theme.type = 'button';
    theme.className = 'ct-theme-toggle';
    theme.addEventListener('click', function () {
      var current = resolvedTheme(root.getAttribute('data-theme-mode') || storedTheme());
      saveTheme(current === 'dark' ? 'light' : 'dark');
    });

    menu.addEventListener('click', function () {
      var open = links.classList.toggle('is-open');
      links.classList.toggle('is-collapsed', !open);
      menu.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    bar.append(brand, links, theme, menu);
    applyTheme(storedTheme());
  }

  function ensureSkipLink() {
    if (!document.querySelector('.ct-skip-link')) {
      var skip = document.createElement('a');
      skip.className = 'ct-skip-link';
      skip.href = '#ct-main';
      skip.textContent = '跳到主要内容';
      body.insertBefore(skip, body.firstChild);
    }
    var target = document.getElementById('ct-main') || document.querySelector('main, .main, .container');
    if (target && !target.id) target.id = 'ct-main';
  }

  ensureShell();
  ensureSkipLink();

  if (window.matchMedia) {
    var media = window.matchMedia('(prefers-color-scheme: dark)');
    if (media.addEventListener) {
      media.addEventListener('change', function () {
        if (storedTheme() === 'system') applyTheme('system');
      });
    }
  }
  window.addEventListener('storage', function (event) {
    if (event.key === THEME_KEY) applyTheme(event.newValue || 'light');
  });
}());

