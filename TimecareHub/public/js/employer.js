// ฝั่งผู้ว่าจ้าง — หาคนดูแล / โพสงาน / งานของฉัน / แชท

let postPicker = null;
let pickArea = '';   // ชื่อย่านที่อ่านได้จากหมุดตอนโพสงาน — ส่งขึ้นไปเป็น area_label ให้อัตโนมัติ

const RATE_UNIT_TH = { per_hour: 'บาท/ชม.', per_day: 'บาท/วัน', per_month: 'บาท/เดือน' };

// ==========================================================
//  ⭐ หาคนดูแล — ปักหมุดบ้าน แล้วดูว่ามีใครรับงานแถวนั้นบ้าง
//     (แสดงเฉพาะคนที่ยืนยันตัวตนแล้ว)
//
//  ล้อกับฝั่งแคร์กิฟเวอร์หางาน (public/js/caregiver.js) ให้เป็นคู่กัน — หาได้ 2 แบบ:
//    1) ปักหมุด + รัศมี → เจอเฉพาะคนที่รับงานแถวนั้น เรียงจากใกล้ไปไกล
//    2) ดูทั้งหมด      → เห็นทุกคน ไม่สนตำแหน่ง (เผื่อคนที่ยังไม่ได้ปักหมุด)
// ==========================================================
let browsePicker = null;
let cgLayer = null;       // เลเยอร์หมุดคน — ล้างทีเดียวได้
let searchRing = null;    // วงรัศมีรอบหมุดค้นหา
let browseMode = 'pin';   // 'pin' = ปักหมุดหาในรัศมี | 'all' = ดูทั้งหมด
let browseItems = [];     // ผลค้นหารอบล่าสุด — ใช้ตอนกดหมุด/กดปุ่มบนการ์ด
let browseTimer = null;

// รัศมีกว้างแค่ไหน ควรเห็นแผนที่กว้างเท่าไหร่ — ไม่งั้นเลือก 50 กม. แล้ววงล้นจอไปไกล
const ZOOM_FOR = { 5: 13, 10: 12, 20: 11, 30: 10, 50: 9 };

async function viewBrowse() {
  browsePicker = cgLayer = searchRing = null;
  browseItems = [];
  browseMode = 'pin';
  clearTimeout(browseTimer);

  view.innerHTML = `
    <h2>หาคนดูแล</h2>
    <p class="sub">ปักหมุดตรงบ้าน แล้วดูว่ามีแคร์กิฟเวอร์รับงานแถวนั้นกี่คน</p>

    <div class="seg">
      <button type="button" data-bmode="pin" class="on">📍 ปักหมุดหาในรัศมี</button>
      <button type="button" data-bmode="all">👥 ดูทั้งหมด</button>
    </div>

    <div class="card" id="pinCard">
      <div class="field">
        <label>จะให้ไปดูแลที่ไหน</label>
        <div class="row" style="align-items:center">
          <input id="placeFind" placeholder="ลาดพร้าว 15 · MRT ห้วยขวาง · รพ.รามคำแหง">
          <button type="button" id="placeFindBtn" class="btn btn-sm btn-ghost" style="flex:0 0 auto">ค้นหาในแผนที่</button>
        </div>
        <p class="hint">พิมพ์แล้วกดค้นหา แผนที่จะเลื่อนไปให้ · หรือกดปุ่ม ◎ ใช้ตำแหน่งเครื่องก็ได้</p>
      </div>

      <p id="browsePinInfo" class="hint" style="margin-bottom:10px">เลื่อน/ซูมแผนที่ให้หมุดกลางจอตรงกับบ้าน</p>
      ${pickerBox({ tall: true })}

      <div class="row" style="margin-top:14px;align-items:flex-end">
        <div class="field" style="margin:0">
          <label>หาคนในรัศมี</label>
          <select id="browseRadius">
            ${[5, 10, 20, 30, 50].map((r) => `<option value="${r}" ${r === 20 ? 'selected' : ''}>${r} กม. จากหมุด</option>`).join('')}
          </select>
        </div>
        <div class="field" style="margin:0;flex:1.3">
          <button class="btn btn-block" id="browseSearch" type="button">🔍 ค้นหาคนแถวนี้</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="row" style="align-items:flex-end;margin:0">
        <div class="field" style="margin:0;flex:2">
          <label>กรองด้วยชื่อ / ทักษะ <span class="hint" style="display:inline;font-weight:400">(ไม่ใส่ก็ได้)</span></label>
          <input id="q" placeholder="ติดเตียง · ผู้ช่วยพยาบาล · ทำกายภาพ">
        </div>
        <div class="field" style="margin:0">
          <button class="btn btn-block btn-ghost" id="doSearch" type="button">กรอง</button>
        </div>
      </div>
    </div>

    <div id="results" style="margin-top:16px"></div>`;

  $$('[data-bmode]', view).forEach((b) => (b.onclick = () => setBrowseMode(b.dataset.bmode)));

  browsePicker = createPicker({ onMove: onBrowsePinMoved });
  cgLayer = L.layerGroup().addTo(browsePicker.map);
  browsePicker.map.on('move', drawSearchRing);

  $('#browseRadius').onchange = () => {
    drawSearchRing();
    browsePicker.map.setZoom(ZOOM_FOR[$('#browseRadius').value]);   // ซูมออกให้เห็นวงเต็ม
    runBrowse();   // ถ้าซูมเท่าเดิมอยู่แล้ว moveend จะไม่ยิง — ต้องสั่งค้นหาเอง
  };
  $('#browseSearch').onclick = () => runBrowse();
  $('#placeFindBtn').onclick = () => browsePicker.search($('#placeFind').value.trim(), $('#placeFindBtn'));
  $('#placeFind').onkeydown = (e) => { if (e.key === 'Enter') browsePicker.search($('#placeFind').value.trim(), $('#placeFindBtn')); };

  $('#doSearch').onclick = () => runBrowse();
  $('#q').onkeydown = (e) => { if (e.key === 'Enter') runBrowse(); };

  drawSearchRing();
  runBrowse();
}

// ---------- สลับโหมด ----------
function setBrowseMode(mode) {
  if (mode === browseMode) return;
  browseMode = mode;

  $$('[data-bmode]', view).forEach((b) => b.classList.toggle('on', b.dataset.bmode === mode));
  $('#pinCard').classList.toggle('hide', mode !== 'pin');
  runBrowse();
}

// ---------- หมุดขยับ → ค้นหาใหม่ ----------
function onBrowsePinMoved({ lat, lng, area, loading }) {
  const el = $('#browsePinInfo');
  if (el) {
    el.textContent = loading
      ? `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)} — กำลังอ่านชื่อย่าน…`
      : `📍 ${area || 'ตำแหน่งนี้'} · ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  // หน่วงเอง ไม่รอให้ชื่อย่านอ่านเสร็จก่อนค่อยค้นหา —
  // Nominatim ล่ม/ช้าเมื่อไหร่ ผลค้นหาจะไม่ตามมาเลย ทั้งที่พิกัดรู้ตั้งแต่วินาทีแรกแล้ว
  clearTimeout(browseTimer);
  browseTimer = setTimeout(() => runBrowse(), 700);
}

// ---------- วงรัศมีค้นหา — ต้องติดหมุดกลางจอตอนลากแผนที่ ----------
function drawSearchRing() {
  if (!browsePicker) return;

  if (browseMode !== 'pin') {
    if (searchRing) { browsePicker.map.removeLayer(searchRing); searchRing = null; }
    return;
  }

  const radius = Number($('#browseRadius').value) * 1000;
  const at = browsePicker.center();
  if (searchRing) return searchRing.setLatLng(at).setRadius(radius);

  // สีเขียนตรง ๆ ไม่ใช้ var(--amber-dark): Leaflet ยัดค่านี้ลง attribute ของ SVG ซึ่ง var() ใช้ไม่ได้
  searchRing = L.circle(at, {
    radius,
    color: '#d97706', weight: 1.5, dashArray: '6 6',
    fillColor: '#f59e0b', fillOpacity: .06,
    interactive: false,
  }).addTo(browsePicker.map);
}

// ---------- ค้นหา + วาดผลลง แผนที่/รายการ ----------
async function runBrowse() {
  if (!browsePicker) return;

  const q = $('#q')?.value.trim() || '';
  const radius = $('#browseRadius').value;
  const c = browsePicker.center();

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (browseMode === 'pin') {
    params.set('lat', c.lat);
    params.set('lng', c.lng);
    params.set('radius_km', radius);
  }

  try {
    ({ items: browseItems } = await api(`/api/caregivers?${params}`));
  } catch (e) {
    return toast(e.message, 4200);
  }
  if (!browsePicker) return;   // ผู้ใช้เปลี่ยนแท็บไปแล้วระหว่างรอ

  drawCgPins();

  $('#results').innerHTML = browseItems.length
    ? `<h2 style="margin-bottom:4px">พบ ${browseItems.length} คน</h2>
       <p class="sub">กด "ดูบนแผนที่" เพื่อดูว่าเขาอยู่ตรงไหน · กด "ดูบัตร" เพื่อดูประวัติเต็ม</p>
       ${browseItems.map(cgCard).join('')}`
    : (browseMode === 'pin'
      ? `<div class="alert alert-info">
           ไม่มีแคร์กิฟเวอร์รับงานในรัศมี ${radius} กม. จากหมุดนี้${q ? ` ที่ตรงกับ "${esc(q)}"` : ''} —
           ลองขยายรัศมี ย้ายหมุด หรือ
           <button class="btn btn-sm btn-ghost" id="seeAllCg" style="margin-top:8px">ดูทั้งหมด</button>
         </div>`
      : emptyBox('ยังไม่มีแคร์กิฟเวอร์ที่ยืนยันตัวตนในระบบตอนนี้'));

  $('#seeAllCg')?.addEventListener('click', () => setBrowseMode('all'));
  $$('[data-hire]', $('#results')).forEach((b) => (b.onclick = () => {
    openHireSheet(browseItems.find((x) => String(x.id) === b.dataset.hire));
  }));
  $$('[data-locate-cg]', $('#results')).forEach((b) => (b.onclick = () => showOnMap(b.dataset.locateCg)));
}

// ---------- หมุดคนบนแผนที่ ----------
function drawCgPins() {
  cgLayer.clearLayers();

  browseItems.forEach((c) => {
    if (c.lat == null || c.lng == null) return;   // ยังไม่ปักหมุด — โผล่ในรายการได้ แต่ปักบนแผนที่ไม่ได้

    L.marker([c.lat, c.lng], {
      icon: L.divIcon({
        className: 'pin',
        html: `<div class="pin-body" data-cgpin="${c.id}">
                 <div class="pin-label">${esc(c.full_name)}</div><div class="pin-tip"></div>
               </div>`,
        iconSize: [null, null],
        iconAnchor: [0, 0],   // จัดตำแหน่งเองด้านล่าง
      }),
    }).addTo(cgLayer).on('click', () => focusCard(c.id));
  });

  // จัดหมุดให้ปลายแหลมชี้ลงตรงพิกัดพอดี
  $$('.leaflet-marker-icon.pin').forEach((el) => {
    el.style.marginLeft = `-${el.offsetWidth / 2}px`;
    el.style.marginTop = `-${el.offsetHeight}px`;
  });
}

// กดหมุด → เลื่อนไปที่การ์ดของคนนั้น แล้วกระพริบให้รู้ว่าใบไหน
function focusCard(id) {
  const card = $(`[data-cgcard="${id}"]`, view);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.remove('flash');
  void card.offsetWidth;   // บังคับให้เบราว์เซอร์เริ่ม animation ใหม่ ถ้ากดหมุดเดิมซ้ำ
  card.classList.add('flash');
  markPin(id);
}

// กด "ดูบนแผนที่" บนการ์ด → เลื่อนแผนที่ไปหาเขา
function showOnMap(id) {
  const c = browseItems.find((x) => String(x.id) === String(id));
  if (!c) return;
  if (c.lat == null) return toast('แคร์กิฟเวอร์คนนี้ยังไม่ได้ปักหมุดย่านที่รับงาน');

  markPin(id);
  browsePicker.map.setView([c.lat, c.lng], 15);
  $('#pinCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  toast(`${c.full_name} รับงานแถว ${c.area_label || 'ตรงหมุดนี้'}${c.distance_km != null ? ` · ห่างจากหมุดคุณ ${c.distance_km.toFixed(1)} กม.` : ''}`, 4000);
}

// ทำหมุดของคนที่กำลังดูให้เด่นกว่าหมุดอื่น
function markPin(id) {
  $$('[data-cgpin]').forEach((el) => el.classList.toggle('sel', el.dataset.cgpin === String(id)));
}

function cgCard(c) {
  return `
    <div class="job" data-cgcard="${c.id}">
      <div style="display:flex;gap:12px;align-items:center">
        ${avatar(c, { cls: 'avatar-lg' })}
        <div style="flex:1;min-width:0">
          <h3>${esc(c.full_name)}</h3>
          <div class="hint" style="margin:2px 0 0">
            📍 ${esc(c.area_label || 'ไม่ระบุย่าน')} · ประสบการณ์ ${c.experience_years} ปี
          </div>
        </div>
        ${c.rate ? `<div class="price">${fmtBaht(c.rate)}<small>${RATE_UNIT_TH[c.rate_unit]}</small></div>` : ''}
      </div>

      <div class="meta">
        ${c.distance_km != null ? `<span class="chip chip-near">📏 ห่าง ${c.distance_km.toFixed(1)} กม.</span>` : ''}
        <span class="chip">🚗 รับงานในรัศมี ${c.service_radius_km} กม.</span>
        ${c.skills ? c.skills.split(',').map((s) => `<span class="chip">${esc(s.trim())}</span>`).join('') : ''}
      </div>
      ${c.bio ? `<p style="margin-top:10px;font-size:14px;color:var(--muted)">${esc(c.bio)}</p>` : ''}

      <div class="job-actions">
        ${c.lat != null ? `<button class="btn btn-sm btn-ghost" data-locate-cg="${c.id}">📍 ดูบนแผนที่</button>` : ''}
        <a class="btn btn-sm btn-ghost" href="/caregiver-card.html?id=${c.id}" style="text-align:center;text-decoration:none">ดูบัตร</a>
        <button class="btn btn-sm" data-hire="${c.id}">ส่งคำขอจ้าง</button>
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
  postPicker = null;
  pickArea = '';

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
        ${pickerBox()}
      </div>

      <button class="btn btn-block">โพสงาน</button>
    </form>`;

  postPicker = createPicker({
    onMove: ({ lat, lng, area, loading }) => {
      pickArea = area;
      $('#pickInfo').textContent = loading
        ? `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)} — กำลังอ่านชื่อย่าน…`
        : `📍 ${area || 'ตำแหน่งนี้'} · ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    },
  });

  const findAddr = () => postPicker.search($('#addrInput').value.trim(), $('#addrFind'));
  $('#addrFind').onclick = findAddr;
  // ในฟอร์ม ปุ่ม Enter จะไปกดส่งฟอร์ม — ดักไว้ให้กลายเป็นค้นหาที่อยู่แทน
  $('#addrInput').onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    findAddr();
  };

  $('#jobForm').onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const c = postPicker.center();
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
