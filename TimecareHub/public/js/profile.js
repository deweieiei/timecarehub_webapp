// โปรไฟล์บัญชีผู้ใช้ — ใช้ร่วมกันทั้ง 2 บทบาท (จ้างคน / รับงาน)
// คนละอันกับ "บัตรประชาชนแคร์กิฟเวอร์" (แท็บ kyc) ที่เป็นข้อมูลฝั่งรับงานล้วน ๆ

const GENDER_TH = { male: 'ชาย', female: 'หญิง', other: 'อื่น ๆ', undisclosed: 'ไม่ระบุ' };
const MARITAL_TH = { single: 'โสด', married: 'สมรส', divorced: 'หย่า', widowed: 'หม้าย' };

// ช่องที่นับว่า "กรอกครบ" — เอาไว้โชว์ % ความสมบูรณ์ ให้ผู้ใช้อยากกรอกต่อ
const SCORED = [
  'full_name', 'birth_date', 'gender', 'national_id', 'phone',
  'addr_line', 'addr_subdistrict', 'addr_district', 'addr_province', 'addr_postcode',
  'emergency_name', 'emergency_phone',
];

const opt = (val, label, cur) => `<option value="${val}" ${cur === val ? 'selected' : ''}>${label}</option>`;
const optsOf = (map, cur) => Object.entries(map).map(([v, l]) => opt(v, l, cur)).join('');

async function viewProfile() {
  const { profile: p } = await api('/api/profile/me');

  const filled = SCORED.filter((f) => p[f] !== null && p[f] !== '').length;
  const pct = Math.round((filled / SCORED.length) * 100);

  view.innerHTML = `
    <h2>โปรไฟล์ของฉัน</h2>
    <p class="sub">ข้อมูลชุดนี้ใช้ร่วมกันทั้งตอนจ้างคน และตอนรับงาน</p>

    <div class="card" style="background:var(--teal-light);box-shadow:none">
      <div style="display:flex;align-items:center;gap:14px">
        <span class="avatar" style="width:54px;height:54px;font-size:21px;background:linear-gradient(135deg,var(--teal),var(--teal-dark))">
          ${esc(initial(p.full_name))}
        </span>
        <div style="flex:1;min-width:0">
          <strong style="font-size:17px">${esc(p.full_name)}</strong>
          <div class="hint" style="margin:2px 0 0">${esc(p.email)}${p.age != null ? ` · อายุ ${p.age} ปี` : ''}</div>
        </div>
      </div>
      <div style="margin-top:14px">
        <div class="hint" style="margin:0 0 6px;display:flex;justify-content:space-between">
          <span>กรอกข้อมูลแล้ว ${filled}/${SCORED.length} ช่องหลัก</span><strong>${pct}%</strong>
        </div>
        <div class="bar"><span style="width:${pct}%"></span></div>
      </div>
    </div>

    <form id="profileForm">
      <!-- ---------- ข้อมูลส่วนตัว ---------- -->
      <div class="card">
        <h3 class="card-title">ข้อมูลส่วนตัว</h3>
        <div class="row">
          <div class="field" style="flex:.6">
            <label>คำนำหน้า</label>
            <input name="title_prefix" value="${esc(p.title_prefix || '')}" placeholder="นาย / นาง / นางสาว" list="prefixes">
            <datalist id="prefixes">
              <option value="นาย"><option value="นาง"><option value="นางสาว"><option value="ดร."><option value="พญ."><option value="นพ.">
            </datalist>
          </div>
          <div class="field" style="flex:1.4">
            <label>ชื่อ-นามสกุล *</label>
            <input name="full_name" required value="${esc(p.full_name || '')}">
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>ชื่อเล่น</label>
            <input name="nickname" value="${esc(p.nickname || '')}" placeholder="ดิว">
          </div>
          <div class="field">
            <label>วันเกิด</label>
            <input type="date" name="birth_date" id="birthDate" value="${p.birth_date || ''}" max="${new Date().toISOString().slice(0, 10)}">
            <p class="hint" id="ageHint">${p.age != null ? `อายุ ${p.age} ปี` : 'ระบบคำนวณอายุให้เอง'}</p>
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>เพศ</label>
            <select name="gender"><option value="">— ไม่ระบุ —</option>${optsOf(GENDER_TH, p.gender)}</select>
          </div>
          <div class="field">
            <label>สถานภาพ</label>
            <select name="marital_status"><option value="">— ไม่ระบุ —</option>${optsOf(MARITAL_TH, p.marital_status)}</select>
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>สัญชาติ</label>
            <input name="nationality" value="${esc(p.nationality || '')}" placeholder="ไทย">
          </div>
          <div class="field">
            <label>ศาสนา</label>
            <input name="religion" value="${esc(p.religion || '')}" placeholder="พุทธ">
          </div>
          <div class="field" style="flex:.7">
            <label>กรุ๊ปเลือด</label>
            <select name="blood_type">
              <option value="">—</option>
              ${['A', 'B', 'AB', 'O'].map((b) => opt(b, b, p.blood_type)).join('')}
            </select>
          </div>
        </div>
        <div class="field" style="margin:0">
          <label>เกี่ยวกับฉัน</label>
          <textarea name="about_me" rows="2" placeholder="เล่าสั้น ๆ ว่าคุณเป็นใคร">${esc(p.about_me || '')}</textarea>
        </div>
      </div>

      <!-- ---------- บัตรประชาชน ---------- -->
      <div class="card">
        <h3 class="card-title">บัตรประชาชน</h3>
        <div class="alert alert-info" style="margin-bottom:14px">
          🔒 <strong>ข้อมูลนี้ไม่เปิดให้ผู้ใช้คนอื่นเห็น</strong> — มีแต่คุณกับระบบเท่านั้นที่เข้าถึงได้
        </div>
        <div class="field">
          <label>เลขบัตรประชาชน (13 หลัก)</label>
          <input name="national_id" id="nid" inputmode="numeric" maxlength="17"
                 value="${esc(p.national_id || '')}" placeholder="1 2345 67890 12 3">
          <p class="hint" id="nidHint">ระบบตรวจหลักสุดท้ายให้ พิมพ์ผิดจะเตือนทันที</p>
        </div>
        <div class="row" style="margin:0">
          <div class="field" style="margin:0">
            <label>วันออกบัตร</label>
            <input type="date" name="national_id_issue_date" value="${p.national_id_issue_date || ''}">
          </div>
          <div class="field" style="margin:0">
            <label>วันบัตรหมดอายุ</label>
            <input type="date" name="national_id_expiry_date" value="${p.national_id_expiry_date || ''}">
          </div>
        </div>
      </div>

      <!-- ---------- ติดต่อ ---------- -->
      <div class="card">
        <h3 class="card-title">ช่องทางติดต่อ</h3>
        <div class="field">
          <label>อีเมล</label>
          <input value="${esc(p.email || '')}" disabled>
          <p class="hint">อีเมลใช้เข้าสู่ระบบ — เปลี่ยนเองไม่ได้</p>
        </div>
        <div class="row">
          <div class="field">
            <label>เบอร์โทร</label>
            <input name="phone" type="tel" inputmode="tel" value="${esc(p.phone || '')}" placeholder="08x-xxx-xxxx">
          </div>
          <div class="field">
            <label>เบอร์สำรอง</label>
            <input name="phone_alt" type="tel" inputmode="tel" value="${esc(p.phone_alt || '')}">
          </div>
        </div>
        <div class="field" style="margin:0">
          <label>LINE ID</label>
          <input name="line_id" value="${esc(p.line_id || '')}">
        </div>
      </div>

      <!-- ---------- ที่อยู่ตามบัตร ---------- -->
      <div class="card">
        <h3 class="card-title">ที่อยู่ตามบัตรประชาชน</h3>
        <div class="field">
          <label>บ้านเลขที่ / หมู่ / ซอย / ถนน</label>
          <input name="addr_line" value="${esc(p.addr_line || '')}" placeholder="123/45 ซอยลาดพร้าว 15">
        </div>
        <div class="row">
          <div class="field"><label>ตำบล / แขวง</label><input name="addr_subdistrict" value="${esc(p.addr_subdistrict || '')}"></div>
          <div class="field"><label>อำเภอ / เขต</label><input name="addr_district" value="${esc(p.addr_district || '')}"></div>
        </div>
        <div class="row" style="margin:0">
          <div class="field" style="margin:0"><label>จังหวัด</label><input name="addr_province" value="${esc(p.addr_province || '')}"></div>
          <div class="field" style="margin:0;flex:.6"><label>รหัสไปรษณีย์</label><input name="addr_postcode" inputmode="numeric" maxlength="5" value="${esc(p.addr_postcode || '')}"></div>
        </div>
      </div>

      <!-- ---------- ที่อยู่ปัจจุบัน ---------- -->
      <div class="card">
        <h3 class="card-title">ที่อยู่ปัจจุบัน</h3>
        <label class="check">
          <input type="checkbox" id="curSame" ${p.cur_same_as_addr ? 'checked' : ''}>
          <span>เหมือนที่อยู่ตามบัตรประชาชน</span>
        </label>
        <div id="curAddr" class="${p.cur_same_as_addr ? 'hide' : ''}" style="margin-top:14px">
          <div class="field">
            <label>บ้านเลขที่ / หมู่ / ซอย / ถนน</label>
            <input name="cur_addr_line" value="${esc(p.cur_addr_line || '')}">
          </div>
          <div class="row">
            <div class="field"><label>ตำบล / แขวง</label><input name="cur_addr_subdistrict" value="${esc(p.cur_addr_subdistrict || '')}"></div>
            <div class="field"><label>อำเภอ / เขต</label><input name="cur_addr_district" value="${esc(p.cur_addr_district || '')}"></div>
          </div>
          <div class="row" style="margin:0">
            <div class="field" style="margin:0"><label>จังหวัด</label><input name="cur_addr_province" value="${esc(p.cur_addr_province || '')}"></div>
            <div class="field" style="margin:0;flex:.6"><label>รหัสไปรษณีย์</label><input name="cur_addr_postcode" inputmode="numeric" maxlength="5" value="${esc(p.cur_addr_postcode || '')}"></div>
          </div>
        </div>
      </div>

      <!-- ---------- ผู้ติดต่อฉุกเฉิน ---------- -->
      <div class="card">
        <h3 class="card-title">ผู้ติดต่อฉุกเฉิน</h3>
        <p class="hint" style="margin:0 0 14px">
          งานดูแลผู้สูงอายุมีคนแปลกหน้าเข้าบ้าน — ทั้ง 2 ฝั่งควรมีคนที่ติดต่อได้เวลาเกิดเรื่อง
        </p>
        <div class="row">
          <div class="field"><label>ชื่อ-นามสกุล</label><input name="emergency_name" value="${esc(p.emergency_name || '')}"></div>
          <div class="field" style="flex:.7"><label>ความสัมพันธ์</label><input name="emergency_relation" value="${esc(p.emergency_relation || '')}" placeholder="พี่สาว"></div>
        </div>
        <div class="field" style="margin:0">
          <label>เบอร์โทร</label>
          <input name="emergency_phone" type="tel" inputmode="tel" value="${esc(p.emergency_phone || '')}">
        </div>
      </div>

      <!-- ---------- อื่น ๆ ---------- -->
      <div class="card">
        <h3 class="card-title">อื่น ๆ</h3>
        <div class="row" style="margin:0">
          <div class="field" style="margin:0"><label>อาชีพ</label><input name="occupation" value="${esc(p.occupation || '')}"></div>
          <div class="field" style="margin:0"><label>การศึกษาสูงสุด</label><input name="education" value="${esc(p.education || '')}" placeholder="ปริญญาตรี"></div>
        </div>
      </div>

      <button class="btn btn-block" id="saveBtn">บันทึกโปรไฟล์</button>
      <p class="hint" style="text-align:center;margin-top:10px">
        ${p.profile_updated_at ? `แก้ไขล่าสุด ${fmtTime(p.profile_updated_at)}` : 'ยังไม่เคยบันทึกโปรไฟล์'}
      </p>
    </form>`;

  // --- อายุอัปเดตสดตอนเลือกวันเกิด ---
  $('#birthDate').oninput = (e) => {
    const a = calcAge(e.target.value);
    $('#ageHint').textContent = a == null ? 'ระบบคำนวณอายุให้เอง' : `อายุ ${a} ปี`;
  };

  // --- เช็คเลขบัตรสดขณะพิมพ์ ---
  $('#nid').oninput = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 13);
    const hint = $('#nidHint');
    if (!digits) {
      hint.textContent = 'ระบบตรวจหลักสุดท้ายให้ พิมพ์ผิดจะเตือนทันที';
      hint.style.color = '';
    } else if (digits.length < 13) {
      hint.textContent = `กรอกแล้ว ${digits.length}/13 หลัก`;
      hint.style.color = '';
    } else if (validThaiId(digits)) {
      hint.textContent = '✓ เลขบัตรถูกต้อง';
      hint.style.color = 'var(--green)';
    } else {
      hint.textContent = '✕ เลขบัตรไม่ถูกต้อง — ลองเช็คอีกครั้ง';
      hint.style.color = 'var(--red)';
    }
  };

  // --- ติ๊ก "เหมือนที่อยู่ตามบัตร" → ซ่อนฟอร์มที่อยู่ปัจจุบัน ---
  $('#curSame').onchange = (e) => $('#curAddr').classList.toggle('hide', e.target.checked);

  $('#profileForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#saveBtn');
    const data = Object.fromEntries(new FormData(e.target));
    data.cur_same_as_addr = $('#curSame').checked ? 1 : 0;   // checkbox ที่ไม่ติ๊กจะไม่โผล่ใน FormData

    btn.disabled = true;
    try {
      await api('/api/profile/me', { method: 'PUT', body: JSON.stringify(data) });
      toast('บันทึกโปรไฟล์แล้ว');
      viewProfile();
    } catch (err) {
      toast(err.message, 4500);
      btn.disabled = false;
    }
  };
}

// เลขบัตรประชาชนไทยมีหลักตรวจสอบ — เช็คฝั่งหน้าเว็บด้วยเพื่อบอกผู้ใช้ทันที
// (ฝั่ง server ตรวจซ้ำอีกที ห้ามเชื่อหน้าเว็บอย่างเดียว)
function validThaiId(id) {
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

function calcAge(d) {
  if (!d) return null;
  const b = new Date(d);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

(async function () {
  await buildFrame({ role: null });   // ไม่มีแถบเมนูล่าง — เข้าจากปุ่มบนหัวเว็บ
  viewProfile();
})();
