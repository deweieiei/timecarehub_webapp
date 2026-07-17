const path = require('path');

// ============================================================
//  รูปโปรไฟล์ — ที่เก็บไฟล์ + วิธีทำ URL
//
//  รูปอยู่นอก public/ โดยตั้งใจ (กติกาเดียวกับรูปในแชท ดู src/routes/chat.js)
//  เข้า URL ตรงไม่ได้ ต้องผ่าน GET /api/profile/photo/:userId ที่เช็คล็อกอินก่อน
// ============================================================

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const AVATAR_DIR = path.join(UPLOAD_ROOT, 'avatars');

// URL ของรูปคงที่ (/photo/:id) แต่ตัวรูปเปลี่ยนได้ → ถ้าไม่มีอะไรบอกความต่าง
// เบราว์เซอร์จะโชว์รูปเก่าค้างหลังเปลี่ยนรูป ติด ?v= จากชื่อไฟล์ (uuid สุ่มใหม่ทุกครั้งที่อัป)
// แล้วรูปใหม่ = URL ใหม่ → เห็นผลทันที และ cache ยาว ๆ ได้ด้วย
function photoUrl(userId, photoPath) {
  if (!photoPath) return null;
  return `/api/profile/photo/${userId}?v=${path.basename(photoPath).slice(0, 8)}`;
}

module.exports = { UPLOAD_ROOT, AVATAR_DIR, photoUrl };
