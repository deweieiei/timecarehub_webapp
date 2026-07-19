// TimeCareHub — กรอบร่วมของทุกหน้า
// โหลดไฟล์นี้ก่อนเสมอ: ทำหน้าที่ auth guard + สร้าง header + สร้างแถบเมนู
// และเก็บฟังก์ชันที่ทุกหน้าใช้ร่วมกัน (api, toast, esc, ...)

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

let ME = null;      // ข้อมูลผู้ใช้ปัจจุบัน — หน้าอื่นเรียกใช้ได้
let TAB = null;     // แท็บที่เปิดอยู่
let view = null;    // <main> — หน้าอื่น render ลงตรงนี้

const ROLE_TH = { employer: 'ผู้ว่าจ้าง', caregiver: 'แคร์กิฟเวอร์' };
const CARE_TYPE_TH = { hourly: 'รายชั่วโมง', daily: 'รายวัน', overnight: 'ค้างคืน', live_in: 'อยู่ประจำ' };
const UNIT_TH = { per_hour: 'บาท/ชม.', per_day: 'บาท/วัน', per_month: 'บาท/เดือน', total: 'บาท (เหมา)' };
// ต้องครบทุกค่าใน ENUM ของ jobs.status — ขาดตัวไหน ป้ายสถานะจะขึ้นคำว่า "undefined"
// (open/matched/done/cancelled = งานโพส | offered/declined = งานจ้างตรง)
const STATUS_TH = {
  open: 'เปิดรับ',
  offered: 'รอตอบรับ',
  matched: 'จับคู่แล้ว',
  done: 'เสร็จแล้ว',
  declined: 'ปฏิเสธแล้ว',
  cancelled: 'ยกเลิก',
};
const KYC_TH = { none: 'ยังไม่ยืนยันตัวตน', pending: 'รอแอดมินอนุมัติ', approved: 'ยืนยันแล้ว', rejected: 'ถูกปฏิเสธ' };

const BKK = [13.7563, 100.5018];

// ---------- ไอคอน (SVG เส้น — คมทุกขนาดจอ) ----------
const svg = (d, w = 1.9) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const ICONS = {
  heart: svg('<path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 22l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>'),
  post: svg('<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>'),
  myjobs: svg('<rect x="3" y="4" width="18" height="17" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/>'),
  find: svg('<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.7" y2="16.7"/>'),
  applied: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 11 17 15 13"/>'),
  chat: svg('<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-4.2-1L3 20l1.1-4.4A8.4 8.4 0 0 1 3 11.5a8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 9 8.4z"/>'),
  kyc: svg('<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8.5" cy="11" r="2.2"/><path d="M5 16.2c.7-1.4 2-2.2 3.5-2.2s2.8.8 3.5 2.2"/><line x1="15" y1="10" x2="19" y2="10"/><line x1="15" y1="14" x2="19" y2="14"/>'),
  swap: svg('<polyline points="17 2 21 6 17 10"/><path d="M3 6h18"/><polyline points="7 22 3 18 7 14"/><path d="M21 18H3"/>'),
  shield: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>'),
  logout: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'),
  back: svg('<polyline points="15 18 9 12 15 6"/>', 2.2),
  send: svg('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>'),
  photo: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.8"/><polyline points="21 15 16 10 5 19"/>'),
  // ติ๊กสถานะข้อความ: นาฬิกา = กำลังส่ง · ติ๊ก 1 = ส่งแล้ว · ติ๊ก 2 = อ่านแล้ว · ตกใจ = ส่งไม่สำเร็จ
  clock: svg('<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>', 2.2),
  tick: svg('<polyline points="4 12.5 9 17.5 20 6.5"/>', 2.6),
  ticks: svg('<polyline points="2 12.5 7 17.5 17.5 6.5"/><polyline points="10.5 15.5 12.5 17.5 23 6.5"/>', 2.6),
  warn: svg('<circle cx="12" cy="12" r="9"/><line x1="12" y1="7.5" x2="12" y2="13"/><line x1="12" y1="16.4" x2="12" y2="16.5"/>', 2.2),
  empty: svg('<rect x="3" y="4" width="18" height="17" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/>'),
  briefcase: svg('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>'),
  browse: svg('<circle cx="9" cy="8" r="3.4"/><path d="M3 20c0-3.3 2.7-5.4 6-5.4s6 2.1 6 5.4"/><circle cx="18" cy="9" r="2.4"/><path d="M17 14.8c2.4.3 4 2.2 4 5.2"/>'),
  hands: svg('<path d="M11 14h2a2 2 0 0 0 2-2 2 2 0 0 0-2-2H9.5L7 12"/><path d="M5 10 2 13l4 4 2-2"/><path d="M13 10h4a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-2"/><path d="M19 10l3 3-4 4-2-2"/>'),
  bell: svg('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'),
  clockFace: svg('<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>'),
};

// ---------- ตัวช่วย ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(url, opts = {}) {
  const r = await fetch(url, {
    headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (r.status === 401) { location.href = '/'; return; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'เกิดข้อผิดพลาด');
  return j;
}

// ปุ่มไหนกดแล้วต้องรอเน็ต ครอบ handler ด้วยตัวนี้ — โชว์วงกลมหมุน + กันกดซ้ำระหว่างรอ
// ใช้: btn.onclick = (e) => withSpin(e.currentTarget, () => doSomethingAsync());
async function withSpin(btn, fn) {
  if (!btn || btn.classList.contains('loading')) return;   // กดซ้ำระหว่างยังหมุนอยู่ = ไม่ทำอะไร
  btn.classList.add('loading');
  btn.disabled = true;
  try {
    return await fn();
  } finally {
    // ปุ่มอาจถูกลบไปแล้ว (เช่น handler สั่ง re-render ทั้งหน้า) — เช็คก่อนแตะ
    if (btn.isConnected) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

function toast(text, ms = 2800) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.remove('hide');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hide'), ms);
}

// ---------- แผ่นเด้งขึ้นจากขอบล่าง (ใช้ร่วมทุกหน้า) ----------
// ของเดิมแต่ละที่ประกอบ backdrop เองหมด ทั้งปุ่มปิด ทั้ง Esc ทั้งกดพื้นหลัง — ซ้ำกัน 5 ที่
// รวมไว้ที่เดียว: หน้าใหม่จะได้ไม่ลืมถอด listener ของ Esc แล้วมันค้างสะสม
// คืน { root, close } — คนเรียกเอา root ไปผูกปุ่มข้างในต่อ
function openSheet({ title, html, wide = false }) {
  document.querySelector('.sheet-backdrop')?.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = `
    <div class="sheet ${wide ? 'sheet-wide' : ''}">
      <div class="sheet-grip"></div>
      <div class="sheet-head">
        <h3>${title}</h3>
        <button class="sheet-close" aria-label="ปิด">✕</button>
      </div>
      ${html}
    </div>`;
  document.body.appendChild(backdrop);

  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  function close() {
    document.removeEventListener('keydown', onEsc);   // ไม่ถอด = เปิด-ปิดหลายรอบแล้ว listener ค้างสะสม
    backdrop.remove();
  }

  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
  backdrop.querySelector('.sheet-close').onclick = close;
  document.addEventListener('keydown', onEsc);

  return { root: backdrop, close };
}

// ---------- ยกเลิกงาน (ใช้ร่วมทั้งฝั่งผู้ว่าจ้างและแคร์กิฟเวอร์) ----------
// ก่อนจับคู่ = ถอนทิ้ง ถามยืนยันเฉย ๆ ไม่ต้องมีเหตุผล ไม่เก็บประวัติ
async function cancelBeforeMatch(jobId, confirmMsg, onDone) {
  if (!confirm(confirmMsg)) return;
  try {
    await api(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
    toast('ยกเลิกแล้ว');
    onDone?.();
  } catch (e) { toast(e.message, 4200); }
}

// แคร์กิฟเวอร์ถอนคำขอรับงาน (ก่อนผู้ว่าจ้างเลือก) — ไม่เก็บประวัติ
async function withdrawApplication(jobId, onDone) {
  if (!confirm('ยกเลิกคำขอรับงานนี้?')) return;
  try {
    await api(`/api/jobs/${jobId}/withdraw`, { method: 'POST' });
    toast('ยกเลิกคำขอแล้ว');
    onDone?.();
  } catch (e) { toast(e.message, 4200); }
}

// เหตุผลสำเร็จรูปตอนยกเลิกงาน (ตกลงกับพี่ดิว ข้อ 5)
// ทำไมต้องมีตัวเลือก: ของเดิมเป็นช่องเปล่า ๆ คนส่วนใหญ่พิมพ์ "ไม่สะดวก" คำเดียวจบ
// ซึ่งอีกฝ่ายอ่านแล้วไม่ได้อะไรเลย — ให้กดเลือกเร็ว ๆ ได้ ข้อความจะมีเนื้อมากกว่า
const CANCEL_REASONS = [
  'ผู้สูงอายุเข้าโรงพยาบาล / อาการเปลี่ยนไป',
  'หาผู้ดูแลจากที่อื่นได้แล้ว',
  'เลื่อนวัน / เปลี่ยนแผนการดูแล',
  'ตกลงเรื่องราคาหรือเวลากันไม่ได้',
  'ติดต่ออีกฝ่ายไม่ได้',
  'อีกฝ่ายผิดนัด / ไม่มาตามที่ตกลง',
  'ติดธุระส่วนตัว ไม่สะดวกแล้ว',
];

// หลังจับคู่ = ต้องบอกเหตุผล → เก็บลงประวัติ (อีกฝ่ายเห็นเหตุผล + ได้แจ้งเตือน)
// ใช้ร่วมกับตอนแคร์กิฟเวอร์ปฏิเสธคำขอจ้างด้วย (mode: 'decline') — เป็นคำถามเดียวกัน
function cancelAfterMatch(jobId, onDone, { mode = 'cancel' } = {}) {
  const isDecline = mode === 'decline';

  const { root, close } = openSheet({
    title: isDecline ? 'ปฏิเสธคำขอจ้าง' : 'ยกเลิกงานนี้',
    html: `
      <p class="hint" style="margin:2px 0 14px">
        ${isDecline
          ? 'บอกเหตุผลสั้น ๆ ให้ผู้ว่าจ้างรู้ (ไม่ใส่ก็ได้) — เขาจะได้ไม่ต้องเดา'
          : 'อีกฝ่ายจะเห็นเหตุผลนี้ในประวัติ และได้รับแจ้งเตือนทันที'}
      </p>

      <div class="reason-list">
        ${CANCEL_REASONS.map((r, i) => `
          <label class="reason">
            <input type="radio" name="reason" value="${esc(r)}" ${i === 0 && !isDecline ? 'checked' : ''}>
            <span>${esc(r)}</span>
          </label>`).join('')}
        <label class="reason">
          <input type="radio" name="reason" value="" data-other>
          <span>อื่น ๆ — พิมพ์เอง</span>
        </label>
      </div>

      <div class="field hide" id="reasonOtherWrap" style="margin-top:12px">
        <textarea id="reasonOther" rows="3" maxlength="500" placeholder="พิมพ์เหตุผลของคุณ"></textarea>
      </div>

      <div class="sheet-actions">
        <button class="btn btn-block ${isDecline ? '' : 'btn-danger'}" id="reasonGo">
          ${isDecline ? 'ยืนยันการปฏิเสธ' : 'ยืนยันยกเลิกงาน'}
        </button>
      </div>`,
  });

  const otherWrap = $('#reasonOtherWrap', root);
  const otherText = $('#reasonOther', root);

  // เลือก "อื่น ๆ" ถึงจะโผล่ช่องพิมพ์ — โชว์ไว้ตลอดแล้วคนจะงงว่าต้องกรอกทั้งคู่ไหม
  $$('input[name=reason]', root).forEach((r) => (r.onchange = () => {
    const other = r.hasAttribute('data-other');
    otherWrap.classList.toggle('hide', !other);
    if (other) otherText.focus();
  }));

  $('#reasonGo', root).onclick = (e) => withSpin(e.currentTarget, async () => {
    const picked = $('input[name=reason]:checked', root);
    const reason = (picked?.hasAttribute('data-other') ? otherText.value : picked?.value || '').trim();

    // ปฏิเสธไม่บังคับเหตุผล แต่ยกเลิกงานที่รับปากไปแล้วบังคับ (ฝั่ง server ก็บังคับซ้ำอีกชั้น)
    if (!isDecline && !reason) return toast('เลือกเหตุผล หรือพิมพ์เองสักหน่อย');

    try {
      if (isDecline) {
        await api(`/api/hires/${jobId}/respond`, {
          method: 'POST',
          body: JSON.stringify({ decision: 'decline', reason }),
        });
        toast('ปฏิเสธคำขอแล้ว');
      } else {
        await api(`/api/jobs/${jobId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
        toast('ยกเลิกงานแล้ว — ย้ายไปที่ประวัติ');
      }
      close();
      onDone?.();
    } catch (err) { toast(err.message, 4200); }
  });
}

// ใครเป็นคนยกเลิกงาน — "คุณ" ถ้าเป็นตัวเราเอง ไม่งั้นบอกบทบาท (+ ชื่อถ้ามีในข้อมูลการ์ด)
function cancelledByLabel(j) {
  if (j.cancelled_by == null) return '';
  if (ME && Number(j.cancelled_by) === Number(ME.id)) return 'คุณ';
  const byEmployer = Number(j.cancelled_by) === Number(j.employer_id);
  const role = byEmployer ? 'ผู้ว่าจ้าง' : 'แคร์กิฟเวอร์';
  const name = byEmployer ? j.employer_name : j.caregiver_name;   // ชื่ออีกฝ่าย (มีบ้างไม่มีบ้างแล้วแต่การ์ด)
  return name ? `${role} (${esc(name)})` : role;
}

// ป้ายเหตุผลที่ยกเลิก — โชว์เฉพาะงานที่ถูกยกเลิกหลังจับคู่ (มีเหตุผลเก็บไว้)
function cancelReasonNote(j) {
  if (j.status !== 'cancelled' || !j.cancel_reason) return '';
  const by = cancelledByLabel(j);
  return `<p style="margin-top:8px;font-size:13px;color:var(--red)">🚫 ${by ? `ยกเลิกโดย${by} — ` : ''}${esc(j.cancel_reason)}</p>`;
}

const stars = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
const fmtBaht = (n) => Number(n).toLocaleString('th-TH');
const fmtTime = (s) => new Date(s).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// ---------- ช่วงวัน + เวลาทำงาน (ข้อ 3) ----------
// คอลัมน์ TIME จาก MySQL กลับมาเป็น "08:00:00" — ตัดวินาทีทิ้ง คนอ่านไม่ได้สนใจ
const fmtHm = (t) => (t ? String(t).slice(0, 5) : null);

const fmtDate = (d) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

// คืนสตริงเดียวจบ เช่น "1 ส.ค. 68 – 30 ก.ย. 68 · 08:00-17:00 น."
// ใช้ 4 ที่ (แผ่นงาน / แผ่นคำขอจ้าง / แผ่นในแชท / การ์ด) — เขียนซ้ำเมื่อไหร่มันจะเริ่มโชว์ไม่ตรงกัน
function fmtPeriod(j) {
  const days = [j.start_date, j.end_date].filter(Boolean).map(fmtDate).join(' – ');
  const from = fmtHm(j.start_time);
  const to = fmtHm(j.end_time);

  // มีเวลาเข้าอย่างเดียวก็ยังบอกได้ ("เข้า 08:00 น.") — ดีกว่าเงียบไปเลย
  const hours = from && to ? `${from}-${to} น.`
    : from ? `เข้า ${from} น.`
    : to ? `เลิก ${to} น.`
    : '';

  return [days, hours].filter(Boolean).join(' · ');
}

// ในห้องแชทวันที่ไปอยู่บนเส้นคั่นแล้ว ใต้ฟองเลยเหลือแค่เวลาพอ (ทุกฟองมีวันที่ติดมาด้วยมันรก)
const fmtClock = (s) => new Date(s).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

// เส้นคั่นวันในแชท — "วันนี้/เมื่อวาน" อ่านแล้วรู้เรื่องกว่าวันที่เต็ม
const fmtDay = (s) => {
  const d = new Date(s);
  const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(new Date()) - midnight(d)) / 86400000);

  if (days === 0) return 'วันนี้';
  if (days === 1) return 'เมื่อวาน';
  if (days < 7) return d.toLocaleDateString('th-TH', { weekday: 'long' });
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
};

// กุญแจเทียบว่า 2 ข้อความอยู่วันเดียวกันไหม — ต้องคิดตามเวลาท้องถิ่น ไม่ใช่ตัดสตริง ISO
// (ISO เป็น UTC: ข้อความตี 3 ที่ไทย = สี่ทุ่ม UTC ของ "เมื่อวาน" → ตัดสตริงแล้วเส้นคั่นวันจะเพี้ยน)
const dayKey = (s) => {
  const d = new Date(s);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

const initial = (name) => String(name || '?').trim().charAt(0);
const emptyBox = (text) => `<div class="empty">${ICONS.empty}<p>${text}</p></div>`;

// ---------- รูปโปรไฟล์ ----------
// มีรูปก็โชว์รูป ไม่มีก็ถอยไปใช้อักษรแรกของชื่อเหมือนเดิม
// รับ object ที่มี photo_url + full_name (ME, แคร์กิฟเวอร์, ผู้สมัคร — หน้าตาเหมือนกันหมด)
const avatar = (u, { cls = '', style = '' } = {}) => `
  <span class="avatar ${cls}" style="${style}">${u?.photo_url
    ? `<img src="${esc(u.photo_url)}" alt="" loading="lazy">`
    : esc(initial(u?.full_name))}</span>`;

// ย่อรูปในเครื่องก่อนอัป — มือถือถ่ายมาทีละ 4-8 MB แต่รูปโปรไฟล์โชว์จริงไม่เกิน ~100 px
// ย่อก่อนส่ง = ประหยัดเน็ตผู้ใช้ ประหยัดดิสก์ server และหน้า "หาคนดูแล" ที่โหลด 9 รูปพร้อมกันไม่อืด
// (ไม่ได้ใช้ sharp ฝั่ง server เพราะไม่อยากลงตัวต่อ native เพิ่มบนเครื่อง serverlive)
async function shrinkImage(file, max = 512) {
  try {
    // from-image = หมุนตาม EXIF ให้ด้วย ไม่งั้นรูปแนวตั้งจากมือถือจะออกมานอนตะแคง
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close();

    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return blob || file;
  } catch {
    return file;   // เบราว์เซอร์เก่าย่อไม่ได้ → ส่งไฟล์เดิมไป (server จำกัดขนาดไว้อยู่แล้ว)
  }
}

// กล่องเลือกรูปโปรไฟล์ — ใช้ทั้งหน้าบัตรแคร์กิฟเวอร์ และหน้าโปรไฟล์ของฉัน
// วาง HTML ก่อน แล้วเรียก wirePhotoPicker() ตอน element อยู่ใน DOM แล้ว
const photoPickerHtml = (user, hint) => `
  <div class="photo-pick">
    ${avatar(user, { cls: 'photo-preview' })}
    <div class="photo-pick-actions">
      <button type="button" class="btn btn-sm btn-ghost" data-photo-pick>
        ${user?.photo_url ? 'เปลี่ยนรูป' : 'เลือกรูป'}
      </button>
      <button type="button" class="btn btn-sm btn-ghost ${user?.photo_url ? '' : 'hide'}" data-photo-del>ลบรูป</button>
      <p class="hint">${hint}</p>
    </div>
  </div>
  <input type="file" accept="image/*" class="hide" data-photo-file>`;

// อัปทันทีที่เลือกรูป ไม่ต้องรอกดบันทึกฟอร์ม —
// ผู้ใช้เลือกรูปแล้วเห็นรูปขึ้นเลยคือสิ่งที่ทุกแอพทำ ถ้าต้องกดบันทึกอีกทีคนจะลืมกดแล้วรูปหาย
// onChange(photo_url | null) — ให้หน้าที่เรียกเอาไปอัปเดตรูปที่อื่น (เช่น หัวเว็บ) ต่อเอง
function wirePhotoPicker({ root = document, onChange } = {}) {
  const preview = $('.photo-preview', root);
  const pickBtn = $('[data-photo-pick]', root);
  const delBtn = $('[data-photo-del]', root);
  const fileInput = $('[data-photo-file]', root);

  const render = (url) => {
    preview.innerHTML = url ? `<img src="${esc(url)}" alt="">` : esc(initial(ME?.full_name));
    pickBtn.textContent = url ? 'เปลี่ยนรูป' : 'เลือกรูป';
    delBtn.classList.toggle('hide', !url);
    onChange?.(url);
  };

  pickBtn.onclick = () => fileInput.click();

  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;

    pickBtn.disabled = true;
    pickBtn.classList.add('loading');   // วงกลมหมุนระหว่างย่อรูป + อัป
    try {
      const body = new FormData();
      // ย่อรูปก่อนอัป — แต่ถ้าย่อแล้วได้ค่าแปลก ๆ (ไม่ใช่ Blob) ให้ถอยไปใช้ไฟล์ต้นฉบับ
      // กัน FormData.append เด้ง "parameter 2 is not of type 'Blob'" เด็ดขาด
      const shrunk = await shrinkImage(file);
      body.append('photo', shrunk instanceof Blob ? shrunk : file, 'photo.jpg');
      const { photo_url } = await api('/api/profile/me/photo', { method: 'POST', body });
      render(photo_url);
      toast('อัปรูปโปรไฟล์แล้ว');
    } catch (e) {
      toast(e.message, 4200);
      render(ME?.photo_url);
    } finally {
      pickBtn.disabled = false;
      pickBtn.classList.remove('loading');
      fileInput.value = '';   // เลือกไฟล์เดิมซ้ำต้องยิง change ได้อีก
    }
  };

  delBtn.onclick = (e) => {
    if (!confirm('ลบรูปโปรไฟล์?')) return;
    withSpin(e.currentTarget, async () => {
      try {
        await api('/api/profile/me/photo', { method: 'DELETE' });
        render(null);
        toast('ลบรูปแล้ว');
      } catch (err) { toast(err.message); }
    });
  };
}

// ==========================================================
//  กรอบ — เรียกจากทุกหน้าที่ต้องล็อกอิน
//
//  buildFrame({
//    role: 'employer' | 'caregiver' | null,   // null = หน้า choose (ไม่มีแถบเมนู)
//    tabs: [[key, label], ...],
//    render: { key: fn, ... }                 // ฟังก์ชัน render ของแต่ละแท็บ
//  })
// ==========================================================
async function buildFrame({ role, tabs = [], render = {} } = {}) {
  const { user } = await api('/api/auth/me');
  ME = user;

  // เข้าหน้าของบทบาทไหน = สลับบทบาทเป็นอันนั้นให้เลย (กัน state ค้าง)
  if (role && ME.active_role !== role) {
    await api('/api/auth/role', { method: 'POST', body: JSON.stringify({ role }) });
    ME.active_role = role;
  }

  const onProfilePage = location.pathname.startsWith('/profile');
  if (!tabs.length) document.body.classList.add('no-tabbar');   // ไม่มีแถบล่าง = ต้องเผื่อ padding เอง

  document.body.innerHTML = `
    <header class="site-header">
      <div class="container header-inner">
        <a class="brand" href="/choose.html">
          <img class="brand-mark" src="/logo-mark.png" alt="" width="40" height="40">
          <span class="brand-text">
            <strong>TIMECAREHUB</strong>
            <small>ดูแลผู้สูงอายุ ใกล้บ้านคุณ</small>
          </span>
        </a>

        <span class="spacer"></span>

        <!-- กระดิ่งอยู่นอกเมนู 3 ขีดโดยตั้งใจ — ของที่มีเลขแดงต้องเห็นตลอด ไม่ใช่ซ่อนอยู่ในเมนู -->
        <button class="icon-btn bell-btn" id="bellBtn" title="แจ้งเตือน" aria-label="แจ้งเตือน">
          ${ICONS.bell}<span class="tab-badge hide" id="bellBadge"></span>
        </button>

        <!-- จอกว้าง: โชว์เรียงกันบนหัว | จอแคบ: ยุบเข้าเมนู 3 ขีด -->
        <div class="header-actions" id="headerActions">
          <div class="user-bar">
            ${avatar(ME)}
            <span class="user-meta">
              <strong>${esc(ME.full_name)}</strong>
              ${role ? `<span class="role-chip role-${role}">${ROLE_TH[role]}</span>` : ''}
            </span>
          </div>

          ${onProfilePage ? '' : `<a class="icon-btn" href="/profile.html" title="โปรไฟล์ของฉัน">${ICONS.user}<span class="label">โปรไฟล์ของฉัน</span></a>`}
          ${role ? `<a class="icon-btn" href="/choose.html" title="เปลี่ยนบทบาท">${ICONS.swap}<span class="label">เปลี่ยนบทบาท</span></a>` : ''}
          ${ME.is_admin ? `<a class="icon-btn" href="/admin.html" title="แอดมิน">${ICONS.shield}<span class="label">แอดมิน</span></a>` : ''}
          <button class="icon-btn" id="logout" title="ออกจากระบบ">${ICONS.logout}<span class="label">ออกจากระบบ</span></button>
        </div>

        <button class="menu-toggle" id="menuToggle" aria-label="เมนู">
          <span></span><span></span><span></span>
        </button>
      </div>
    </header>

    <main id="view"></main>
    ${tabs.length ? '<nav id="nav" class="tabbar"></nav>' : ''}
    <div id="toast" class="hide"></div>`;

  view = $('#view');

  $('#logout').onclick = (e) => withSpin(e.currentTarget, async () => {
    await api('/api/auth/logout', { method: 'POST' });
    location.href = '/';
  });

  $('#bellBtn').onclick = (e) => withSpin(e.currentTarget, () => openInbox());

  // เมนู 3 ขีด (จอแคบ)
  const toggle = $('#menuToggle');
  const actions = $('#headerActions');
  toggle.onclick = (e) => {
    e.stopPropagation();
    toggle.classList.toggle('open');
    actions.classList.toggle('open');
  };
  document.addEventListener('click', (e) => {
    if (!actions.contains(e.target)) {
      toggle.classList.remove('open');
      actions.classList.remove('open');
    }
  });

  // แชทสด — เปิดท่อ socket ทิ้งไว้ตั้งแต่เข้าหน้า ไม่ต้องรอเปิดแท็บแชท
  // (หน้าที่ไม่ได้โหลด chat.js เช่น profile/admin จะไม่มีฟังก์ชันนี้ — ข้ามไป)
  if (typeof initRealtime === 'function') initRealtime();

  if (tabs.length) {
    $('#nav').innerHTML = tabs
      .map(([k, label]) => `
        <button data-tab="${k}">
          <span class="tab-icon">${ICONS[k]}<span class="tab-badge hide" data-badge="${k}"></span></span>
          <span>${label}</span>
        </button>`)
      .join('');
    $$('#nav button').forEach((b) => (b.onclick = () => go(b.dataset.tab, render)));
    go(tabs[0][0], render);

    refreshBadges();
    setInterval(refreshBadges, 15000);   // เช็คของใหม่ทุก 15 วิ
  }

  return ME;
}

// เปลี่ยน/ลบรูปแล้ว รูปบนหัวเว็บต้องเปลี่ยนตามทันที ไม่ใช่รอผู้ใช้กดรีเฟรชเอง
function setMyPhoto(url) {
  ME.photo_url = url || null;
  const el = $('.user-bar .avatar');
  if (el) el.innerHTML = url ? `<img src="${esc(url)}" alt="">` : esc(initial(ME.full_name));
}

// ---------- ตัวเลขแดง ๆ บนแท็บ + กระดิ่ง ----------
function paintBadge(el, count) {
  if (!el) return;
  if (count > 0) {
    el.textContent = count > 9 ? '9+' : count;
    el.classList.remove('hide');
  } else {
    el.classList.add('hide');
  }
}

async function refreshBadges() {
  try {
    const n = await api(`/api/notifications?role=${ME.active_role}`);

    // แท็บไหนควรมีเลขอะไร — ขึ้นกับบทบาทที่เปิดอยู่
    const counts = {
      chat: n.chat,
      myjobs: n.applicants,   // ฝั่งผู้จ้าง — มีคนมากดขอรับงาน
      applied: n.offers,      // ฝั่งแคร์กิฟเวอร์ — มีคำขอจ้างส่งมา
    };

    for (const [tab, count] of Object.entries(counts)) {
      paintBadge(document.querySelector(`[data-badge="${tab}"]`), count);
    }
    paintBadge($('#bellBadge'), n.alerts);
  } catch { /* เงียบไว้ ไม่ใช่เรื่องคอขาดบาดตาย */ }
}

// ============================================================
//  กระดิ่งแจ้งเตือน (ข้อ 6)
//  งานของฉันเปลี่ยนไปโดยที่ฉันไม่ได้เป็นคนทำ → มาโผล่ที่นี่
// ============================================================
const NOTIFY_ICON = {
  job_cancelled: '🚫',
  job_withdrawn: '🚫',
  offer_withdrawn: '🚫',
  offer_declined: '🙅',
  job_not_chosen: '🙅',
  application_withdrawn: '↩️',
  job_matched: '🎉',
  offer_accepted: '🎉',
  offer_received: '📨',
  job_applied: '🙋',
  job_done: '✅',
};

async function openInbox() {
  let items = [];
  try {
    ({ items } = await api('/api/notifications/list'));
  } catch (e) {
    return toast(e.message, 4200);
  }

  openSheet({
    title: 'แจ้งเตือน',
    html: items.length
      ? `<div class="notif-list">${items.map((n) => `
          <div class="notif ${n.read_at ? '' : 'new'}">
            <span class="notif-icon">${NOTIFY_ICON[n.type] || '🔔'}</span>
            <div>
              <strong>${esc(n.title)}</strong>
              ${n.body ? `<p>${esc(n.body)}</p>` : ''}
              <time>${esc(fmtTime(n.created_at))}</time>
            </div>
          </div>`).join('')}</div>`
      : emptyBox('ยังไม่มีแจ้งเตือน'),
  });

  // เปิดดูแล้ว = อ่านแล้วทั้งกอง — ยิงหลังวาดเสร็จ ไม่ต้องให้ผู้ใช้รอ
  // (ล้มก็ไม่เป็นไร เลขแดงยังอยู่ เดี๋ยวเปิดใหม่แล้วลองอีกที)
  api('/api/notifications/read', { method: 'POST' })
    .then(() => paintBadge($('#bellBadge'), 0))
    .catch(() => {});
}

function go(tab, render) {
  TAB = tab;
  closeChat();
  view.scrollTop = 0;
  $$('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  render[tab]();
}
