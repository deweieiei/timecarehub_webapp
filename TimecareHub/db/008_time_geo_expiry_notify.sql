-- ============================================================
--  รอบที่ 8 — เวลาทำงาน / พิกัดงานจ้างตรง / วันหมดอายุประกาศ / แจ้งเตือน
--
--  งานที่ 1 (ข้อ 3): จ้างงานมีแค่วันที่ → เพิ่ม "เวลาเข้า-เวลาออก"
--  งานที่ 2 (ข้อ 4): คำขอจ้างตรงมีแต่ที่อยู่เป็นตัวหนังสือ → เพิ่มปักหมุด GPS
--                    (คอลัมน์ lat/lng/area_label มีอยู่แล้วตั้งแต่รอบ 002 แค่ไม่เคยมีหน้าจอให้ปัก)
--  งานที่ 3 (ข้อ 8): คำขอที่ถูกปฏิเสธ ให้ผู้ว่าจ้างเห็น 24 ชม. แล้วซ่อน → ต้องรู้ว่า "ปฏิเสธเมื่อไหร่"
--  งานที่ 4 (ข้อ 9): ประกาศงานอยู่ได้ 14 วันแล้วหายไป
--  งานที่ 5 (ข้อ 6): งานเปลี่ยนแปลง/ถูกยกเลิก ต้องมีแจ้งเตือนเด้ง
--
--  รันซ้ำได้ — migrate.js ข้าม error "คอลัมน์/คีย์มีอยู่แล้ว" ให้เอง
-- ============================================================

-- ---------- เวลาทำงาน ----------
-- แยกจาก start_date/end_date เป็นคนละคอลัมน์ ไม่รวมเป็น DATETIME:
-- งานดูแลผู้สูงอายุส่วนใหญ่เป็น "ทุกวัน 08:00-17:00" — วันคือช่วงของสัญญา เวลาคือรอบของแต่ละวัน
-- ยัดรวมเป็น DATETIME เมื่อไหร่ จะตอบคำถาม "วันเสาร์เข้ากี่โมง" ไม่ได้เลย
ALTER TABLE jobs ADD COLUMN start_time TIME NULL AFTER start_date;
ALTER TABLE jobs ADD COLUMN end_time   TIME NULL AFTER end_date;

-- ---------- เวลาที่สถานะเปลี่ยนล่าสุด ----------
-- ใช้ตอบ "ถูกปฏิเสธมากี่ชั่วโมงแล้ว" (ข้อ 8) — created_at ตอบไม่ได้
-- เพราะคำขอที่ส่งไปเมื่อวาน แล้วเพิ่งโดนปฏิเสธเมื่อกี้ ต้องยังโชว์อยู่
ALTER TABLE jobs ADD COLUMN status_changed_at DATETIME NULL AFTER status;

-- ---------- วันหมดอายุของประกาศงาน ----------
-- เก็บเป็นคอลัมน์จริง ไม่คำนวณสดจาก created_at + 14 วัน:
-- วันไหนอยากต่ออายุให้งานใดงานหนึ่ง (หรือเปลี่ยนนโยบายเป็น 30 วัน) จะทำได้โดยไม่ต้องแก้โค้ด
-- และงานเก่าที่โพสไว้ก่อนหน้าจะไม่โดนกฎใหม่ย้อนหลังจนหายวับไปพร้อมกันทั้งกอง
ALTER TABLE jobs ADD COLUMN expires_at DATETIME NULL AFTER status_changed_at;

-- ค้นหางานยิงเงื่อนไข status + expires_at ทุกครั้ง
ALTER TABLE jobs ADD INDEX idx_open_alive (status, expires_at);

-- ---------- เติมค่าให้ข้อมูลเดิม ----------
-- WHERE ... IS NULL = รันซ้ำกี่รอบก็ได้ ของที่เติมไปแล้วไม่โดนเขียนทับ
UPDATE jobs SET status_changed_at = created_at WHERE status_changed_at IS NULL;
UPDATE jobs SET expires_at = created_at + INTERVAL 14 DAY
 WHERE expires_at IS NULL AND hire_type = 'open';

-- ============================================================
--  notifications : แจ้งเตือนในแอพ (ข้อ 6)
--
--  ไม่ใช่ push notification ของมือถือ — ตกลงกันตั้งแต่ประชุมแรกว่า MVP ไม่เอา
--  อันนี้คือกระดิ่งบนหัวเว็บ: เปิดเว็บอยู่แล้วเด้งสดผ่าน socket, ไม่ได้เปิดก็เห็นตอนกลับเข้ามา
--
--  job_id เป็น ON DELETE SET NULL ไม่ใช่ CASCADE โดยตั้งใจ —
--  "ผู้ว่าจ้างถอนประกาศงานทิ้ง" (รอบ 007 ลบแถวจริง) เป็นเหตุการณ์ที่ผู้สมัครต้องรู้ที่สุด
--  ถ้า CASCADE แจ้งเตือนจะถูกลบพร้อมงานในวินาทีเดียวกับที่มันควรถูกส่ง
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  job_id     INT NULL,
  type       VARCHAR(40)  NOT NULL,     -- job_cancelled / job_done / offer_declined / ...
  title      VARCHAR(200) NOT NULL,
  body       VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at    DATETIME NULL,
  CONSTRAINT fk_nt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_nt_job  FOREIGN KEY (job_id)  REFERENCES jobs(id)  ON DELETE SET NULL,
  INDEX idx_nt_inbox (user_id, created_at),
  INDEX idx_nt_unread (user_id, read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
