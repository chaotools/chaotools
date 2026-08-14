(() => {
  const API = '/api/relationship-memory';
  const TOKEN_KEY = 'relationship_memory_web_token';
  const SYNC_KEY = 'relationship_memory_web_sync';
  const state = {
    token: localStorage.getItem(TOKEN_KEY) || '',
    memories: [],
    events: [],
    profile: null,
    cursor: 0,
    pending: [],
    pairingTimer: null,
    selectedId: null,
    filter: 'all',
    type: 'like',
    editingId: null,
    modalMode: 'record',
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const typeInfo = {
    like: { label: '喜欢', icon: '♡', color: 'rose' },
    dislike: { label: '不喜欢', icon: '×', color: 'dislike' },
    wish: { label: '愿望', icon: '✦', color: 'wish' },
    habit: { label: '习惯 / 边界', icon: '⌁', color: 'habit' },
  };

  document.documentElement.classList.add('rm-sync-loading');
  const bootStyle = document.createElement('style');
  bootStyle.textContent = `.rm-sync-loading .app-shell,.rm-sync-loading .mobile-nav{visibility:hidden}.rm-boot{position:fixed;inset:0;z-index:999;display:flex;align-items:center;justify-content:center;padding:24px;background:#faf6f3;color:#29252d;font-family:"PingFang SC","Microsoft YaHei",sans-serif}.rm-boot-card{width:min(430px,100%);padding:32px;border:1px solid #eadfe3;border-radius:24px;background:#fffdf9;box-shadow:0 18px 48px rgba(69,44,59,.08);text-align:center}.rm-boot-mark{display:grid;width:48px;height:48px;margin:0 auto 16px;place-items:center;border-radius:15px 15px 15px 5px;background:#3b293f;color:#fff;font:28px Georgia,serif}.rm-boot h2{margin:0;font:400 25px Georgia,"Songti SC",serif}.rm-boot p{margin:10px 0 0;color:#958a8d;font-size:12px;line-height:1.7}.rm-boot-code{margin:20px 0 4px;color:#87536e;font:400 35px Georgia,serif;letter-spacing:.16em}.rm-boot-hint{color:#958a8d;font-size:11px}.rm-boot button{margin-top:18px;padding:10px 15px;border:1px solid #eadfe3;border-radius:10px;background:transparent;color:#87536e;font-weight:700}`;
  document.head.appendChild(bootStyle);
  const boot = document.createElement('div');
  boot.className = 'rm-boot';
  boot.innerHTML = '<div class="rm-boot-card"><div class="rm-boot-mark">♡</div><h2>心有记</h2><p id="rmBootText">正在准备你的私密关系空间…</p><div class="rm-boot-code" id="rmBootCode"></div><div class="rm-boot-hint" id="rmBootHint"></div><button id="rmBootRetry" hidden>重新连接</button></div>';
  document.body.appendChild(boot);

  function key(item) { return `${item.entity}:${item.id}`; }
  function profileTerm() { return state.profile?.partnerName || '对方'; }
  function saveLocalSync() { localStorage.setItem(SYNC_KEY, JSON.stringify({ cursor: state.cursor, pending: state.pending })); }
  function loadLocalSync() { try { const value = JSON.parse(localStorage.getItem(SYNC_KEY) || '{}'); state.cursor = Number(value.cursor) || 0; state.pending = Array.isArray(value.pending) ? value.pending : []; } catch { state.cursor = 0; state.pending = []; } }

  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const response = await fetch(API + path, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.detail || body.message || `请求失败：${response.status}`);
    return body;
  }

  function bootMessage(text, code = '', hint = '') {
    $('#rmBootText').textContent = text;
    $('#rmBootCode').textContent = code;
    $('#rmBootHint').textContent = hint;
  }

  function applyChange(change) {
    if (change.entity === 'profile') {
      if (change.operation !== 'delete' && change.data) state.profile = { ...state.profile, ...change.data };
      return;
    }
    const list = change.entity === 'memory' ? state.memories : state.events;
    const index = list.findIndex((item) => item.id === change.id);
    if (change.operation === 'delete' || change.data?.deletedAt) { if (index >= 0) list.splice(index, 1); return; }
    if (index >= 0) list[index] = { ...list[index], ...change.data };
    else list.push(change.data);
  }

  function applySync(result) {
    const accepted = new Set((result.accepted || []).map(key));
    const conflicts = new Set((result.conflicts || []).map(key));
    state.pending = state.pending.filter((item) => !accepted.has(key(item)));
    (result.changes || []).forEach((change) => {
      if (!conflicts.has(key(change)) && !state.pending.some((item) => key(item) === key(change))) applyChange(change);
    });
    state.cursor = Number(result.cursor || state.cursor);
    saveLocalSync();
    return (result.conflicts || []).length;
  }

  function typeOf(memory) { return typeInfo[memory.type] || typeInfo.like; }
  function memoryTitle(memory) { return memory.title || memory.content || '一条记忆'; }
  function memoryContent(memory) { return memory.content || memory.text || ''; }
  function memoriesBy(type) { return state.memories.filter((memory) => memory.type === type); }

  function buildScenarios() {
    const partner = profileTerm();
    const wish = memoriesBy('wish')[0];
    const like = memoriesBy('like')[0];
    const boundary = state.memories.find((memory) => memory.type === 'dislike' || memory.importance === 'important');
    return {
      date: { kicker:'A DATE WITH YOUR PERSON', title:'约会前', desc:'从已经记下的小愿望开始，不需要准备一场盛大的惊喜。', items:[wish ? [`把${partner}提过的「${memoryTitle(wish)}」加入计划`, '来自愿望记忆'] : ['从愿望记忆里选一条加入计划', '先从已有记录开始'], like ? [`围绕「${memoryTitle(like)}」安排一个小环节`, '来自喜欢记忆'] : [`为${partner}留出完整的聊天时间`, '中性的约会建议'], boundary ? ['提前确认时间和路线，避开已记录的边界', '来自重要记忆'] : ['提前确认路线和时间，减少临时变动', '通用计划建议']], primary:'加入提醒计划'},
      gift: { kicker:'A GIFT WITH MEANING', title:'准备礼物', desc:'从具体的喜欢和愿望中找到答案，不再依赖一套固定模板。', items:[like ? [`从「${memoryTitle(like)}」里挑一项具体心意`, '来自喜欢记忆'] : ['从喜欢类记忆中挑一项具体心意', '先积累偏好记录'], ['附上一句只属于你们的话', '让礼物有关系里的上下文'], boundary ? [`避开「${memoryTitle(boundary)}」`, '来自边界记忆'] : ['先查看不喜欢和重要边界', '送礼前的安全检查']], primary:'整理礼物清单'},
      meal: { kicker:'A MEAL TOGETHER', title:'一起吃饭', desc:'把忌口、习惯和沟通边界放在推荐菜之前。', items:[boundary ? [`先查看「${memoryTitle(boundary)}」`, '来自重要记忆'] : ['先查看不喜欢和重要边界', '用记忆避开雷区'], like ? [`参考「${memoryTitle(like)}」`, '来自喜欢记忆'] : ['参考已确认的饮食偏好', '没有记录时不替对方猜测'], ['选择方便交流、节奏舒服的环境', '通用用餐建议']], primary:'查看用餐提醒'},
      travel: { kicker:'A LITTLE JOURNEY', title:'计划旅行', desc:'把想去的地方变成路线，也给临时的心情留出空间。', items:[wish ? [`从「${memoryTitle(wish)}」选一个地点或体验`, '来自愿望记忆'] : ['从愿望类记忆里选一个地点或体验', '先积累想去的地方'], like ? [`把「${memoryTitle(like)}」安排进路线`, '来自喜欢记忆'] : ['把喜欢的事物安排进路线', '围绕偏好做选择'], ['保留一段不被安排的时间', '让旅行不变成任务清单']], primary:'生成旅行草案'},
      talk: { kicker:'A BETTER CONVERSATION', title:'好好沟通', desc:'记忆不是用来赢得争论的证据，而是帮助彼此少一点猜测，多一点尊重。', items:[boundary ? [`先回顾「${memoryTitle(boundary)}」`, '来自重要或边界记忆'] : ['先查看重要边界记忆', '先理解，再回应'], ['先问对方现在需要倾听还是建议', '给彼此选择的空间'], ['用具体的话确认已经听见', '不替对方总结，不急着解决']], primary:'补充沟通记忆'},
    };
  }

  function renderHome() {
    const partner = profileTerm();
    const wish = memoriesBy('wish')[0];
    const latest = state.memories[0];
    const hero = $('#view-home .hero-card');
    if (hero) {
      $('.hero-eyebrow', hero).textContent = `TODAY · 已记录 ${state.memories.length} 条关系记忆`;
      $('h2', hero).innerHTML = `记得${esc(partner)}说过的，<br><em>也记得${esc(partner)}没说完的。</em>`;
      $('p', hero).textContent = `把每一次随口提到的喜欢、不喜欢和小愿望，变成下一次靠近${partner}的线索。`;
      const quote = $('.quote-float', hero);
      if (quote) { $('p', quote).textContent = wish ? memoryContent(wish) : (latest ? memoryContent(latest) : '下一次听见一个小愿望，就记在这里。'); $('small', quote).textContent = wish ? '来自愿望记忆' : '等待第一条关系记忆'; }
    }
    const couple = $('.couple-copy');
    if (couple) { $('strong', couple).textContent = state.profile && (state.profile.selfName || state.profile.partnerName) ? `${state.profile.selfName || '我'} & ${state.profile.partnerName || '伴侣'}` : '还没有设置称呼'; $('span', couple).textContent = state.profile?.relationshipName || '登录后可跨设备同步'; }
    const coupleAvatar = $('.couple-avatar'); if (coupleAvatar) coupleAvatar.textContent = state.profile?.partnerName?.slice(0, 1) || '♡';
    const userAvatar = $('#userButton'); if (userAvatar) userAvatar.textContent = state.profile?.selfName?.slice(0, 1) || '我';
    const navCounts = $$('.nav-count'); if (navCounts[0]) navCounts[0].textContent = state.memories.length; if (navCounts[1]) navCounts[1].textContent = Object.keys(buildScenarios()).length;
    const temperature = Math.min(100, state.memories.length ? 55 + state.memories.length * 3 : 0);
    const temperatureScore = $('.temperature-score strong'); if (temperatureScore) temperatureScore.textContent = temperature;
    const temperatureBar = $('.temperature-bar span'); if (temperatureBar) temperatureBar.style.width = `${temperature}%`;
    const temperatureText = $('.temperature-card p'); if (temperatureText) temperatureText.textContent = state.memories.length ? `已记录 ${state.memories.length} 个关系细节，继续保持这份留心。` : '从一条具体的关系记忆开始。';
    const focus = $('.focus-card');
    if (focus) { const title = wish ? `把「${memoryTitle(wish)}」放进下一次计划` : '从一条愿望记忆开始下一次计划'; $('h3', focus).textContent = title; $('p', focus).textContent = wish ? `不是安排的规模，而是你记得${partner}曾经提过。` : '先记录，再在合适的时候把它变成行动。'; $('.focus-source span:last-child', focus).textContent = wish ? '来自愿望记忆' : '等待愿望记录'; }
    const stats = $$('#view-home .stat-card strong');
    if (stats.length >= 4) { stats[0].textContent = state.memories.length; stats[1].textContent = memoriesBy('wish').length; stats[2].textContent = state.events.length; stats[3].textContent = state.memories.filter((memory) => memory.importance === 'important').length; }
    const trendLabels = ['本地记录', '未实现愿望', '近期提醒', '重要边界']; $$('.stat-trend').forEach((item, index) => { item.textContent = trendLabels[index] || '动态数据'; });
    const quoteCard = $('.quote-card');
    if (quoteCard) { $('blockquote', quoteCard).textContent = latest ? `“${memoryContent(latest)}”` : '“一次被记住，就会变成一次被在乎。”'; $('cite', quoteCard).textContent = latest ? `来自${partner}的关系记忆` : '先记住一个具体的细节。'; }
    const pending = state.memories.filter((memory) => memory.status === 'pending');
    const coverageRows = $$('.coverage-row'); const coverageValues = [memoriesBy('like').length, state.memories.filter((memory) => memory.type === 'habit').length, memoriesBy('wish').length, state.memories.filter((memory) => memory.importance === 'important' || memory.type === 'dislike').length]; coverageRows.forEach((row, index) => { const value = state.memories.length ? Math.min(100, Math.round(coverageValues[index] / state.memories.length * 100)) : 0; const bar = $('.coverage-bar span', row); const number = $('em', row); if (bar) bar.style.width = `${value}%`; if (number) number.textContent = `${value}%`; });
    const progress = $('.review-progress span'); if (progress) progress.style.width = `${pending.length ? Math.min(100, Math.round(pending.length / Math.max(state.memories.length, pending.length) * 100)) : 0}%`;
    const plan = $('#view-calendar .plan-card'); if (plan) { const wishTitle = wish ? `把「${memoryTitle(wish)}」放进计划` : '从一个愿望开始计划'; $('h3', plan).textContent = wishTitle; $('p', plan).textContent = wish ? `这条记忆来自${partner}，可以成为下一次安排的起点。` : '记录一个想做的事，之后再把它放进合适的日期。'; }
    const momentsIntro = $('#view-moments .moments-intro'); if (momentsIntro) { $('h2', momentsIntro).textContent = `让记住${partner}，发生在合适的时刻。`; $('p', momentsIntro).textContent = '不同的场景，需要不同的心意。建议会从已经记录的细节里生成，不再替你猜测。'; }
    const momentsScore = $('#view-moments .score-copy'); if (momentsScore) { $('h3', momentsScore).textContent = state.memories.length ? `${partner}的偏好正在变得具体` : '从第一条记忆开始了解对方'; $('p', momentsScore).textContent = `当前已记录 ${state.memories.length} 条关系记忆，场景建议会随内容变化。`; }
    const scoreRing = $('#view-moments .score-ring'); const score = Math.min(100, state.memories.length * 8); if (scoreRing) { $('strong', scoreRing).textContent = score; scoreRing.style.background = `conic-gradient(#92798a 0 ${score}%, #ecf0ea ${score}% 100%)`; }
    const recordsDesc = $('#view-records .page-heading p'); if (recordsDesc) recordsDesc.textContent = `把关于${partner}的细节，整理成一份只属于你们的地图。`;
    const review = $('#view-home .review-panel');
    if (review) { $('.review-number strong', review).textContent = String(pending.length).padStart(2, '0'); $('.review-number span', review).textContent = '条等待确认的记忆'; $('.review-copy', review).textContent = pending.length ? '这些记录可能只是当下的心情，确认后才会参与后续建议。' : '暂无待确认内容。新的可能偏好会在这里等待确认。'; $('.review-list', review).innerHTML = pending.length ? pending.slice(0, 3).map((memory) => `<div class="review-item"><span class="ico">${typeOf(memory).icon}</span><span>${esc(memoryTitle(memory))}</span><button type="button" class="review-confirm" data-confirm-id="${esc(memory.id)}">✓</button></div>`).join('') : '<div class="review-item"><span class="ico">✓</span><span>目前没有待确认记忆</span></div>'; }
    const eventGrid = $('#view-home .event-grid');
    if (eventGrid) eventGrid.innerHTML = state.events.slice(0, 3).map((event) => `<article class="event-card ${esc(event.color || 'rose')}"><span class="event-badge">${event.done ? '已完成' : '待准备'}</span><div class="event-date"><strong>${esc(event.date?.slice(8) || '--')}</strong><span>${esc(event.date?.slice(0, 7) || '')}</span></div><div><div class="event-name">${esc(event.title)}</div><div class="event-note">${esc(event.note || '已设置提醒')}</div></div></article>`).join('') || '<div class="empty-state"><p>还没有提醒，先添加一个重要的日子。</p></div>';
    const profileCard = $('#view-settings .profile-card'); if (profileCard) { const name = state.profile && (state.profile.selfName || state.profile.partnerName) ? `${state.profile.selfName || '我'} & ${state.profile.partnerName || '伴侣'}` : '还没有设置称呼'; $('strong', profileCard).textContent = name; const profileMeta = $('.profile-head > span > span', profileCard); if (profileMeta) profileMeta.textContent = state.profile?.relationshipName || '设置后可跨设备同步'; const profileCopy = $('p', profileCard); if (profileCopy) profileCopy.textContent = '这里记录的是你愿意认真听见、记住，并在以后尊重的那些细节。'; }
  }

  function renderTimeline() {
    $('#homeTimeline').innerHTML = state.memories.slice(0, 4).map((memory) => { const info = typeOf(memory); return `<div class="timeline-entry"><span class="timeline-dot ${info.color}">${info.icon}</span><div class="timeline-content"><strong>${esc(memoryTitle(memory))}</strong><p>${esc(memory.context || info.label)}</p></div><span class="timeline-meta">${esc(String(memory.updatedAt || '').slice(0, 10))}</span></div>`; }).join('') || '<div class="empty-state"><p>还没有关系记忆。</p></div>';
  }

  function renderRecords() {
    const query = ($('#recordSearch')?.value || '').trim().toLowerCase();
    const visible = state.memories.filter((memory) => { const match = state.filter === 'all' || (state.filter === 'important' ? memory.importance === 'important' : memory.type === state.filter); const text = [memoryTitle(memory), memoryContent(memory), memory.category, memory.context, ...(memory.tags || [])].join(' ').toLowerCase(); return match && (!query || text.includes(query)); });
    $('#recordCount').textContent = visible.length;
    $('#recordList').innerHTML = visible.map((memory) => { const info = typeOf(memory); return `<button class="record-card ${memory.id === state.selectedId ? 'selected' : ''}" type="button" data-record-id="${esc(memory.id)}"><span class="record-symbol ${info.color}">${info.icon}</span><span class="record-body"><span class="record-line"><strong>${esc(memoryTitle(memory))}</strong><small class="record-status">${memory.status === 'pending' ? '待确认' : '已确认'}</small></span><p>${esc(memoryContent(memory))}</p><span class="record-tags"><small class="record-tag">${esc(info.label)}</small><small class="record-tag">${esc(memory.category || '关系记忆')}</small></span></span><span class="record-date">${esc(String(memory.updatedAt || '').slice(0, 10))}</span></button>`; }).join('') || '<div class="empty-state"><span class="ico">⌕</span><p>没有找到匹配的关系记忆。</p></div>';
    if (!state.selectedId && visible[0]) state.selectedId = visible[0].id;
    renderDetail();
  }

  function renderDetail() {
    const memory = state.memories.find((item) => item.id === state.selectedId);
    if (!memory) { $('#recordDetail').innerHTML = '<div class="empty-state"><span class="ico">♡</span><p>选择一条记忆查看详情。</p></div>'; return; }
    const info = typeOf(memory);
    $('#recordDetail').innerHTML = `<div class="detail-top"><div><div class="detail-kicker">${info.label} / ${esc(memory.category || '关系记忆')}</div><h3>${esc(memoryTitle(memory))}</h3></div></div><div class="detail-quote">${esc(memoryContent(memory))}</div><div class="detail-meta-grid"><div class="detail-meta"><span>记录场景</span><strong>${esc(memory.context || '未记录')}</strong></div><div class="detail-meta"><span>当前状态</span><strong>${memory.status === 'pending' ? '待确认' : '已确认'}</strong></div><div class="detail-meta"><span>重要程度</span><strong>${memory.importance === 'important' ? '重要' : '普通'}</strong></div><div class="detail-meta"><span>关系对象</span><strong>${esc(profileTerm())}</strong></div></div><div class="detail-actions"><button class="btn btn-dark btn-small" type="button" data-detail-action="primary">${memory.status === 'pending' ? '确认这条记忆' : '标记为已使用'}</button><button class="btn btn-outline btn-small" type="button" data-detail-action="edit">编辑记录</button></div>`;
  }

  function renderCalendar() {
    const grid = $('#calendarGrid'); if (!grid) return;
    const now = new Date(); const year = now.getFullYear(); const month = now.getMonth(); const first = new Date(year, month, 1).getDay(); const total = new Date(year, month + 1, 0).getDate();
    const monthTitle = $('.month-copy strong'); if (monthTitle) monthTitle.textContent = `${year} 年 ${month + 1} 月`;
    let html = ''; for (let i = 0; i < 42; i += 1) { const day = i - first + 1; const current = day > 0 && day <= total; const date = current ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : ''; const event = state.events.find((item) => item.date === date); html += `<button class="calendar-day ${current ? '' : 'muted'}" type="button" ${date ? `data-calendar-date="${date}"` : ''}><span>${current ? day : ''}</span>${event ? `<span class="calendar-event ${esc(event.color || 'rose')}">${esc(event.title.slice(0, 8))}</span>` : ''}</button>`; }
    grid.innerHTML = html;
  }

  function renderUpcoming() { const list = $('#upcomingList'); if (!list) return; list.innerHTML = state.events.slice(0, 4).map((event) => `<div class="upcoming-item ${event.done ? 'done' : ''}"><div class="upcoming-date"><strong>${esc(event.date?.slice(8) || '--')}</strong><span>${esc(event.date?.slice(0, 7) || '')}</span></div><div class="upcoming-copy"><strong>${esc(event.title)}</strong><span>${esc(event.note || '已设置提醒')}</span></div><button type="button" class="event-toggle" data-event-id="${esc(event.id)}">${event.done ? '✓' : '○'}</button></div>`).join('') || '<div class="empty-state"><p>还没有设置提醒。</p></div>'; }

  function renderScenario(name = 'date') { const scenarios = buildScenarios(); const data = scenarios[name] || scenarios.date; const list = $('#scenarioList'); if (list) list.innerHTML = Object.entries(scenarios).map(([id, item]) => `<button class="scenario-card ${id === name ? 'active' : ''}" type="button" data-scenario="${id}"><span class="scenario-icon ${id === 'date' ? 'rose' : id === 'gift' ? 'amber' : id === 'meal' ? 'blue' : id === 'travel' ? 'sage' : ''}">${id === 'date' ? '⌖' : id === 'gift' ? '♢' : id === 'meal' ? '♧' : id === 'travel' ? '◌' : '⌁'}</span><span class="scenario-copy"><strong>${item.title}</strong><span>${item.desc}</span></span><span class="ico scenario-arrow">›</span></button>`).join(''); $('#scenarioDetail').innerHTML = `<div class="detail-kicker">${data.kicker}</div><h3>${data.title}</h3><p>${data.desc}</p><div class="suggestion-list">${data.items.map((item, index) => `<div class="suggestion-item"><span class="suggestion-number">0${index + 1}</span><span><strong>${esc(item[0])}</strong><span>${esc(item[1])}</span></span><span class="ico">›</span></div>`).join('')}</div><div class="scenario-actions"><button class="btn btn-primary btn-small" type="button" data-scenario-action="primary">${data.primary}<span class="ico">↗</span></button><button class="btn btn-outline btn-small" type="button" data-scenario-action="capture">补充一条记忆</button></div>`; }

  function renderAll() { const partner = profileTerm(); $('#pageTitle').textContent = state.profile?.relationshipName || `${state.profile?.selfName || '我'} & ${state.profile?.partnerName || '伴侣'}`; $('#pageSubtitle').textContent = state.memories.length ? `已记录 ${state.memories.length} 条关于${partner}的关系记忆。` : `从下一次听见${partner}的一个小愿望开始。`; const profileCard = $('#view-settings .profile-card'); if (profileCard) { $('strong', profileCard).textContent = $('#pageTitle').textContent; $('p', profileCard).textContent = '关系资料和记忆只属于这个已配对的私密空间。'; } $('#memoryText').placeholder = `例如：最近很想去看一场日落，${partner}可能会喜欢。`; $('#eventTitle').placeholder = `例如：${partner}的生日、一起看展`; $('#eventNote').placeholder = `例如：结合${partner}最近提到的愿望准备`; renderHome(); renderTimeline(); renderRecords(); renderCalendar(); renderUpcoming(); renderScenario('date'); }

  function queue(entity, operation, id, data, baseRevision = 0) { state.pending = state.pending.filter((item) => key(item) !== `${entity}:${id}`); state.pending.push({ entity, operation, id, data, baseRevision }); saveLocalSync(); }
  async function sync() { if (!state.token) return; const result = await api('/sync', { method:'POST', body:JSON.stringify({ cursor:state.cursor, changes:state.pending.slice(0, 100) }) }); applySync(result); renderAll(); }
  function openModal(mode = 'record', record = null, eventRecord = null) { state.modalMode = mode; $('#recordForm').classList.toggle('hide', mode !== 'record'); $('#eventForm').classList.toggle('show', mode === 'event'); $('#modalTitle').textContent = mode === 'record' ? (record ? '编辑这条记忆' : '记下一条记忆') : '新建一个提醒'; $('#memoryText').value = record ? memoryContent(record) : ''; $('#memoryCategory').value = record?.category || '日常偏好'; $('#memoryContext').value = record?.context || ''; $('#eventTitle').value = eventRecord?.title || ''; $('#eventDate').value = eventRecord?.date || ''; $('#eventType').value = eventRecord?.color || 'rose'; $('#eventNote').value = eventRecord?.note || ''; state.type = record?.type || 'like'; state.editingId = record?.id || null; $$('.type-option').forEach((item) => item.classList.toggle('active', item.dataset.recordType === state.type)); $('#modalBackdrop').classList.add('show'); }
  function closeModal() { $('#modalBackdrop').classList.remove('show'); state.editingId = null; }
  async function saveModal() { const now = new Date().toISOString(); if (state.modalMode === 'event') { const title = $('#eventTitle').value.trim(); if (!title) return showToast('先写下提醒名称'); const event = { id:`web_event_${Date.now()}`, title, date:$('#eventDate').value || new Date().toISOString().slice(0, 10), color:$('#eventType').value, note:$('#eventNote').value.trim() || '已设置提醒', done:false, createdAt:now, updatedAt:now, revision:0 }; state.events.push(event); queue('event','upsert',event.id,event,0); closeModal(); renderAll(); try { await sync(); showToast('提醒已同步保存'); } catch (error) { showToast(error.message); } return; } const text = $('#memoryText').value.trim(); if (!text) return showToast('先写下一句话'); const old = state.memories.find((item) => item.id === state.editingId); const memory = { ...(old || {}), id:state.editingId || `web_${Date.now()}`, type:state.type, title:text.replace(/[“”"。！？!?，,]/g,'').slice(0,22), content:text, category:$('#memoryCategory').value, context:$('#memoryContext').value.trim() || '电脑端记录', importance:'normal', status:'confirmed', tags:old?.tags || ['电脑端'], createdAt:old?.createdAt || now, updatedAt:now, revision:old?.revision || 0 }; if (old) state.memories = state.memories.map((item) => item.id === old.id ? memory : item); else state.memories.unshift(memory); queue('memory','upsert',memory.id,memory,old?.revision || 0); closeModal(); renderAll(); try { await sync(); showToast('已同步保存'); } catch (error) { showToast(error.message); } }

  function setView(view) { $$('.page-view').forEach((page) => page.classList.toggle('active', page.dataset.page === view)); $$('.nav-item,.mobile-nav button[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === view)); const titles = { home:'关系总览', records:'记忆库', calendar:'时光提醒', moments:'场景灵感', settings:'空间设置' }; const homeTitle = state.profile?.relationshipName || `${state.profile?.selfName || '我'} & ${state.profile?.partnerName || '伴侣'}`; $('#pageTitle').textContent = view === 'home' ? homeTitle : titles[view]; window.scrollTo({ top:0, behavior:'smooth' }); }
  function showToast(message) { let toast = $('#toast'); if (!toast) return; $('#toastText').textContent = message; toast.classList.add('show'); clearTimeout(window.__rmToast); window.__rmToast = setTimeout(() => toast.classList.remove('show'), 2800); }

  function bindDynamicEvents() {
    document.addEventListener('click', async (event) => {
      const nav = event.target.closest('[data-view]'); if (nav) { event.preventDefault(); event.stopImmediatePropagation(); setView(nav.dataset.view); return; }
      const recordCard = event.target.closest('[data-record-id]'); if (recordCard) { event.preventDefault(); event.stopImmediatePropagation(); state.selectedId = recordCard.dataset.recordId; renderRecords(); return; }
      const filter = event.target.closest('[data-filter]'); if (filter) { event.preventDefault(); event.stopImmediatePropagation(); state.filter = filter.dataset.filter; $$('.filter-chip').forEach((item) => item.classList.toggle('active', item === filter)); renderRecords(); return; }
      const scenario = event.target.closest('[data-scenario]'); if (scenario) { event.preventDefault(); event.stopImmediatePropagation(); $$('.scenario-card').forEach((item) => item.classList.toggle('active', item === scenario)); renderScenario(scenario.dataset.scenario); return; }
      const detail = event.target.closest('[data-detail-action]'); if (detail) { event.preventDefault(); event.stopImmediatePropagation(); const memory = state.memories.find((item) => item.id === state.selectedId); if (!memory) return; if (detail.dataset.detailAction === 'edit') openModal('record', memory); else { memory.status = 'confirmed'; memory.used = true; memory.updatedAt = new Date().toISOString(); queue('memory','upsert',memory.id,memory,memory.revision || 0); renderAll(); sync().catch((error) => showToast(error.message)); } return; }
      const review = event.target.closest('[data-confirm-id]'); if (review) { event.preventDefault(); event.stopImmediatePropagation(); const memory = state.memories.find((item) => item.id === review.dataset.confirmId); if (memory) { memory.status='confirmed'; queue('memory','upsert',memory.id,memory,memory.revision || 0); renderAll(); sync().catch((error) => showToast(error.message)); } return; }
      const eventToggle = event.target.closest('[data-event-id]'); if (eventToggle) { event.preventDefault(); event.stopImmediatePropagation(); const item = state.events.find((eventItem) => eventItem.id === eventToggle.dataset.eventId); if (item) { item.done = !item.done; item.updatedAt = new Date().toISOString(); queue('event','upsert',item.id,item,item.revision || 0); renderAll(); sync().catch((error) => showToast(error.message)); } return; }
      const scenarioAction = event.target.closest('[data-scenario-action]'); if (scenarioAction) { event.preventDefault(); event.stopImmediatePropagation(); if (scenarioAction.dataset.scenarioAction === 'capture') openModal('record'); else openModal('event'); return; }
      if (event.target.closest('#heroCapture,#recordsCapture,#mobileCapture')) { event.preventDefault(); event.stopImmediatePropagation(); openModal('record'); return; }
      if (event.target.closest('#eventCapture,#addFocusPlan,#planWeekend')) { event.preventDefault(); event.stopImmediatePropagation(); openModal('event'); return; }
      if (event.target.closest('#modalClose,#modalCancel')) { event.preventDefault(); event.stopImmediatePropagation(); closeModal(); return; }
      if (event.target.closest('#modalSave')) { event.preventDefault(); event.stopImmediatePropagation(); saveModal(); return; }
      if (event.target.closest('#globalSearch')) { event.preventDefault(); event.stopImmediatePropagation(); setView('records'); setTimeout(() => $('#recordSearch')?.focus(), 80); return; }
      if (event.target.closest('#notifyButton')) { event.preventDefault(); event.stopImmediatePropagation(); setView('calendar'); return; }
      if (event.target.closest('#userButton,#coupleSwitcher,#editProfile')) { event.preventDefault(); event.stopImmediatePropagation(); setView('settings'); return; }
      if (event.target.closest('#voiceButton')) { event.preventDefault(); event.stopImmediatePropagation(); showToast('电脑端请直接输入听见的内容，手机端可使用语音记录'); return; }
      const type = event.target.closest('[data-record-type]'); if (type) { event.preventDefault(); event.stopImmediatePropagation(); state.type = type.dataset.recordType; $$('.type-option').forEach((item) => item.classList.toggle('active', item === type)); return; }
      if (event.target.closest('#exportRecords,#backupData')) { event.preventDefault(); event.stopImmediatePropagation(); const blob = new Blob([JSON.stringify({ profile:state.profile, memories:state.memories, events:state.events }, null, 2)], { type:'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = '心有记-关系空间备份.json'; link.click(); URL.revokeObjectURL(link.href); return; }
    }, true);
    document.addEventListener('input', (event) => { if (event.target.id === 'recordSearch') { event.stopImmediatePropagation(); renderRecords(); } }, true);
    $('#modalBackdrop')?.addEventListener('click', (event) => { if (event.target === $('#modalBackdrop')) closeModal(); }, true);
  }

  async function start() {
    loadLocalSync();
    try {
      if (state.token) {
        const bootData = await api('/bootstrap'); state.profile = bootData.profile || null; state.memories = bootData.memories || []; state.events = bootData.events || []; state.cursor = bootData.cursor || 0; renderAll(); document.documentElement.classList.remove('rm-sync-loading'); boot.remove(); bindDynamicEvents(); return;
      }
      const pairing = await fetch(`${API}/pairing/start`, { method:'POST' }).then((response) => response.json());
      bootMessage('请在手机端打开「心有记 → 设置」，输入下面的配对码。', pairing.code || '', '配对码 10 分钟内有效');
      state.pairingTimer = setInterval(async () => { try { const status = await fetch(`${API}/pairing/status?pairingId=${encodeURIComponent(pairing.pairingId)}&secret=${encodeURIComponent(pairing.secret)}`).then((response) => response.json()); if (status.status === 'bound') { clearInterval(state.pairingTimer); state.token = status.token; localStorage.setItem(TOKEN_KEY, state.token); location.reload(); } } catch { /* wait */ } }, 2000);
      $('#rmBootRetry').hidden = false; $('#rmBootRetry').onclick = () => location.reload();
    } catch (error) { bootMessage('同步空间暂时无法连接', '', error.message || '请稍后重试'); $('#rmBootRetry').hidden = false; $('#rmBootRetry').onclick = () => location.reload(); }
  }

  start();
})();
