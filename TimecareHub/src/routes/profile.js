const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const db = require('../db');
const { requireAuth } = require('../auth');
const { UPLOAD_ROOT, AVATAR_DIR, photoUrl } = require('../photo');
const { ageFrom } = require('../util');

const router = express.Router();

// ============================================================
//  โปรไฟล์บัญชีผู้ใช้ — ข้อมูล "ของคน" ใช้ร่วมกันทั้ง 2 บทบาท
//  (คนละอันกับ "บัตรแคร์กิฟเวอร์" ที่ /api/kyc ซึ่งเป็นข้อมูลฝั่งรับงาน)
//
//  ⚠️ ไฟล์นี้เป็นที่เดียวที่ได้รับอนุญาตให้ส่ง national_id "ตัวเต็ม" ออกไป
//     และส่งให้ "เจ้าของบัญชีเท่านั้น" — route อื่นห้าม SELECT u.* เด็ดขาด
//
//     ข้อยกเว้นเดียว: /api/caregivers/:id ส่ง "เลขที่ปิดบังแล้ว" ของแคร์กิฟเวอร์
//     ที่ยืนยันตัวตนแล้ว ให้ผู้ว่าจ้างเห็น — ปิดบังในตัว SQL ตัวเต็มไม่เคยออกมาถึง Node
//     (ตกลงกับพี่ดิว 2026-07-17 · ดูกฎเต็มที่ db/003_user_profile.sql)
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
// photo_path อยู่ในนี้แต่ไม่อยู่ใน EDITABLE — เปลี่ยนได้ทางอัปโหลดเท่านั้น
// (ไม่งั้นผู้ใช้ยิง PUT ตั้ง path เป็นไฟล์อะไรก็ได้ในเครื่อง server)
const READABLE = [...EDITABLE, 'id', 'email', 'is_admin', 'active_role', 'created_at', 'profile_updated_at', 'photo_path'];

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

// DATE จาก MySQL กลับมาเป็น Date object — <input type="date"> ต้องการ YYYY-MM-DD
const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// ---------- อ่านโปรไฟล์ตัวเอง ----------
router.get('/me', requireAuth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT ${READABLE.join(', ')} FROM users WHERE id = ?`,
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'ไม่พบบัญชีผู้ใช้' });

  const { photo_path, ...p } = rows[0];
  for (const f of DATE_FIELDS) p[f] = toDateInput(p[f]);

  // ส่ง URL ออกไป ไม่ใช่ path ในดิสก์ — ผังโฟลเดอร์ของ server ไม่ใช่เรื่องที่หน้าเว็บต้องรู้
  res.json({ profile: { ...p, age: ageFrom(p.birth_date), photo_url: photoUrl(p.id, photo_path) } });
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

// ============================================================
//  รูปโปรไฟล์
//  รูปคือสิ่งแรกที่ผู้ว่าจ้างดูตอนเลือกคนเข้าบ้าน — ตัวอักษรย่อในวงกลมบอกอะไรไม่ได้เลย
// ============================================================

const EXT_OF = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => fs.mkdir(AVATAR_DIR, { recursive: true }, (err) => cb(err, AVATAR_DIR)),
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + EXT_OF[file.mimetype]),
  }),
  // หน้าเว็บย่อรูปให้เหลือ ~512px ก่อนส่งอยู่แล้ว (ดู shrinkImage ใน public/js/frame.js)
  // ตัวเลขนี้เป็นตาข่ายกันคนยิงตรงมาที่ API — ต้องเท่ากับที่แชทใช้ ไม่งั้นข้อความ error ท้าย server.js โกหก
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (EXT_OF[file.mimetype]) return cb(null, true);
    // status: 400 → "คุณส่งของผิด" ไม่ใช่ "ระบบพัง" (ตัวจับ error ท้าย server.js อ่านค่านี้)
    cb(Object.assign(new Error('รองรับเฉพาะไฟล์รูป (JPG, PNG, WebP)'), { status: 400 }));
  },
});

// ---------- ดูรูปของใครก็ได้ที่ล็อกอินแล้ว ----------
// ทำไมไม่ปล่อยเป็นไฟล์ static: ผู้ว่าจ้างต้องเห็นรูปแคร์กิฟเวอร์ในไดเรกทอรีก็จริง
// แต่ "คนที่ล็อกอินแล้ว" กับ "ใครก็ได้ในอินเทอร์เน็ต" ไม่ใช่เรื่องเดียวกัน
// รูปหน้าคนทำงานดูแลผู้สูงอายุไม่ควรถูกกวาดไปทำอย่างอื่นได้ด้วยการเดา URL
router.get('/photo/:userId', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT photo_path FROM users WHERE id = ?', [req.params.userId]);
    const rel = rows[0]?.photo_path;
    if (!rel) return res.status(404).json({ error: 'ยังไม่มีรูปโปรไฟล์' });

    const file = path.resolve(UPLOAD_ROOT, rel);
    if (!file.startsWith(path.resolve(AVATAR_DIR))) return res.status(400).json({ error: 'path ไม่ถูกต้อง' });

    // เปลี่ยนรูป = ชื่อไฟล์ใหม่ = ?v= ใหม่ (ดู src/photo.js) → URL นี้แทนรูปเดิมตลอดกาล cache ยาวได้
    // private = ห้าม proxy/CDN เก็บไว้แจกคนที่ยังไม่ล็อกอิน
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.sendFile(file, (err) => {
      if (err) next(err);
    });
  } catch (e) {
    next(e);
  }
});

// ---------- อัปรูปของตัวเอง ----------
router.post('/me/photo', requireAuth, upload.single('photo'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'ยังไม่ได้เลือกรูป' });

  try {
    const rel = path.relative(UPLOAD_ROOT, req.file.path).split(path.sep).join('/');
    const [[old]] = await db.query('SELECT photo_path FROM users WHERE id = ?', [req.user.id]);

    await db.query('UPDATE users SET photo_path = ? WHERE id = ?', [rel, req.user.id]);

    // รูปเก่าไม่มีใครอ้างถึงแล้ว — ลบทิ้ง ไม่งั้น uploads/ บวมขึ้นทุกครั้งที่มีคนเปลี่ยนรูป
    if (old?.photo_path) fs.unlink(path.resolve(UPLOAD_ROOT, old.photo_path), () => {});

    res.json({ ok: true, photo_url: photoUrl(req.user.id, rel) });
  } catch (e) {
    // บันทึกลง DB ไม่ผ่าน = ไฟล์ที่เพิ่งเขียนไปกลายเป็นขยะ เก็บกวาดซะ
    fs.unlink(req.file.path, () => {});
    next(e);
  }
});

// ---------- ลบรูปของตัวเอง ----------
router.delete('/me/photo', requireAuth, async (req, res, next) => {
  try {
    const [[row]] = await db.query('SELECT photo_path FROM users WHERE id = ?', [req.user.id]);
    if (!row?.photo_path) return res.json({ ok: true });   // ไม่มีรูปอยู่แล้ว = สำเร็จตามที่ขอ

    await db.query('UPDATE users SET photo_path = NULL WHERE id = ?', [req.user.id]);
    fs.unlink(path.resolve(UPLOAD_ROOT, row.photo_path), () => {});
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
