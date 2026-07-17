// หน้า "บัตรแคร์กิฟเวอร์" — ผู้ว่าจ้างกดเข้ามาจากหน้า "หาคนดูแล" เพื่อดูประวัติเต็มก่อนตัดสินใจจ้าง
// เข้าด้วย /caregiver-card.html?id=<userId>
//
// ไม่มีแถบเมนูล่าง (buildFrame role:null) — เป็นหน้าย่อยที่กดเข้ามาแล้วกดกลับ

const RATE_UNIT_TH = { per_hour: 'บาท/ชม.', per_day: 'บาท/วัน', per_month: 'บาท/เดือน' };
const GENDER_TH = { male: 'ชาย', female: 'หญิง', other: 'อื่น ๆ', undisclosed: 'ไม่ระบุ' };

async function viewCard() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { view.innerHTML = emptyBox('ไม่พบบัตรที่ต้องการ'); return; }

  let c;
  try {
    ({ caregiver: c } = await api(`/api/caregivers/${id}`));
  } catch (e) {
    view.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="history.back()" style="margin-bottom:14px">← กลับ</button>
      ${emptyBox(esc(e.message))}`;
    return;
  }

  const hasPin = c.lat != null && c.lng != null;
  const row = (k, v) => (v ? `<div class="sheet-row"><div class="k">${k}</div><div class="v">${v}</div></div>` : '');
  const reviewed = c.kyc_reviewed_at
    ? new Date(c.kyc_reviewed_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  view.innerHTML = `
    <button class="btn btn-ghost btn-sm" id="back" style="margin-bottom:14px">← กลับไปหาคนดูแล</button>

    <div class="card cg-hero">
      ${avatar(c, { cls: 'avatar-xl' })}
      <div style="flex:1;min-width:0">
        <h2 style="margin:0">${esc(c.full_name)}</h2>
        <div class="hint" style="margin:4px 0 0">
          📍 ${esc(c.area_label || 'ไม่ระบุย่าน')} · ประสบการณ์ ${c.experience_years} ปี
          ${c.age != null ? ` · อายุ ${c.age} ปี` : ''}
        </div>
        <div style="margin-top:8px">
          <span class="badge badge-approved">✓ ยืนยันตัวตนแล้ว</span>
          ${c.rating_count ? `<span class="stars" style="margin-left:6px">${stars(c.rating_avg)}</span>
            <span class="hint" style="display:inline">(${c.rating_count})</span>` : ''}
        </div>
      </div>
      ${c.rate ? `<div class="price" style="font-size:22px">${fmtBaht(c.rate)}<small>${RATE_UNIT_TH[c.rate_unit]}</small></div>` : ''}
    </div>

    ${c.skills ? `<div class="card">
      <h3 class="card-title">ทักษะ</h3>
      <div class="meta" style="margin:0">${c.skills.split(',').map((s) => `<span class="chip">${esc(s.trim())}</span>`).join('')}</div>
    </div>` : ''}

    ${c.bio ? `<div class="card">
      <h3 class="card-title">แนะนำตัว</h3>
      <p style="font-size:15px;white-space:pre-wrap">${esc(c.bio)}</p>
    </div>` : ''}

    <div class="card">
      <h3 class="card-title">ข้อมูลยืนยันตัวตน</h3>
      <div class="alert alert-info" style="margin-bottom:14px">
        🔒 เลขบัตรถูกปิดบางส่วนเพื่อความปลอดภัย — เห็นแค่พอเทียบกับบัตรตัวจริงตอนเจอหน้า
      </div>
      ${row('เลขบัตรประชาชน', c.national_id_masked ? `<code style="font-size:15px;letter-spacing:1px">${esc(c.national_id_masked)}</code>` : '<span style="color:var(--muted)">ยังไม่ได้กรอกในโปรไฟล์</span>')}
      ${row('เพศ', c.gender ? GENDER_TH[c.gender] : '')}
      ${row('สัญชาติ', esc(c.nationality || ''))}
      ${row('ยืนยันตัวตนเมื่อ', reviewed)}
    </div>

    <div class="card">
      <h3 class="card-title">ย่านที่รับงาน</h3>
      ${hasPin
        ? `<p class="hint" style="margin:-6px 0 10px">🚗 รับงานในรัศมี ${c.service_radius_km} กม. จากหมุดนี้</p>
           <div class="map-wrap"><div id="cardMap"></div></div>`
        : `<p class="hint" style="margin:0">ยังไม่ได้ปักหมุดย่านที่รับงาน</p>`}
    </div>

    <button class="btn btn-block" id="hireBtn" style="margin-top:6px">ส่งคำขอจ้าง ${esc(c.full_name)}</button>
    <p class="hint" style="text-align:center;margin-top:10px">เขาจะกดรับหรือปฏิเสธ — ต่อรองรายละเอียดกันต่อในแชทได้</p>`;

  $('#back').onclick = () => history.back();

  // ส่งคำขอจ้าง = พาไปหน้าผู้ว่าจ้าง แล้วเปิดแผ่นจ้างของคนนี้ให้เลย
  // (ฟอร์มจ้างอยู่ใน employer.js — หน้านี้ไม่โหลดไฟล์นั้น เลยส่งผ่าน query ให้หน้าโน้นเปิดเอง)
  $('#hireBtn').onclick = () => { location.href = `/employer.html?hire=${c.id}`; };

  if (hasPin) {
    const map = L.map('cardMap', { scrollWheelZoom: false }).setView([c.lat, c.lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);

    // สีเขียนตรง ๆ ไม่ใช้ var(): Leaflet ยัดค่าลง attribute ของ SVG ซึ่ง var() ใช้ไม่ได้
    L.circle([c.lat, c.lng], {
      radius: c.service_radius_km * 1000,
      color: '#0e7c86', weight: 1.5, dashArray: '6 6', fillColor: '#0e7c86', fillOpacity: .06, interactive: false,
    }).addTo(map);
    L.marker([c.lat, c.lng], {
      icon: L.divIcon({
        className: 'pin',
        html: `<div class="pin-body"><div class="pin-label">${esc(c.area_label || c.full_name)}</div><div class="pin-tip"></div></div>`,
        iconSize: [null, null], iconAnchor: [0, 0],
      }),
    }).addTo(map);
    $$('.leaflet-marker-icon.pin').forEach((el) => {
      el.style.marginLeft = `-${el.offsetWidth / 2}px`;
      el.style.marginTop = `-${el.offsetHeight}px`;
    });
  }
}

(async function () {
  await buildFrame({ role: 'employer' });   // หน้านี้ฝั่งผู้ว่าจ้างใช้ — สลับบทบาทให้ด้วยกันเผลอค้าง
  viewCard();
})();
