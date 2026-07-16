# 🖥️ ข้อมูลเครื่อง Server

**อัปเดตล่าสุด:** 2026-07-17

## การเข้าถึง

```
ssh server_live@192.168.1.35
```
- ✅ ตั้ง **SSH key** แล้ว (`~/.ssh/id_ed25519` บนเครื่อง Windows) — เข้าได้โดยไม่ถามรหัสผ่าน
- 🔴 **TODO ค้างมาตั้งแต่ 2026-07-14: รหัสผ่านหลุดในแชท AI → ต้อง `passwd` เปลี่ยนใหม่**
  (ทั้ง `server_live` และ `root` — รหัส root หลุดเพิ่มอีกตัววันที่ 2026-07-17)

---

## สเปคเครื่อง

| รายการ | ค่า |
|---|---|
| OS | Ubuntu 26.04 LTS |
| Kernel | 7.0.0-27-generic |
| RAM | 30 GB (ใช้ ~1.5 GB — ว่างเพียบ) |
| Disk | 915 GB (ใช้ 13 GB / เหลือ 856 GB) |
| Hostname | serverlive |

## ซอฟต์แวร์

| ตัว | เวอร์ชัน |
|---|---|
| Node.js | **v22.22.1** |
| npm | 9.2.0 |
| MySQL | **8.4.10** (127.0.0.1:3306) |
| nginx | 1.28.3 (port 80 + 443) |
| PHP | 8.5.4 (ไม่ได้ใช้กับ TimeCareHub) |
| git | 2.53.0 |
| pm2 | ✅ |

> 🎉 **ไม่ต้องติดตั้งอะไรเพิ่มเลย** ทุกอย่างที่ TimeCareHub ต้องใช้มีครบแล้ว

---

## 📁 TimeCareHub อยู่ตรงไหน

```
/home/server_live/timecarehub/              ← git clone จาก GitHub
├── 00_MEETING_01.md ... 07_ROADMAP.md      ← เอกสาร (อยู่ในนี้ด้วย เพราะ clone มาทั้ง repo)
├── README.md
└── TimecareHub/                            ← ⭐ ตัวแอพที่รันจริง
    ├── server.js                              pm2 รันไฟล์นี้
    ├── .env                                   🔴 ไม่อยู่บน git — มีที่นี่ที่เดียว
    ├── node_modules/                          ไม่อยู่บน git (npm install เอาคืนได้)
    ├── uploads/kyc/                           🔴 ไม่อยู่บน git — รูปบัตร ปชช.
    ├── db/ src/ public/
```

**ของสำรอง (อย่าเพิ่งลบ):**
```
/home/server_live/timecarehub-backup-2026-07-16-1948/   ← .env + uploads
/home/server_live/timecarehub.old/                       ← โฟลเดอร์เดิมก่อนย้ายมาใช้ git
```

| | |
|---|---|
| **git repo** | https://github.com/deweieiei/timecarehub_webapp (branch `main`, **public**) |
| pm2 process | `timecarehub-8091` (cwd = `~/timecarehub/TimecareHub`) |
| deploy | `cd ~/timecarehub && git pull && pm2 restart timecarehub-8091` |

> ⚠️ **path เปลี่ยนเมื่อ 2026-07-17** — เอกสารเก่าเขียนว่าแอพอยู่ที่ `~/timecarehub/server.js`
> ตอนนี้อยู่ที่ `~/timecarehub/TimecareHub/server.js` เพราะ clone repo มาทั้งก้อน

---

## nginx — เตรียมไว้ให้แล้ว ไม่ต้องแตะ

ไฟล์ `/etc/nginx/sites-enabled/timecarehub.com.conf`

```nginx
server {
    listen 80;
    server_name timecarehub.com www.timecarehub.com;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    server_name timecarehub.com www.timecarehub.com;
    include snippets/ssl-selfsigned.conf;

    location / {
        proxy_pass http://127.0.0.1:8091;    # ← Node app รันที่พอร์ตนี้
        include snippets/proxy-common.conf;
    }
}
```

| เรื่อง | ค่า |
|---|---|
| Port ที่ Node รัน | **8091** |
| โดเมน | timecarehub.com (SSL **self-signed** — เบราว์เซอร์จะเตือน กด "ไปต่อ" ได้) |

**เข้าเว็บได้ 2 ทาง:**
- **http://192.168.1.35:8091** ← ตรง ๆ แนะนำตอนเดโม
- https://timecarehub.com ← ต้องเพิ่มในไฟล์ hosts ของเครื่องที่เปิดก่อน
  (Windows: `C:\Windows\System32\drivers\etc\hosts` เปิดด้วยสิทธิ์ Administrator)
  ```
  192.168.1.35  timecarehub.com
  ```

---

## เว็บอื่นบนเครื่องนี้ (อย่าไปชน)

| โดเมน | Port | สถานะ |
|---|---|---|
| **timecarehub.com** | **8091** | ✅ **รันอยู่** (pm2: `timecarehub-8091`) — ของเรา |
| (monitor) | 8999 | ✅ รันอยู่ (pm2: `monitor8999`) จาก `~/project/server_monitor` |
| chaungthai.com | 8086 | ⚠️ nginx ชี้ไว้ แต่ยังไม่มีอะไรรัน (มีแต่โฟลเดอร์ `~/chaungthai`) |
| beingstory.com | ? | มีโฟลเดอร์ `~/beingstory` |

**พอร์ตที่ใช้จริง:** 22 (ssh), 80/443 (nginx), 3306 (mysql), **8091 (timecarehub)**, 8999 (monitor)

---

## ฐานข้อมูล

| | |
|---|---|
| DB | `timecarehub` |
| User | `timecarehub` (ไม่ใช่ root — เข้าได้เฉพาะ DB นี้) |
| รหัส | อยู่ใน `~/timecarehub/TimecareHub/.env` เท่านั้น |

```bash
mysql -u timecarehub -p timecarehub
```

> ✅ **แก้แล้ว** — เอกสารรุ่นแรกติดปัญหา "เข้า MySQL root ไม่ได้"
> ตอนนี้สร้าง DB + user เฉพาะโปรเจคเรียบร้อยแล้ว ไม่ต้องใช้ root อีก

---

## 🔴 ความเสี่ยงที่ยังค้างอยู่

| เรื่อง | สถานะ |
|---|---|
| รหัส SSH `server_live` + `root` หลุดในแชท AI | ❌ **ยังไม่เปลี่ยน** |
| repo เป็น public — ไฟล์นี้ (IP + ผังเครื่อง) อยู่บน GitHub สาธารณะ | ⚠️ พี่ดิวรับทราบและเลือกเอง |
| SSL เป็น self-signed | ⚠️ ยอมรับได้ตอนเดโม |
| port 8091 เปิดวง LAN ตรง ๆ | ⚠️ ตั้ง `HOST=127.0.0.1` ใน `.env` เพื่อปิด |
| ไม่มี rate limit ที่ login | ❌ |
| ไม่มี CSRF token | ❌ |

> 💡 **บรรเทาความเสี่ยง:** `192.168.1.35` เป็น IP วงในบ้าน คนจากอินเทอร์เน็ตยิงตรงไม่ถึง
> แต่ถ้าวันไหนเอาเครื่องออกเน็ต รายการข้างบนนี้ต้องปิดให้หมดก่อน
