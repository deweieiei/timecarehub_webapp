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

module.exports = { ageFrom, num };
