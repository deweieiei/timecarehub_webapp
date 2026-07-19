// แชท — ใช้ร่วมกันทั้งฝั่งผู้ว่าจ้างและฝั่งแคร์กิฟเวอร์
// ต้องโหลดก่อนไฟล์นี้: /socket.io/socket.io.js แล้วก็ frame.js (ใช้ ME, view, api, esc, ICONS, ...)
//
// ข้อความวิ่งผ่าน Socket.IO ทางเดียว ไม่มีทางถอย REST แล้ว
//   — เน็ตที่บล็อก WebSocket socket.io ถอยไปใช้ HTTP long-polling ให้เองอยู่แล้ว
//     ทางถอยที่เขียนเองซ้ำอีกชั้นไม่ได้ช่วยอะไร มีแต่ทำให้ต้องกันยิงรัว 2 ที่ แล้ววันหนึ่งจะลืมที่นึง
// รูปยังไปทาง HTTP POST: ไฟล์ใหญ่ยิงผ่าน WebSocket แล้วบล็อกข้อความอื่นทั้งเส้น

let socket = null;
let curChat = null;              // { jobId, otherId } — ห้องที่เปิดค้างอยู่ตอนนี้ (null = ไม่ได้เปิด)

const shownIds = new Set();      // id ข้อความที่วาดไปแล้ว — กันวาดซ้ำเวลา event มาชนกับ REST
const presence = new Map();      // userId → { online, last_seen_at }

const outbox = new Map();        // client_id → ฟังก์ชันส่งซ้ำ (ฟองไหนล้ม แตะที่ฟองเพื่อยิงใหม่)
const blobUrls = new Map();      // client_id → object URL ของรูปที่ยังส่งไม่เสร็จ (ต้องคืนหน่วยความจำเอง)

let oldestId = null;             // id ฟองบนสุดที่โหลดมาแล้ว — หมุดสำหรับขอของเก่าต่อ
let hasMore = false;             // ยังมีข้อความเก่ากว่านี้ให้โหลดอีกไหม
let loadingOlder = false;

let hideTypingTimer = null;      // ซ่อนป้าย "กำลังพิมพ์" ถ้าอีกฝั่งเงียบไป
let typingOffTimer = null;       // บอกอีกฝั่งว่าเราหยุดพิมพ์แล้ว
let lastTypingPing = 0;          // กันยิง event ถี่เกินตอนพิมพ์รัว ๆ

const SEND_TIMEOUT = 12000;      // รอ ack นานสุดเท่านี้ แล้วถือว่าส่งไม่สำเร็จ

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

  // งานของฉันถูกยกเลิก/เปลี่ยนสถานะ (ข้อ 6) — เด้งให้เห็นทันที ไม่ต้องรอรอบ poll 15 วิ
  // toast อย่างเดียวไม่พอ: เผลอมองไม่ทันแล้วหายไปเลย → เลขบนกระดิ่งต้องขึ้นด้วย
  socket.on('notify', (n) => {
    toast(`🔔 ${n.title}`, 5000);
    refreshBadges();
    // เปิดแท็บภารกิจ/แชทค้างอยู่ = รายการบนจอตอนนี้เก่าไปแล้ว วาดใหม่ให้เลย
    if (TAB === 'chat' && !curChat) viewChat();
  });

  // เน็ตหลุดแล้วกลับมา = ระหว่างนั้นอาจมีข้อความที่เราพลาดไป → ดึงห้องที่เปิดอยู่ใหม่
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
  // กรองตามบทบาทหน้าปัจจุบัน — แคร์กิฟเวอร์เห็นแต่ห้องผู้ว่าจ้าง / ผู้ว่าจ้างเห็นแต่ห้องแคร์กิฟเวอร์
  const { items } = await api(`/api/chat/threads?role=${ME.active_role}`);
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
  outbox.clear();
  blobUrls.forEach((url) => URL.revokeObjectURL(url));   // ปิดห้องทั้งที่รูปยังส่งไม่เสร็จ = คืนหน่วยความจำซะ
  blobUrls.clear();

  oldestId = null;
  hasMore = false;
  loadingOlder = false;

  clearTimeout(hideTypingTimer);
  clearTimeout(typingOffTimer);
  document.querySelector('.chat-room')?.remove();
}

async function openChat(jobId, otherId, name, title) {
  // เปิดจากหน้า "ผู้สมัคร" จะไม่มีชื่อส่งมา — ไปหยิบจากรายการห้องแชทแทน
  if (!name) {
    const { items } = await api(`/api/chat/threads?role=${ME.active_role}`);
    const t = items.find((x) => String(x.job_id) === String(jobId) && String(x.other_id) === String(otherId));
    name = t?.other_name || 'แชท';
    title = t?.title || '';
  }

  closeChat();
  curChat = { jobId: Number(jobId), otherId: Number(otherId), name };

  // ปุ่มมุมขวาบนหัวห้อง — แล้วแต่บทบาท: แคร์กิฟเวอร์ดูรายละเอียดงาน / ผู้ว่าจ้างดูบัตรแคร์กิฟเวอร์
  const ctx = ME.active_role === 'employer'
    ? { icon: ICONS.kyc, label: 'ดูบัตรแคร์กิฟเวอร์' }
    : { icon: ICONS.applied, label: 'ดูรายละเอียดงาน' };

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
      <button class="icon-btn" id="chatContext" title="${ctx.label}" aria-label="${ctx.label}">${ctx.icon}</button>
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

  $('#chatContext', room).onclick = (e) => withSpin(e.currentTarget, () => openChatContext());

  $('#chatForm', room).onsubmit = (e) => {
    e.preventDefault();
    sendText();
  };

  $('#chatText', room).oninput = () => sendTyping(true);

  // เลื่อนขึ้นเกือบสุด = ขอข้อความเก่าเพิ่มอีกหน้า
  $('#chatMsgs', room).onscroll = (e) => {
    if (e.target.scrollTop < 80) loadOlder();
  };

  $('#chatAttach', room).onclick = () => $('#chatFile', room).click();
  $('#chatFile', room).onchange = (e) => {
    const file = e.target.files[0];
    e.target.value = '';                 // เลือกรูปเดิมซ้ำได้ (ไม่งั้น onchange ไม่ยิงรอบ 2)
    if (file) sendImage(file);
  };

  await loadMsgs();
}

// ============================================================
//  ปุ่มบนหัวห้องแชท — ดูรายละเอียดงาน (แคร์กิฟเวอร์) / ดูบัตรแคร์กิฟเวอร์ (ผู้ว่าจ้าง)
// ============================================================
async function openChatContext() {
  if (!curChat) return;

  // ผู้ว่าจ้าง → เปิดบัตรแคร์กิฟเวอร์ที่กำลังคุย (ฟังก์ชันอยู่ใน employer.js)
  if (ME.active_role === 'employer') {
    if (typeof openCardSheet === 'function') return openCardSheet(curChat.otherId);
    return;
  }

  // แคร์กิฟเวอร์ → เปิดรายละเอียดงานที่กำลังคุย
  try {
    const { job } = await api(`/api/jobs/${curChat.jobId}`);
    openChatJobSheet(job);
  } catch (e) { toast(e.message, 4200); }
}

// แผ่นรายละเอียดงาน (อ่านอย่างเดียว — กำลังคุยกันอยู่แล้ว ไม่ต้องมีปุ่มรับ/ขอรับงาน)
function openChatJobSheet(j) {
  if (!j) return;
  document.querySelector('.sheet-backdrop')?.remove();

  const row = (k, v) => (v ? `<div class="sheet-row"><div class="k">${k}</div><div class="v">${v}</div></div>` : '');
  const period = fmtPeriod(j);

  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = `
    <div class="sheet">
      <div class="sheet-grip"></div>
      <div class="sheet-head">
        <h3>${esc(j.title)}</h3>
        <button class="sheet-close" aria-label="ปิด">✕</button>
      </div>

      <div class="meta" style="margin-top:8px">
        <span class="badge badge-${j.status}">${STATUS_TH[j.status] || esc(j.status)}</span>
        <span class="chip">${CARE_TYPE_TH[j.care_type]}</span>
        <span class="chip">${j.hire_type === 'direct' ? 'จ้างตรง' : 'งานโพส'}</span>
      </div>

      <div class="sheet-price">
        <b>฿${fmtBaht(j.budget)}</b>
        <span>${UNIT_TH[j.budget_unit]}</span>
        <span style="margin-left:auto;font-size:12.5px">งบตั้งต้น — ต่อรองในแชทได้</span>
      </div>

      ${row('ผู้ว่าจ้าง', esc(j.employer_name || '-'))}
      ${row('อาการผู้สูงอายุ', esc(j.elder_condition || '') || '<span style="color:var(--muted)">ไม่ได้ระบุ</span>')}
      ${row('สิ่งที่ต้องทำ', esc(j.tasks || '') || '<span style="color:var(--muted)">ไม่ได้ระบุ</span>')}
      ${row('ช่วงเวลา', period || '<span style="color:var(--muted)">ยืดหยุ่น / ตกลงกันภายหลัง</span>')}
      ${row('ตำแหน่ง', j.address
        ? `📍 ${esc(j.address)}`
        : (j.area_label ? `📍 ${esc(j.area_label)} (โดยประมาณ)` : '<span style="color:var(--muted)">ไม่ได้ระบุ</span>'))}
      ${j.status === 'cancelled' && j.cancel_reason
        ? row('ยกเลิกโดย', `<span style="color:var(--red)">${cancelledByLabel(j) || '-'} — ${esc(j.cancel_reason)}</span>`) : ''}
    </div>`;

  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
  backdrop.querySelector('.sheet-close').onclick = close;
  const onEsc = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } };
  document.addEventListener('keydown', onEsc);
}

// โหลดหน้าล่าสุดของห้อง — ใช้ตอนเปิดห้อง และตอน socket กลับมาต่อติดหลังเน็ตหลุด
async function loadMsgs() {
  const box = $('#chatMsgs');
  if (!curChat || !box) return;

  const chat = curChat;

  try {
    const r = await api(`/api/chat/${chat.jobId}?with=${chat.otherId}`);
    if (!r || curChat !== chat) return;

    setPresence(chat.otherId, r.other_online, r.other_last_seen);
    paintChatHead();

    // ฟองที่ยังส่งไม่สำเร็จ ห้ามล้างทิ้งเด็ดขาด — ผู้ใช้ยังไม่รู้ว่ามันถึงปลายทางหรือยัง
    // (บั๊กเดิม: เน็ตสะดุดแล้วต่อกลับ → ตรงนี้ล้างทั้งกล่อง ข้อความที่กำลังส่งหายเงียบ ๆ)
    const keep = $$('.msg[data-tmp]', box);

    shownIds.clear();
    box.replaceChildren();
    r.items.forEach((m) => addMessage(m, { scroll: false }));
    keep.forEach((el) => box.appendChild(el));   // ต่อท้ายสุดเสมอ — ยังไม่มีเลขลำดับจริงให้เรียง

    hasMore = !!r.has_more;
    oldestId = r.items[0]?.id ?? null;

    if (!box.children.length) {
      box.innerHTML = '<p class="chat-hint">ยังไม่มีข้อความ — ทักทายกันก่อนเลย</p>';
    }
    redrawDays();
    box.scrollTop = box.scrollHeight;

    // server เพิ่ง mark read ให้ตอน GET — เลขแดงบนแท็บต้องหายทันที ไม่ใช่รอรอบ poll ถัดไปอีก 15 วิ
    refreshBadges();
  } catch { /* เงียบไว้ — เดี๋ยว socket ต่อติดแล้วดึงใหม่เอง */ }
}

// เลื่อนขึ้นไปสุด = ขอของเก่าเพิ่มอีกหน้า
async function loadOlder() {
  const box = $('#chatMsgs');
  if (!hasMore || loadingOlder || !curChat || !box || !oldestId) return;
  loadingOlder = true;

  const chat = curChat;
  const heightBefore = box.scrollHeight;   // จำความสูงไว้ก่อนแทรกของเก่าเข้าไปข้างบน

  try {
    const r = await api(`/api/chat/${chat.jobId}?with=${chat.otherId}&before=${oldestId}`);
    if (!r || curChat !== chat) return;

    // ไล่จากใหม่→เก่า แล้วยัดไว้บนสุดทีละอัน → ผลลัพธ์เรียงเก่า→ใหม่เองโดยไม่ต้องคิดเลข
    [...r.items].reverse().forEach((m) => addMessage(m, { scroll: false, top: true }));

    hasMore = !!r.has_more;
    if (r.items.length) oldestId = r.items[0].id;
    redrawDays();

    // ของเก่าที่เพิ่งแทรกดันเนื้อหาที่กำลังอ่านอยู่ให้เลื่อนลง → ชดเชยให้กลับไปอยู่ที่เดิม
    box.scrollTop = box.scrollHeight - heightBefore;
  } catch {
    /* ปล่อยไว้ — เลื่อนขึ้นอีกทีค่อยลองใหม่ */
  } finally {
    loadingOlder = false;
  }
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

function addMessage(m, { scroll = true, top = false } = {}) {
  const box = $('#chatMsgs');
  if (!box) return;
  if (m.id && shownIds.has(m.id)) return;   // มาสองทาง (ack + broadcast) → เอาอันแรกพอ

  $('.chat-hint', box)?.remove();

  // ฟองที่โชว์ล่วงหน้าตอนกดส่ง — พอของจริงกลับมา ให้เอาของจริงแทนที่
  //   เช็ค sender_id ด้วย: client_id ของอีกฝั่งก็เด้งมาถึงเราเหมือนกัน แต่ไม่ใช่ของเรา ห้ามเอามาใช้
  //   CSS.escape: client_id เป็นค่าที่ "อีกเครื่อง" สร้างมา — ยัดตรง ๆ ลง selector แล้วเจอค่าพิลึก selector จะพัง
  if (m.client_id && m.sender_id === ME.id) {
    box.querySelector(`[data-tmp="${CSS.escape(m.client_id)}"]`)?.remove();
    outbox.delete(m.client_id);
    const url = blobUrls.get(m.client_id);
    if (url) {
      URL.revokeObjectURL(url);   // ส่งถึงแล้ว รูปตัวจริงมาจาก server ต่อจากนี้
      blobUrls.delete(m.client_id);
    }
  }
  if (m.id) shownIds.add(m.id);

  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;

  const el = document.createElement('div');
  el.className = `msg ${m.sender_id === ME.id ? 'me' : 'them'} ${m.kind === 'image' ? 'has-img' : ''}`;
  if (m.id) el.dataset.id = m.id;
  el.dataset.at = m.created_at;              // redrawDays() ใช้ตัวนี้หาว่าต้องคั่นวันตรงไหน
  if (m.pending) {
    el.dataset.tmp = m.client_id;
    el.onclick = () => el.classList.contains('failed') && retry(m.client_id);
  }
  el.innerHTML = `${bodyHtml(m)}<span class="msg-meta"><time>${esc(fmtClock(m.created_at))}</time>${ticksHtml(m)}</span>`;

  if (top) box.prepend(el);
  else box.appendChild(el);

  // แทรกของเก่าไว้ข้างบนไม่ต้องเลื่อนตาม — loadOlder() จัดตำแหน่งสกรอลล์เองอยู่แล้ว
  if (!top && scroll && (atBottom || m.sender_id === ME.id)) box.scrollTop = box.scrollHeight;
}

// เส้นคั่นวัน — เดินดูฟองทั้งกล่องแล้ววางเส้นใหม่ทั้งหมด
// (คิดใหม่ทั้งกล่องเลย ไม่ต้องไล่แก้ทีละจุด — ฟองในกล่องมีหลักร้อย ถูกกว่าการเขียนให้ฉลาดแล้วพลาด)
function redrawDays() {
  const box = $('#chatMsgs');
  if (!box) return;

  $$('.chat-day', box).forEach((d) => d.remove());

  let day = null;
  $$('.msg', box).forEach((el) => {
    const at = el.dataset.at;
    if (!at) return;

    const k = dayKey(at);
    if (k === day) return;
    day = k;

    const sep = document.createElement('div');
    sep.className = 'chat-day';
    sep.textContent = fmtDay(at);
    box.insertBefore(sep, el);
  });
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
    redrawDays();                                          // ข้ามเที่ยงคืนระหว่างคุยกัน = ต้องมีเส้นคั่นวันใหม่
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

  // รอ ack ก่อนค่อยดึงเลขแดงมาใหม่ — ยิง refreshBadges พร้อมกันเลยจะได้เลขเก่ากลับมา เพราะ UPDATE ยังไม่ลง
  socket.timeout(SEND_TIMEOUT).emit(
    'chat:read',
    { jobId: curChat.jobId, otherId: curChat.otherId },
    (err) => { if (!err) refreshBadges(); }
  );
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
  redrawDays();
}

// ส่งไม่สำเร็จ — คาฟองไว้ที่เดิมพร้อมเครื่องหมายตกใจ ให้แตะเพื่อยิงใหม่
// (ดีกว่าลบฟองแล้วยัดข้อความคืนช่องพิมพ์: ถ้าผู้ใช้พิมพ์ประโยคถัดไปไปแล้ว ของเดิมจะหายไปเฉย ๆ)
function markFailed(client_id, msg) {
  const el = document.querySelector(`.msg[data-tmp="${CSS.escape(client_id)}"]`);
  if (!el) return;

  el.classList.add('failed');
  el.title = msg;

  const t = $('.ticks', el);
  if (t) {
    t.className = 'ticks failed';
    t.title = msg;
    t.innerHTML = ICONS.warn;
  }
}

function retry(client_id) {
  const el = document.querySelector(`.msg[data-tmp="${CSS.escape(client_id)}"]`);
  const again = outbox.get(client_id);
  if (!el || !again) return;

  el.classList.remove('failed');
  el.removeAttribute('title');

  const t = $('.ticks', el);
  if (t) {
    t.className = 'ticks pending';
    t.title = 'กำลังส่ง';
    t.innerHTML = ICONS.clock;
  }
  again();
}

// ⚠️ ต้องใส่ .timeout() เสมอ — Socket.IO ไม่เรียก callback ให้เลยถ้าสายหลุดตอน ack ยังไม่กลับมา
//    ไม่ใส่ = ฟองค้างเป็นรูปนาฬิกาตลอดกาล ผู้ใช้ไม่มีทางรู้ว่าส่งถึงหรือเปล่า (บั๊กเดิมของไฟล์นี้)
function emitSend(chat, body, client_id) {
  socket.timeout(SEND_TIMEOUT).emit(
    'chat:send',
    { jobId: chat.jobId, to: chat.otherId, body, client_id },
    (err, r) => {
      if (err) return markFailed(client_id, 'ส่งไม่สำเร็จ — แตะที่ข้อความเพื่อลองใหม่');
      if (r?.error) return markFailed(client_id, r.error);
      if (r?.message) addMessage(r.message);
    }
  );
}

function sendText() {
  const input = $('#chatText');
  const body = input.value.trim();
  if (!body || !curChat || !socket) return;

  input.value = '';
  sendTyping(false);

  const chat = curChat;
  const client_id = newClientId();
  showPending(client_id, { body });

  outbox.set(client_id, () => emitSend(chat, body, client_id));
  emitSend(chat, body, client_id);
}

// ============================================================
//  ส่งรูป
// ============================================================
const MAX_SIDE = 1600;   // ด้านยาวสุดหลังย่อ — พอสำหรับดูบัตร/ใบยา/สภาพบ้าน ไม่ต้องใหญ่กว่านี้

// ⚠️ ชื่อต้องไม่ชนกับ shrinkImage() ใน frame.js เด็ดขาด
//    ทั้ง 2 ไฟล์เป็น <script> ธรรมดา ไม่ใช่ module → ประกาศชื่อเดียวกัน = ตัวที่โหลดทีหลังทับตัวแรก
//    บั๊กที่เคยเกิด: caregiver.html โหลด frame.js แล้วตามด้วย chat.js → ตัวนี้ทับ
//    แล้ว wirePhotoPicker() ใน frame.js ที่คาดว่าจะได้ Blob กลับได้ {blob,w,h} แทน
//    → ถอยไปอัปไฟล์ต้นฉบับเต็ม ๆ → รูปจากมือถือชนลิมิต 8 MB หรือเป็น HEIC ที่ fileFilter ไม่รับ
//    → "อัปรูปที่หน้าบัตรแคร์กิฟเวอร์ไม่ได้ แต่หน้าโปรไฟล์ได้" (profile.html ไม่ได้โหลด chat.js)
//
// ย่อรูปที่เครื่องคนส่งก่อนอัป — รูปจากมือถือใบละ 5-10 MB อัปตรงคือรอเป็นนาทีบนเน็ตบ้าน
// ผลพลอยได้: canvas ทิ้ง EXIF ทั้งก้อน → พิกัด GPS ที่ฝังมากับรูปหลุดไปกับรูปไม่ได้
async function shrinkChatImage(file) {
  if (typeof createImageBitmap !== 'function') return { blob: file };

  try {
    // imageOrientation: รูปจากมือถือฝังมุมหมุนไว้ใน EXIF — ไม่สั่งอันนี้รูปจะตะแคง
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const ow = bmp.width;
    const oh = bmp.height;

    // GIF ย่อแล้วภาพเคลื่อนไหวหาย (canvas ได้เฟรมเดียว) → ส่งไฟล์เดิมไปเลย
    // แต่ยังต้องแนบขนาดไปด้วยเสมอ ไม่งั้นฝั่งรับไม่มีที่จองไว้ให้รูป → หน้ากระตุกตอนรูปโหลดเสร็จ
    // ซึ่งค้านกับเหตุผลทั้งหมดที่เก็บ image_w/h ไว้ตั้งแต่แรก
    if (file.type === 'image/gif') {
      bmp.close?.();
      return { blob: file, w: ow, h: oh };
    }

    const scale = Math.min(1, MAX_SIDE / Math.max(ow, oh));
    const w = Math.round(ow * scale);
    const h = Math.round(oh * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close?.();

    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.82));
    return blob ? { blob, w, h } : { blob: file, w: ow, h: oh };
  } catch {
    return { blob: file };   // อ่านรูปไม่ออกเลย ส่งของเดิม ให้ลิมิต 8 MB ฝั่ง server เป็นคนปัดตก
  }
}

async function sendImage(file) {
  if (!curChat) return;
  if (!file.type.startsWith('image/')) return toast('ส่งได้เฉพาะไฟล์รูป');

  const chat = curChat;
  const client_id = newClientId();
  const localUrl = URL.createObjectURL(file);
  blobUrls.set(client_id, localUrl);

  // โชว์รูปจากเครื่องตัวเองไปก่อนเลย ไม่ต้องรออัปเสร็จ
  showPending(client_id, { kind: 'image', local_url: localUrl });

  const attempt = async () => {
    try {
      const { blob, w, h } = await shrinkChatImage(file);

      const fd = new FormData();
      fd.append('client_id', client_id);
      if (w && h) { fd.append('w', w); fd.append('h', h); }
      // ย่อแล้วได้ค่าแปลก ๆ ให้ถอยไปใช้ไฟล์ต้นฉบับ — กัน append เด้ง "not of type 'Blob'"
      fd.append('image', blob instanceof Blob ? blob : file, 'photo.jpg');

      // ต้องบอกคู่สนทนาทาง query — ด่านตรวจสิทธิ์ทำงานก่อน multer จะเขียนไฟล์ลงดิสก์ (ตอนนั้นยังอ่าน body ไม่ได้)
      const r = await api(`/api/chat/${chat.jobId}/image?with=${chat.otherId}`, { method: 'POST', body: fd });
      if (r?.message) addMessage(r.message);   // ตรงนี้เป็นคนคืน object URL ให้เอง
    } catch (e) {
      markFailed(client_id, e.message || 'ส่งรูปไม่สำเร็จ — แตะที่รูปเพื่อลองใหม่');
    }
  };

  outbox.set(client_id, attempt);
  await attempt();
}

// หมายเหตุ: ระบบให้ดาว/รีวิว ถูกปิดไว้ชั่วคราว (ตกลงกัน 2026-07-14)
// โค้ดฝั่ง backend (src/routes/reviews.js) กับตาราง reviews ยังอยู่ครบ เปิดกลับได้ทันที
