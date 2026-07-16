// แชท — ใช้ร่วมกันทั้งฝั่งผู้ว่าจ้างและฝั่งแคร์กิฟเวอร์
// ต้องโหลดก่อนไฟล์นี้: /socket.io/socket.io.js แล้วก็ frame.js (ใช้ ME, view, api, esc, ICONS, ...)
//
// ของเดิมเป็น polling ทุก 3 วิ แล้ว innerHTML ทับทั้งกล่อง — ตอนนี้เปลี่ยนเป็น Socket.IO
// และต่อข้อความใหม่เข้าไปทีละฟอง (ไม่ล้างของเก่า) → ไม่กระพริบ ไม่ดีดสกรอลล์ ไม่ตัดคำที่กำลังเลือกอยู่

let socket = null;
let curChat = null;              // { jobId, otherId } — ห้องที่เปิดค้างอยู่ตอนนี้ (null = ไม่ได้เปิด)

const shownIds = new Set();      // id ข้อความที่วาดไปแล้ว — กันวาดซ้ำเวลา event มาชนกับ REST
const presence = new Map();      // userId → { online, last_seen_at }

let hideTypingTimer = null;      // ซ่อนป้าย "กำลังพิมพ์" ถ้าอีกฝั่งเงียบไป
let typingOffTimer = null;       // บอกอีกฝั่งว่าเราหยุดพิมพ์แล้ว
let lastTypingPing = 0;          // กันยิง event ถี่เกินตอนพิมพ์รัว ๆ

// ============================================================
//  ท่อสด
// ============================================================
function initRealtime() {
  if (socket || typeof io !== 'function') return;

  // ต่อด้วย cookie เดิมของเว็บ — ฝั่ง server ตรวจ tch_token ตอน handshake (src/realtime.js)
  socket = io();

  socket.on('chat:new', onIncoming);
  socket.on('chat:read', onRead);
  socket.on('chat:typing', onTyping);
  socket.on('presence', onPresence);

  // เน็ตหลุดแล้วกลับมา = ระหว่างนั้นอาจมีข้อความที่เราพลาดไป → ดึงห้องที่เปิดอยู่ใหม่ทั้งห้อง
  socket.on('connect', () => {
    if (curChat) loadMsgs();
    else if (TAB === 'chat') viewChat();
  });

  // กลับมาดูแท็บนี้อีกครั้ง = ถือว่าอ่านแล้ว
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') markRead();
  });
}

// ============================================================
//  ออนไลน์ / เห็นล่าสุด
// ============================================================
function setPresence(userId, online, lastSeenAt) {
  const cur = presence.get(Number(userId)) || {};
  presence.set(Number(userId), {
    online,
    // ออฟไลน์เมื่อไหร่ให้จับเวลาด้วยนาฬิกาเครื่องเราเอง (server ไม่ได้ส่งเวลามาให้ — ตั้งใจ ดู realtime.js)
    last_seen_at: online ? null : (lastSeenAt ?? cur.last_seen_at ?? new Date().toISOString()),
  });
}

function onPresence({ user_id, online }) {
  setPresence(user_id, online);

  // อัปเดตทั้ง 2 ที่ที่โชว์สถานะอยู่: หัวห้องแชท กับ จุดเขียวในรายการห้อง
  if (curChat && Number(curChat.otherId) === Number(user_id)) paintChatHead();

  const dot = document.querySelector(`.thread[data-other="${user_id}"] .presence-dot`);
  if (dot) dot.classList.toggle('on', online);
}

function lastSeenText(userId) {
  const p = presence.get(Number(userId));
  if (!p) return '';
  if (p.online) return 'ออนไลน์';
  if (!p.last_seen_at) return 'ออฟไลน์';

  const mins = Math.floor((Date.now() - new Date(p.last_seen_at)) / 60000);
  if (mins < 1) return 'เห็นล่าสุดเมื่อสักครู่';        // ติดลบด้วย (นาฬิกา 2 เครื่องคลาดกันได้) → เหมาเป็น "เมื่อสักครู่"
  if (mins < 60) return `เห็นล่าสุด ${mins} นาทีที่แล้ว`;
  if (mins < 1440) return `เห็นล่าสุด ${Math.floor(mins / 60)} ชม.ที่แล้ว`;
  if (mins < 10080) return `เห็นล่าสุด ${Math.floor(mins / 1440)} วันที่แล้ว`;
  return `เห็นล่าสุด ${fmtTime(p.last_seen_at)}`;
}

// ============================================================
//  รายการห้องแชท
// ============================================================
const previewOf = (t) =>
  t.last_kind === 'image' ? '📷 รูปภาพ' : (t.last_message || 'ยังไม่มีข้อความ');

async function viewChat() {
  const { items } = await api('/api/chat/threads');
  items.forEach((t) => setPresence(t.other_id, t.other_online, t.other_last_seen));

  view.innerHTML = `
    <h2>แชท</h2>
    <p class="sub">คุยตกลงระยะเวลางานและราคา</p>
    ${items.length ? items.map((t) => `
      <div class="thread" data-job="${t.job_id}" data-other="${t.other_id}"
           data-name="${esc(t.other_name)}" data-title="${esc(t.title)}">
        <div class="thread-avatar">
          <div class="avatar">${esc(initial(t.other_name))}</div>
          <span class="presence-dot ${t.other_online ? 'on' : ''}" title="${t.other_online ? 'ออนไลน์' : 'ออฟไลน์'}"></span>
        </div>
        <div class="thread-body">
          <strong>${esc(t.other_name)}</strong>
          <small>${esc(t.title)}</small>
          <small class="thread-last ${t.unread ? 'unread' : ''}">${esc(previewOf(t))}</small>
        </div>
        <div class="thread-side">
          ${t.last_at ? `<time>${esc(fmtTime(t.last_at))}</time>` : ''}
          ${t.unread ? `<span class="thread-badge">${t.unread > 9 ? '9+' : t.unread}</span>` : ''}
        </div>
      </div>`).join('')
      : emptyBox('ยังไม่มีห้องแชท<br>กดขอรับงาน หรือรอคนมาขอรับงานของคุณ')}`;

  $$('.thread', view).forEach((t) =>
    (t.onclick = () => openChat(t.dataset.job, t.dataset.other, t.dataset.name, t.dataset.title)));
}

// ============================================================
//  ห้องแชท (เปิดทับเต็มจอ)
// ============================================================
function closeChat() {
  if (curChat) sendTyping(false);
  curChat = null;
  shownIds.clear();
  clearTimeout(hideTypingTimer);
  clearTimeout(typingOffTimer);
  document.querySelector('.chat-room')?.remove();
}

async function openChat(jobId, otherId, name, title) {
  // เปิดจากหน้า "ผู้สมัคร" จะไม่มีชื่อส่งมา — ไปหยิบจากรายการห้องแชทแทน
  if (!name) {
    const { items } = await api('/api/chat/threads');
    const t = items.find((x) => String(x.job_id) === String(jobId) && String(x.other_id) === String(otherId));
    name = t?.other_name || 'แชท';
    title = t?.title || '';
  }

  closeChat();
  curChat = { jobId: Number(jobId), otherId: Number(otherId), name };

  const room = document.createElement('div');
  room.className = 'chat-room';
  room.innerHTML = `
    <div class="chat-head">
      <button class="icon-btn" id="chatBack" aria-label="กลับ">${ICONS.back}</button>
      <div class="thread-avatar">
        <div class="avatar">${esc(initial(name))}</div>
        <span class="presence-dot" id="chatDot"></span>
      </div>
      <div style="flex:1;min-width:0">
        <strong>${esc(name)}</strong>
        <small id="chatStatus">${esc(title || '')}</small>
      </div>
    </div>

    <div class="chat-msgs" id="chatMsgs"></div>

    <form class="chat-input" id="chatForm">
      <input type="file" id="chatFile" accept="image/*" hidden>
      <button type="button" class="icon-btn attach" id="chatAttach" aria-label="ส่งรูป">${ICONS.photo}</button>
      <input id="chatText" placeholder="พิมพ์ข้อความ..." autocomplete="off">
      <button class="btn" aria-label="ส่ง">${ICONS.send}</button>
    </form>`;
  document.body.appendChild(room);

  $('#chatBack', room).onclick = () => {
    closeChat();
    if (TAB === 'chat') viewChat();
  };

  $('#chatForm', room).onsubmit = (e) => {
    e.preventDefault();
    sendText();
  };

  $('#chatText', room).oninput = () => sendTyping(true);

  $('#chatAttach', room).onclick = () => $('#chatFile', room).click();
  $('#chatFile', room).onchange = (e) => {
    const file = e.target.files[0];
    e.target.value = '';                 // เลือกรูปเดิมซ้ำได้ (ไม่งั้น onchange ไม่ยิงรอบ 2)
    if (file) sendImage(file);
  };

  await loadMsgs();
}

// โหลดทั้งห้องใหม่ — ใช้ตอนเปิดห้อง และตอน socket กลับมาต่อติดหลังเน็ตหลุด
async function loadMsgs() {
  const box = $('#chatMsgs');
  if (!curChat || !box) return;

  try {
    const r = await api(`/api/chat/${curChat.jobId}?with=${curChat.otherId}`);
    if (!r || !curChat) return;

    setPresence(curChat.otherId, r.other_online, r.other_last_seen);
    paintChatHead();

    shownIds.clear();
    box.innerHTML = '';
    r.items.forEach((m) => addMessage(m, { scroll: false }));

    if (!r.items.length) {
      box.innerHTML = '<p class="chat-hint">ยังไม่มีข้อความ — ทักทายกันก่อนเลย</p>';
    }
    box.scrollTop = box.scrollHeight;
  } catch { /* เงียบไว้ — เดี๋ยว socket ต่อติดแล้วดึงใหม่เอง */ }
}

function paintChatHead() {
  if (!curChat) return;
  const p = presence.get(curChat.otherId) || {};
  $('#chatDot')?.classList.toggle('on', !!p.online);

  const el = $('#chatStatus');
  if (el && !el.dataset.typing) el.textContent = lastSeenText(curChat.otherId);
}

// ============================================================
//  วาดข้อความ
// ============================================================
// ติ๊กสถานะ — โชว์เฉพาะฝั่งเรา (ข้อความคนอื่นเราไม่ต้องรู้ว่าเขาส่งถึงเราตอนไหน)
//   นาฬิกา = กำลังส่ง · ติ๊ก 1 = ส่งแล้ว · ติ๊ก 2 (สว่าง) = อ่านแล้ว
function ticksHtml(m) {
  if (m.sender_id !== ME.id) return '';
  if (m.pending) return `<span class="ticks pending" title="กำลังส่ง">${ICONS.clock}</span>`;
  if (m.read_at) return `<span class="ticks read" title="อ่านแล้ว">${ICONS.ticks}</span>`;
  return `<span class="ticks" title="ส่งแล้ว">${ICONS.tick}</span>`;
}

function bodyHtml(m) {
  if (m.kind !== 'image') return `<span class="msg-text">${esc(m.body)}</span>`;

  // จองพื้นที่ตามสัดส่วนรูปไว้ก่อน — รูปโหลดเสร็จแล้วหน้าจะได้ไม่กระตุก
  const ratio = m.image_w && m.image_h ? `style="aspect-ratio:${m.image_w}/${m.image_h}"` : '';
  const src = m.local_url || `/api/chat/image/${m.id}`;

  // กดรูป = เปิดดูเต็ม ๆ ในแท็บใหม่ (ยืมตัวดูรูปของเบราว์เซอร์มาใช้ ไม่ต้องเขียน lightbox เอง)
  const img = `<img class="msg-img" src="${src}" ${ratio} alt="รูปที่ส่งในแชท" loading="lazy">`;
  return m.local_url ? img : `<a href="/api/chat/image/${m.id}" target="_blank" rel="noopener">${img}</a>`;
}

function addMessage(m, { scroll = true } = {}) {
  const box = $('#chatMsgs');
  if (!box) return;
  if (m.id && shownIds.has(m.id)) return;   // มาสองทาง (ack + broadcast) → เอาอันแรกพอ

  $('.chat-hint', box)?.remove();

  // ฟองที่โชว์ล่วงหน้าตอนกดส่ง — พอของจริงกลับมา ให้เอาของจริงแทนที่
  //   เช็ค sender_id ด้วย: client_id ของอีกฝั่งก็เด้งมาถึงเราเหมือนกัน แต่ไม่ใช่ของเรา ห้ามเอามาใช้
  //   CSS.escape: client_id เป็นค่าที่ "อีกเครื่อง" สร้างมา — ยัดตรง ๆ ลง selector แล้วเจอค่าพิลึก selector จะพัง
  if (m.client_id && m.sender_id === ME.id) {
    box.querySelector(`[data-tmp="${CSS.escape(m.client_id)}"]`)?.remove();
  }
  if (m.id) shownIds.add(m.id);

  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;

  const el = document.createElement('div');
  el.className = `msg ${m.sender_id === ME.id ? 'me' : 'them'} ${m.kind === 'image' ? 'has-img' : ''}`;
  if (m.id) el.dataset.id = m.id;
  if (m.pending) el.dataset.tmp = m.client_id;
  el.innerHTML = `${bodyHtml(m)}<span class="msg-meta"><time>${esc(fmtTime(m.created_at))}</time>${ticksHtml(m)}</span>`;
  box.appendChild(el);

  if (scroll && (atBottom || m.sender_id === ME.id)) box.scrollTop = box.scrollHeight;
}

// ============================================================
//  รับของสด
// ============================================================
const inCurChat = (m) =>
  curChat && Number(m.job_id) === curChat.jobId &&
  [m.sender_id, m.receiver_id].includes(curChat.otherId);

function onIncoming(m) {
  if (inCurChat(m)) {
    addMessage(m);
    if (m.sender_id === curChat.otherId) {
      hideTyping();                                        // ส่งข้อความมาแล้ว = เลิกพิมพ์แล้ว
      if (document.visibilityState === 'visible') markRead();
    }
    return;
  }

  // ไม่ได้เปิดห้องนี้อยู่ → อัปเดตเลขแดงบนแท็บ + รายการห้อง (ถ้ากำลังดูรายการอยู่)
  if (m.receiver_id === ME.id) refreshBadges();
  if (TAB === 'chat' && !curChat) viewChat();
}

function onRead({ job_id, by, ids }) {
  if (!curChat || Number(job_id) !== curChat.jobId || by !== curChat.otherId) return;

  // อีกฝั่งกดอ่านข้อความของเราแล้ว → เปลี่ยนติ๊กเป็น "อ่านแล้ว"
  ids.forEach((id) => {
    const tick = document.querySelector(`.msg[data-id="${id}"] .ticks`);
    if (!tick) return;
    tick.className = 'ticks read';
    tick.title = 'อ่านแล้ว';
    tick.innerHTML = ICONS.ticks;
  });
}

function markRead() {
  if (!curChat || !socket) return;
  socket.emit('chat:read', { jobId: curChat.jobId, otherId: curChat.otherId });
  refreshBadges();
}

// ============================================================
//  กำลังพิมพ์
// ============================================================
function onTyping({ job_id, from, on }) {
  if (!curChat || Number(job_id) !== curChat.jobId || from !== curChat.otherId) return;
  if (!on) return hideTyping();

  const el = $('#chatStatus');
  if (!el) return;
  el.dataset.typing = '1';
  el.textContent = 'กำลังพิมพ์...';
  el.classList.add('typing');

  // กันป้ายค้าง: ถ้าอีกฝั่งปิดแท็บหนีไปเฉย ๆ event 'หยุดพิมพ์' จะไม่มีวันมา
  clearTimeout(hideTypingTimer);
  hideTypingTimer = setTimeout(hideTyping, 5000);
}

function hideTyping() {
  clearTimeout(hideTypingTimer);
  const el = $('#chatStatus');
  if (!el) return;
  delete el.dataset.typing;
  el.classList.remove('typing');
  paintChatHead();
}

function sendTyping(on) {
  if (!curChat || !socket) return;
  const ping = () => socket.emit('chat:typing', { jobId: curChat.jobId, to: curChat.otherId, on });

  clearTimeout(typingOffTimer);

  if (!on) return ping();

  // พิมพ์รัว ๆ ไม่ต้องยิงทุกตัวอักษร — 2 วิครั้งพอ แล้วนิ่งไป 2.5 วิค่อยบอกว่าหยุดแล้ว
  if (Date.now() - lastTypingPing > 2000) {
    lastTypingPing = Date.now();
    ping();
  }
  typingOffTimer = setTimeout(() => sendTyping(false), 2500);
}

// ============================================================
//  ส่งข้อความ
// ============================================================
const newClientId = () => `c${Date.now()}${Math.random().toString(16).slice(2, 8)}`;

// ฟองที่โชว์ทันทีตอนกดส่ง (ยังไม่ถึง server) — ให้ความรู้สึกว่าแอพไว
function showPending(client_id, extra) {
  addMessage({
    client_id,
    pending: true,
    sender_id: ME.id,
    receiver_id: curChat.otherId,
    job_id: curChat.jobId,
    created_at: new Date().toISOString(),
    kind: 'text',
    ...extra,
  });
}

function sendText() {
  const input = $('#chatText');
  const body = input.value.trim();
  if (!body || !curChat) return;

  input.value = '';
  sendTyping(false);

  const client_id = newClientId();
  showPending(client_id, { body });

  const chat = curChat;
  const fail = (msg) => {
    document.querySelector(`[data-tmp="${client_id}"]`)?.remove();
    if (curChat === chat && !input.value) input.value = body;   // คืนข้อความให้ ไม่ต้องพิมพ์ใหม่
    toast(msg);
  };

  // ปกติไปทาง socket — ถ้าท่อไม่ติด (เน็ตบางที่บล็อก WebSocket) ค่อยถอยไปใช้ REST
  if (socket?.connected) {
    socket.emit('chat:send', { jobId: chat.jobId, to: chat.otherId, body, client_id }, (r) => {
      if (r?.error) return fail(r.error);
      if (r?.message) addMessage(r.message);
    });
    return;
  }

  api(`/api/chat/${chat.jobId}`, {
    method: 'POST',
    body: JSON.stringify({ body, to: chat.otherId, client_id }),
  })
    .then((r) => r?.message && addMessage(r.message))
    .catch((e) => fail(e.message));
}

// ============================================================
//  ส่งรูป
// ============================================================
const MAX_SIDE = 1600;   // ด้านยาวสุดหลังย่อ — พอสำหรับดูบัตร/ใบยา/สภาพบ้าน ไม่ต้องใหญ่กว่านี้

// ย่อรูปที่เครื่องคนส่งก่อนอัป — รูปจากมือถือใบละ 5-10 MB อัปตรงคือรอเป็นนาทีบนเน็ตบ้าน
// ผลพลอยได้: canvas ทิ้ง EXIF ทั้งก้อน → พิกัด GPS ที่ฝังมากับรูปหลุดไปกับรูปไม่ได้
async function shrinkImage(file) {
  // GIF ย่อแล้วภาพเคลื่อนไหวหาย (canvas ได้เฟรมเดียว) → ส่งไฟล์เดิมไปเลย
  if (file.type === 'image/gif' || typeof createImageBitmap !== 'function') return { blob: file };

  try {
    // imageOrientation: รูปจากมือถือฝังมุมหมุนไว้ใน EXIF — ไม่สั่งอันนี้รูปจะตะแคง
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close?.();

    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.82));
    return blob ? { blob, w, h } : { blob: file };
  } catch {
    return { blob: file };   // ย่อไม่ได้ก็ส่งของเดิม ให้ลิมิต 8 MB ฝั่ง server เป็นคนปัดตก
  }
}

async function sendImage(file) {
  if (!curChat) return;
  if (!file.type.startsWith('image/')) return toast('ส่งได้เฉพาะไฟล์รูป');

  const chat = curChat;
  const client_id = newClientId();
  const localUrl = URL.createObjectURL(file);

  // โชว์รูปจากเครื่องตัวเองไปก่อนเลย ไม่ต้องรออัปเสร็จ
  showPending(client_id, { kind: 'image', local_url: localUrl });

  try {
    const { blob, w, h } = await shrinkImage(file);

    const fd = new FormData();
    fd.append('client_id', client_id);
    if (w) { fd.append('w', w); fd.append('h', h); }
    fd.append('image', blob, 'photo.jpg');

    // ต้องบอกคู่สนทนาทาง query — ด่านตรวจสิทธิ์ทำงานก่อน multer จะเขียนไฟล์ลงดิสก์ (ตอนนั้นยังอ่าน body ไม่ได้)
    const r = await api(`/api/chat/${chat.jobId}/image?with=${chat.otherId}`, { method: 'POST', body: fd });
    if (r?.message) addMessage(r.message);
  } catch (e) {
    document.querySelector(`[data-tmp="${client_id}"]`)?.remove();
    toast(e.message || 'ส่งรูปไม่สำเร็จ');
  } finally {
    URL.revokeObjectURL(localUrl);
  }
}

// หมายเหตุ: ระบบให้ดาว/รีวิว ถูกปิดไว้ชั่วคราว (ตกลงกัน 2026-07-14)
// โค้ดฝั่ง backend (src/routes/reviews.js) กับตาราง reviews ยังอยู่ครบ เปิดกลับได้ทันที
