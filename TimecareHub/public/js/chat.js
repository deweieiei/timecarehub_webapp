// แชท — ใช้ร่วมกันทั้งฝั่งผู้ว่าจ้างและฝั่งแคร์กิฟเวอร์
// ต้องโหลด frame.js ก่อน (ใช้ ME, view, api, esc, ...)

let chatTimer = null;
let curChat = null;

function stopChatPolling() {
  clearInterval(chatTimer);
  chatTimer = null;
  curChat = null;
}

function closeChatRoom() {
  document.querySelector('.chat-room')?.remove();
}

// ---------- รายการห้องแชท ----------
async function viewChat() {
  const { items } = await api('/api/chat/threads');

  view.innerHTML = `
    <h2>แชท</h2>
    <p class="sub">คุยตกลงระยะเวลางานและราคา</p>
    ${items.length ? items.map((t) => `
      <div class="thread" data-job="${t.job_id}" data-other="${t.other_id}"
           data-name="${esc(t.other_name)}" data-title="${esc(t.title)}">
        <div class="avatar">${esc(initial(t.other_name))}</div>
        <div class="thread-body">
          <strong>${esc(t.other_name)}</strong>
          <small>${esc(t.title)}</small>
          <small style="color:var(--ink);opacity:.7">${esc(t.last_message || 'ยังไม่มีข้อความ')}</small>
        </div>
      </div>`).join('')
      : emptyBox('ยังไม่มีห้องแชท<br>กดขอรับงาน หรือรอคนมาขอรับงานของคุณ')}`;

  $$('.thread', view).forEach((t) =>
    (t.onclick = () => openChat(t.dataset.job, t.dataset.other, t.dataset.name, t.dataset.title)));
}

// ---------- ห้องแชท (เปิดทับเต็มจอ) ----------
async function openChat(jobId, otherId, name, title) {
  // เปิดจากหน้า "ผู้สมัคร" จะไม่มีชื่อส่งมา — ไปหยิบจากรายการห้องแชทแทน
  if (!name) {
    const { items } = await api('/api/chat/threads');
    const t = items.find((x) => String(x.job_id) === String(jobId) && String(x.other_id) === String(otherId));
    name = t?.other_name || 'แชท';
    title = t?.title || '';
  }

  curChat = { jobId, otherId };
  closeChatRoom();

  const room = document.createElement('div');
  room.className = 'chat-room';
  room.innerHTML = `
    <div class="chat-head">
      <button class="icon-btn" id="chatBack">${ICONS.back}</button>
      <div class="avatar">${esc(initial(name))}</div>
      <div style="flex:1;min-width:0">
        <strong>${esc(name)}</strong>
        <small>${esc(title || '')}</small>
      </div>
    </div>
    <div class="chat-msgs" id="chatMsgs"></div>
    <form class="chat-input" id="chatForm">
      <input id="chatText" placeholder="พิมพ์ข้อความ..." autocomplete="off">
      <button class="btn" aria-label="ส่ง">${ICONS.send}</button>
    </form>`;
  document.body.appendChild(room);

  $('#chatBack', room).onclick = () => {
    stopChatPolling();
    closeChatRoom();
    if (TAB === 'chat') viewChat();
  };

  $('#chatForm', room).onsubmit = async (e) => {
    e.preventDefault();
    const input = $('#chatText', room);
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    try {
      await api(`/api/chat/${jobId}`, { method: 'POST', body: JSON.stringify({ body, to: otherId }) });
      loadMsgs();
    } catch (err) { toast(err.message); }
  };

  clearInterval(chatTimer);
  await loadMsgs();
  chatTimer = setInterval(loadMsgs, 3000);   // MVP ใช้ polling ยังไม่ต้อง WebSocket
}

async function loadMsgs() {
  if (!curChat) return;
  const box = $('#chatMsgs');
  if (!box) return;

  try {
    const { items } = await api(`/api/chat/${curChat.jobId}?with=${curChat.otherId}`);
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;

    box.innerHTML = items.length
      ? items.map((m) => `
          <div class="msg ${m.sender_id === ME.id ? 'me' : 'them'}">
            ${esc(m.body)}<time>${fmtTime(m.created_at)}</time>
          </div>`).join('')
      : '<p style="text-align:center;color:var(--muted);font-size:14px;margin-top:20px">ยังไม่มีข้อความ — ทักทายกันก่อนเลย</p>';

    if (atBottom) box.scrollTop = box.scrollHeight;
  } catch { /* เงียบไว้ ให้ polling รอบหน้าลองใหม่ */ }
}

// หมายเหตุ: ระบบให้ดาว/รีวิว ถูกปิดไว้ชั่วคราว (ตกลงกัน 2026-07-14)
// โค้ดฝั่ง backend (src/routes/reviews.js) กับตาราง reviews ยังอยู่ครบ เปิดกลับได้ทันที
