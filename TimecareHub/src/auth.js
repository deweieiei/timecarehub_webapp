const jwt = require('jsonwebtoken');
const db = require('./db');

const COOKIE = 'tch_token';

function sign(user) {
  return jwt.sign(
    { id: user.id, email: user.email, is_admin: !!user.is_admin },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function setAuthCookie(res, user) {
  res.cookie(COOKIE, sign(user), {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE);
}

// ต้องล็อกอิน — โหลด user สดจาก DB ทุกครั้ง (สถานะ KYC/role เปลี่ยนได้ตลอด)
async function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await db.query(
      `SELECT u.id, u.email, u.full_name, u.phone, u.active_role, u.is_admin,
              c.kyc_status, c.rating_avg, c.rating_count
         FROM users u
         LEFT JOIN caregiver_profiles c ON c.user_id = u.id
        WHERE u.id = ?`,
      [payload.id]
    );
    if (!rows.length) return res.status(401).json({ error: 'ไม่พบบัญชีผู้ใช้' });
    req.user = rows[0];
    next();
  } catch {
    return res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'เฉพาะแอดมินเท่านั้น' });
  next();
}

// แคร์กิฟเวอร์ที่ผ่าน KYC + แอดมินอนุมัติแล้วเท่านั้น ถึงจะกดขอรับงานได้
function requireApprovedCaregiver(req, res, next) {
  if (req.user.kyc_status !== 'approved') {
    return res.status(403).json({
      error: 'ต้องยืนยันตัวตน (KYC) และผ่านการอนุมัติจากแอดมินก่อน จึงจะรับงานได้',
      kyc_status: req.user.kyc_status || 'none',
    });
  }
  next();
}

module.exports = { setAuthCookie, clearAuthCookie, requireAuth, requireAdmin, requireApprovedCaregiver };
