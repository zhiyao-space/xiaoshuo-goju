'use strict';

const $ = (sel) => document.querySelector(sel);
const LS = {
  sessions: 'inkan.sessions.v1',
  settings: 'inkan.settings.v1',
  active: 'inkan.active.v1',
  theme: 'inkan.theme.v1'
};

const DEFAULT_SYS = '你是一位才华横溢的中文小说作家。请根据用户的设定与要求进行长篇创作：文风统一、人物立体、情节连贯，善用细节、节奏与氛围描写。输出小说正文，可用 Markdown 标题分节。直接呈现故事，不要输出创作建议或与正文无关的说明。';

let settings = load(LS.settings, {
  base: '', key: '', model: '', temp: 0.9, maxtok: 4096,
  sys: DEFAULT_SYS, world: '', tone: '', pov: '', len: '1500-2500字', instr: '',
  css: ''
});

let sessions = load(LS.sessions, []);
let activeId = load(LS.active, null);
let generating = false;
let controller = null;
let quoted = '';

(function normalizeSettings() {
  if (!Array.isArray(settings.presets) || !settings.presets.length) {
    settings.presets = [{
      id: uid(), name: '默认预设',
      base: settings.base || '', key: settings.key || '', model: settings.model || '',
      temp: settings.temp ?? 0.9, maxtok: settings.maxtok ?? 4096
    }];
  }
  if (!settings.presets.some(p => p.id === settings.activePreset)) settings.activePreset = settings.presets[0].id;
  syncFlat();
})();

function syncFlat() {
  const ap = settings.presets.find(p => p.id === settings.activePreset);
  if (ap) {
    settings.base = ap.base; settings.key = ap.key; settings.model = ap.model;
    settings.temp = ap.temp; settings.maxtok = ap.maxtok;
  }
}

function load(k, fb) {
  try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; }
  catch { return fb; }
}
function save(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
function saveAll() { save(LS.sessions, sessions); save(LS.settings, settings); save(LS.active, activeId); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function activeSession() { return sessions.find(s => s.id === activeId) || null; }

/* ---------- 渲染 ---------- */

function renderSessions() {
  const box = $('#session-list');
  box.innerHTML = '';
  if (!sessions.length) {
    box.innerHTML = '<div class="session-empty">暂无会话</div>';
    return;
  }
  for (const s of [...sessions].reverse()) {
    const el = document.createElement('div');
    el.className = 'session-item' + (s.id === activeId ? ' active' : '');
    el.innerHTML = `<span class="s-title"></span><button class="s-del" title="删除会话">✕</button>`;
    el.querySelector('.s-title').textContent = s.title || '未命名章节';
    el.addEventListener('click', (e) => {
      if (e.target.closest('.s-del')) return;
      activeId = s.id; saveAll(); renderAll(); closeSidebarMobile();
    });
    el.querySelector('.s-del').addEventListener('click', () => {
      askConfirm(`删除会话「${s.title || '未命名章节'}」？此操作不可恢复。`, () => {
        sessions = sessions.filter(x => x.id !== s.id);
        if (activeId === s.id) activeId = sessions.length ? sessions[sessions.length - 1].id : null;
        saveAll(); renderAll();
        toast('会话已删除');
      });
    });
    box.appendChild(el);
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function inlineMd(s) {
  return s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
}
function mdLite(text) {
  const lines = escapeHtml(text).split('\n');
  let html = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { html += '<p class="blank">&nbsp;</p>'; continue; }
    if (/^(---|\*\*\*|___)$/.test(line)) { html += '<hr>'; continue; }
    let m;
    if ((m = line.match(/^###\s+(.*)/))) html += `<h3>${inlineMd(m[1])}</h3>`;
    else if ((m = line.match(/^##\s+(.*)/))) html += `<h2>${inlineMd(m[1])}</h2>`;
    else if ((m = line.match(/^#\s+(.*)/))) html += `<h1>${inlineMd(m[1])}</h1>`;
    else html += `<p>${inlineMd(line)}</p>`;
  }
  return html || '<p></p>';
}

function renderMessages() {
  const s = activeSession();
  const box = $('#messages');
  box.innerHTML = '';
  $('#empty-state').classList.toggle('hidden', !!s && s.messages.length > 0);
  if (!s) return;
  s.messages.forEach((m, i) => box.appendChild(renderMsg(m, i)));
  scrollBottom();
}

function renderMsg(m, idx) {
  const el = document.createElement('div');
  el.className = `msg ${m.role === 'user' ? 'user' : 'ai'}`;
  el.dataset.idx = idx;
  const name = m.role === 'user' ? '你' : 'AI';
  const mark = m.role === 'user' ? '你' : '墨';
  el.innerHTML = `
    <div class="msg-head"><span class="msg-avatar">${mark}</span><span>${name}</span><span class="msg-time"></span></div>
    <div class="msg-body"></div>`;
  el.querySelector('.msg-time').textContent = m.t ? new Date(m.t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
  const body = el.querySelector('.msg-body');
  if (m.role === 'user') body.textContent = m.content;
  else body.innerHTML = mdLite(m.content);
  return el;
}

function renderAll() {
  renderSessions();
  const s = activeSession();
  $('#session-title').textContent = s ? (s.title || '未命名章节') : 'AI 写文小工具';
  renderMessages();
}

function scrollBottom() {
  const c = $('#chat');
  c.scrollTop = c.scrollHeight;
}

/* ---------- 会话 ---------- */

function newSession() {
  const s = { id: uid(), title: '未命名章节', messages: [], createdAt: Date.now() };
  sessions.push(s);
  activeId = s.id;
  saveAll(); renderAll();
  closeSidebarMobile();
  return s;
}

function ensureSession() {
  return activeSession() || newSession();
}

/* ---------- 系统提示词 ---------- */

function buildSystemPrompt() {
  const parts = [settings.sys || DEFAULT_SYS];
  if (settings.world) parts.push(`【题材 / 世界观】${settings.world}`);
  if (settings.tone) parts.push(`【文风基调】${settings.tone}`);
  if (settings.pov) parts.push(`【叙事人称】${settings.pov}`);
  if (settings.len) parts.push(`【单章篇幅】约 ${settings.len}`);
  if (settings.instr) parts.push(`【写作指令】${settings.instr}`);
  return parts.join('\n');
}

/* ---------- API 生成 ---------- */

async function streamChat(history, onDelta) {
  if (!settings.base || !settings.model) {
    toast('请先在「设置 → API 接入」填写 API 地址与模型');
    openSettings();
    throw new Error('no api config');
  }
  controller = new AbortController();
  const url = settings.base.replace(/\/+$/, '') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      ...(settings.key ? { 'Authorization': 'Bearer ' + settings.key } : {})
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: Number(settings.temp) || 0.9,
      max_tokens: Number(settings.maxtok) || 4096,
      stream: true,
      messages: [{ role: 'system', content: buildSystemPrompt() }, ...history]
    })
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.error?.message || msg; } catch {}
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const data = t.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const j = JSON.parse(data);
        const d = j.choices?.[0]?.delta?.content;
        if (d) onDelta(d);
      } catch {}
    }
  }
}

function setGenerating(on, label) {
  generating = on;
  $('#generating-bar').classList.toggle('hidden', !on);
  if (label) $('#generating-bar span:nth-child(2)').textContent = label;
  $('#btn-send').disabled = on;
  $('#input').disabled = on;
}

async function generate(history, aiMsgContainer) {
  const s = activeSession();
  const msg = { role: 'assistant', content: '', t: Date.now() };
  const el = renderMsg(msg, s.messages.length);
  aiMsgContainer.appendChild(el);
  scrollBottom();
  const body = el.querySelector('.msg-body');
  let acc = '';
  const paint = () => {
    body.innerHTML = mdLite(acc) + '<span class="cursor"></span>';
    scrollBottom();
  };
  setGenerating(true, '正在生成…');
  try {
    await streamChat(history, (d) => { acc += d; paint(); });
  } catch (e) {
    if (e.name === 'AbortError') {
      acc += acc ? '\n\n（已手动停止）' : '（已停止）';
    } else {
      acc = `【生成失败】${e.message}`;
      toast('生成失败：' + e.message);
    }
  }
  msg.content = acc;
  s.messages.push(msg);
  saveAll();
  body.innerHTML = mdLite(acc);
  setGenerating(false);
  renderSessions();
}

function autoTitle(s) {
  if (s.title && s.title !== '未命名章节') return;
  const first = s.messages.find(m => m.role === 'user');
  if (first) {
    s.title = first.content.replace(/\s+/g, ' ').slice(0, 16) || '未命名章节';
    $('#session-title').textContent = s.title;
  }
}

/* ---------- 发送 ---------- */

async function send() {
  const input = $('#input');
  const text = input.value.trim();
  if (!text || generating) return;
  const s = ensureSession();
  const m = { role: 'user', content: text, t: Date.now() };
  s.messages.push(m);
  input.value = ''; autoGrow(input);
  clearQuote();
  saveAll();
  $('#messages').appendChild(renderMsg(m, s.messages.length - 1));
  autoTitle(s);
  renderSessions();
  scrollBottom();
  const history = s.messages.map(x => ({ role: x.role, content: x.content }));
  await generate(history, $('#messages'));
}

/* ---------- 消息操作（长按菜单） ---------- */

function openCtxMenu(x, y, items) {
  const menu = $('#ctx-menu');
  menu.innerHTML = '';
  for (const it of items) {
    if (it === '-') {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      menu.appendChild(sep);
      continue;
    }
    const b = document.createElement('button');
    b.className = 'ctx-item' + (it.disabled ? ' disabled' : '');
    b.textContent = it.label;
    b.addEventListener('click', () => { closeCtxMenu(); it.fn(); });
    menu.appendChild(b);
  }
  menu.classList.remove('hidden');
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  menu.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
}
function closeCtxMenu() { $('#ctx-menu').classList.add('hidden'); }

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('已复制'); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = t; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy'); ta.remove();
    toast('已复制');
  }
}

function bindLongPress() {
  let timer = null, sx = 0, sy = 0, target = null;
  const chat = $('#chat');

  const findMsg = (el) => {
    const me = el && el.closest ? el.closest('.msg') : null;
    return me ? { el: me, idx: Number(me.dataset.idx) } : null;
  };

  const showFor = (x, y, found) => {
    const s = activeSession();
    if (!s) return;
    const m = s.messages[found.idx];
    if (!m) return;
    const isAI = m.role === 'assistant';
    const prevUser = (() => {
      for (let i = found.idx - 1; i >= 0; i--) if (s.messages[i].role === 'user') return true;
      return false;
    })();
    window.getSelection().removeAllRanges();
    openCtxMenu(x, y, [
      { label: '复制', fn: () => copyText(m.content) },
      { label: '编辑', fn: () => startEdit(found) },
      { label: '引用', fn: () => setQuote(m.content, m.role === 'user' ? '你' : 'AI') },
      '-',
      { label: '撤回', fn: () => askConfirm('撤回该条及其后所有内容？', () => {
          s.messages.splice(found.idx);
          saveAll(); renderMessages();
          toast('已撤回');
        }) },
      { label: '重新生成', disabled: !isAI || !prevUser, fn: () => regenerate(found.idx) },
      { label: '继续生成', disabled: !isAI, fn: () => continueStory(found.idx) }
    ]);
  };

  chat.addEventListener('contextmenu', (e) => {
    const found = findMsg(e.target);
    if (!found) return;
    e.preventDefault();
    showFor(e.clientX, e.clientY, found);
  });

  chat.addEventListener('touchstart', (e) => {
    const found = findMsg(e.target);
    if (!found) return;
    target = found;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    timer = setTimeout(() => {
      timer = null;
      showFor(sx, sy - 10, target);
      if (navigator.vibrate) navigator.vibrate(15);
    }, 480);
  }, { passive: true });

  chat.addEventListener('touchmove', (e) => {
    if (!timer) return;
    const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    if (dx * dx + dy * dy > 120) { clearTimeout(timer); timer = null; }
  }, { passive: true });

  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  chat.addEventListener('touchend', cancel);
  chat.addEventListener('touchcancel', cancel);

  chat.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const found = findMsg(e.target);
    if (!found) return;
    sx = e.clientX; sy = e.clientY;
    timer = setTimeout(() => {
      timer = null;
      showFor(sx, sy - 10, found);
    }, 480);
  });
  chat.addEventListener('mousemove', (e) => {
    if (!timer) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (dx * dx + dy * dy > 400) cancel();
  });
  chat.addEventListener('mouseup', cancel);
  chat.addEventListener('mouseleave', cancel);
}

function startEdit(found) {
  const s = activeSession();
  const m = s.messages[found.idx];
  const el = found.el;
  el.classList.add('editing');
  const ed = document.createElement('textarea');
  ed.className = 'msg-editor';
  ed.value = m.content;
  const acts = document.createElement('div');
  acts.className = 'msg-editor-actions';
  acts.innerHTML = `<button class="btn btn-ghost">取消</button><button class="btn btn-primary">保存</button>`;
  const [btnCancel, btnSave] = acts.querySelectorAll('button');
  el.appendChild(ed); el.appendChild(acts);
  ed.focus();
  btnCancel.addEventListener('click', () => { el.classList.remove('editing'); ed.remove(); acts.remove(); });
  btnSave.addEventListener('click', () => {
    const v = ed.value.trim();
    if (v) {
      m.content = v;
      saveAll();
      const body = el.querySelector('.msg-body');
      if (m.role === 'user') body.textContent = v; else body.innerHTML = mdLite(v);
    }
    el.classList.remove('editing'); ed.remove(); acts.remove();
    toast('已保存');
  });
}

function setQuote(text, who) {
  quoted = text;
  $('#quote-text').textContent = `${who}：${text.slice(0, 120)}${text.length > 120 ? '…' : ''}`;
  $('#quote-preview').classList.remove('hidden');
  $('#input').focus();
}
function clearQuote() {
  quoted = '';
  $('#quote-preview').classList.add('hidden');
}

async function regenerate(idx) {
  const s = activeSession();
  if (generating) return;
  s.messages.splice(idx);
  saveAll(); renderMessages();
  const history = s.messages.map(x => ({ role: x.role, content: x.content }));
  await generate(history, $('#messages'));
}

async function continueStory(idx) {
  const s = activeSession();
  if (generating) return;
  const contMsg = { role: 'user', content: '请从上文末尾无缝继续写下去，保持文风与人称一致，不要重复任何已有内容。', hidden: false, t: Date.now() };
  const history = s.messages.slice(0, idx + 1).map(x => ({ role: x.role, content: x.content }));
  history.push({ role: 'user', content: contMsg.content });
  const marker = document.createElement('div');
  marker.style.cssText = 'text-align:center;color:var(--text-faint);font-size:12px;margin:20px 0;letter-spacing:2px';
  marker.textContent = '· 继续生成 ·';
  $('#messages').appendChild(marker);
  await generate(history, $('#messages'));
}

/* ---------- 导出 ---------- */

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportChoice(x, y) {
  openCtxMenu(x, y, [
    { label: '导出 TXT（正文）', fn: () => {
        const s = activeSession();
        if (!s || !s.messages.length) return toast('当前会话为空');
        const text = s.messages.filter(m => m.role === 'assistant').map(m => m.content).join('\n\n————————\n\n');
        download(`${s.title || '未命名章节'}.txt`, text, 'text/plain;charset=utf-8');
        toast('已导出 TXT');
      } },
    { label: '导出 Markdown（完整）', fn: () => {
        const s = activeSession();
        if (!s || !s.messages.length) return toast('当前会话为空');
        const lines = [`# ${s.title || '未命名章节'}`, ''];
        for (const m of s.messages) lines.push(m.role === 'user' ? `> **创作指令：** ${m.content}\n` : m.content + '\n');
        download(`${s.title || '未命名章节'}.md`, lines.join('\n'), 'text/markdown;charset=utf-8');
        toast('已导出 Markdown');
      } }
  ]);
  const menu = $('#ctx-menu');
  const r = $('#btn-export').getBoundingClientRect();
  menu.style.left = r.left + 'px';
  menu.style.top = (r.top - menu.offsetHeight - 10) + 'px';
}

/* ---------- 设置 ---------- */

let editPresetId = settings.activePreset;
const modelsCache = {};

function curPreset() { return settings.presets.find(p => p.id === editPresetId); }

function renderPresetSelect() {
  const sel = $('#cfg-preset');
  sel.innerHTML = '';
  settings.presets.forEach(p => {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name || '未命名预设';
    sel.appendChild(o);
  });
  sel.value = editPresetId;
}

function loadPresetFields() {
  const p = curPreset();
  if (!p) return;
  $('#cfg-name').value = p.name || '';
  $('#cfg-base').value = p.base || '';
  $('#cfg-key').value = p.key || '';
  $('#cfg-model').value = p.model || '';
  $('#cfg-temp').value = p.temp ?? 0.9;
  $('#cfg-maxtok').value = p.maxtok ?? 4096;
  closeModelList();
}

async function fetchModels() {
  const base = $('#cfg-base').value.trim().replace(/\/+$/, '');
  if (!base) return toast('请先填写 API 地址');
  const key = $('#cfg-key').value.trim();
  const btn = $('#btn-fetch-models');
  btn.disabled = true; btn.textContent = '拉取中…';
  try {
    const res = await fetch(base + '/models', {
      headers: key ? { 'Authorization': 'Bearer ' + key } : {}
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    const raw = Array.isArray(j.data) ? j.data : (Array.isArray(j.models) ? j.models : (Array.isArray(j) ? j : []));
    const list = [...new Set(raw.map(m => typeof m === 'string' ? m : (m.id || m.name || m.model)).filter(Boolean))];
    if (!list.length) throw new Error('接口未返回模型列表');
    modelsCache[editPresetId] = list;
    renderModelList(true);
    toast(`已拉取 ${list.length} 个模型`);
  } catch (e) {
    toast('拉取失败：' + e.message);
  }
  btn.disabled = false; btn.textContent = '拉取模型';
}

function renderModelList(open) {
  const box = $('#model-list');
  const all = modelsCache[editPresetId] || [];
  const q = $('#cfg-model').value.trim().toLowerCase();
  const items = q ? all.filter(m => m.toLowerCase().includes(q)) : all;
  box.innerHTML = '';
  if (!items.length) {
    box.innerHTML = `<div class="model-empty">${all.length ? '无匹配模型' : '暂无模型列表，点击「拉取模型」获取'}</div>`;
  } else {
    items.forEach(m => {
      const d = document.createElement('div');
      d.className = 'model-item';
      d.textContent = m;
      d.addEventListener('click', () => {
        $('#cfg-model').value = m;
        closeModelList();
      });
      box.appendChild(d);
    });
  }
  box.classList.toggle('hidden', !open);
}

function closeModelList() { $('#model-list').classList.add('hidden'); }

function openSettings() {
  editPresetId = settings.activePreset;
  renderPresetSelect();
  loadPresetFields();
  $('#cfg-sys').value = settings.sys || DEFAULT_SYS;
  $('#cfg-world').value = settings.world || '';
  $('#cfg-tone').value = settings.tone || '';
  $('#cfg-pov').value = settings.pov || '';
  $('#cfg-len').value = settings.len || '1500-2500字';
  $('#cfg-instr').value = settings.instr || '';
  $('#cfg-css').value = settings.css || '';
  $('#modal-settings').classList.remove('hidden');
}

function saveSettings() {
  const p = curPreset();
  if (p) {
    p.name = $('#cfg-name').value.trim() || '未命名预设';
    p.base = $('#cfg-base').value.trim();
    p.key = $('#cfg-key').value.trim();
    p.model = $('#cfg-model').value.trim();
    p.temp = Number($('#cfg-temp').value) || 0.9;
    p.maxtok = Number($('#cfg-maxtok').value) || 4096;
    settings.activePreset = p.id;
  }
  syncFlat();
  settings.sys = $('#cfg-sys').value;
  settings.world = $('#cfg-world').value.trim();
  settings.tone = $('#cfg-tone').value;
  settings.pov = $('#cfg-pov').value;
  settings.len = $('#cfg-len').value;
  settings.instr = $('#cfg-instr').value.trim();
  settings.css = $('#cfg-css').value;
  saveAll();
  applyCustomCSS();
  $('#modal-settings').classList.add('hidden');
  toast('已保存并启用预设「' + (p ? p.name : '') + '」');
}

function applyCustomCSS() {
  let el = $('#user-style');
  if (!el) {
    el = document.createElement('style');
    el.id = 'user-style';
    document.head.appendChild(el);
  }
  el.textContent = settings.css || '';
}

async function aiSkin() {
  if (generating) return;
  if (!settings.base || !settings.model) {
    toast('请先在「API 接入」中配置 API');
    switchTab('api');
    return;
  }
  $('#modal-settings').classList.add('hidden');
  setGenerating(true, 'AI 正在美化界面…');
  const prompt = `你是资深前端设计师。请为这个黑白极简 AI 小说写作界面编写一套自定义 CSS 美化样式。

硬性要求：
1. 保持纯黑白灰配色（允许透明度与阴影），禁止引入任何彩色。
2. 优雅、有质感、可读性强，适合长时间阅读长文。
3. 只输出一段完整 CSS 代码，用 \`\`\`css 代码块包裹，不要任何解释文字。

可用主要选择器：
body（整体）、#sidebar（左侧栏）、.logo-mark（Logo 方块）、.session-item（会话项）、#topbar（顶栏）、#session-title（标题）、.messages（消息区）、.msg（消息）、.msg-body（正文）、#composer（输入区）、.composer-row（输入框容器）、#input（输入框）、.send-btn（发送按钮）、.btn（通用按钮）、.ctx-menu（长按菜单）、.modal-box（弹窗）、.empty-state（空状态）、.toast（提示条）。

技巧：可用 ::before/::after 添加纯 CSS 装饰纹理、可用 letter-spacing/行高/衬线字体优化排版、可用 subtle 渐变与阴影增加层次。总长度控制在 200 行以内。`;
  let acc = '';
  try {
    await streamChat([{ role: 'user', content: prompt }], (d) => { acc += d; });
    const m = acc.match(/```(?:css)?\s*([\s\S]*?)```/);
    const css = (m ? m[1] : acc).trim();
    if (!css) throw new Error('AI 未返回有效 CSS');
    settings.css = css;
    $('#cfg-css').value = css;
    saveAll();
    applyCustomCSS();
    toast('美化样式已应用并保存');
  } catch (e) {
    if (e.name !== 'AbortError') toast('美化失败：' + e.message);
  }
  setGenerating(false);
}

/* ---------- 确认框 / Toast ---------- */

let confirmCb = null;
function askConfirm(text, cb) {
  $('#confirm-text').textContent = text;
  confirmCb = cb;
  $('#modal-confirm').classList.remove('hidden');
}

let toastTimer = null;
function toast(t) {
  const el = $('#toast');
  el.textContent = t;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

/* ---------- 其他 ---------- */

function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
}

function switchTab(name) {
  document.querySelectorAll('.modal-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'pane-' + name));
}

function closeSidebarMobile() {
  if (innerWidth <= 768) $('#sidebar').classList.add('collapsed');
}

function renameTitle() {
  const s = activeSession();
  const el = $('#session-title');
  const old = s ? s.title : '';
  const input = document.createElement('input');
  input.value = old;
  input.style.cssText = 'flex:1;background:var(--panel-2);border:1px solid var(--border-strong);color:var(--text);border-radius:6px;padding:4px 8px;font-size:15px;font-family:inherit;outline:none';
  el.replaceWith(input);
  input.focus(); input.select();
  const done = () => {
    if (s) {
      s.title = input.value.trim() || '未命名章节';
      saveAll(); renderSessions();
    }
    input.replaceWith(el);
    el.textContent = s ? s.title : 'AI 写文小工具';
  };
  input.addEventListener('blur', done);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
}

/* ---------- 初始化 ---------- */

function init() {
  if (localStorage.getItem(LS.theme) === 'light') document.body.classList.add('light');
  applyCustomCSS();

  $('#btn-new-session').addEventListener('click', () => newSession());
  $('#btn-send').addEventListener('click', send);
  $('#btn-stop').addEventListener('click', () => { if (controller) controller.abort(); });
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-save-settings').addEventListener('click', saveSettings);
  $('#btn-export').addEventListener('click', (e) => exportChoice(e.clientX, e.clientY));

  $('#cfg-preset').addEventListener('change', () => {
    editPresetId = $('#cfg-preset').value;
    loadPresetFields();
  });
  $('#btn-preset-add').addEventListener('click', () => {
    const p = { id: uid(), name: '预设 ' + (settings.presets.length + 1), base: '', key: '', model: '', temp: 0.9, maxtok: 4096 };
    settings.presets.push(p);
    editPresetId = p.id;
    renderPresetSelect();
    loadPresetFields();
    $('#cfg-name').focus();
    toast('已新增预设，填写后点「保存」启用');
  });
  $('#btn-preset-del').addEventListener('click', () => {
    if (settings.presets.length <= 1) return toast('至少保留一套预设');
    const p = curPreset();
    askConfirm(`删除预设「${p.name}」？`, () => {
      settings.presets = settings.presets.filter(x => x.id !== editPresetId);
      if (settings.activePreset === editPresetId) settings.activePreset = settings.presets[0].id;
      editPresetId = settings.activePreset;
      renderPresetSelect();
      loadPresetFields();
      syncFlat();
      saveAll();
      toast('预设已删除');
    });
  });
  $('#btn-fetch-models').addEventListener('click', fetchModels);

  const modelInput = $('#cfg-model');
  modelInput.addEventListener('input', () => renderModelList(true));
  modelInput.addEventListener('focus', () => renderModelList(true));
  modelInput.addEventListener('blur', () => setTimeout(closeModelList, 160));
  modelInput.addEventListener('keydown', (e) => {
    const box = $('#model-list');
    if (box.classList.contains('hidden')) return;
    const items = [...box.querySelectorAll('.model-item')];
    if (!items.length) return;
    let idx = items.findIndex(i => i.classList.contains('active'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      idx = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
      items.forEach((it, i) => it.classList.toggle('active', i === idx));
      items[idx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      modelInput.value = items[Math.max(idx, 0)].textContent;
      closeModelList();
    } else if (e.key === 'Escape') {
      closeModelList();
    }
  });

  $('#btn-theme').addEventListener('click', () => {
    document.body.classList.toggle('light');
    localStorage.setItem(LS.theme, document.body.classList.contains('light') ? 'light' : 'dark');
  });
  $('#btn-toggle-side').addEventListener('click', () => $('#sidebar').classList.toggle('collapsed'));
  $('#session-title').addEventListener('click', renameTitle);
  $('#btn-remove-quote').addEventListener('click', clearQuote);
  $('#btn-ai-skin').addEventListener('click', aiSkin);
  $('#btn-clear-css').addEventListener('click', () => {
    settings.css = ''; $('#cfg-css').value = ''; saveAll(); applyCustomCSS(); toast('已恢复默认样式');
  });
  $('#btn-confirm-ok').addEventListener('click', () => {
    $('#modal-confirm').classList.add('hidden');
    if (confirmCb) { const cb = confirmCb; confirmCb = null; cb(); }
  });

  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
    $('#' + b.dataset.close).classList.add('hidden');
  }));
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', (e) => {
    if (e.target === m && m.id !== 'modal-settings') m.classList.add('hidden');
  }));
  document.querySelectorAll('.modal-tabs .tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  const input = $('#input');
  input.addEventListener('input', () => autoGrow(input));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#ctx-menu')) closeCtxMenu();
    if (!e.target.closest('.model-combo')) closeModelList();
    if (innerWidth <= 768 && !e.target.closest('#sidebar') && !e.target.closest('#btn-toggle-side')) {
      $('#sidebar').classList.add('collapsed');
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeCtxMenu(); document.querySelectorAll('.modal').forEach(m => { if (m.id !== 'modal-settings') m.classList.add('hidden'); }); }
  });

  bindLongPress();
  renderAll();
}

init();
