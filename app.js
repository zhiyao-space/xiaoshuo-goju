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
  hydrateIllust(box);
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
  if (m.role === 'user') {
    body.textContent = m.content;
  } else {
    const frags = (m.illust && Array.isArray(m.illust.fragments)) ? m.illust.fragments : null;
    if (!frags) {
      body.innerHTML = mdLite(m.content);
    } else {
      // 图文混排：配图内嵌到对应段落位置
      const paras = m.content.split(/\n\s*\n/).filter(p => p.trim());
      const usedTexts = new Set();
      paras.forEach(p => {
        const wrap = document.createElement('div');
        wrap.innerHTML = mdLite(p);
        while (wrap.firstChild) body.appendChild(wrap.firstChild);
        const t = p.trim();
        for (const f of frags) {
          if (f.mainId && f.text.trim() === t) {
            usedTexts.add(t);
            body.appendChild(makeIllustImg(f.mainId));
          }
        }
      });
      // 正文被编辑过导致文字对不上的片段，配图追加到消息末尾
      for (const f of frags) {
        if (f.mainId && !usedTexts.has(f.text.trim())) body.appendChild(makeIllustImg(f.mainId));
      }
    }
  }
  return el;
}

function makeIllustImg(imgId) {
  const img = document.createElement('img');
  img.className = 'msg-illust';
  img.dataset.imgid = imgId;
  img.alt = '片段配图';
  img.loading = 'lazy';
  return img;
}

async function hydrateIllust(root) {
  const imgs = (root || document).querySelectorAll('img.msg-illust[data-imgid]:not([src])');
  for (const img of imgs) {
    const url = await NAI.getImageUrl(img.dataset.imgid);
    if (url) img.src = url;
  }
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
function closeCtxMenu() { $('#ctx-menu').classList.add('hidden'); swallowNextMenuClose = false; }

let swallowNextMenuClose = false;

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
      { label: '配图', disabled: !isAI, fn: () => openIllust(found.idx) },
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
      swallowNextMenuClose = true;
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
      swallowNextMenuClose = true;
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

function safeName(s) {
  return (s || '未命名').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) || '未命名';
}

function download(name, text, type) {
  const blob = new Blob(["\ufeff", text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 5000);
  toast('已开始下载：' + name);
}

function chapterContent(s) {
  return s.messages.filter(m => m.role === 'assistant').map(m => m.content).join('\n\n');
}

function buildBook(list, md) {
  const parts = [];
  list.forEach(s => {
    const c = chapterContent(s);
    if (!c) return;
    if (md) parts.push(`## ${s.title || '未命名章节'}\n\n${c}`);
    else parts.push(`【${s.title || '未命名章节'}】\n\n${c}`);
  });
  if (!parts.length) return null;
  if (md) return `# 全本（共 ${list.length} 章）\n\n` + parts.join('\n\n\n');
  return parts.join('\n\n————————\n\n');
}

function exportChoice(x, y) {
  const s = activeSession();
  swallowNextMenuClose = true;
  openCtxMenu(x, y, [
    { label: '当前章节 · TXT', disabled: !s || !s.messages.length, fn: () => {
        const text = chapterContent(s);
        if (!text) return toast('本章还没有正文');
        download(`${safeName(s.title)}.txt`, text, 'text/plain;charset=utf-8');
      } },
    { label: '当前章节 · Markdown', disabled: !s || !s.messages.length, fn: () => {
        const lines = [`# ${s.title || '未命名章节'}`, ''];
        for (const m of s.messages) lines.push(m.role === 'user' ? `> **创作指令：** ${m.content}\n` : m.content + '\n');
        download(`${safeName(s.title)}.md`, lines.join('\n'), 'text/markdown;charset=utf-8');
      } },
    { label: '复制本章全文', disabled: !s || !s.messages.length, fn: () => copyText(chapterContent(s)) },
    '-',
    { label: '选择章节导出…', disabled: !sessions.length, fn: openExportPicker },
    { label: '整本合并 · TXT', disabled: !sessions.length, fn: () => {
        const text = buildBook(sessions, false);
        if (!text) return toast('还没有任何正文');
        download(`全本_${sessions.length}章.txt`, text, 'text/plain;charset=utf-8');
      } },
    { label: '整本合并 · Markdown', disabled: !sessions.length, fn: () => {
        const text = buildBook(sessions, true);
        if (!text) return toast('还没有任何正文');
        download(`全本_${sessions.length}章.md`, text, 'text/markdown;charset=utf-8');
      } }
  ]);
  const menu = $('#ctx-menu');
  const r = $('#btn-export').getBoundingClientRect();
  menu.style.left = r.left + 'px';
  menu.style.top = Math.max(8, r.top - menu.offsetHeight - 10) + 'px';
}

function openExportPicker() {
  if (!sessions.length) return toast('暂无任何章节');
  const box = $('#export-chapter-list');
  box.innerHTML = '';
  sessions.forEach((s, i) => {
    const lab = document.createElement('label');
    lab.className = 'export-item';
    const n = s.messages.filter(m => m.role === 'assistant').length;
    lab.innerHTML = `<input type="checkbox" value="${s.id}" checked><span class="t"></span><span class="cnt"></span>`;
    lab.querySelector('.t').textContent = s.title || ('未命名章节 ' + (i + 1));
    lab.querySelector('.cnt').textContent = n ? n + ' 段正文' : '空';
    box.appendChild(lab);
  });
  $('#modal-export').classList.remove('hidden');
}

function exportSelected(md) {
  const ids = [...document.querySelectorAll('#export-chapter-list input:checked')].map(i => i.value);
  if (!ids.length) return toast('请先勾选要导出的章节');
  const list = sessions.filter(s => ids.includes(s.id));
  const text = buildBook(list, md);
  if (!text) return toast('所选章节还没有正文');
  download(`全本_${list.length}章.${md ? 'md' : 'txt'}`, text, md ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8');
  $('#modal-export').classList.add('hidden');
}

function exportChoice(x, y) {
  swallowNextMenuClose = true;
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
  editImgApiId = imgOpts.activeApi || (imgApis[0] ? imgApis[0].id : '');
  renderImgApiSelect();
  loadImgApiFields();
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
  saveImgApiFields();
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

/* ---------- 生图工坊 & 图库 ---------- */

let imgApis = NAI.loadImgApis();
let imgStyles = NAI.loadImgStyles();
let gallery = NAI.loadGallery();
const IMG_OPT_KEY = 'inkan.imgopts.v1';
let imgOpts = NAI.lsGet(IMG_OPT_KEY, { pos: '', neg: '', activeApi: imgApis[0] ? imgApis[0].id : '' });
let illustCtx = null; // { msgIdx, fragIdx, mode, vibe }
let illBusy = false;
let editImgApiId = imgApis[0] ? imgApis[0].id : '';

function curImgApi() { return imgApis.find(a => a.id === imgOpts.activeApi) || imgApis[0]; }
function saveImgData() {
  NAI.lsSet(NAI.LSK.imgApi, imgApis);
  NAI.lsSet(NAI.LSK.imgStyles, imgStyles);
  NAI.lsSet(NAI.LSK.gallery, gallery);
  NAI.lsSet(IMG_OPT_KEY, imgOpts);
}

function ensureIllust(m) {
  if (!m.illust || !Array.isArray(m.illust.fragments) || !m.illust.fragments.length) {
    const paras = (m.content || '').split(/\n\s*\n/).map(t => t.trim()).filter(Boolean);
    let list = paras.length > 1 ? paras : [(m.content || '').trim() || '（空片段）'];
    // 跳过章节标题行、序号行和过短段落，只对真正有画面内容的段落配图
 const meaningful = list.filter(t => !/^(#{1,6}[ \t]|[-*>]|第.{1,8}[章回节卷]|序章|楔子|章节目录)/.test(t) && t.length >= 15);
    if (meaningful.length) list = meaningful;
    m.illust = {
      fragments: list.map(t => ({ id: NAI.uid2(), text: t, note: '', autoCount: 0, imageIds: [], mainId: null }))
    };
    saveAll();
  }
  return m.illust;
}

function illustMsg() {
  const s = activeSession();
  if (!s || !illustCtx) return null;
  return s.messages[illustCtx.msgIdx] || null;
}
function currentFrag() {
  const m = illustMsg();
  if (!m) return null;
  return ensureIllust(m).fragments[illustCtx.fragIdx] || m.illust.fragments[0] || null;
}

async function openIllust(idx) {
  const s = activeSession();
  const m = s && s.messages[idx];
  if (!m) return;
  ensureIllust(m);
  illustCtx = { msgIdx: idx, fragIdx: 0, mode: 'off', vibe: null };
  renderIllustFragments();
  renderIllustStyles();
  renderIllustOptions();
  setVibeMode('off');
  $('#charlib').value = charLib || '';
  $('#ill-pos').value = imgOpts.pos || '';
  $('#ill-neg').value = imgOpts.neg || '';
  loadFragmentFields();
  renderIllPreview();
  $('#modal-illust').classList.remove('hidden');
  hydrateIllust($('#ill-preview'));
}

function renderIllustFragments() {
  const sel = $('#ill-fragment');
  const m = illustMsg();
  sel.innerHTML = '';
  if (!m) return;
  ensureIllust(m).fragments.forEach((f, i) => {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = `片段 ${i + 1} · ${f.text.slice(0, 14)}${f.text.length > 14 ? '…' : ''}${f.imageIds.length ? `（已配 ${f.imageIds.length} 图）` : ''}`;
    sel.appendChild(o);
  });
  sel.value = illustCtx.fragIdx;
}

function renderIllustStyles() {
  const sel = $('#ill-style');
  sel.innerHTML = '<option value="">（不用预设）</option>';
  imgStyles.forEach(st => {
    const o = document.createElement('option');
    o.value = st.id;
    o.textContent = (st.group ? `[${st.group}] ` : '') + st.name;
    sel.appendChild(o);
  });
}

function renderIllustOptions() {
  const size = $('#ill-size');
  if (!size.options.length) {
    NAI.SIZE_PRESETS.forEach((p, i) => {
      const o = document.createElement('option');
      o.value = i; o.textContent = p.label;
      size.appendChild(o);
    });
    NAI.SAMPLERS.forEach(sm => {
      const o = document.createElement('option');
      o.value = sm; o.textContent = sm;
      $('#ill-sampler').appendChild(o);
    });
  }
}

function loadFragmentFields() {
  const f = currentFrag();
  if (!f) return;
  $('#ill-text').value = f.text;
  $('#ill-note').value = f.note || '';
  $('#ill-count').value = f.autoCount || 0;
  $('#ill-style').value = f.styleId || '';
}

function persistFragmentFields() {
  const f = currentFrag();
  if (!f) return;
  f.text = $('#ill-text').value;
  f.note = $('#ill-note').value.trim();
  f.autoCount = Math.max(0, Math.min(4, Number($('#ill-count').value) || 0));
  f.styleId = $('#ill-style').value || '';
  saveAll();
}

function persistPromptFields() {
  imgOpts.pos = $('#ill-pos').value;
  imgOpts.neg = $('#ill-neg').value;
  saveImgData();
}

function currentPrompt() {
  const f = currentFrag();
  if (!f) return '';
  const body = (f.text || '').slice(0, 120);
  const pos = ($('#ill-pos').value || '').trim();
  const note = f.note || '';
  if (pos) return pos.replace(/\{content\}/g, body) + (note ? (pos ? ', ' : '') + note : '');
  return body + (note ? ', ' + note : '');
}

function setVibeMode(mode) {
  illustCtx = illustCtx || { mode: 'off', vibe: null };
  illustCtx.mode = mode;
  $('#vibe-off').classList.toggle('active', mode === 'off');
  $('#vibe-vibe').classList.toggle('active', mode === 'vibe');
  $('#vibe-precise').classList.toggle('active', mode === 'precise');
  $('#vibe-detail').classList.toggle('hidden', mode === 'off');
  $('#vibe-strength-wrap').classList.toggle('hidden', mode !== 'vibe');
  $('#vibe-info-wrap').classList.toggle('hidden', mode !== 'vibe');
  $('#vibe-reftype-wrap').classList.toggle('hidden', mode !== 'precise');
  $('#vibe-fidelity-wrap').classList.toggle('hidden', mode !== 'precise');
}

function dataUriToBlob(uri) {
  const [meta, b64] = uri.split(',');
  const mime = (meta.match(/data:([^;]+)/) || [, 'image/png'])[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function buildIllCfg() {
  const size = NAI.SIZE_PRESETS[Number($('#ill-size').value)] || NAI.SIZE_PRESETS[0];
  return {
    prompt: (illustCtx && illustCtx.overridePrompt) || currentPrompt(),
    negative: ($('#ill-neg').value || '').trim(),
    width: size.w, height: size.h,
    steps: Number($('#ill-steps').value) || 28,
    scale: Number($('#ill-scale').value) || 5,
    sampler: $('#ill-sampler').value,
    seed: ($('#ill-seed').value || '').trim(),
    reference: (illustCtx && illustCtx.mode !== 'off' && illustCtx.vibe) ? {
      mode: illustCtx.mode, dataUri: illustCtx.vibe,
      strength: Number($('#vibe-strength').value), information: Number($('#vibe-info').value),
      refType: $('#vibe-reftype').value, fidelity: Number($('#vibe-fidelity').value)
    } : null
  };
}

async function illGenerate(times) {
  if (illBusy) return toast('正在生成中，请稍候');
  const api = curImgApi();
  const f = currentFrag();
  if (!f) return toast('请选择片段');
  persistFragmentFields();
  persistPromptFields();
  const cfg = buildIllCfg();
  if (!cfg.prompt) return toast('提示词为空，请填写片段内容或正面提示词');
  illBusy = true;
  $('#btn-ill-generate').disabled = true;
  $('#btn-ill-batch').disabled = true;
  const n = times || Math.max(1, Number($('#ill-count').value) || 1);
  const errors = [];
  for (let i = 0; i < n; i++) {
    try {
      toast(`生成中 ${i + 1}/${n}…`);
      const uris = await NAI.generateImage(api, cfg);
      for (const uri of uris) {
        const id = NAI.uid2();
        await NAI.putImageBlob(id, dataUriToBlob(uri));
        f.imageIds.push(id);
        if (!f.mainId) f.mainId = id;
        gallery.push({
          id, sessionId: activeId, msgIdx: illustCtx.msgIdx, fragId: f.id,
          seed: cfg.seed || null,
          params: { width: cfg.width, height: cfg.height, steps: cfg.steps, scale: cfg.scale, sampler: cfg.sampler, prompt: cfg.prompt, negative: cfg.negative },
          createdAt: Date.now()
        });
      }
      saveAll(); saveImgData();
      renderIllustFragments();
      renderIllPreview();
      renderMessages();
      await hydrateIllust();
    } catch (e) {
      errors.push(`第${i + 1}张：${e.message}`);
    }
  }
  illBusy = false;
  $('#btn-ill-generate').disabled = false;
  $('#btn-ill-batch').disabled = false;
  if (illustCtx) illustCtx.overridePrompt = null;
  toast(errors.length ? `完成，但${errors.length}张失败：${errors[0]}` : '生成完成');
}

/* ---------- AI 自动提示词（调用文本 API 提炼画面） ---------- */

const AUTO_SYS = '你是 NovelAI 画图提示词专家。把给定的小说片段提炼成可直接用于 NovelAI（动漫二次元风格）生图的英文提示词。\n硬性要求：\n1. 忠实还原人物形象：凡出场角色，必须按「角色形象设定」逐项写出发色、瞳色、发型、服饰、体态、表情；设定中未给出的外貌细节，可依据人物性格与身份合理补全，不得省略为泛泛的 1girl/1boy。\n2. 画面细节丰富：主体动作与姿势、多人互动关系、场景环境元素、时间天气、光影氛围、镜头构图（如 cowboy shot, from above）都要写到。\n3. tag 式英文短语、逗号分隔，positive 控制在 80-150 个词，不要压缩成一句概括。\n4. 只保留可画出的视觉信息，忽略心理与抽象描写；开头加画质 tag（best quality, amazing quality, very aesthetic, anime style）。\n5. 如给出「画风提示词」，将其并入 positive 末尾。\n只输出 JSON：{"positive":"英文提示词","negative":"英文负面提示词"}，不要输出任何其他文字。';

const LS_CHARS = 'inkan.chars.v1';
let charLib = load(LS_CHARS, '');

function parseCharLib(raw) {
 const docs = [];
 (raw || '').split('\n').forEach(line => {
 const t = line.trim();
 if (!t) return;
 const parts = t.split('|');
 const name = (parts[0] || '').trim();
 const desc = (parts[1] || '').trim();
 if (name && desc) docs.push(name + ': ' + desc);
 });
 return docs;
}

function saveCharLib() {
 charLib = $('#charlib').value;
 save(LS_CHARS, charLib);
}

async function aiMakePrompt(text, stylePos) {
 if (!settings.base || !settings.model) {
 toast('请先在「设置 → API 接入」配置文本 API');
 $('#modal-illust').classList.add('hidden');
 openSettings(); switchTab('api');
 throw new Error('未配置文本 API');
 }
 const docs = parseCharLib(charLib || $('#charlib').value);
 const userParts = [];
 if (docs.length) userParts.push('【角色形象设定】\n' + docs.join('\n'));
 if (stylePos) userParts.push('【画风提示词（并入 positive 末尾）】' + stylePos);
 userParts.push('【小说片段】\n' + text.slice(0, 1600));
 const url = settings.base.replace(/\/+$/, '') + '/chat/completions';
 const res = await fetch(url, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', ...(settings.key ? { Authorization: 'Bearer ' + settings.key } : {}) },
 body: JSON.stringify({
 model: settings.model, temperature: 0.8, max_tokens: 700,
 messages: [
 { role: 'system', content: AUTO_SYS },
 { role: 'user', content: userParts.join('\n\n') }
 ]
 })
 });
 if (!res.ok) throw new Error('HTTP ' + res.status);
 const j = await res.json();
 const raw = j.choices?.[0]?.message?.content || '';
 let pos = '', neg = '';
 const mjson = raw.match(/\{[\s\S]*\}/);
 if (mjson) { try { const o = JSON.parse(mjson[0]); pos = o.positive || ''; neg = o.negative || ''; } catch {} }
 if (!pos) pos = raw.replace(/```[\s\S]*?```/g, '').trim().slice(0, 400);
 if (!pos) throw new Error('AI 未返回有效提示词');
 return { pos, neg };
}

function currentStylePos() {
 const st = imgStyles.find(x => x.id === $('#ill-style').value);
 return st && st.pos ? st.pos.replace('{content}', '').trim() : '';
}

async function illAutoPrompt() {
  const f = currentFrag();
  if (!f) return;
  persistFragmentFields();
  const btn = $('#btn-ill-auto');
  btn.disabled = true; btn.textContent = 'AI 提炼中…';
  try {
    const r = await aiMakePrompt((f.note ? f.note + '：' : '') + f.text, currentStylePos());
    f.aiPrompt = r.pos; saveAll();
    $('#ill-pos').value = r.pos;
    if (r.neg) $('#ill-neg').value = r.neg;
    persistPromptFields();
    toast('AI 提示词已填入，可直接生成');
  } catch (e) {
    if (e.message !== '未配置文本 API') toast('AI 提示词失败：' + e.message);
  }
  btn.disabled = false; btn.textContent = 'AI 生成提示词';
}

async function illResplit() {
  const m = illustMsg();
  if (!m) return;
  askConfirm('按正文重新切分片段？已生成图片会保留（集中到第一个片段），各片段备注与张数将重置。', () => {
    const imgs = m.illust.fragments.flatMap(f => f.imageIds);
    const mainId = m.illust.fragments.map(f => f.mainId).find(Boolean) || imgs[0] || null;
    m.illust = null;
    ensureIllust(m);
    if (imgs.length) {
      const f0 = m.illust.fragments[0];
      f0.imageIds = imgs;
      f0.mainId = mainId;
    }
    illustCtx.fragIdx = 0;
    renderIllustFragments(); loadFragmentFields(); renderIllPreview();
    renderMessages(); hydrateIllust();
    toast('已按正文重新切分');
  });
}

async function illBatch() {
  if (illBusy) return toast('正在生成中，请稍候');
  const m = illustMsg();
  if (!m) return;
  persistFragmentFields();
  const plan = m.illust.fragments.map((f, i) => ({ f, i })).filter(x => x.f.autoCount > 0);
  if (!plan.length) return toast('没有片段设置自动张数（>0），无法批量');
  const autoMode = $('#ill-auto-mode').checked;
  const fails = [];
  for (const { f, i } of plan) {
    illustCtx.fragIdx = i;
    $('#ill-fragment').value = i;
    loadFragmentFields();
    renderIllustFragments();
    if (autoMode) {
      // 全自动：逐段调用文本 API 提炼画面提示词，无需手动输入
      try {
        const r = await aiMakePrompt((f.note ? f.note + '：' : '') + f.text, currentStylePos());
        illustCtx.overridePrompt = r.pos;
        $('#ill-pos').value = r.pos;
        if (r.neg && !$('#ill-neg').value.trim()) $('#ill-neg').value = r.neg;
        persistPromptFields();
      } catch (e) {
        fails.push(`片段${i + 1}提示词：${e.message}`);
        continue;
      }
    } else {
      illustCtx.overridePrompt = null;
    }
    await illGenerate(f.autoCount);
  }
  illustCtx.overridePrompt = null;
  toast('整章批量生图结束' + (fails.length ? `（${fails.length}段提示词失败：${fails[0]}）` : ''));
}

function renderIllPreview() {
  const box = $('#ill-preview');
  const f = currentFrag();
  box.innerHTML = '';
  if (!f || !f.imageIds.length) {
    box.innerHTML = '<div class="illust-empty">本片段还没有生成图</div>';
    return;
  }
  f.imageIds.forEach((id, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'ill-thumb' + (id === f.mainId ? ' main' : '');
    const img = document.createElement('img');
    img.dataset.imgid = id;
    img.alt = `生成图 ${i + 1}`;
    img.title = '点击设为片段主图';
    img.addEventListener('click', () => {
      f.mainId = id; saveAll(); renderIllPreview(); renderMessages(); hydrateIllust(); toast('已设为片段主图');
    });
    const num = document.createElement('span');
    num.className = 'ill-num';
    num.textContent = String(i + 1);
    wrap.appendChild(img);
    wrap.appendChild(num);
    box.appendChild(wrap);
    NAI.getImageUrl(id).then(u => { if (u) img.src = u; });
  });
}

async function illTranslate() {
  const fields = ['#ill-pos', '#ill-neg', '#ill-note'];
  let unmatched = [];
  for (const sel of fields) {
    const el = $(sel);
    const { result, unmatched: u } = NAI.translateZhToEn(el.value);
    if (result) el.value = result;
    unmatched.push(...u);
  }
  persistFragmentFields(); persistPromptFields();
  toast(unmatched.length ? `已翻译，未覆盖词：${unmatched.slice(0, 6).join('、')}（请手改）` : '已全部翻译为英文');
}

async function illImportMeta() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/png';
  inp.onchange = async () => {
    const file = inp.files[0];
    if (!file) return;
    const meta = await NAI.parsePngMetadata(file);
    if (!meta) return toast('未找到 PNG 元数据');
    if (meta.prompt) $('#ill-pos').value = meta.prompt;
    if (meta.negative) $('#ill-neg').value = meta.negative;
    if (meta.width) {
      const i = NAI.SIZE_PRESETS.findIndex(s => s.w === meta.width && s.h === meta.height);
      if (i >= 0) $('#ill-size').value = String(i);
      else { $('#ill-steps').value = meta.steps || $('#ill-steps').value; }
    }
    if (meta.steps) $('#ill-steps').value = meta.steps;
    if (meta.scale != null) $('#ill-scale').value = meta.scale;
    if (meta.sampler) {
      const has = [...$('#ill-sampler').options].some(o => o.value === meta.sampler);
      if (has) $('#ill-sampler').value = meta.sampler;
    }
    if (meta.seed != null) $('#ill-seed').value = meta.seed;
    persistPromptFields();
    toast('已从 PNG 元数据回填参数');
  };
  inp.click();
}

/* ---------- 图库 ---------- */

let galleryViewing = null;

function openGallery() {
  $('#gallery-detail').classList.add('hidden');
  $('#gallery-grid').classList.remove('hidden');
  renderGalleryGrid();
  $('#modal-gallery').classList.remove('hidden');
}

function renderGalleryGrid() {
  const grid = $('#gallery-grid');
  grid.innerHTML = '';
  $('#gallery-empty').classList.toggle('hidden', gallery.length > 0);
  [...gallery].reverse().forEach(g => {
    const wrap = document.createElement('div');
    wrap.className = 'gallery-thumb';
    const img = document.createElement('img');
    img.alt = '生成图';
    NAI.getImageUrl(g.id).then(u => { if (u) img.src = u; });
    img.addEventListener('click', () => showGalleryDetail(g));
    wrap.appendChild(img);
    grid.appendChild(wrap);
  });
}

function showGalleryDetail(g) {
  galleryViewing = g;
  $('#gallery-grid').classList.add('hidden');
  const d = $('#gallery-detail');
  d.classList.remove('hidden');
  const img = $('#gallery-img');
  img.removeAttribute('src');
  NAI.getImageUrl(g.id).then(u => { if (u) img.src = u; });
  const p = g.params || {};
  $('#gallery-meta').innerHTML = '';
  const lines = [
    p.prompt || '',
    p.negative ? '负向：' + p.negative : '',
    `${p.width}×${p.height} · steps ${p.steps} · scale ${p.scale} · ${p.sampler}${g.seed ? ' · seed ' + g.seed : ''}`,
    `生成时间：${new Date(g.createdAt).toLocaleString('zh-CN')}`
  ].filter(Boolean);
  lines.forEach(t => {
    const el = document.createElement('p');
    el.textContent = t;
    $('#gallery-meta').appendChild(el);
  });
}

async function galleryDownload() {
  if (!galleryViewing) return;
  const blob = await NAI.getImageBlob(galleryViewing.id);
  if (!blob) return toast('图片数据不存在');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `inkan-${galleryViewing.id}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function galleryRemove() {
  const g = galleryViewing;
  if (!g) return;
  askConfirm('从图库删除该图？片段引用会一并移除。', () => {
    gallery = gallery.filter(x => x.id !== g.id);
    for (const s of sessions) {
      const m = s.messages[g.msgIdx];
      if (m && m.illust) {
        for (const f of m.illust.fragments) {
          f.imageIds = f.imageIds.filter(x => x !== g.id);
          if (f.mainId === g.id) f.mainId = f.imageIds[0] || null;
        }
      }
    }
    NAI.deleteImageBlob(g.id);
    saveImgData(); saveAll();
    galleryViewing = null;
    $('#gallery-detail').classList.add('hidden');
    $('#gallery-grid').classList.remove('hidden');
    renderGalleryGrid(); renderMessages(); hydrateIllust();
    toast('已删除');
  });
}

/* ---------- 生图 API 预设（设置弹窗） ---------- */

function curImgApiEdit() { return imgApis.find(a => a.id === editImgApiId); }

function renderImgApiSelect() {
  const sel = $('#cfg-imgapi');
  sel.innerHTML = '';
  imgApis.forEach(a => {
    const o = document.createElement('option');
    o.value = a.id;
    o.textContent = a.name || '未命名预设';
    sel.appendChild(o);
  });
  sel.value = editImgApiId;
}

function loadImgApiFields() {
  const a = curImgApiEdit();
  if (!a) return;
  $('#cfg-img-name').value = a.name || '';
  $('#cfg-img-base').value = a.base || '';
  $('#cfg-img-key').value = a.key || '';
  $('#cfg-img-model').value = a.model || '';
}

function saveImgApiFields() {
  const a = curImgApiEdit();
  if (!a) return;
  a.name = $('#cfg-img-name').value.trim() || '未命名预设';
  a.base = $('#cfg-img-base').value.trim();
  a.key = $('#cfg-img-key').value.trim();
  a.model = $('#cfg-img-model').value.trim();
  imgOpts.activeApi = a.id;
  saveImgData();
}

async function testImgApi() {
  saveImgApiFields();
  const btn = $('#btn-imgapi-test');
  btn.disabled = true; btn.textContent = '测试中…';
  const r = await NAI.testImageApi(curImgApiEdit());
  toast(r.msg);
  btn.disabled = false; btn.textContent = '测试连接';
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
  $('#btn-export-sel-txt').addEventListener('click', () => exportSelected(false));
  $('#btn-export-sel-md').addEventListener('click', () => exportSelected(true));

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
    if (!e.target.closest('#ctx-menu')) {
      if (swallowNextMenuClose) swallowNextMenuClose = false;
      else closeCtxMenu();
    }
    if (!e.target.closest('.model-combo')) closeModelList();
    if (innerWidth <= 768 && !e.target.closest('#sidebar') && !e.target.closest('#btn-toggle-side')) {
      $('#sidebar').classList.add('collapsed');
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeCtxMenu(); document.querySelectorAll('.modal').forEach(m => { if (m.id !== 'modal-settings') m.classList.add('hidden'); }); }
  });

  bindLongPress();

  /* --- 生图接线 --- */
  $('#btn-gallery').addEventListener('click', openGallery);
  $('#gallery-download').addEventListener('click', galleryDownload);
  $('#gallery-remove').addEventListener('click', galleryRemove);
  $('#gallery-back').addEventListener('click', () => {
    $('#gallery-detail').classList.add('hidden');
    $('#gallery-grid').classList.remove('hidden');
    renderGalleryGrid();
  });

  $('#cfg-imgapi').addEventListener('change', () => {
    editImgApiId = $('#cfg-imgapi').value;
    loadImgApiFields();
  });
  $('#btn-imgapi-add').addEventListener('click', () => {
    const a = { id: NAI.uid2(), name: '生图预设 ' + (imgApis.length + 1), base: '', key: '', model: 'nai-diffusion-4-5-full' };
    imgApis.push(a);
    editImgApiId = a.id;
    renderImgApiSelect(); loadImgApiFields();
    toast('已新增生图预设，填写后点「保存」');
  });
  $('#btn-imgapi-del').addEventListener('click', () => {
    if (imgApis.length <= 1) return toast('至少保留一套生图预设');
    const a = curImgApiEdit();
    askConfirm(`删除生图预设「${a.name}」？`, () => {
      imgApis = imgApis.filter(x => x.id !== editImgApiId);
      if (imgOpts.activeApi === editImgApiId) imgOpts.activeApi = imgApis[0].id;
      editImgApiId = imgOpts.activeApi;
      renderImgApiSelect(); loadImgApiFields(); saveImgData();
      toast('生图预设已删除');
    });
  });
  $('#btn-imgapi-test').addEventListener('click', testImgApi);
  $('#btn-illust-open').addEventListener('click', () => {
    const s = activeSession();
    if (!s || !s.messages.length) return toast('当前章节还没有正文');
    const idx = (() => { for (let i = s.messages.length - 1; i >= 0; i--) if (s.messages[i].role === 'assistant') return i; return -1; })();
    if (idx < 0) return toast('本章还没有 AI 正文可配图');
    $('#modal-settings').classList.add('hidden');
    openIllust(idx);
  });

  $('#ill-fragment').addEventListener('change', () => {
    persistFragmentFields();
    illustCtx.fragIdx = Number($('#ill-fragment').value) || 0;
    loadFragmentFields();
    renderIllPreview();
  });
  ['ill-text', 'ill-note', 'ill-count', 'ill-style'].forEach(id => {
    $('#' + id).addEventListener('change', persistFragmentFields);
  });
  $('#ill-style').addEventListener('change', () => {
    const st = imgStyles.find(x => x.id === $('#ill-style').value);
    if (!st) return;
    if (st.pos) $('#ill-pos').value = st.pos;
    if (st.neg) $('#ill-neg').value = st.neg;
    const p = st.params || {};
    if (p.width) {
      const i = NAI.SIZE_PRESETS.findIndex(s => s.w === p.width && s.h === p.height);
      if (i >= 0) $('#ill-size').value = String(i);
    }
    if (p.steps) $('#ill-steps').value = p.steps;
    if (p.scale != null) $('#ill-scale').value = p.scale;
    if (p.sampler) $('#ill-sampler').value = p.sampler;
    persistPromptFields();
  });
  ['ill-pos', 'ill-neg'].forEach(id => $('#' + id).addEventListener('change', persistPromptFields));
  $('#btn-ill-translate').addEventListener('click', illTranslate);
  $('#btn-ill-import-meta').addEventListener('click', illImportMeta);
  $('#btn-ill-generate').addEventListener('click', () => illGenerate());
  $('#btn-ill-batch').addEventListener('click', illBatch);
  $('#btn-ill-auto').addEventListener('click', illAutoPrompt);
 $('#charlib').addEventListener('change', saveCharLib);
  $('#btn-ill-resplit').addEventListener('click', illResplit);

  $('#vibe-off').addEventListener('click', () => setVibeMode('off'));
  $('#vibe-vibe').addEventListener('click', () => setVibeMode('vibe'));
  $('#vibe-precise').addEventListener('click', () => setVibeMode('precise'));
  $('#vibe-pick').addEventListener('click', () => $('#vibe-file').click());
  $('#vibe-file').addEventListener('change', () => {
    const file = $('#vibe-file').files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      illustCtx.vibe = reader.result;
      const pv = $('#vibe-preview');
      pv.src = reader.result;
      pv.classList.remove('hidden');
      toast('参考图已就绪');
    };
    reader.readAsDataURL(file);
  });
  [['vibe-strength', 'vibe-strength-val'], ['vibe-info', 'vibe-info-val'], ['vibe-fidelity', 'vibe-fidelity-val']].forEach(([s, v]) => {
    $('#' + s).addEventListener('input', () => { $('#' + v).textContent = $('#' + s).value; });
  });

  renderAll();
}

init();
