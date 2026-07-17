-- ============================================================
--  รอบที่ 7 — เพิ่ม "ยกเลิกงาน" พร้อมเก็บเหตุผลลงประวัติ
--
--  กติกา (ตกลงกับพี่ดิว):
--    • ยกเลิก "ก่อนจับคู่" (open/offered) = ถอนทิ้งเลย ไม่เก็บประวัติ → ลบแถวทิ้ง
--    • ยกเลิก "หลังจับคู่" (matched)      = ต้องมีเหตุผล เก็บเป็น cancelled ไว้ในประวัติ
--
--  status = 'cancelled' มีอยู่ใน ENUM แล้วตั้งแต่รอบ 2 — รอบนี้แค่เพิ่มที่เก็บเหตุผล
--  รันซ้ำได้ — migrate.js ข้าม error "คอลัมน์มีอยู่แล้ว" ให้เอง
-- ============================================================

ALTER TABLE jobs ADD COLUMN cancel_reason VARCHAR(500) NULL AFTER assigned_caregiver_id;
ALTER TABLE jobs ADD COLUMN cancelled_by  INT NULL AFTER cancel_reason;
