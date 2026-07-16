-- ============================================================
--  รอบที่ 2 — เพิ่ม "ระบบจ้างตรง" (ผู้จ้างเลือกแคร์กิฟเวอร์เอง)
--  ควบคู่กับระบบโพสงานเดิม (ไม่ได้ตัดทิ้ง)
--
--  รันซ้ำได้ — migrate.js จะข้าม error "คอลัมน์มีอยู่แล้ว" ให้เอง
-- ============================================================

-- ---------- jobs: รองรับงานแบบจ้างตรง ----------
-- hire_type = 'open'   → งานที่โพสไว้ ใครก็กดขอรับได้ (ระบบเดิม)
--           = 'direct' → ผู้จ้างยิงตรงไปหาแคร์กิฟเวอร์คนเดียว (ระบบใหม่)
ALTER TABLE jobs ADD COLUMN hire_type ENUM('open','direct') NOT NULL DEFAULT 'open' AFTER employer_id;
ALTER TABLE jobs ADD COLUMN target_caregiver_id INT NULL AFTER hire_type;
ALTER TABLE jobs ADD CONSTRAINT fk_job_target FOREIGN KEY (target_caregiver_id) REFERENCES users(id) ON DELETE CASCADE;

-- งานจ้างตรงไม่ต้องปักหมุด → lat/lng ต้องว่างได้
ALTER TABLE jobs MODIFY lat DECIMAL(10,7) NULL;
ALTER TABLE jobs MODIFY lng DECIMAL(10,7) NULL;

-- เพิ่มสถานะ: offered = ส่งคำขอไปแล้ว รอตอบ | declined = แคร์กิฟเวอร์ปฏิเสธ
ALTER TABLE jobs MODIFY status ENUM('open','offered','matched','done','declined','cancelled') NOT NULL DEFAULT 'open';

-- ---------- caregiver_profiles: ข้อมูลที่ผู้จ้างต้องเห็นตอนเลือกคน ----------
ALTER TABLE caregiver_profiles ADD COLUMN area_label VARCHAR(120) NULL;
ALTER TABLE caregiver_profiles ADD COLUMN lat DECIMAL(10,7) NULL;
ALTER TABLE caregiver_profiles ADD COLUMN lng DECIMAL(10,7) NULL;
ALTER TABLE caregiver_profiles ADD COLUMN rate DECIMAL(10,2) NULL;
ALTER TABLE caregiver_profiles ADD COLUMN rate_unit ENUM('per_hour','per_day','per_month') NOT NULL DEFAULT 'per_day';

-- ---------- messages: ทำ badge "ข้อความใหม่" ----------
ALTER TABLE messages ADD COLUMN read_at DATETIME NULL;
