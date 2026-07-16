const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// ============================================================
//  โปรไฟล์บัญชีผู้ใช้ — ข้อมูล "ของคน" ใช้ร่วมกันทั้ง 2 บทบาท
//  (คนละอันกับ "บัตรประชาชนแคร์กิฟเวอร์" ที่ /api/kyc ซึ่งเป็นข้อมูลฝั่งรับงาน)
//
//  ⚠️ ไฟล์นี้เป็นที่เดียวที่ได้รับอนุญาตให้ส่ง national_id ออกไป
//     และส่งให้ "เจ้าของบัญชีเท่านั้น" — route อื่นห้าม SELECT u.* เด็ดขาด
// ============================================================

// คอลัมน์ที่ผู้ใช้แก้เองได้ — เป็น allowlist ไม่ใช่ blocklist
// ห้ามมี: id, email, password_hash, is_admin, active_role, created_at
const EDITABLE = [
  'full_name', 'title_prefix', 'nickname', 'birth_date', 'gender',
  'nationality', 'religion', 'marital_status', 'blood_type',
  'national_id', 'national_id_issue_date', 'national_id_expiry_date',
  'phone', 'phone_alt', 'line_id',
  'addr_line', 'addr_subdistrict', 'addr_district', 'addr_province', 'addr_postcode',
  'cur_same_as_addr',
  'cur_addr_line', 'cur_addr_subdistrict', 'cur_addr_district', 'cur_addr_province', 'cur_addr_postcode',
  'emergency_name', 'emergency_relation', 'emergency_phone',
  'occupation', 'education', 'about_me',
];

// คอลัมน์ที่ส่งกลับให้เจ้าของบัญชี = ที่แก้ได้ + ที่อ่านอย่างเดียว
const READABLE = [...EDITABLE, 'id', 'email', 'is_admin', 'active_role', 'created_at', 'profile_updated_at'];

const ENUMS = {
  gender: ['male', 'female', 'other', 'undisclosed'],
  marital_status: ['single', 'married', 'divorced', 'widowed'],
  blood_type: ['A', 'B', 'AB', 'O'],
};

const DATE_FIELDS = ['birth_date', 'national_id_issue_date', 'national_id_expiry_date'];

// เลขบัตรประชาชนไทยมีหลักตรวจสอบ (หลักที่ 13) — พิมพ์ผิดจับได้ทันทีโดยไม่ต้องต่อ API ใคร
function validThaiId(id) {
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

function ageFrom(birthDate) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

// DATE จาก MySQL กลับมาเป็น Date object — <input type="date"> ต้องการ YYYY-MM-DD
const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// ---------- อ่านโปรไฟล์ตัวเอง ----------
router.get('/me', requireAuth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT ${READABLE.join(', ')} FROM users WHERE id = ?`,
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'ไม่พบบัญชีผู้ใช้' });

  const p = rows[0];
  for (const f of DATE_FIELDS) p[f] = toDateInput(p[f]);

  res.json({ profile: { ...p, age: ageFrom(p.birth_date) } });
});

// ---------- บันทึกโปรไฟล์ตัวเอง ----------
router.put('/me', requireAuth, async (req, res) => {
  const set = [];
  const params = [];

  for (const field of EDITABLE) {
    if (!(field in req.body)) continue;   // ส่งมาแค่ช่องไหน อัปเดตแค่ช่องนั้น

    let v = req.body[field];
    if (typeof v === 'string') v = v.trim();
    if (v === '' || v === undefined) v = null;   // ช่องว่าง = ล้างค่า ไม่ใช่เก็บสตริงว่าง

    // --- ตรวจค่าตามชนิดของช่อง ---
    if (v !== null && ENUMS[field] && !ENUMS[field].includes(v)) {
      return res.status(400).json({ error: `ค่าของ ${field} ไม่ถูกต้อง` });
    }

    if (field === 'full_name' && !v) {
      return res.status(400).json({ error: 'ชื่อ-นามสกุลว่างไม่ได้' });
    }

    if (field === 'national_id' && v !== null) {
      v = String(v).replace(/\D/g, '');   // ผู้ใช้พิมพ์ขีดคั่นมาก็รับได้
      if (!validThaiId(v)) {
        return res.status(400).json({ error: 'เลขบัตรประชาชนไม่ถูกต้อง — ต้องเป็นตัวเลข 13 หลักและผ่านการตรวจหลักสุดท้าย' });
      }
    }

    if (field === 'birth_date' && v !== null) {
      const age = ageFrom(v);
      if (age === null) return res.status(400).json({ error: 'วันเกิดไม่ถูกต้อง' });
      if (age < 15) return res.status(400).json({ error: 'ผู้ใช้ต้องมีอายุอย่างน้อย 15 ปี' });
    }

    if (field === 'cur_same_as_addr') v = v ? 1 : 0;

    set.push(`${field} = ?`);   // ชื่อคอลัมน์มาจาก EDITABLE เท่านั้น ไม่ได้มาจาก input
    params.push(v);
  }

  if (!set.length) return res.status(400).json({ error: 'ไม่มีข้อมูลที่จะบันทึก' });

  set.push('profile_updated_at = NOW()');
  params.push(req.user.id);

  try {
    await db.query(`UPDATE users SET ${set.join(', ')} WHERE id = ?`, params);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'เลขบัตรประชาชนนี้ถูกใช้กับอีกบัญชีแล้ว' });
    }
    throw e;
  }

  res.json({ ok: true });
});

module.exports = router;
