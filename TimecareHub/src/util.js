// ตัวช่วยเล็ก ๆ ที่ใช้ข้ามหลาย route

// เก็บวันเกิด ไม่เก็บอายุ — อายุคำนวณสดทุกครั้ง ไม่งั้นวันเกิดผ่านไปแล้วตัวเลขค้าง
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

// DECIMAL จาก mysql2 กลับมาเป็นสตริง ("13.8161000") — ปล่อยไปถึงหน้าเว็บแล้ว
// Leaflet ปักหมุดไม่ขึ้น และ .toFixed() พัง เพราะสตริงไม่มีเมธอดนั้น
const num = (v) => (v == null ? null : Number(v));

// เวลาจาก <input type="time"> มาเป็น "HH:MM" (บางเบราว์เซอร์แถมวินาทีมาเป็น "HH:MM:SS")
// ไม่ตรงรูปแบบ = ถือว่าไม่ได้กรอก คืน null
// ปล่อยค่าเพี้ยนลงคอลัมน์ TIME แล้ว MySQL จะเก็บ 00:00:00 ให้ ซึ่งอ่านทีหลังแยกไม่ออกเลย
// ว่า "เข้างานเที่ยงคืน" หรือ "ไม่ได้กรอกเวลา"
function readTime(v) {
  if (v == null) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(String(v).trim());
  return m ? `${m[1]}:${m[2]}:00` : null;
}

module.exports = { ageFrom, num, readTime };
