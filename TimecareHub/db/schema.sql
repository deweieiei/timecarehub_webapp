-- TimeCareHub — Database Schema (MVP)
-- MySQL 8.4 / utf8mb4

-- ============================================================
-- users : 1 บัญชี สลับได้ 2 บทบาท (employer / caregiver)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(120) NOT NULL,
  phone         VARCHAR(30),
  active_role   ENUM('employer','caregiver') NOT NULL DEFAULT 'employer',
  is_admin      TINYINT(1) NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- caregiver_profiles : ข้อมูล + สถานะ KYC ของฝั่งแคร์กิฟเวอร์
--   kyc_status = none → pending → approved / rejected
--   ต้อง approved เท่านั้น ถึงจะ (1) กดขอรับงานได้ (2) เห็นพิกัดเป๊ะ
-- ============================================================
CREATE TABLE IF NOT EXISTS caregiver_profiles (
  user_id          INT PRIMARY KEY,
  bio              TEXT,
  experience_years INT NOT NULL DEFAULT 0,
  skills           VARCHAR(500),
  kyc_status       ENUM('none','pending','approved','rejected') NOT NULL DEFAULT 'none',
  kyc_id_card      VARCHAR(255),        -- path ไฟล์รูปบัตรประชาชน
  kyc_selfie       VARCHAR(255),        -- path ไฟล์เซลฟี่คู่บัตร
  kyc_note         VARCHAR(500),        -- เหตุผลที่แอดมินปฏิเสธ
  kyc_submitted_at DATETIME,
  kyc_reviewed_at  DATETIME,
  rating_avg       DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  rating_count     INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_cg_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- jobs : งานที่ผู้ว่าจ้างโพส + พิกัด GPS
-- ============================================================
CREATE TABLE IF NOT EXISTS jobs (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  employer_id           INT NOT NULL,
  title                 VARCHAR(200) NOT NULL,
  elder_condition       TEXT,                       -- อาการ/สภาพผู้สูงอายุ
  tasks                 TEXT,                       -- สิ่งที่ต้องช่วยทำ
  care_type             ENUM('hourly','daily','overnight','live_in') NOT NULL DEFAULT 'daily',
  start_date            DATE,
  end_date              DATE,
  budget                DECIMAL(10,2) NOT NULL,     -- งบที่ผู้ว่าจ้างตั้ง (ตกลงจริงในแชท)
  budget_unit           ENUM('per_hour','per_day','per_month','total') NOT NULL DEFAULT 'per_day',
  lat                   DECIMAL(10,7) NOT NULL,
  lng                   DECIMAL(10,7) NOT NULL,
  address               VARCHAR(300),               -- ที่อยู่เต็ม (เปิดเฉพาะแคร์กิฟเวอร์ที่ approved)
  area_label            VARCHAR(120),               -- ชื่อย่านคร่าวๆ เช่น "ลาดพร้าว" (เปิดให้ทุกคนเห็น)
  status                ENUM('open','matched','done','cancelled') NOT NULL DEFAULT 'open',
  assigned_caregiver_id INT NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_job_employer  FOREIGN KEY (employer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_job_caregiver FOREIGN KEY (assigned_caregiver_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_status (status),
  INDEX idx_geo (lat, lng)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- job_applications : แคร์กิฟเวอร์กดขอรับงาน (1 งาน หลายคนกดได้)
--   ผู้ว่าจ้างเลือกเอง 1 คน → accepted, ที่เหลือ rejected
-- ============================================================
CREATE TABLE IF NOT EXISTS job_applications (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  job_id       INT NOT NULL,
  caregiver_id INT NOT NULL,
  message      VARCHAR(500),
  status       ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_app_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_app_cg  FOREIGN KEY (caregiver_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_job_caregiver (job_id, caregiver_id)   -- กดขอซ้ำไม่ได้
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- messages : แชทผูกกับงาน (polling ทุก 3 วิ ไม่ใช้ WebSocket ใน MVP)
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  job_id      INT NOT NULL,
  sender_id   INT NOT NULL,
  receiver_id INT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_msg_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_snd FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_rcv FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_thread (job_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- reviews : ให้ดาวหลังงานเสร็จ (ให้ได้ทั้ง 2 ฝั่ง แต่ 1 คน/งาน ให้ได้ครั้งเดียว)
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  job_id      INT NOT NULL,
  reviewer_id INT NOT NULL,
  reviewee_id INT NOT NULL,
  rating      TINYINT NOT NULL,     -- 1-5
  comment     VARCHAR(500),
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rv_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_rv_er  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_rv_ee  FOREIGN KEY (reviewee_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT ck_rating CHECK (rating BETWEEN 1 AND 5),
  UNIQUE KEY uq_job_reviewer (job_id, reviewer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
