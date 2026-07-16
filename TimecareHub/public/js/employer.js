// ฝั่งผู้ว่าจ้าง — หาแคร์กิฟเวอร์ / โพสงาน / งานของฉัน / แชท

let pickMap = null;
let pickMarker = null;

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
  pickMap = pickMarker = null;

  view.innerHTML = `
    <h2>โพสงานใหม่</h2>
    <p class="sub">กรอกรายละเอียด แล้วแตะบนแผนที่เพื่อปักหมุดบ้าน</p>

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
        <div class="field">
          <label>ที่อยู่เต็ม</label>
          <input name="address" placeholder="123/45 ซอยลาดพร้าว 15 จตุจักร">
          <p class="hint">🔒 เห็นเฉพาะแคร์กิฟเวอร์ที่ยืนยันตัวตนแล้ว</p>
        </div>
        <div class="field" style="margin:0">
          <label>ชื่อย่าน</label>
          <input name="area_label" placeholder="ลาดพร้าว">
          <p class="hint">👁 คนทั่วไปเห็นได้</p>
        </div>
      </div>

      <div class="card">
        <label>ปักหมุดตำแหน่ง *</label>
        <p id="pickInfo" class="hint" style="color:var(--red);margin-bottom:10px">ยังไม่ได้ปักหมุด — แตะบนแผนที่</p>
        <div id="pickMap"></div>
      </div>

      <button class="btn btn-block">โพสงาน</button>
    </form>`;

  pickMap = L.map('pickMap').setView(BKK, 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(pickMap);
  navigator.geolocation?.getCurrentPosition((p) => pickMap.setView([p.coords.latitude, p.coords.longitude], 15));

  pickMap.on('click', (e) => {
    if (pickMarker) pickMarker.setLatLng(e.latlng);
    else pickMarker = L.marker(e.latlng).addTo(pickMap);
    const info = $('#pickInfo');
    info.textContent = `✓ ปักหมุดแล้ว (${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)})`;
    info.style.color = 'var(--green)';
  });

  $('#jobForm').onsubmit = async (e) => {
    e.preventDefault();
    if (!pickMarker) return toast('แตะบนแผนที่เพื่อปักหมุดตำแหน่งก่อน');
    const data = Object.fromEntries(new FormData(e.target));
    const { lat, lng } = pickMarker.getLatLng();
    data.lat = lat;
    data.lng = lng;
    try {
      await api('/api/jobs', { method: 'POST', body: JSON.stringify(data) });
      toast('โพสงานแล้ว รอแคร์กิฟเวอร์กดขอรับงาน');
      go('myjobs', EMPLOYER_VIEWS);
    } catch (err) { toast(err.message); }
  };
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
