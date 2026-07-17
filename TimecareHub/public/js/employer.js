// ฝั่งผู้ว่าจ้าง — หาแคร์กิฟเวอร์ / โพสงาน / งานของฉัน / แชท

let pickMap = null;
let pickArea = '';   // ชื่อย่านที่อ่านได้จากหมุด — ส่งขึ้นไปเป็น area_label ให้อัตโนมัติ

const RATE_UNIT_TH = { per_hour: 'บาท/ชม.', per_day: 'บาท/วัน', per_month: 'บาท/เดือน' };

// ==========================================================
//  ⭐ หาแคร์กิฟเวอร์ — เดินดูโปรไฟล์แล้วส่งคำขอจ้างได้เลย
//     ไม่ต้องโพสงาน ไม่ต้องปักหมุด
//     (แสดงเฉพาะคนที่ยืนยันตัวตนแล้ว)
// ==========================================================
async function viewBrowse(q = '') {
  const { items } = await api(`/api/caregivers${q ? `?q=${encodeURIComponent(q)}` : ''}`);

  view.innerHTML = `
    <h2>หาแคร์กิฟเวอร์</h2>
    <p class="sub">ดูโปรไฟล์แล้วส่งคำขอจ้างได้เลย — แสดงเฉพาะคนที่ยืนยันตัวตนแล้ว</p>

    <div class="card">
      <div class="row" style="align-items:flex-end">
        <div class="field" style="margin:0;flex:2">
          <label>ค้นหา</label>
          <input id="q" value="${esc(q)}" placeholder="ชื่อ / ทักษะ / ย่าน เช่น ติดเตียง, ลาดพร้าว">
        </div>
        <div class="field" style="margin:0">
          <button class="btn btn-block" id="doSearch" type="button">🔍 ค้นหา</button>
        </div>
      </div>
    </div>

    ${items.length
      ? `<p class="sub">พบ ${items.length} คน</p>` + items.map(cgCard).join('')
      : emptyBox('ไม่พบแคร์กิฟเวอร์ที่ตรงกับคำค้น')}`;

  const run = () => viewBrowse($('#q').value.trim());
  $('#doSearch').onclick = run;
  $('#q').onkeydown = (e) => { if (e.key === 'Enter') run(); };

  $$('[data-hire]', view).forEach((b) => (b.onclick = () => {
    openHireSheet(items.find((c) => String(c.id) === b.dataset.hire));
  }));
}

function cgCard(c) {
  return `
    <div class="job">
      <div style="display:flex;gap:12px;align-items:center">
        <div class="avatar" style="width:52px;height:52px;font-size:20px;background:linear-gradient(135deg,var(--teal),var(--teal-dark))">
          ${esc(initial(c.full_name))}
        </div>
        <div style="flex:1;min-width:0">
          <h3>${esc(c.full_name)}</h3>
          <div class="hint" style="margin:2px 0 0">
            📍 ${esc(c.area_label || 'ไม่ระบุย่าน')} · ประสบการณ์ ${c.experience_years} ปี
          </div>
        </div>
        ${c.rate ? `<div class="price">${fmtBaht(c.rate)}<small>${RATE_UNIT_TH[c.rate_unit]}</small></div>` : ''}
      </div>

      ${c.skills ? `<div class="meta">${c.skills.split(',').map((s) => `<span class="chip">${esc(s.trim())}</span>`).join('')}</div>` : ''}
      ${c.bio ? `<p style="margin-top:10px;font-size:14px;color:var(--muted)">${esc(c.bio)}</p>` : ''}

      <div class="job-actions">
        <button class="btn btn-sm btn-block" data-hire="${c.id}">ส่งคำขอจ้าง</button>
      </div>
    </div>`;
}

// ---------- แผ่นส่งคำขอจ้าง ----------
function openHireSheet(c) {
  if (!c) return;
  document.querySelector('.sheet-backdrop')?.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = `
    <div class="sheet">
      <div class="sheet-grip"></div>
      <div class="sheet-head">
        <h3>ส่งคำขอจ้าง — ${esc(c.full_name)}</h3>
        <button class="sheet-close" aria-label="ปิด">✕</button>
      </div>
      <p class="hint" style="margin-bottom:14px">
        ${esc(c.area_label || '')} · ประสบการณ์ ${c.experience_years} ปี
        ${c.rate ? ` · เรตปกติ ${fmtBaht(c.rate)} ${RATE_UNIT_TH[c.rate_unit]}` : ''}
      </p>

      <form id="hireForm">
        <div class="field">
          <label>หัวข้องาน *</label>
          <input name="title" required placeholder="ดูแลคุณแม่ 78 ปี ช่วงกลางวัน">
        </div>
        <div class="field">
          <label>ประเภทงาน *</label>
          <select name="care_type">
            <option value="daily">รายวัน (ไป-กลับ)</option>
            <option value="hourly">รายชั่วโมง</option>
            <option value="overnight">ค้างคืน</option>
            <option value="live_in">อยู่ประจำ</option>
          </select>
        </div>
        <div class="row">
          <div class="field">
            <label>งบที่เสนอ *</label>
            <input name="budget" type="number" inputmode="numeric" min="1" required
                   value="${c.rate ? Math.round(c.rate) : ''}" placeholder="700">
          </div>
          <div class="field">
            <label>หน่วย</label>
            <select name="budget_unit">
              <option value="per_day">บาท/วัน</option>
              <option value="per_hour">บาท/ชม.</option>
              <option value="per_month">บาท/เดือน</option>
              <option value="total">เหมาทั้งงาน</option>
            </select>
          </div>
        </div>
        <div class="row">
          <div class="field"><label>วันเริ่ม</label><input name="start_date" type="date"></div>
          <div class="field"><label>วันสิ้นสุด</label><input name="end_date" type="date"></div>
        </div>
        <div class="field">
          <label>อาการ / สภาพผู้สูงอายุ</label>
          <textarea name="elder_condition" rows="2" placeholder="เดินได้เอง ความจำไม่ดี เบาหวาน"></textarea>
        </div>
        <div class="field">
          <label>สิ่งที่ต้องช่วยทำ</label>
          <textarea name="tasks" rows="2" placeholder="ป้อนข้าว จัดยา พาเดินออกกำลัง"></textarea>
        </div>
        <div class="field">
          <label>ที่อยู่</label>
          <input name="address" placeholder="123/45 ซอยลาดพร้าว 15 จตุจักร">
          <p class="hint">เห็นเฉพาะแคร์กิฟเวอร์คนนี้เท่านั้น</p>
        </div>

        <button class="btn btn-block">ส่งคำขอจ้าง</button>
        <p class="hint" style="text-align:center;margin-top:10px">
          เขาจะกดรับหรือปฏิเสธ — ต่อรองรายละเอียดกันต่อในแชทได้
        </p>
      </form>
    </div>`;

  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
  backdrop.querySelector('.sheet-close').onclick = close;

  backdrop.querySelector('#hireForm').onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.caregiver_id = c.id;
    try {
      await api('/api/hires', { method: 'POST', body: JSON.stringify(data) });
      close();
      toast('ส่งคำขอจ้างแล้ว — รอเขาตอบรับ');
      go('myjobs', EMPLOYER_VIEWS);
    } catch (err) { toast(err.message, 4200); }
  };
}

// ==========================================================
//  โพสงานใหม่
// ==========================================================
function viewPost() {
  pickMap = null;
  pickArea = '';
  // ถ้าเพิ่งออกจากหน้านี้ไปตอนยังอ่านชื่อย่านไม่เสร็จ ทิ้งรอบเก่าให้หมด
  // ไม่งั้นมันจะกลับมาทับ pickArea ของหมุดใหม่
  clearTimeout(revTimer);
  revCtl?.abort();

  view.innerHTML = `
    <h2>โพสงานใหม่</h2>
    <p class="sub">กรอกรายละเอียด แล้วเลื่อนแผนที่ให้หมุดตรงกับบ้าน</p>

    <form id="jobForm">
      <div class="card">
        <div class="field">
          <label>หัวข้องาน *</label>
          <input name="title" required placeholder="ต้องการคนดูแลคุณแม่ 78 ปี ช่วงกลางวัน">
        </div>
        <div class="field">
          <label>ประเภทงาน *</label>
          <select name="care_type">
            <option value="daily">รายวัน (ไป-กลับ)</option>
            <option value="hourly">รายชั่วโมง</option>
            <option value="overnight">ค้างคืน</option>
            <option value="live_in">อยู่ประจำ</option>
          </select>
        </div>
        <div class="row">
          <div class="field">
            <label>งบประมาณ *</label>
            <input name="budget" type="number" inputmode="numeric" min="1" required placeholder="500">
          </div>
          <div class="field">
            <label>หน่วย</label>
            <select name="budget_unit">
              <option value="per_day">บาท/วัน</option>
              <option value="per_hour">บาท/ชม.</option>
              <option value="per_month">บาท/เดือน</option>
              <option value="total">เหมาทั้งงาน</option>
            </select>
          </div>
        </div>
        <div class="row">
          <div class="field" style="margin:0"><label>วันเริ่ม</label><input name="start_date" type="date"></div>
          <div class="field" style="margin:0"><label>วันสิ้นสุด</label><input name="end_date" type="date"></div>
        </div>
      </div>

      <div class="card">
        <div class="field">
          <label>อาการ / สภาพผู้สูงอายุ</label>
          <textarea name="elder_condition" rows="3" placeholder="เดินได้เอง แต่ความจำไม่ดี มีโรคประจำตัวเบาหวาน"></textarea>
        </div>
        <div class="field" style="margin:0">
          <label>สิ่งที่ต้องช่วยทำ</label>
          <textarea name="tasks" rows="3" placeholder="ป้อนข้าว จัดยา พาเดินออกกำลัง พาไปหาหมอเดือนละครั้ง"></textarea>
        </div>
      </div>

      <div class="card">
        <div class="field" style="margin:0">
          <label>ที่อยู่เต็ม</label>
          <div class="row" style="align-items:center">
            <input name="address" id="addrInput" placeholder="123/45 ซอยลาดพร้าว 15 จตุจักร">
            <button type="button" id="addrFind" class="btn btn-sm btn-ghost" style="flex:0 0 auto">ค้นหาในแผนที่</button>
          </div>
          <p class="hint">🔒 เห็นเฉพาะแคร์กิฟเวอร์ที่ยืนยันตัวตนแล้ว · กดค้นหาแล้วแผนที่จะเลื่อนไปให้</p>
        </div>
      </div>

      <div class="card">
        <label>ปักหมุดตำแหน่ง *</label>
        <p id="pickInfo" class="hint" style="margin-bottom:10px">เลื่อน/ซูมแผนที่ให้หมุดกลางจอตรงกับบ้าน</p>
        <div class="map-wrap pick-wrap">
          <div id="pickMap"></div>
          <div class="pick-pin" id="pickPin" aria-hidden="true"></div>
          <button type="button" id="btnMyLoc" class="map-locate" title="ใช้ตำแหน่งของฉัน">
            <span>◎</span> ตำแหน่งของฉัน
          </button>
        </div>
      </div>

      <button class="btn btn-block">โพสงาน</button>
    </form>`;

  pickMap = L.map('pickMap').setView(BKK, 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(pickMap);

  // ขยับไปที่ตำแหน่งเครื่องให้ตอนเปิดหน้า — แต่ถ้าผู้ใช้เริ่มเลื่อนแผนที่เองแล้ว อย่าไปแย่งจอเขา
  let touched = false;
  pickMap.once('dragstart zoomstart', () => { touched = true; });
  navigator.geolocation?.getCurrentPosition((p) => {
    if (!touched) pickMap.setView([p.coords.latitude, p.coords.longitude], 16);
  });

  const pin = $('#pickPin');
  pickMap.on('movestart', () => pin.classList.add('lift'));
  pickMap.on('moveend', () => { pin.classList.remove('lift'); onPinMoved(); });
  onPinMoved();

  $('#btnMyLoc').onclick = locateMe;
  $('#addrFind').onclick = findAddress;
  // ในฟอร์ม ปุ่ม Enter จะไปกดส่งฟอร์ม — ดักไว้ให้กลายเป็นค้นหาที่อยู่แทน
  $('#addrInput').onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    findAddress();
  };

  $('#jobForm').onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const c = pickMap.getCenter();
    data.lat = c.lat;
    data.lng = c.lng;
    data.area_label = pickArea || null;   // ไม่ต้องให้ผู้ใช้พิมพ์ — อ่านจากหมุดให้เลย
    try {
      await api('/api/jobs', { method: 'POST', body: JSON.stringify(data) });
      toast('โพสงานแล้ว รอแคร์กิฟเวอร์กดขอรับงาน');
      go('myjobs', EMPLOYER_VIEWS);
    } catch (err) { toast(err.message); }
  };
}

// ---------- หมุดกลางจอ: อ่านพิกัด + ชื่อย่าน จากจุดกึ่งกลางแผนที่ ----------
const NOMINATIM = 'https://nominatim.openstreetmap.org';
let revTimer = null;
let revCtl = null;

function onPinMoved() {
  const c = pickMap.getCenter();
  setPickInfo(`📍 ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)} — กำลังอ่านชื่อย่าน…`);

  // เลื่อนแผนที่ทีเดียวยิงหลายรอบได้ — หน่วงไว้ แล้วยกเลิกรอบเก่าทิ้ง
  // (Nominatim ขอไม่เกิน 1 ครั้ง/วินาที)
  clearTimeout(revTimer);
  revCtl?.abort();
  revTimer = setTimeout(async () => {
    revCtl = new AbortController();
    try {
      const r = await fetch(
        `${NOMINATIM}/reverse?format=jsonv2&zoom=16&accept-language=th&lat=${c.lat}&lon=${c.lng}`,
        { signal: revCtl.signal }
      );
      const a = (await r.json()).address || {};
      pickArea = a.suburb || a.neighbourhood || a.city_district || a.town || a.village || a.city || a.county || '';
    } catch (err) {
      if (err.name === 'AbortError') return;   // มีรอบใหม่มาแทนแล้ว ไม่ต้องเขียนทับ
      pickArea = '';
    }
    setPickInfo(`📍 ${pickArea || 'ตำแหน่งนี้'} · ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`);
  }, 600);
}

function setPickInfo(text) {
  const el = $('#pickInfo');
  if (el) el.textContent = text;
}

// ---------- ปุ่ม "ตำแหน่งของฉัน" ----------
function locateMe() {
  const btn = $('#btnMyLoc');
  if (!navigator.geolocation) return toast('เครื่องนี้หาตำแหน่งอัตโนมัติไม่ได้ — เลื่อนแผนที่เอาเองได้เลย', 4200);

  btn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    (p) => {
      btn.disabled = false;
      pickMap.setView([p.coords.latitude, p.coords.longitude], 17);
    },
    (err) => {
      btn.disabled = false;
      toast(err.code === err.PERMISSION_DENIED
        ? 'ยังไม่ได้อนุญาตให้เข้าถึงตำแหน่ง — เปิดสิทธิ์ในเบราว์เซอร์ก่อน'
        : 'หาตำแหน่งไม่สำเร็จ ลองใหม่อีกครั้ง', 4200);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// ---------- ปุ่ม "ค้นหาในแผนที่" — พิมพ์ที่อยู่แล้วให้แผนที่เลื่อนไปให้ ----------
async function findAddress() {
  const q = $('#addrInput').value.trim();
  if (!q) return toast('พิมพ์ที่อยู่ก่อน แล้วค่อยกดค้นหา');

  const btn = $('#addrFind');
  btn.disabled = true;
  btn.textContent = 'กำลังค้นหา…';
  try {
    const r = await fetch(
      `${NOMINATIM}/search?format=jsonv2&limit=1&countrycodes=th&accept-language=th&q=${encodeURIComponent(q)}`
    );
    const hits = await r.json();
    if (!hits.length) return toast('ไม่พบที่อยู่นี้ — ลองพิมพ์สั้นลง เช่น ชื่อซอย/ถนน หรือเลื่อนแผนที่เอง', 4600);
    pickMap.setView([Number(hits[0].lat), Number(hits[0].lon)], 17);
    toast('เลื่อนแผนที่ให้แล้ว — ปรับหมุดให้ตรงบ้านอีกที');
  } catch {
    toast('ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง');
  } finally {
    btn.disabled = false;
    btn.textContent = 'ค้นหาในแผนที่';
  }
}

// ==========================================================
//  งานที่ฉันโพส
// ==========================================================
async function viewMyJobs() {
  const [{ posted }, { items: hires }] = await Promise.all([
    api('/api/jobs/mine'),
    api('/api/hires/sent'),
  ]);

  view.innerHTML = `
    <h2>งานของฉัน</h2>
    <p class="sub">คำขอจ้างที่ส่งไป และงานที่โพสไว้</p>

    ${hires.length ? `
      <h3 style="font-size:16px;margin:18px 0 10px">คำขอจ้างที่ส่งไป (${hires.length})</h3>
      ${hires.map(hireCard).join('')}` : ''}

    <h3 style="font-size:16px;margin:22px 0 10px">งานที่โพสไว้ (${posted.length})</h3>
    ${posted.length ? posted.map(jobCard).join('') : emptyBox('ยังไม่ได้โพสงาน')}`;

  $$('[data-applicants]', view).forEach((b) => (b.onclick = () => showApplicants(b.dataset.applicants)));
  $$('[data-complete]', view).forEach((b) => (b.onclick = async () => {
    await api(`/api/jobs/${b.dataset.complete}/complete`, { method: 'POST' });
    toast('ปิดงานเรียบร้อย');
    viewMyJobs();
  }));
  $$('[data-chatjob]', view).forEach((b) => (b.onclick = () => {
    go('chat', EMPLOYER_VIEWS);
    setTimeout(() => openChat(b.dataset.chatjob, b.dataset.other), 250);
  }));
}

// การ์ดคำขอจ้างตรง
function hireCard(j) {
  return `
    <div class="job">
      <div class="job-top">
        <div style="flex:1;min-width:0">
          <h3>${esc(j.title)}</h3>
          <div style="margin-top:6px">
            <span class="badge badge-${j.status}">${STATUS_TH[j.status]}</span>
            <span style="font-size:13px;color:var(--muted)"> · ส่งถึง ${esc(j.caregiver_name)}</span>
          </div>
        </div>
        <div class="price">${fmtBaht(j.budget)}<small>${UNIT_TH[j.budget_unit]}</small></div>
      </div>
      <div class="meta">
        <span class="chip">จ้างตรง</span>
        <span class="chip">${CARE_TYPE_TH[j.care_type]}</span>
      </div>
      <div class="job-actions">
        <button class="btn btn-sm btn-ghost" data-chatjob="${j.id}" data-other="${j.target_caregiver_id}">💬 คุยกับเขา</button>
        ${j.status === 'matched' ? `<button class="btn btn-sm btn-amber" data-complete="${j.id}">งานเสร็จแล้ว</button>` : ''}
      </div>
    </div>`;
}

// การ์ดงานที่โพสไว้ (ระบบเดิม)
function jobCard(j) {
  return `
    <div class="job">
      <div class="job-top">
        <div style="flex:1;min-width:0">
          <h3>${esc(j.title)}</h3>
          <div style="margin-top:6px">
            <span class="badge badge-${j.status}">${STATUS_TH[j.status]}</span>
            ${j.caregiver_name ? `<span style="font-size:13px;color:var(--muted)"> · ${esc(j.caregiver_name)}</span>` : ''}
          </div>
        </div>
        <div class="price">${fmtBaht(j.budget)}<small>${UNIT_TH[j.budget_unit]}</small></div>
      </div>
      <div class="meta">
        <span class="chip">โพสหาคน</span>
        <span class="chip">${CARE_TYPE_TH[j.care_type]}</span>
        <span class="chip">📍 ${esc(j.area_label || '-')}</span>
        <span class="chip">👤 ${j.applicant_count} คนขอรับ</span>
      </div>
      <div class="job-actions">
        ${j.status === 'open' ? `<button class="btn btn-sm" data-applicants="${j.id}">ดูผู้สมัคร (${j.applicant_count})</button>` : ''}
        ${j.status === 'matched' ? `<button class="btn btn-sm btn-amber" data-complete="${j.id}">งานเสร็จแล้ว</button>` : ''}
      </div>
    </div>`;
}

// ==========================================================
//  รายชื่อผู้สมัคร → เลือก 1 คน
// ==========================================================
async function showApplicants(jobId) {
  const { items } = await api(`/api/jobs/${jobId}/applicants`);

  view.innerHTML = `
    <button class="btn btn-ghost btn-sm" id="back" style="margin-bottom:14px">← กลับ</button>
    <h2>ผู้สมัคร ${items.length} คน</h2>
    <p class="sub">ดูดาวและประวัติก่อนเลือก — คุยต่อรองในแชทได้ก่อน</p>
    ${items.length ? items.map((a) => `
      <div class="job">
        <div style="display:flex;gap:12px;align-items:center">
          <div class="avatar">${esc(initial(a.full_name))}</div>
          <div style="flex:1;min-width:0">
            <h3>${esc(a.full_name)}</h3>
            <div class="hint" style="margin:2px 0 0">ประสบการณ์ ${a.experience_years} ปี</div>
          </div>
        </div>
        <div class="meta">
          <span class="chip">ประสบการณ์ ${a.experience_years} ปี</span>
          ${a.skills ? `<span class="chip">${esc(a.skills)}</span>` : ''}
        </div>
        ${a.bio ? `<p style="margin-top:10px;font-size:14px">${esc(a.bio)}</p>` : ''}
        ${a.message ? `<p style="margin-top:8px;font-size:14px;color:var(--muted);font-style:italic">"${esc(a.message)}"</p>` : ''}
        <div class="job-actions">
          <button class="btn btn-sm btn-ghost" data-chat="${a.caregiver_id}">💬 คุยก่อน</button>
          <button class="btn btn-sm" data-choose="${a.caregiver_id}">เลือกคนนี้</button>
        </div>
      </div>`).join('')
      : emptyBox('ยังไม่มีใครกดขอรับงานนี้')}`;

  $('#back').onclick = viewMyJobs;

  $$('[data-choose]', view).forEach((b) => (b.onclick = async () => {
    if (!confirm('ยืนยันเลือกแคร์กิฟเวอร์คนนี้?\nคนอื่นจะถูกปฏิเสธอัตโนมัติ')) return;
    try {
      await api(`/api/jobs/${jobId}/choose/${b.dataset.choose}`, { method: 'POST' });
      toast('เลือกแล้ว — คุยรายละเอียดกันต่อในแชทได้เลย');
      viewMyJobs();
    } catch (e) { toast(e.message); }
  }));

  $$('[data-chat]', view).forEach((b) => (b.onclick = () => {
    go('chat', EMPLOYER_VIEWS);
    setTimeout(() => openChat(jobId, b.dataset.chat), 250);
  }));
}

// ==========================================================
const EMPLOYER_VIEWS = { browse: () => viewBrowse(), post: viewPost, myjobs: viewMyJobs, chat: viewChat };

buildFrame({
  role: 'employer',
  tabs: [['browse', 'หาคนดูแล'], ['post', 'โพสงาน'], ['myjobs', 'งานของฉัน'], ['chat', 'แชท']],
  render: EMPLOYER_VIEWS,
});
