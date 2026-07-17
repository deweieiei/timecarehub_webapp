// ฝั่งแคร์กิฟเวอร์ — หางาน / งานที่ขอรับไว้ / แชท / ยืนยันตัวตน

let map = null;
let jobsLayer = null;    // เลเยอร์หมุดงาน — ล้างทีเดียวได้ ไม่ไปโดนหมุดที่ผู้ใช้ปัก
let dropPin = null;      // หมุดที่ผู้ใช้ปักไว้เอง
let radiusRing = null;   // วงรัศมีรอบหมุด
let pinLatLng = null;    // จุดที่หมุดปักอยู่
let pinTouched = false;  // ผู้ใช้ขยับหมุดเองแล้วหรือยัง
let findMode = 'pin';    // 'pin' = ปักหมุดหาในรัศมี | 'all' = ดูงานทั้งหมด ไม่สนตำแหน่ง

// ==========================================================
//  หางานบนแผนที่ — 2 แบบ
//    1) ปักหมุดตรงไหนก็ได้ แล้วหางานในรัศมีรอบหมุด
//    2) ดูงานทั้งหมด — ปิดหมุด/ตำแหน่งไปเลย
// ==========================================================
async function viewFind() {
  map = jobsLayer = dropPin = radiusRing = pinLatLng = null;
  pinTouched = false;
  findMode = 'pin';
  const approved = ME.kyc_status === 'approved';

  view.innerHTML = `
    <h2>หางานใกล้ฉัน</h2>
    <p class="sub">ปักหมุดตรงย่านที่อยากทำงาน แล้วเลือกรัศมี — หรือกดดูงานทั้งหมดก็ได้</p>

    ${approved ? '' : `
      <div class="alert alert-warn">
        <strong>🔒 ยังไม่ได้ยืนยันตัวตน</strong><br>
        ตอนนี้เห็นแค่ตำแหน่งคร่าว ๆ (วงกลม) และยังกดขอรับงานไม่ได้<br>
        <button class="btn btn-sm btn-amber" style="margin-top:10px" id="goKyc">ยืนยันตัวตนเลย</button>
      </div>`}

    <div class="seg">
      <button type="button" data-mode="pin" class="on">📍 ปักหมุดหาในรัศมี</button>
      <button type="button" data-mode="all">🗺️ ดูงานทั้งหมด</button>
    </div>

    <div class="map-wrap">
      <div id="map"></div>
      <button type="button" id="btnMyLoc" class="map-locate" title="ใช้ตำแหน่งของฉัน">
        <span>◎</span> ตำแหน่งของฉัน
      </button>
    </div>

    <div class="card" id="radiusBar" style="margin-top:12px">
      <p class="hint" id="pinHint" style="margin:0 0 10px">แตะบนแผนที่เพื่อย้ายหมุด หรือลากหมุดได้เลย</p>
      <div class="row" style="align-items:flex-end">
        <div class="field" style="margin:0">
          <label>รัศมีรอบหมุด</label>
          <select id="radius">
            <option value="5">5 กม.</option>
            <option value="10">10 กม.</option>
            <option value="20" selected>20 กม.</option>
            <option value="50">50 กม.</option>
          </select>
        </div>
        <div class="field" style="margin:0;flex:1.3">
          <button class="btn btn-block" id="search" type="button">🔍 ค้นหางาน</button>
        </div>
      </div>
    </div>

    <div id="results" style="margin-top:16px"></div>`;

  $('#goKyc')?.addEventListener('click', () => go('kyc', CAREGIVER_VIEWS));

  map = L.map('map').setView(BKK, 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
  jobsLayer = L.layerGroup().addTo(map);

  map.on('click', (e) => {
    if (findMode !== 'pin') return;
    pinTouched = true;
    movePin(e.latlng);
  });

  $$('[data-mode]', view).forEach((b) => (b.onclick = () => setFindMode(b.dataset.mode)));
  $('#btnMyLoc').onclick = locateMe;
  $('#radius').onchange = () => { drawRing(); runSearch({ fit: true }); };
  $('#search').onclick = () => runSearch({ fit: true });

  // ปักหมุดกลางแผนที่ไว้ก่อน จะได้มีงานให้ดูทันทีโดยไม่ต้องรอ GPS
  movePin(map.getCenter(), { fit: true });

  navigator.geolocation?.getCurrentPosition((p) => {
    if (pinTouched || findMode !== 'pin') return;   // ผู้ใช้จัดการเองแล้ว อย่าไปแย่งหมุดเขา
    map.setView([p.coords.latitude, p.coords.longitude], 13);
    movePin(L.latLng(p.coords.latitude, p.coords.longitude), { fit: true });
  });
}

// ---------- สลับโหมด ----------
function setFindMode(mode) {
  if (mode === findMode) return;
  findMode = mode;

  const pinMode = mode === 'pin';
  $$('[data-mode]', view).forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  $('#radiusBar').classList.toggle('hide', !pinMode);
  $('#btnMyLoc').classList.toggle('hide', !pinMode);

  if (pinMode) {
    if (!pinLatLng) pinLatLng = map.getCenter();
    renderPin();
    drawRing();
  } else {
    // โหมดดูงานทั้งหมด — เอาหมุดกับวงรัศมีออกให้หมด ไม่เอาตำแหน่งมาเกี่ยวเลย
    if (dropPin) { map.removeLayer(dropPin); dropPin = null; }
    if (radiusRing) { map.removeLayer(radiusRing); radiusRing = null; }
  }
  runSearch({ fit: true });
}

// ---------- หมุดที่ผู้ใช้ปัก ----------
function renderPin() {
  if (!pinLatLng) return;
  if (dropPin) return dropPin.setLatLng(pinLatLng);

  dropPin = L.marker(pinLatLng, {
    icon: L.divIcon({ className: 'drop-pin', html: '<div class="drop-pin-body"></div>', iconSize: [30, 30], iconAnchor: [15, 30] }),
    draggable: true,
    autoPan: true,
    zIndexOffset: 1000,   // ให้อยู่เหนือหมุดงาน จะได้ลากติดเสมอ
  }).addTo(map);

  dropPin.on('dragstart', () => { pinTouched = true; });
  dropPin.on('dragend', () => {
    pinLatLng = dropPin.getLatLng();
    drawRing();
    runSearch();   // ไม่ fit — ผู้ใช้เพิ่งจัดจอเอง อย่าไปกระตุกจอเขา
  });
}

function movePin(latlng, opts = {}) {
  pinLatLng = L.latLng(latlng);
  renderPin();
  drawRing();
  runSearch(opts);
}

function drawRing() {
  if (radiusRing) { map.removeLayer(radiusRing); radiusRing = null; }
  if (findMode !== 'pin' || !pinLatLng) return;

  radiusRing = L.circle(pinLatLng, {
    radius: Number($('#radius').value) * 1000,
    color: '#d97706', weight: 1.5, dashArray: '6 6',
    fillColor: '#f59e0b', fillOpacity: .06,
    interactive: false,   // ต้องปิด ไม่งั้นวงรัศมีบังคลิกวางหมุดทั้งแผนที่
  }).addTo(map);
}

// ---------- ปุ่ม "ตำแหน่งของฉัน" ----------
function locateMe() {
  const btn = $('#btnMyLoc');
  if (!navigator.geolocation) return toast('เครื่องนี้หาตำแหน่งอัตโนมัติไม่ได้ — แตะบนแผนที่เพื่อปักหมุดเองได้เลย', 4200);

  btn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    (p) => {
      btn.disabled = false;
      pinTouched = true;
      map.setView([p.coords.latitude, p.coords.longitude], 13);
      movePin(L.latLng(p.coords.latitude, p.coords.longitude), { fit: true });
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

// ---------- ค้นหา + วาดผลลง แผนที่/รายการ ----------
async function runSearch({ fit = false } = {}) {
  const radius = $('#radius')?.value;
  let items = [];
  try {
    ({ items } = findMode === 'pin' && pinLatLng
      ? await api(`/api/jobs?lat=${pinLatLng.lat}&lng=${pinLatLng.lng}&radius_km=${radius}`)
      : await api('/api/jobs'));
  } catch (e) {
    return toast(e.message, 4200);
  }
  if (!map) return;   // ผู้ใช้เปลี่ยนแท็บไปแล้วระหว่างรอ

  jobsLayer.clearLayers();

  items.forEach((j) => {
    // ยังไม่ผ่าน KYC → เห็นแค่วงกลมคร่าว ๆ ไม่รู้ตำแหน่งจริง แต่ยังกดดูรายละเอียดได้
    if (!j.precise) {
      L.circle([j.lat, j.lng], {
        radius: j.fuzz_radius_m, color: '#0e7c86', fillColor: '#0e7c86', fillOpacity: .16, weight: 1,
      }).addTo(jobsLayer).on('click', () => openJobSheet(j));
    }

    // หมุดโชว์หัวข้องาน — กดแล้วเปิดแผ่นรายละเอียด
    L.marker([j.lat, j.lng], {
      icon: L.divIcon({
        className: 'pin',
        html: `<div class="pin-body"><div class="pin-label">${esc(j.title)}</div><div class="pin-tip"></div></div>`,
        iconSize: [null, null],
        iconAnchor: [0, 0],   // จัดตำแหน่งเองด้านล่าง
      }),
    }).addTo(jobsLayer).on('click', () => openJobSheet(j));
  });

  // จัดหมุดให้ปลายแหลมชี้ลงตรงพิกัดพอดี
  $$('.leaflet-marker-icon.pin').forEach((el) => {
    el.style.marginLeft = `-${el.offsetWidth / 2}px`;
    el.style.marginTop = `-${el.offsetHeight}px`;
  });

  if (fit) {
    // โหมดหมุด: ให้เห็นวงรัศมีเต็มวง | โหมดทั้งหมด: ให้เห็นงานครบทุกงาน
    if (findMode === 'pin' && radiusRing) map.fitBounds(radiusRing.getBounds(), { padding: [30, 30] });
    else if (items.length) map.fitBounds(L.latLngBounds(items.map((j) => [j.lat, j.lng])), { padding: [50, 50], maxZoom: 15 });
  }

  $('#results').innerHTML = items.length
    ? `<h2 style="margin-bottom:12px">พบ ${items.length} งาน</h2>` + items.map(jobCard).join('')
    : (findMode === 'pin'
      ? `<div class="alert alert-info">
           ไม่มีงานในรัศมี ${radius} กม. จากหมุดนี้ — ลองขยายรัศมี ย้ายหมุด หรือ
           <button class="btn btn-sm btn-ghost" id="seeAll" style="margin-top:8px">ดูงานทั้งหมด</button>
         </div>`
      : emptyBox('ยังไม่มีงานเปิดรับในระบบตอนนี้'));

  $('#seeAll')?.addEventListener('click', () => setFindMode('all'));
  $$('[data-detail]', $('#results')).forEach((b) => (b.onclick = () => {
    openJobSheet(items.find((j) => String(j.id) === b.dataset.detail));
  }));
  $$('[data-apply]', $('#results')).forEach((b) => (b.onclick = () => applyJob(b.dataset.apply)));
}

// ==========================================================
//  แผ่นรายละเอียดงาน — เด้งขึ้นตอนกดหมุด
// ==========================================================
function closeSheet() {
  document.querySelector('.sheet-backdrop')?.remove();
}

function openJobSheet(j) {
  if (!j) return;
  closeSheet();

  const row = (k, v) => (v ? `<div class="sheet-row"><div class="k">${k}</div><div class="v">${v}</div></div>` : '');

  const period = [j.start_date, j.end_date]
    .filter(Boolean)
    .map((d) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }))
    .join(' – ');

  const location = j.precise
    ? `📍 ${esc(j.address || j.area_label || '-')}`
    : `<span style="color:var(--amber-dark)">🔒 ตำแหน่งโดยประมาณ (${esc(j.area_label || 'ไม่ระบุย่าน')})<br>
       <small>ยืนยันตัวตนเพื่อดูที่อยู่จริง</small></span>`;

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
        <span class="chip">${CARE_TYPE_TH[j.care_type]}</span>
        ${j.distance_km != null ? `<span class="chip">📏 ห่าง ${Number(j.distance_km).toFixed(1)} กม.</span>` : ''}
        <span class="chip">👤 ${j.applicant_count} คนขอรับ</span>
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
      ${row('ตำแหน่ง', location)}

      <div class="sheet-actions">
        <button class="btn btn-block" id="sheetApply">ขอรับงานนี้</button>
      </div>
    </div>`;

  document.body.appendChild(backdrop);

  // ปิดเมื่อกดพื้นหลัง / ปุ่มกากบาท / Esc
  backdrop.onclick = (e) => { if (e.target === backdrop) closeSheet(); };
  backdrop.querySelector('.sheet-close').onclick = closeSheet;
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { closeSheet(); document.removeEventListener('keydown', onEsc); }
  });

  backdrop.querySelector('#sheetApply').onclick = async () => {
    await applyJob(j.id);
    closeSheet();
  };
}

function jobCard(j) {
  return `
    <div class="job">
      <div class="job-top">
        <div style="flex:1;min-width:0"><h3>${esc(j.title)}</h3></div>
        <div class="price">${fmtBaht(j.budget)}<small>${UNIT_TH[j.budget_unit]}</small></div>
      </div>
      <div class="meta">
        <span class="chip">${CARE_TYPE_TH[j.care_type]}</span>
        ${j.distance_km != null ? `<span class="chip">📏 ${Number(j.distance_km).toFixed(1)} กม.</span>` : ''}
        <span class="chip">👤 ${j.applicant_count} คนขอรับ</span>
      </div>
      ${j.elder_condition ? `<p style="margin-top:10px;font-size:14px">${esc(j.elder_condition)}</p>` : ''}
      <p style="margin-top:8px;font-size:13px;${j.precise ? 'color:var(--muted)' : 'color:var(--amber-dark)'}">
        ${j.precise
          ? `📍 ${esc(j.address || j.area_label || '-')}`
          : `🔒 ตำแหน่งโดยประมาณ (${esc(j.area_label || 'ไม่ระบุย่าน')}) — ยืนยันตัวตนเพื่อดูที่อยู่จริง`}
      </p>
      <div class="job-actions">
        <button class="btn btn-sm btn-ghost" data-detail="${j.id}">ดูรายละเอียด</button>
        <button class="btn btn-sm" data-apply="${j.id}">ขอรับงาน</button>
      </div>
    </div>`;
}

async function applyJob(jobId) {
  const message = prompt('ข้อความถึงผู้ว่าจ้าง (ไม่ใส่ก็ได้)\nเช่น แนะนำตัว ประสบการณ์ หรือเสนอราคา');
  if (message === null) return;
  try {
    await api(`/api/jobs/${jobId}/apply`, { method: 'POST', body: JSON.stringify({ message }) });
    toast('ส่งคำขอแล้ว — ไปคุยกับผู้ว่าจ้างในแชทได้เลย');
  } catch (e) { toast(e.message, 4500); }
}

// ==========================================================
//  งานของฉัน — คำขอจ้างที่ส่งมาหา + งานที่ไปกดขอรับไว้
// ==========================================================
async function viewApplied() {
  const [{ items: offers }, { applied }] = await Promise.all([
    api('/api/hires/incoming'),
    api('/api/jobs/mine'),
  ]);

  const st = {
    pending: ['pending', 'รอผู้ว่าจ้างเลือก'],
    accepted: ['approved', 'ได้รับเลือกแล้ว ✓'],
    rejected: ['rejected', 'ไม่ได้รับเลือก'],
  };

  const waiting = offers.filter((o) => o.status === 'offered').length;

  view.innerHTML = `
    <h2>งานของฉัน</h2>
    <p class="sub">คำขอจ้างที่ส่งมาหาคุณ และงานที่คุณไปกดขอรับไว้</p>

    <h3 style="font-size:16px;margin:18px 0 10px">
      คำขอจ้างตรง (${offers.length})
      ${waiting ? `<span class="badge badge-pending" style="margin-left:6px">ใหม่ ${waiting}</span>` : ''}
    </h3>
    ${offers.length ? offers.map(offerCard).join('') : emptyBox('ยังไม่มีใครส่งคำขอจ้างมา')}

    <h3 style="font-size:16px;margin:22px 0 10px">งานที่ขอรับไว้ (${applied.length})</h3>
    ${applied.length ? applied.map((j) => `
      <div class="job">
        <div class="job-top">
          <div style="flex:1;min-width:0">
            <h3>${esc(j.title)}</h3>
            <div style="margin-top:6px">
              <span class="badge badge-${st[j.my_application_status][0]}">${st[j.my_application_status][1]}</span>
            </div>
          </div>
          <div class="price">${fmtBaht(j.budget)}<small>${UNIT_TH[j.budget_unit]}</small></div>
        </div>
        <div class="meta">
          <span class="chip">👤 ${esc(j.employer_name)}</span>
          <span class="chip">${CARE_TYPE_TH[j.care_type]}</span>
        </div>
      </div>`).join('')
      : emptyBox('ยังไม่ได้ขอรับงานไหน<br>ไปที่แท็บ "หางาน"')}`;

  $$('[data-accept]', view).forEach((b) => (b.onclick = () => respond(b.dataset.accept, 'accept')));
  $$('[data-decline]', view).forEach((b) => (b.onclick = () => {
    if (!confirm('ปฏิเสธคำขอจ้างนี้?')) return;
    respond(b.dataset.decline, 'decline');
  }));
  $$('[data-chatjob]', view).forEach((b) => (b.onclick = () => {
    go('chat', CAREGIVER_VIEWS);
    setTimeout(() => openChat(b.dataset.chatjob, b.dataset.other), 250);
  }));
}

function offerCard(j) {
  const isNew = j.status === 'offered';
  return `
    <div class="job" ${isNew ? 'style="border:2px solid var(--amber)"' : ''}>
      <div class="job-top">
        <div style="flex:1;min-width:0">
          <h3>${esc(j.title)}</h3>
          <div style="margin-top:6px">
            <span class="badge badge-${j.status}">${STATUS_TH[j.status]}</span>
            <span style="font-size:13px;color:var(--muted)"> · จาก ${esc(j.employer_name)}</span>
          </div>
        </div>
        <div class="price">${fmtBaht(j.budget)}<small>${UNIT_TH[j.budget_unit]}</small></div>
      </div>

      <div class="meta">
        <span class="chip">${CARE_TYPE_TH[j.care_type]}</span>
        ${j.address ? `<span class="chip">📍 ${esc(j.address)}</span>` : ''}
      </div>
      ${j.elder_condition ? `<p style="margin-top:10px;font-size:14px">${esc(j.elder_condition)}</p>` : ''}
      ${j.tasks ? `<p style="margin-top:4px;font-size:14px;color:var(--muted)">${esc(j.tasks)}</p>` : ''}

      <div class="job-actions">
        ${isNew ? `
          <button class="btn btn-sm btn-ghost" data-decline="${j.id}">ปฏิเสธ</button>
          <button class="btn btn-sm" data-accept="${j.id}">ตอบรับงาน</button>`
        : `<button class="btn btn-sm btn-ghost btn-block" data-chatjob="${j.id}" data-other="${j.employer_id}">💬 คุยกับผู้ว่าจ้าง</button>`}
      </div>
    </div>`;
}

async function respond(jobId, decision) {
  try {
    await api(`/api/hires/${jobId}/respond`, { method: 'POST', body: JSON.stringify({ decision }) });
    toast(decision === 'accept' ? 'ตอบรับงานแล้ว — คุยรายละเอียดต่อในแชทได้เลย' : 'ปฏิเสธคำขอแล้ว');
    viewApplied();
  } catch (e) { toast(e.message); }
}

// ==========================================================
//  บัตรแคร์กิฟเวอร์ — รูป + ประวัติ + ย่านที่รับงาน (ปักหมุดเอง)
//  บัตรใบนี้คือสิ่งที่ผู้ว่าจ้างเห็นตอนหาคน — หมุดที่ปักคือตัวตัดสินว่าจะโผล่ในผลค้นหาของใคร
//
//  ยืนยันตัวตน = โหมดเดโม กดปุ่มเดียวผ่านทันที
//  (ไม่มีอัปรูปบัตร ไม่ต้องรอแอดมิน — แต่ยังคุม GPS 2 ระดับเหมือนเดิม)
// ==========================================================
let cardPicker = null;

async function viewKyc() {
  cardPicker = null;
  const p = await api('/api/kyc/me');
  const approved = p.kyc_status === 'approved';
  const hasPin = p.lat != null && p.lng != null;

  view.innerHTML = `
    <h2>บัตรแคร์กิฟเวอร์</h2>
    <p class="sub">
      สถานะ: <span class="badge badge-${p.kyc_status}">${KYC_TH[p.kyc_status]}</span>
      · ข้อมูลชื่อ/ที่อยู่/บัตรประชาชนส่วนตัว อยู่ที่ <a href="/profile.html" style="color:var(--teal);font-weight:600">โปรไฟล์ของฉัน</a>
    </p>

    ${approved
      ? `<div class="alert alert-ok">
           <strong>✅ ยืนยันตัวตนเรียบร้อย</strong><br>
           กดขอรับงานได้แล้ว และเห็นพิกัด + ที่อยู่จริงของงานทุกงาน
         </div>`
      : `<div class="alert alert-info">
           <strong>ตอนนี้คุณยังยืนยันตัวตนไม่สำเร็จ</strong><br>
           • เห็นงานได้ แต่เห็นแค่ <strong>ตำแหน่งคร่าว ๆ (วงกลม)</strong> ไม่เห็นที่อยู่จริง<br>
           • ยัง <strong>กดขอรับงานไม่ได้</strong> และยัง <strong>ไม่โผล่ให้ผู้ว่าจ้างเห็น</strong>
         </div>`}

    <form id="kycForm">
      <input type="hidden" name="lat" id="cardLat" value="${hasPin ? p.lat : ''}">
      <input type="hidden" name="lng" id="cardLng" value="${hasPin ? p.lng : ''}">

      <div class="card">
        <h3 class="card-title">รูปโปรไฟล์</h3>
        ${photoPickerHtml(p, 'รูปหน้าตรง เห็นหน้าชัด — <strong>ผู้ว่าจ้างเห็นรูปนี้เป็นอย่างแรก</strong> ตอนเลือกคนเข้าบ้าน')}
      </div>

      <div class="card">
        <h3 class="card-title">ประวัติการทำงาน</h3>
        <p class="hint" style="margin:-6px 0 14px">
          ข้อมูลนี้คือสิ่งที่<strong>ผู้ว่าจ้างเห็นตอนหาคนดูแล</strong> — ใส่ครบ โอกาสถูกจ้างสูงกว่ามาก
        </p>
        <div class="row">
          <div class="field">
            <label>ประสบการณ์ (ปี)</label>
            <input type="number" inputmode="numeric" name="experience_years" min="0" value="${p.experience_years || 0}">
          </div>
          <div class="field">
            <label>เรตที่รับ</label>
            <input type="number" inputmode="numeric" name="rate" min="0" value="${p.rate ? Math.round(p.rate) : ''}" placeholder="700">
          </div>
          <div class="field">
            <label>หน่วย</label>
            <select name="rate_unit">
              <option value="per_day" ${p.rate_unit === 'per_day' ? 'selected' : ''}>บาท/วัน</option>
              <option value="per_hour" ${p.rate_unit === 'per_hour' ? 'selected' : ''}>บาท/ชม.</option>
              <option value="per_month" ${p.rate_unit === 'per_month' ? 'selected' : ''}>บาท/เดือน</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>ทักษะ <span class="hint" style="display:inline;font-weight:400">(คั่นด้วยจุลภาค)</span></label>
          <input name="skills" value="${esc(p.skills || '')}" placeholder="ผู้ช่วยพยาบาล, ทำกายภาพ, ทำอาหาร">
        </div>
        <div class="field" style="margin:0">
          <label>แนะนำตัว</label>
          <textarea name="bio" rows="3" placeholder="เล่าประสบการณ์ดูแลผู้สูงอายุของคุณ">${esc(p.bio || '')}</textarea>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">ย่านที่รับงาน</h3>

        <div class="alert alert-warn" style="margin-bottom:14px">
          <strong>👀 หมุดนี้ผู้ว่าจ้างเห็นตรง ๆ บนแผนที่</strong><br>
          ปัก<strong>ย่านที่อยากรับงาน</strong> (เช่น ปากซอย ห้าง สถานีรถไฟฟ้าใกล้บ้าน) — ไม่ต้องปักบ้านตัวเอง
        </div>

        <div class="field">
          <label>ค้นหาว่าตอนนี้เราอยู่ตรงไหน</label>
          <div class="row" style="align-items:center">
            <input id="cardFind" placeholder="ลาดพร้าว 15 · MRT ห้วยขวาง · เซ็นทรัลปิ่นเกล้า">
            <button type="button" id="cardFindBtn" class="btn btn-sm btn-ghost" style="flex:0 0 auto">ค้นหาในแผนที่</button>
          </div>
          <p class="hint">พิมพ์แล้วกดค้นหา แผนที่จะเลื่อนไปให้ · หรือกดปุ่ม ◎ ใช้ตำแหน่งเครื่องก็ได้</p>
        </div>

        <p id="cardPinInfo" class="hint" style="margin-bottom:10px">เลื่อน/ซูมแผนที่ให้หมุดกลางจอตรงย่านที่จะรับงาน</p>
        ${pickerBox()}

        <div class="row" style="margin-top:14px;align-items:flex-end">
          <div class="field" style="margin:0">
            <label>ยอมเดินทางไกลแค่ไหน</label>
            <select name="service_radius_km" id="cardRadius">
              ${[5, 10, 20, 30, 50].map((r) =>
                `<option value="${r}" ${(p.service_radius_km || 10) === r ? 'selected' : ''}>ในรัศมี ${r} กม. จากหมุด</option>`).join('')}
            </select>
            <p class="hint">ผู้ว่าจ้างที่หาคนไกลกว่านี้จะไม่เจอคุณ</p>
          </div>
          <div class="field" style="margin:0">
            <label>ชื่อย่าน</label>
            <input name="area_label" id="cardArea" value="${esc(p.area_label || '')}" placeholder="ลาดพร้าว">
            <p class="hint">ระบบอ่านจากหมุดให้ — แก้เองได้</p>
          </div>
        </div>
      </div>

      <div class="card" style="background:var(--teal-light);box-shadow:none">
        <p style="font-size:14px;color:var(--teal-dark)">
          <strong>ℹ️ โหมดเดโม</strong><br>
          ระบบจริงจะให้ถ่ายรูปบัตรประชาชน + เซลฟี่คู่บัตร แล้วรอแอดมินตรวจอนุมัติ<br>
          ตอนนี้ปิดไว้ชั่วคราวเพื่อให้ทดลองใช้ง่าย — กดปุ่มด้านล่างแล้วผ่านทันที
        </p>
      </div>

      <button class="btn btn-block" id="cardSave">${approved ? 'บันทึกการเปลี่ยนแปลง' : 'ยืนยันตัวตน'}</button>
      ${approved ? '' : '<p class="hint" style="text-align:center;margin-top:10px">ต้องปักหมุดย่านที่รับงานก่อน ถึงจะยืนยันตัวตนได้</p>'}
    </form>`;

  wirePhotoPicker({ onChange: setMyPhoto });

  // มีหมุดเดิมอยู่แล้ว → เปิดมาที่หมุดเดิม อย่าให้ GPS ลากไปที่อื่นแล้วทับของที่ตั้งใจปักไว้
  cardPicker = createPicker({
    center: hasPin ? [p.lat, p.lng] : BKK,
    zoom: hasPin ? 15 : 13,
    autoLocate: !hasPin,
    onMove: onCardPinMoved,
  });

  drawServiceRing();
  $('#cardRadius').onchange = drawServiceRing;
  cardPicker.map.on('move', drawServiceRing);   // วงรัศมีต้องติดหมุดตอนลากแผนที่ ไม่ใช่ค้างที่เดิม

  $('#cardFindBtn').onclick = () => cardPicker.search($('#cardFind').value.trim(), $('#cardFindBtn'));
  // ในฟอร์ม ปุ่ม Enter จะไปกดส่งฟอร์ม — ดักไว้ให้กลายเป็นค้นหาที่อยู่แทน
  $('#cardFind').onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    cardPicker.search($('#cardFind').value.trim(), $('#cardFindBtn'));
  };

  $('#kycForm').onsubmit = (e) => {
    e.preventDefault();
    saveCard(e.target, approved);
  };
}

// ---------- หมุดขยับ: จำพิกัด + เติมชื่อย่านให้ ----------
function onCardPinMoved({ lat, lng, area, loading }) {
  $('#cardLat').value = lat;
  $('#cardLng').value = lng;
  $('#cardPinInfo').textContent = loading
    ? `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)} — กำลังอ่านชื่อย่าน…`
    : `📍 ${area || 'ตำแหน่งนี้'} · ${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  // เติมชื่อย่านให้เฉพาะตอนช่องยังว่าง — ผู้ใช้พิมพ์เองแล้วห้ามไปทับ
  const areaInput = $('#cardArea');
  if (!loading && area && areaInput && !areaInput.value.trim()) areaInput.value = area;
}

// ---------- วงรัศมีที่ยอมเดินทาง ----------
let serviceRing = null;

function drawServiceRing() {
  if (!cardPicker) return;
  const radius = Number($('#cardRadius').value) * 1000;
  const at = cardPicker.center();

  // setLatLng/setRadius แทนการลบแล้ววาดใหม่ — ลากแผนที่ทีนึง move ยิงเป็นสิบรอบ
  if (serviceRing) return serviceRing.setLatLng(at).setRadius(radius);

  // สีเขียนตรง ๆ ไม่ใช้ var(--teal): Leaflet ยัดค่านี้ลง attribute stroke/fill ของ SVG
  // ซึ่ง var() ใช้ใน presentation attribute ไม่ได้ → เส้นจะกลายเป็นสีดำ
  serviceRing = L.circle(at, {
    radius,
    color: '#0e7c86', weight: 1.5, dashArray: '6 6',
    fillColor: '#0e7c86', fillOpacity: .06,
    interactive: false,
  }).addTo(cardPicker.map);
}

// ---------- บันทึก ----------
// ยืนยันแล้ว → บันทึกเฉย ๆ ไม่แตะสถานะ | ยังไม่ยืนยัน → บันทึก + ยืนยันตัวตนรวดเดียว
async function saveCard(form, approved) {
  const btn = $('#cardSave');
  const data = Object.fromEntries(new FormData(form));

  btn.disabled = true;
  try {
    await api(approved ? '/api/kyc/profile' : '/api/kyc/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    // อัปเดต ME — หน้าหางานจะได้เห็นพิกัดเป๊ะทันที ไม่ต้องรีโหลด
    const { user } = await api('/api/auth/me');
    ME = user;

    toast(approved ? 'บันทึกบัตรแล้ว' : 'ยืนยันตัวตนสำเร็จ — กดขอรับงานได้แล้ว และผู้ว่าจ้างเริ่มเห็นคุณแล้ว', 4200);
    viewKyc();
  } catch (err) {
    toast(err.message, 4500);
    btn.disabled = false;
  }
}

// ==========================================================
const CAREGIVER_VIEWS = { find: viewFind, applied: viewApplied, chat: viewChat, kyc: viewKyc };

buildFrame({
  role: 'caregiver',
  // แท็บใช้ชื่อสั้น (จอมือถือมี 4 แท็บ ยาวกว่านี้ล้น) — ชื่อเต็มอยู่ที่หัวข้อในหน้า
  tabs: [['find', 'หางาน'], ['applied', 'งานของฉัน'], ['chat', 'แชท'], ['kyc', 'บัตรแคร์กิฟเวอร์']],
  render: CAREGIVER_VIEWS,
});
