# TimeCareHub — MVP

แพลตฟอร์มจับคู่ **ผู้ว่าจ้าง** กับ **แคร์กิฟเวอร์ (ผู้ดูแลผู้สูงอายุ)**
MVP เป็นเว็บ (ยังไม่ทำแอพมือถือ) — ดูสเปคที่ตกลงกันได้ที่ `Desktop\Linux\timecarehub\00_MEETING_01.md`

---

## รันอยู่ที่ไหน

| | |
|---|---|
| เครื่อง | serverlive `192.168.1.35` |
| โฟลเดอร์ | `/home/server_live/timecarehub/` |
| Port | `8091` (nginx proxy มาให้แล้ว) |
| URL | https://timecarehub.com (ต้องชี้ DNS/hosts มาที่ .35) |
| pm2 | ชื่อ process = **`timecarehub-8091`** (ใส่เลขพอร์ตท้ายชื่อ เหมือน `monitor8999`)<br>`pm2 restart timecarehub-8091` / `pm2 logs timecarehub-8091` |

**ถ้าเปิดจากเครื่องอื่นใน LAN** — เพิ่มบรรทัดนี้ในไฟล์ hosts ของเครื่องนั้น
(Windows: `C:\Windows\System32\drivers\etc\hosts` — ต้องเปิดด้วยสิทธิ์ Administrator)
```
192.168.1.35  timecarehub.com
```
> SSL เป็น self-signed เบราว์เซอร์จะเตือน — กด "ไปต่อ" ได้

---

## Stack

```
Frontend : HTML + JS ธรรมดา (ไม่มี framework, ไม่ต้อง build)
Map      : Leaflet + OpenStreetMap (ฟรี ไม่ต้องใช้ API key)
Backend  : Node.js 22 + Express
Database : MySQL 8.4
Auth     : JWT ใน httpOnly cookie + bcrypt
```

## โครงไฟล์

```
timecarehub/
├── server.js              จุดเริ่มต้น (Express, port 8091)
├── .env                   รหัส DB + JWT secret (ไม่ commit)
├── db/
│   ├── schema.sql         ตารางทั้ง 6
│   └── migrate.js         npm run migrate
├── src/
│   ├── db.js              MySQL pool
│   ├── auth.js            JWT + middleware เช็คสิทธิ์
│   ├── geo.js             ⭐ ตรรกะเปิดเผยพิกัด 2 ระดับ
│   └── routes/            auth, jobs, kyc, chat, reviews
├── public/
│   ├── index.html         เข้าสู่ระบบ / สมัคร
│   ├── app.html           แอพหลัก
│   ├── admin.html         หน้าแอดมิน (อนุมัติ KYC)
│   └── js/app.js
└── uploads/kyc/           รูปบัตร ปชช. (นอก public/ เข้าตรงไม่ได้)
```

---

## ⭐ ตรรกะสำคัญ: พิกัด GPS 2 ระดับ (`src/geo.js`)

| สถานะแคร์กิฟเวอร์ | เห็นอะไร |
|---|---|
| ผ่าน KYC + แอดมินอนุมัติ | 📍 พิกัดเป๊ะ + ที่อยู่เต็ม + เบอร์โทร |
| ยังไม่ผ่าน / รออนุมัติ | ⭕ วงกลมรัศมี 800 ม. — ไม่เห็นที่อยู่ ไม่เห็นเบอร์ |

**ทำไม:** ที่อยู่บ้านที่มีผู้สูงอายุอยู่ลำพัง = ข้อมูลอ่อนไหว ไม่ควรเปิดให้ใครก็ได้ที่สมัครเข้ามาเห็น
และเป็นแรงจูงใจให้แคร์กิฟเวอร์รีบทำ KYC

**หมายเหตุทางเทคนิค:** จุดเบลอใช้วิธี "ปัดลงกริด ~1 กม." ไม่ใช่สุ่ม
เพราะถ้าสุ่มใหม่ทุกครั้ง คนไม่หวังดีกด refresh หลายรอบแล้วเอามาเฉลี่ย จะเดาตำแหน่งจริงได้
วิธีนี้พิกัดเดิมจะได้จุดเบลอเดิมเสมอ → เดาไม่ได้

---

## บัญชีทดสอบ (สร้างจาก smoke test)

| อีเมล | รหัสผ่าน | บทบาท |
|---|---|---|
| emp@test.com | password123 | ผู้ว่าจ้าง + **แอดมิน** |
| cg@test.com | password123 | แคร์กิฟเวอร์ (ผ่าน KYC แล้ว) |

> ⚠️ **ก่อนเอาไปโชว์จริง ลบบัญชีทดสอบทิ้ง**
> ```sql
> DELETE FROM users WHERE email IN ('emp@test.com','cg@test.com');
> ```

**ตั้งบัญชีตัวเองเป็นแอดมิน:**
```bash
mysql -u timecarehub -p timecarehub -e "UPDATE users SET is_admin=1 WHERE email='อีเมลของคุณ';"
```

---

## ฟีเจอร์ที่มีใน MVP

- ✅ สมัคร / เข้าสู่ระบบ (อีเมล + รหัสผ่าน)
- ✅ 1 บัญชี สลับ 2 บทบาทได้ (ปุ่มบนหัวเว็บ)
- ✅ KYC — อัปบัตร ปชช. + เซลฟี่ → แอดมินอนุมัติ
- ✅ โพสงาน + ปักหมุด GPS บนแผนที่
- ✅ หางานตามรัศมี (5/10/20/50 กม.)
- ✅ หลายคนกดขอรับงานได้ → ผู้ว่าจ้างดูดาว/โปรไฟล์ แล้วเลือก 1 คน
- ✅ แชท (polling ทุก 3 วิ)
- ✅ ปิดงาน + ให้ดาว 1-5 → คะแนนเฉลี่ยอัปเดตอัตโนมัติ
- ✅ หน้าแอดมิน — คิว KYC

## ยังไม่มี (คุยกันแล้วว่าไว้ทีหลัง)

- ❌ จ่ายเงินในระบบ / escrow — MVP จ่ายกันเองนอกแอพ
- ❌ Push notification
- ❌ Flutter app
- ❌ ระบบตั๋ว / โมเดลรายได้

---

## แก้โค้ดแล้ว deploy ใหม่

```powershell
# จากเครื่อง Windows
scp -r public src db server.js package.json server_live@192.168.1.35:~/timecarehub/
ssh server_live@192.168.1.35 "pm2 restart timecarehub-8091"
```
