# 🔌 API Reference — TimeCareHub

**Base URL:** `http://192.168.1.35:8091`
**รูปแบบ:** JSON ทั้งหมด (ยกเว้นอัปโหลดไฟล์ = `multipart/form-data`)
**Auth:** JWT ใน httpOnly cookie ชื่อ `tch_token` — เบราว์เซอร์ส่งให้เองอัตโนมัติ

**ถ้าไม่ได้ล็อกอิน** ทุกเส้น (ยกเว้น register/login) ตอบ `401`
```json
{ "error": "กรุณาเข้าสู่ระบบ" }
```

---

## 🔐 Auth — `/api/auth`

### `POST /register` — สมัครสมาชิก
```json
{ "email": "a@b.com", "password": "อย่างน้อย8ตัว", "full_name": "สมชาย ใจดี", "phone": "0811111111" }
```
→ `{ "ok": true }` + ตั้ง cookie ให้เลย (สมัครเสร็จล็อกอินอัตโนมัติ)
สร้าง `caregiver_profiles` (kyc_status=`none`) ให้อัตโนมัติด้วย

| Error | เมื่อไหร่ |
|---|---|
| `409` อีเมลนี้ถูกใช้สมัครแล้ว | อีเมลซ้ำ |
| `400` รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร | |

### `POST /login`
```json
{ "email": "a@b.com", "password": "..." }
```
→ `{ "ok": true }` | `401` อีเมลหรือรหัสผ่านไม่ถูกต้อง
> ตั้งใจใช้ข้อความเดียวกันทั้งกรณีไม่มีอีเมลและรหัสผิด — ไม่บอกใบ้ว่าอีเมลไหนมีในระบบ

### `POST /logout` → `{ "ok": true }`

### `GET /me` — ข้อมูลตัวเอง
```json
{ "user": { "id": 2, "email": "cg@test.com", "full_name": "มานี", "active_role": "caregiver",
            "is_admin": 0, "kyc_status": "approved", "rating_avg": "5.00", "rating_count": 1 } }
```

### `POST /role` — สลับบทบาท
```json
{ "role": "caregiver" }   // หรือ "employer"
```

---

## 💼 Jobs — `/api/jobs`

### `POST /` — โพสงาน (ผู้ว่าจ้าง)
```json
{
  "title": "ต้องการคนดูแลคุณแม่ 78 ปี ช่วงกลางวัน",
  "care_type": "daily",            // hourly | daily | overnight | live_in
  "budget": 600,
  "budget_unit": "per_day",        // per_hour | per_day | per_month | total
  "start_date": "2026-08-01",
  "end_date": "2026-08-31",
  "elder_condition": "เดินได้เอง ความจำไม่ดี เบาหวาน",
  "tasks": "ป้อนข้าว จัดยา พาเดินออกกำลัง",
  "lat": 13.8161, "lng": 100.5601,
  "address": "123/45 ซอยลาดพร้าว 15 จตุจักร",   // เห็นเฉพาะคนผ่าน KYC
  "area_label": "ลาดพร้าว"                       // ทุกคนเห็นได้
}
```
→ `{ "ok": true, "id": 1 }`
**บังคับ:** `title`, `budget`, `lat`, `lng`

---

### `GET /?lat=&lng=&radius_km=` — ⭐ หางานตามรัศมี

| พารามิเตอร์ | ค่าเริ่มต้น |
|---|---|
| `lat`, `lng` | ไม่ใส่ = เอางานล่าสุดทั้งหมด ไม่กรองระยะ |
| `radius_km` | 20 (สูงสุด 100) |

**คำตอบขึ้นกับสถานะ KYC ของคนเรียก** — นี่คือหัวใจของระบบ

**ผ่าน KYC แล้ว (`approved`):**
```json
{ "items": [{
    "id": 1, "title": "...", "budget": "600.00", "budget_unit": "per_day",
    "lat": "13.8161000", "lng": "100.5601000",        ← พิกัดจริง
    "address": "123/45 ซอยลาดพร้าว 15 จตุจักร",        ← ที่อยู่เต็ม
    "distance_km": 0.02, "applicant_count": 0,
    "precise": true                                    ← ⭐
}] }
```

**ยังไม่ผ่าน KYC:**
```json
{ "items": [{
    "id": 1, "title": "...", "budget": "600.00",
    "lat": 13.815, "lng": 100.556,                     ← ปัดลงกริด ~1 กม.
    "precise": false,                                  ← ⭐
    "fuzz_radius_m": 800,                              ← เอาไปวาดวงกลม
    "area_label": "ลาดพร้าว"
    // ไม่มี address, ไม่มี employer_phone
}] }
```

> หน้าเว็บดู `precise` แล้วตัดสินใจ: `true` → ปักหมุด, `false` → วาดวงกลม

---

### `GET /mine` — งานของฉัน (ทั้ง 2 บทบาท)
```json
{
  "posted":  [ /* งานที่ฉันโพส + applicant_count + caregiver_name */ ],
  "applied": [ /* งานที่ฉันกดขอรับ + my_application_status */ ]
}
```

### `GET /:id` — รายละเอียดงาน 1 ตัว (ถูก mask เหมือนกัน)

### `POST /:id/apply` — 🔒 กดขอรับงาน (**ต้อง KYC approved**)
```json
{ "message": "สนใจครับ มีประสบการณ์ 5 ปี" }
```
| Error | เมื่อไหร่ |
|---|---|
| `403` ต้องยืนยันตัวตน (KYC)... | ยังไม่ approved |
| `409` คุณกดขอรับงานนี้ไปแล้ว | กดซ้ำ |
| `400` งานนี้ปิดรับแล้ว | status ≠ open |
| `400` ขอรับงานที่ตัวเองโพสไม่ได้ | |

### `GET /:id/applicants` — ดูผู้สมัคร (เจ้าของงานเท่านั้น)
เรียงตามคะแนนดาวมาก → น้อย
```json
{ "items": [{ "caregiver_id": 2, "full_name": "มานี", "rating_avg": "5.00", "rating_count": 1,
              "experience_years": 5, "skills": "ผู้ช่วยพยาบาล", "bio": "...", "message": "..." }] }
```

### `POST /:id/choose/:caregiverId` — เลือกแคร์กิฟเวอร์
งาน → `matched` | คนที่เลือก → `accepted` | คนอื่น → `rejected` (ทำใน transaction เดียว)

### `POST /:id/complete` — ปิดงาน (เจ้าของงานเท่านั้น, ต้อง `matched` ก่อน)

---

## 🪪 KYC — `/api/kyc`

### `GET /me` — สถานะ KYC ของฉัน
```json
{ "kyc_status": "pending", "kyc_note": null, "bio": "...", "experience_years": 5,
  "skills": "...", "rating_avg": "0.00", "has_id_card": true, "has_selfie": true }
```

### `POST /submit` — ส่งเอกสาร (`multipart/form-data`)

| field | ชนิด |
|---|---|
| `id_card` | ไฟล์รูป — บัตรประชาชน |
| `selfie` | ไฟล์รูป — เซลฟี่คู่บัตร |
| `bio` / `experience_years` / `skills` | ข้อความ |

รับ JPG/PNG/WEBP ไม่เกิน 5 MB → `{ "ok": true, "kyc_status": "pending" }`
> ส่งซ้ำได้ถ้าโดน `rejected` (แนบใหม่แค่ใบเดียวก็ได้ ใบเดิมยังอยู่)

### `GET /queue` — 🔒 คิวรออนุมัติ (**แอดมินเท่านั้น**)

### `GET /file/:userId/:kind` — 🔒 ดูรูปเอกสาร (**แอดมินเท่านั้น**)
`:kind` = `id_card` | `selfie` → ส่งไฟล์รูปกลับ
> คนอื่นเรียก = `403` — ไฟล์เก็บนอก `public/` เข้า URL ตรงไม่ได้

### `POST /review/:userId` — 🔒 อนุมัติ/ปฏิเสธ (**แอดมินเท่านั้น**)
```json
{ "decision": "approved" }
{ "decision": "rejected", "note": "รูปบัตรเบลอ อ่านเลขไม่ออก" }
```

---

## 💬 Chat — `/api/chat`

### `GET /threads` — ห้องแชทของฉัน
```json
{ "items": [{ "job_id": 1, "title": "...", "other_id": 2, "other_name": "มานี",
              "last_message": "ขอ 600 บาท/วัน ได้ไหมคะ", "last_at": "..." }] }
```

### `GET /:jobId?with=<userId>` — อ่านข้อความ
> `with` จำเป็นเฉพาะฝั่งผู้ว่าจ้าง (เพราะคุยกับหลายคนในงานเดียวได้)
> ฝั่งแคร์กิฟเวอร์ไม่ต้องใส่ — ระบบรู้ว่าคู่สนทนาคือเจ้าของงาน

```json
{ "items": [{ "id": 1, "sender_id": 2, "body": "สวัสดีครับ", "created_at": "..." }],
  "me": 2, "other_id": 1 }
```

### `POST /:jobId` — ส่งข้อความ
```json
{ "body": "ว่างวันจันทร์-ศุกร์ครับ", "to": 2 }   // "to" จำเป็นเฉพาะฝั่งผู้ว่าจ้าง
```
| Error | เมื่อไหร่ |
|---|---|
| `403` ต้องกดขอรับงานนี้ก่อนจึงจะคุยได้ | แคร์กิฟเวอร์ที่ไม่ได้สมัครงานนี้ |
| `403` คนนี้ไม่ได้กดขอรับงานนี้ | ผู้ว่าจ้างส่งหาคนที่ไม่ได้สมัคร |

---

## ⭐ Reviews — `/api/reviews`

### `POST /:jobId` — ให้ดาว
```json
{ "rating": 5, "comment": "ดูแลคุณแม่ดีมาก ใส่ใจ" }
```
| Error | เมื่อไหร่ |
|---|---|
| `400` ให้ดาวได้หลังงานเสร็จแล้วเท่านั้น | job.status ≠ `done` |
| `409` คุณให้ดาวงานนี้ไปแล้ว | ให้ซ้ำ |
| `403` คุณไม่ได้เกี่ยวข้องกับงานนี้ | ไม่ใช่คู่ในงาน |

ให้แล้ว → `caregiver_profiles.rating_avg` / `rating_count` อัปเดตอัตโนมัติ

### `GET /user/:userId` — ดูรีวิวของคนนั้น (ล่าสุด 50 รายการ)

---

## 🩺 `GET /api/health`
```json
{ "ok": true, "service": "timecarehub" }
```
