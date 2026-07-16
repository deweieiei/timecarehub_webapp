# 🔌 API Reference — TimeCareHub

**อัปเดตล่าสุด:** 2026-07-17 — ตรงกับโค้ดจริงแล้ว

**Base URL:** `http://192.168.1.35:8091`
**รูปแบบ:** JSON ทั้งหมด
**Auth:** JWT ใน httpOnly cookie ชื่อ `tch_token` — เบราว์เซอร์ส่งให้เองอัตโนมัติ

**ถ้าไม่ได้ล็อกอิน** ทุกเส้น (ยกเว้น register/login/health) ตอบ `401`
```json
{ "error": "กรุณาเข้าสู่ระบบ" }
```

## สารบัญ

| กลุ่ม | ทำอะไร |
|---|---|
| [`/api/auth`](#-auth--apiauth) | สมัคร ล็อกอิน สลับบทบาท |
| [`/api/profile`](#-profile--apiprofile) | 🆕 โปรไฟล์บัญชีผู้ใช้ (ชื่อ บัตร ปชช. ที่อยู่) |
| [`/api/jobs`](#-jobs--apijobs) | งานแบบ**โพสหาคน** |
| [`/api/caregivers`](#-caregivers--apicaregivers) | 🆕 ไดเรกทอรีแคร์กิฟเวอร์ |
| [`/api/hires`](#-hires--apihires) | 🆕 งานแบบ**จ้างตรง** |
| [`/api/kyc`](#-kyc--apikyc) | ⚠️ ยืนยันตัวตน (โหมดเดโม) + แอดมิน |
| [`/api/chat`](#-chat--apichat) | แชท — ข้อความ + รูป |
| [**Socket.IO**](#-socketio--แชทสด-) | 🆕 แชทสด: ข้อความ · อ่านแล้ว · กำลังพิมพ์ · ออนไลน์ |
| [`/api/notifications`](#-notifications--apinotifications) | 🆕 ตัวเลขแดงบนแท็บ |
| [`/api/reviews`](#-reviews--apireviews-) | ⏸ ให้ดาว — **ปิดอยู่** |

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

### `GET /me` — ข้อมูลตัวเอง (หน้าเว็บเรียกตอนโหลดทุกหน้า)
```json
{ "user": { "id": 2, "email": "cg@test.com", "full_name": "มานี", "phone": "081...",
            "active_role": "caregiver", "is_admin": 0,
            "kyc_status": "approved", "rating_avg": "0.00", "rating_count": 0 } }
```
> ⚠️ **ไม่มี `national_id`** โดยตั้งใจ — เส้นนี้ถูกเรียกทุกหน้า ไม่ควรมีข้อมูลอ่อนไหวติดมา

### `POST /role` — สลับบทบาท
```json
{ "role": "caregiver" }   // หรือ "employer"
```

---

## 👤 Profile — `/api/profile` 🆕

> ⚠️ **นี่คือ route เดียวในระบบที่ส่ง `national_id` ออกได้ และส่งให้เจ้าของบัญชีเท่านั้น**

### `GET /me` — อ่านโปรไฟล์ตัวเอง
```json
{ "profile": {
    "id": 5, "email": "care1@demo.com", "full_name": "สมหญิง ดูแลดี",
    "title_prefix": "นางสาว", "nickname": "หญิง",
    "birth_date": "1990-03-15", "age": 36,          ← ⭐ คำนวณสดจาก birth_date
    "gender": "female", "nationality": "ไทย", "religion": "พุทธ",
    "marital_status": "single", "blood_type": "O",
    "national_id": "1101700123456",                  ← 🔒 เจ้าของเท่านั้น
    "national_id_issue_date": "2020-01-01", "national_id_expiry_date": "2028-01-01",
    "phone": "081-234-5601", "phone_alt": null, "line_id": null,
    "addr_line": "123/45 ซอยลาดพร้าว 15", "addr_subdistrict": "จอมพล",
    "addr_district": "จตุจักร", "addr_province": "กรุงเทพมหานคร", "addr_postcode": "10900",
    "cur_same_as_addr": 1, "cur_addr_line": null, "...": null,
    "emergency_name": "สมชาย ดูแลดี", "emergency_relation": "พี่ชาย", "emergency_phone": "0899999999",
    "occupation": null, "education": null, "about_me": null,
    "is_admin": 0, "active_role": "caregiver",
    "created_at": "...", "profile_updated_at": "..."
} }
```

### `PUT /me` — บันทึกโปรไฟล์ตัวเอง

**ส่งมาแค่ช่องไหน อัปเดตแค่ช่องนั้น** — ไม่ต้องส่งครบทุกช่อง
ส่งสตริงว่าง `""` = **ล้างค่าเป็น NULL**

```json
{ "national_id": "1-1017-00123-45-6", "birth_date": "1990-03-15", "gender": "female",
  "addr_province": "กรุงเทพมหานคร", "emergency_phone": "0899999999" }
```
→ `{ "ok": true }`

**ช่องที่แก้ได้** (allowlist — นอกเหนือจากนี้ถูกเมินเงียบ ๆ):
`full_name` `title_prefix` `nickname` `birth_date` `gender` `nationality` `religion` `marital_status` `blood_type` `national_id` `national_id_issue_date` `national_id_expiry_date` `phone` `phone_alt` `line_id` `addr_*` `cur_same_as_addr` `cur_addr_*` `emergency_*` `occupation` `education` `about_me`

> ### 🔒 ช่องที่ **แก้ไม่ได้** — โดยตั้งใจ
> `id` · `email` · `password_hash` · **`is_admin`** · `active_role` · `created_at`
> ยิง `{"is_admin":1}` มา = ถูกเมินทิ้ง ไม่ error ไม่ทำอะไร

| Error | เมื่อไหร่ |
|---|---|
| `400` เลขบัตรประชาชนไม่ถูกต้อง — ต้องเป็นตัวเลข 13 หลักและผ่านการตรวจหลักสุดท้าย | เลขบัตรผิด checksum |
| `400` ผู้ใช้ต้องมีอายุอย่างน้อย 15 ปี | `birth_date` ใหม่เกินไป |
| `400` ชื่อ-นามสกุลว่างไม่ได้ | ส่ง `full_name: ""` |
| `400` ค่าของ gender ไม่ถูกต้อง | ค่าไม่อยู่ใน ENUM |
| `400` ไม่มีข้อมูลที่จะบันทึก | ไม่ส่งช่องที่แก้ได้มาเลย |

**หมายเหตุ:**
- เลขบัตรใส่ขีดคั่นมาได้ (`1-1017-00123-45-6`) ระบบถอดให้เอง เก็บเป็นตัวเลขล้วน
- ตรวจ **หลักตรวจสอบ (checksum) ของบัตรไทยจริง ๆ** ไม่ใช่แค่นับ 13 หลัก

---

## 💼 Jobs — `/api/jobs`

> งานแบบ **"โพสหาคน"** (`hire_type='open'`) — ใครกดขอรับก็ได้ ผู้ว่าจ้างเลือกเอง
> งานจ้างตรงอยู่ที่ [`/api/hires`](#-hires--apihires)

### `POST /` — โพสงาน
```json
{
  "title": "ต้องการคนดูแลคุณแม่ 78 ปี ช่วงกลางวัน",
  "care_type": "daily",            // hourly | daily | overnight | live_in
  "budget": 600,
  "budget_unit": "per_day",        // per_hour | per_day | per_month | total
  "start_date": "2026-08-01", "end_date": "2026-08-31",
  "elder_condition": "เดินได้เอง ความจำไม่ดี เบาหวาน",
  "tasks": "ป้อนข้าว จัดยา พาเดินออกกำลัง",
  "lat": 13.8161, "lng": 100.5601,
  "address": "123/45 ซอยลาดพร้าว 15 จตุจักร",   // เห็นเฉพาะคนยืนยันตัวตนแล้ว
  "area_label": "ลาดพร้าว"                       // ทุกคนเห็นได้
}
```
→ `{ "ok": true, "id": 1 }` — **บังคับ:** `title`, `budget`, `lat`, `lng`

---

### `GET /?lat=&lng=&radius_km=` — ⭐ หางานตามรัศมี

| พารามิเตอร์ | ค่าเริ่มต้น |
|---|---|
| `lat`, `lng` | ไม่ใส่ = เอางานล่าสุดทั้งหมด ไม่กรองระยะ |
| `radius_km` | 20 (สูงสุด 100) |

คืนเฉพาะงาน `status='open'` **และ** `hire_type='open'`

**คำตอบขึ้นกับสถานะ KYC ของคนเรียก** — นี่คือหัวใจของระบบ

**ยืนยันตัวตนแล้ว (`approved`):**
```json
{ "items": [{
    "id": 1, "title": "...", "budget": "600.00", "budget_unit": "per_day",
    "lat": "13.8161000", "lng": "100.5601000",        ← พิกัดจริง
    "address": "123/45 ซอยลาดพร้าว 15 จตุจักร",        ← ที่อยู่เต็ม
    "distance_km": 0.02, "applicant_count": 0,
    "precise": true                                    ← ⭐
}] }
```

**ยังไม่ยืนยันตัวตน:**
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

### `GET /mine` — งานของฉัน (ทั้ง 2 บทบาท)
```json
{
  "posted":  [ /* งานที่ฉันโพส (hire_type='open') + applicant_count + caregiver_name */ ],
  "applied": [ /* งานที่ฉันกดขอรับ + my_application_status */ ]
}
```

### `GET /:id` — รายละเอียดงาน 1 ตัว (ถูก mask เหมือนกัน)

### `POST /:id/apply` — 🔒 กดขอรับงาน (**ต้องยืนยันตัวตนแล้ว**)
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
{ "items": [{ "caregiver_id": 2, "full_name": "มานี", "phone": "081...",
              "rating_avg": "0.00", "rating_count": 0,
              "experience_years": 5, "skills": "ผู้ช่วยพยาบาล", "bio": "...", "message": "..." }] }
```

### `POST /:id/choose/:caregiverId` — เลือกแคร์กิฟเวอร์
งาน → `matched` | คนที่เลือก → `accepted` | คนอื่น → `rejected` (ทำใน transaction เดียว + `FOR UPDATE`)

### `POST /:id/complete` — ปิดงาน (เจ้าของงานเท่านั้น, ต้อง `matched` ก่อน)

---

## 🧑‍⚕️ Caregivers — `/api/caregivers` 🆕

> ไดเรกทอรีให้ผู้ว่าจ้างเดินดูโปรไฟล์แล้วจ้างตรงได้เลย — ไม่ต้องโพสงาน ไม่ต้องปักหมุด
> ⭐ **แสดงเฉพาะคนที่ `kyc_status='approved'`** — คนที่ยังไม่ยืนยันตัวตนไม่โผล่เลย

### `GET /?q=` — รายชื่อแคร์กิฟเวอร์
`q` ค้นจาก ชื่อ / ทักษะ / ย่าน (ไม่ใส่ = เอาทั้งหมด) · เรียงตามประสบการณ์มาก→น้อย · สูงสุด 100 คน

```json
{ "items": [{ "id": 5, "full_name": "สมหญิง ดูแลดี",
              "bio": "จบผู้ช่วยพยาบาล...", "experience_years": 5,
              "skills": "ผู้ช่วยพยาบาล, จัดยา",
              "area_label": "ลาดพร้าว", "lat": "13.8161000", "lng": "100.5601000",
              "rate": "700.00", "rate_unit": "per_day" }] }
```
> ไม่โชว์ตัวเอง · **ไม่มี `national_id` / `email` / `phone`**

### `GET /:id` — โปรไฟล์แคร์กิฟเวอร์ 1 คน
→ `{ "caregiver": {...} }` | `404` ถ้าไม่มีคนนี้หรือยังไม่ approved

---

## 🤝 Hires — `/api/hires` 🆕

> งานแบบ **"จ้างตรง"** (`hire_type='direct'`) — ผู้ว่าจ้างยิงตรงไปหาคนที่เลือก
> เก็บในตาราง `jobs` เหมือนงานปกติ เพื่อให้แชท/ปิดงานใช้โค้ดชุดเดียวกัน

```
offered ──แคร์กิฟเวอร์กดรับ──→ matched ──ผู้จ้างปิดงาน──→ done
     └──แคร์กิฟเวอร์ปฏิเสธ──→ declined
```

### `POST /` — ส่งคำขอจ้าง
```json
{ "caregiver_id": 5, "title": "ดูแลคุณแม่ช่วงกลางวัน",
  "care_type": "daily", "budget": 700, "budget_unit": "per_day",
  "start_date": "2026-08-01", "end_date": null,
  "elder_condition": "...", "tasks": "...",
  "address": "123/45 ซอยลาดพร้าว 15"   // เห็นเฉพาะแคร์กิฟเวอร์คนนี้เท่านั้น
}
```
→ `{ "ok": true, "id": 6 }` — **บังคับ:** `caregiver_id`, `title`, `budget`
**ไม่ต้องส่ง `lat`/`lng`** — งานจ้างตรงไม่ปักหมุด

| Error | เมื่อไหร่ |
|---|---|
| `400` แคร์กิฟเวอร์คนนี้ยังไม่ได้ยืนยันตัวตน | เป้าหมายไม่ใช่ `approved` |
| `409` คุณส่งคำขอจ้างคนนี้ไปแล้ว กำลังรอเขาตอบอยู่ | มีคำขอ `offered` ค้างอยู่กับคู่เดิม |
| `400` จ้างตัวเองไม่ได้ | |

### `GET /incoming` — คำขอจ้างที่ส่งมาหาฉัน (ฝั่งแคร์กิฟเวอร์)
เรียง `offered` → `matched` → `done` → `declined`
```json
{ "items": [{ "id": 6, "title": "...", "status": "offered", "budget": "700.00",
              "employer_name": "วิภา อ่อนโยน", "employer_phone": "081...",
              "address": "...", "elder_condition": "...", "tasks": "..." }] }
```

### `GET /sent` — คำขอจ้างที่ฉันส่งไป (ฝั่งผู้ว่าจ้าง)
```json
{ "items": [{ "id": 6, "title": "...", "status": "offered",
              "caregiver_name": "สมหญิง ดูแลดี", "target_caregiver_id": 5 }] }
```

### `POST /:id/respond` — ตอบรับ / ปฏิเสธ (คนที่ถูกส่งคำขอไปหาเท่านั้น)
```json
{ "decision": "accept" }    // หรือ "decline"
```
→ `{ "ok": true, "status": "matched" }` | `{ "ok": true, "status": "declined" }`

| Error | เมื่อไหร่ |
|---|---|
| `403` คำขอนี้ไม่ได้ส่งถึงคุณ | ไม่ใช่ `target_caregiver_id` |
| `400` คำขอนี้ตอบไปแล้ว | status ≠ `offered` |

> **ปิดงานจ้างตรง** ใช้ `POST /api/jobs/:id/complete` เส้นเดียวกับงานโพส

---

## 🪪 KYC — `/api/kyc`

> ### ⚠️ ตอนนี้เป็น **โหมดเดโม** — กดปุ่มเดียวผ่านทันที ไม่มีอัปโหลด ไม่มีคิวแอดมิน
> ของเดิมที่ออกแบบไว้: อัปบัตร ปชช. + เซลฟี่ → เข้าคิว → แอดมินอนุมัติ
> คอลัมน์ `kyc_id_card` / `kyc_selfie` ยังอยู่ครบใน DB → เปิดกลับได้ทันที

### `GET /me` — สถานะ + โปรไฟล์ฝั่งรับงานของฉัน
```json
{ "kyc_status": "approved", "bio": "...", "experience_years": 5, "skills": "...",
  "area_label": "ลาดพร้าว", "rate": "700.00", "rate_unit": "per_day" }
```

### `POST /verify` — ⭐ ยืนยันตัวตน (กดปุ่มเดียว) + บันทึกโปรไฟล์ฝั่งรับงาน
```json
{ "bio": "...", "experience_years": 5, "skills": "ผู้ช่วยพยาบาล, จัดยา",
  "area_label": "ลาดพร้าว", "rate": 700, "rate_unit": "per_day" }
```
→ `{ "ok": true, "kyc_status": "approved" }`

> ข้อมูลชุดนี้คือสิ่งที่**ผู้ว่าจ้างเห็นในไดเรกทอรี** `/api/caregivers`

### `GET /caregivers` — 🔒 รายชื่อแคร์กิฟเวอร์ทั้งหมด + สถานะ (**แอดมินเท่านั้น**)
```json
{ "items": [{ "id": 5, "full_name": "...", "email": "...", "phone": "...",
              "kyc_status": "approved", "experience_years": 5,
              "rating_avg": "0.00", "rating_count": 0, "applied_count": 2 }] }
```

### `POST /revoke/:userId` — 🔒 เพิกถอนการยืนยันตัวตน (**แอดมินเท่านั้น**)
→ `kyc_status = 'none'` — คนนั้นจะกดขอรับงานไม่ได้ เห็นแค่ตำแหน่งคร่าว ๆ และหายจากไดเรกทอรี

---

## 💬 Chat — `/api/chat`

> 🆕 **ปกติหน้าเว็บคุยผ่าน Socket.IO ไม่ใช่ REST** (ดูหัวข้อ Socket.IO ท้ายไฟล์)
> REST เหลือไว้: ดึงรายการห้อง · ดึงประวัติข้อความ · อัปโหลดรูป · เสิร์ฟรูป
> ส่วน `POST /:jobId` ยังอยู่เป็น **ทางสำรอง** เผื่อ socket ต่อไม่ติด

### `GET /threads` — ห้องแชทของฉัน (รวมทั้งงานโพสและงานจ้างตรง)
```json
{ "items": [{ "job_id": 1, "title": "...", "status": "open", "hire_type": "open",
              "other_id": 2, "other_name": "มานี",
              "last_kind": "image",                 // 🆕 image → หน้าเว็บโชว์ "📷 รูปภาพ"
              "last_message": "ขอ 600 บาท/วัน ได้ไหมคะ",
              "last_sender": 2, "last_at": "...",
              "unread": 2,
              "other_online": true,                 // 🆕 จุดเขียว — มาจากทะเบียน socket ไม่ใช่ DB
              "other_last_seen": "2026-07-16T20:52:42.000Z" }] }  // 🆕 ไว้โชว์ "เห็นล่าสุดเมื่อ..."
```

### `GET /:jobId?with=<userId>` — อ่านข้อความ
> `with` จำเป็นเฉพาะฝั่งผู้ว่าจ้างของ**งานโพส** (เพราะคุยกับหลายคนในงานเดียวได้)
> งานจ้างตรงไม่ต้องใส่ — ระบบรู้คู่สนทนาจาก `target_caregiver_id`

```json
{ "items": [{ "id": 1, "job_id": 1, "sender_id": 2, "receiver_id": 1,
              "kind": "text",                       // 🆕 text | image
              "body": "สวัสดีครับ",
              "image_w": null, "image_h": null,     // 🆕 มีค่าเมื่อ kind = 'image'
              "created_at": "...", "read_at": null }],
  "me": 2, "other_id": 1,
  "other_online": true, "other_last_seen": "..." }  // 🆕
```
> **เรียกเส้นนี้ = ข้อความของคู่นี้ถูกมาร์คว่าอ่านแล้ว** (`read_at = NOW()`) → ตัวเลขแดงหาย
> 🆕 และยิง `chat:read` ทาง socket ไปบอกคนส่งให้เปลี่ยนเป็นติ๊กคู่ทันที
> 🔴 **ไม่ส่ง `image_path` ออกมาเด็ดขาด** — หน้าเว็บเรียกรูปผ่าน `/image/:id` เท่านั้น

### 🆕 `POST /:jobId/image?with=<userId>` — ส่งรูป (multipart/form-data)

| ฟิลด์ | จำเป็น | หมายเหตุ |
|---|---|---|
| `image` | ✅ | JPG / PNG / WebP / GIF — **สูงสุด 8 MB** |
| `w` / `h` | | ขนาดรูปหลังย่อ — จองพื้นที่กันหน้ากระตุกตอนรูปยังโหลดไม่เสร็จ |
| `client_id` | | เลขอ้างอิงของหน้าเว็บ · server ส่งกลับมาใน `chat:new` ให้จับคู่กับฟองที่โชว์ล่วงหน้า |

> ⚠️ **คู่สนทนาต้องส่งมาทาง query (`?with=`) ไม่ใช่ใน body** — เพราะด่านตรวจสิทธิ์ต้องทำงาน
> **ก่อน** multer เขียนไฟล์ลงดิสก์ (ตอนนั้นยังอ่าน body ของ multipart ไม่ได้)
> ไม่งั้นคนไม่มีสิทธิ์จะยัดไฟล์ขึ้น server ได้ก่อนโดนปฏิเสธ
>
> หน้าเว็บ **ย่อรูปเหลือด้านยาว 1600px + แปลงเป็น JPEG ตั้งแต่ที่เครื่องคนส่ง** (ทดสอบจริง: 5.4 MB → 26 KB)
> ลิมิต 8 MB เป็นตาข่ายรองไว้เฉย ๆ เผื่อเบราว์เซอร์เก่าที่ย่อไม่ได้

ตอบกลับ: `{ "ok": true, "message": { ...แถวข้อความ..., "client_id": "..." } }`

### 🆕 `GET /image/:id` — เปิดรูปในแชท
> เสิร์ฟไฟล์จริง ไม่ใช่ JSON · **เห็นได้เฉพาะคนส่งกับคนรับ** คนอื่นเดา id เอาไม่ได้ → `403`
> `Cache-Control: private, max-age=31536000, immutable` — 1 id = 1 ไฟล์ตายตัวไม่มีวันเปลี่ยน
> `private` = ห้าม proxy/CDN เก็บไว้แจกคนอื่น

### `POST /:jobId` — ส่งข้อความ (ทางสำรองเมื่อ socket ต่อไม่ติด)
```json
{ "body": "ว่างวันจันทร์-ศุกร์ครับ", "to": 2 }   // "to" จำเป็นเฉพาะฝั่งผู้ว่าจ้างของงานโพส
```
ตอบกลับ: `{ "ok": true, "message": { ... } }` — และเด้ง `chat:new` ให้อีกฝั่งทาง socket ด้วย

| Error | เมื่อไหร่ |
|---|---|
| `403` ต้องกดขอรับงานนี้ก่อนจึงจะคุยได้ | แคร์กิฟเวอร์ที่ไม่ได้สมัครงานโพสนั้น |
| `403` คนนี้ไม่ได้กดขอรับงานนี้ | ผู้ว่าจ้างส่งหาคนที่ไม่ได้สมัคร |
| `403` งานนี้ไม่ได้ส่งถึงคุณ | งานจ้างตรงที่ไม่ใช่เป้าหมาย |
| `400` พิมพ์ข้อความก่อนส่ง | body ว่าง |
| 🆕 `400` ข้อความยาวเกินไป | เกิน 4,000 ตัวอักษร |
| 🆕 `400` รองรับเฉพาะไฟล์รูป (JPG, PNG, WebP, GIF) | อัปไฟล์ที่ไม่ใช่รูป |
| 🆕 `400` ไฟล์ใหญ่เกิน 8 MB | รูปเกินลิมิต |
| 🆕 `403` ไม่มีสิทธิ์ดูรูปนี้ | คนนอกเดา id รูปของคนอื่น |

---

## 🔔 Notifications — `/api/notifications` 🆕

### `GET /` — ตัวเลขแดงบนแท็บ (หน้าเว็บเรียกทุก 15 วินาที)
```json
{ "chat": 3, "applicants": 1, "offers": 2 }
```

| ค่า | นับอะไร | ไปโผล่ที่แท็บ |
|---|---|---|
| `chat` | ข้อความที่ส่งมาหาฉันและยังไม่อ่าน (`read_at IS NULL`) | แชท |
| `applicants` | คนที่มากดขอรับงานที่ฉันโพส และฉันยังไม่ได้เลือกใคร | งานของฉัน (ฝั่งผู้จ้าง) |
| `offers` | คำขอจ้างตรงที่ส่งมาหาฉัน ยังไม่ได้ตอบ | งานของฉัน (ฝั่งแคร์กิฟเวอร์) |

---

## ⭐ Reviews — `/api/reviews` ⏸

> ### **ปิดอยู่** — `server.js` คอมเมนต์ `app.use('/api/reviews', ...)` ไว้
> เรียกเส้นพวกนี้ตอนนี้จะได้ `404` (Express ไม่รู้จัก) — โค้ดกับตารางยังอยู่ครบ เอาคอมเมนต์ออกก็กลับมาทันที

### `POST /:jobId` — ให้ดาว
```json
{ "rating": 5, "comment": "ดูแลคุณแม่ดีมาก ใส่ใจ" }
```
| Error | เมื่อไหร่ |
|---|---|
| `400` ให้ดาวได้หลังงานเสร็จแล้วเท่านั้น | job.status ≠ `done` |
| `409` คุณให้ดาวงานนี้ไปแล้ว | ให้ซ้ำ |
| `403` คุณไม่ได้เกี่ยวข้องกับงานนี้ | ไม่ใช่คู่ในงาน |

### `GET /user/:userId` — ดูรีวิวของคนนั้น (ล่าสุด 50 รายการ)

---

## 🔌 Socket.IO — แชทสด 🆕

**เกาะพอร์ต 8091 ร่วมกับ Express** ไม่ได้เปิดพอร์ตใหม่ → nginx/firewall ไม่ต้องแก้อะไร
หน้าเว็บโหลด client จาก `/socket.io/socket.io.js` (**server แจกเอง** ไม่ได้ดึงจากเน็ต เวอร์ชันตรงกันเสมอ)

```html
<script src="/socket.io/socket.io.js"></script>
<script>const socket = io();</script>   <!-- cookie ติดไปเอง ไม่ต้องส่ง token -->
```

**ตอน handshake ตรวจ cookie `tch_token` ตัวเดิมของเว็บ** — ไม่มี token แยก
ไม่ล็อกอิน = ต่อไม่ติด (`connect_error: unauthorized`)

### เว็บ → server

| event | payload | ตอบกลับ (ack) |
|---|---|---|
| `chat:send` | `{ jobId, to, body, client_id }` | `{ ok: true, message: {...} }` หรือ `{ error: "..." }` |
| `chat:read` | `{ jobId, otherId }` | — (เด้ง `chat:read` กลับมาแทน) |
| `chat:typing` | `{ jobId, to, on: true\|false }` | — |

### server → เว็บ

| event | payload | เมื่อไหร่ |
|---|---|---|
| `chat:new` | แถวข้อความ + `client_id` | มีข้อความ/รูปใหม่ (ยิงให้ทั้งคนส่งและคนรับ — เปิดหลายแท็บก็ตรงกัน) |
| `chat:read` | `{ job_id, by, ids: [1,2], at }` | อีกฝั่งอ่านข้อความของเราแล้ว → เปลี่ยนเป็นติ๊กคู่ |
| `chat:typing` | `{ job_id, from, on }` | อีกฝั่งกำลังพิมพ์ |
| `presence` | `{ user_id, online }` | คู่สนทนาออนไลน์/ออฟไลน์ |

> **`presence` ส่งเฉพาะคนที่เคยคุยกันเท่านั้น** (`contactsOf()` ใน `chat-core.js`) — คนอื่นไม่เกี่ยว ไม่ต้องรู้ว่าเราออนไลน์
>
> **`presence` ไม่ส่งเวลา "เห็นล่าสุด" มาด้วยโดยตั้งใจ** — คนรับ event เห็นอยู่แล้วว่าอีกฝั่งเพิ่งหลุดตอนนี้
> ให้หน้าเว็บจับเวลาด้วยนาฬิกาตัวเอง จะได้ไม่เอาเวลาจาก Node ไปปนกับเวลาจาก MySQL (คนละ timezone ได้)
>
> **ทุก event เช็คสิทธิ์ใหม่ทุกครั้งด้วย `checkAccess()`** — ไม่ได้เชื่อว่า "ต่อ socket ติดแล้ว = คุยกับใครก็ได้"

### ⚠️ ข้อจำกัด
ทะเบียน "ใครออนไลน์" อยู่ใน **RAM ของโปรเซส** → ใช้ได้กับ **pm2 fork โปรเซสเดียว** เท่านั้น
ถ้าเปลี่ยนไป cluster ต้องย้ายไป Redis (ดู [02_ARCHITECTURE.md](02_ARCHITECTURE.md))

---

## 🩺 `GET /api/health`
```json
{ "ok": true, "service": "timecarehub" }
```
> ไม่ต้องล็อกอิน — ใช้เช็คว่า app ยังไม่ตาย
