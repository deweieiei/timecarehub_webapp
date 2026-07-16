const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { setAuthCookie, clearAuthCookie, requireAuth } = require('../auth');

const router = express.Router();

// สมัครสมาชิก
router.post('/register', async (req, res) => {
  const { email, password, full_name, phone } = req.body;

  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'กรุณากรอก อีเมล รหัสผ่าน และชื่อ-นามสกุล' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const [r] = await db.query(
      'INSERT INTO users (email, password_hash, full_name, phone) VALUES (?,?,?,?)',
      [email.trim().toLowerCase(), hash, full_name.trim(), phone || null]
    );
    // สร้างโปรไฟล์แคร์กิฟเวอร์รอไว้เลย (kyc_status = none) เพราะทุกคนสลับบทบาทได้
    await db.query('INSERT INTO caregiver_profiles (user_id) VALUES (?)', [r.insertId]);

    const user = { id: r.insertId, email, is_admin: 0 };
    setAuthCookie(res, user);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'อีเมลนี้ถูกใช้สมัครแล้ว' });
    }
    console.error(e);
    res.status(500).json({ error: 'สมัครสมาชิกไม่สำเร็จ' });
  }
});

// เข้าสู่ระบบ
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' });

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [
      String(email).trim().toLowerCase(),
    ]);
    const user = rows[0];
    // ข้อความเดียวกันทั้งกรณีไม่มีอีเมลและรหัสผิด — ไม่บอกใบ้ว่าอีเมลไหนมีในระบบ
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }
    setAuthCookie(res, user);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'เข้าสู่ระบบไม่สำเร็จ' });
  }
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// ข้อมูลผู้ใช้ปัจจุบัน (หน้าเว็บเรียกตอนโหลด)
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// สลับบทบาท employer <-> caregiver
router.post('/role', requireAuth, async (req, res) => {
  const { role } = req.body;
  if (!['employer', 'caregiver'].includes(role)) {
    return res.status(400).json({ error: 'บทบาทไม่ถูกต้อง' });
  }
  await db.query('UPDATE users SET active_role = ? WHERE id = ?', [role, req.user.id]);
  res.json({ ok: true, role });
});

module.exports = router;
