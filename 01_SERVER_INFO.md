# 🖥️ ข้อมูลเครื่อง Server (สำรวจ 2026-07-14)

## การเข้าถึง

```
ssh server_live@192.168.1.35
```
- ✅ ตั้ง **SSH key** แล้ว (`~/.ssh/id_ed25519` บนเครื่อง Windows) — เข้าได้โดยไม่ถามรหัสผ่าน
- ⚠️ **TODO: รหัสผ่านเดิมหลุดในแชท → ต้อง `passwd` เปลี่ยนใหม่**

---

## สเปคเครื่อง

| รายการ | ค่า |
|---|---|
| OS | Ubuntu 26.04 LTS |
| Kernel | 7.0.0-27-generic |
| RAM | 30 GB (ใช้ 1.4 GB — ว่างเพียบ) |
| Disk | 915 GB (ใช้ 13 GB / เหลือ 856 GB) |
| Hostname | serverlive |

## ซอฟต์แวร์ที่ติดตั้งแล้ว

| ตัว | เวอร์ชัน | หมายเหตุ |
|---|---|---|
| Node.js | **v22.22.1** | ✅ พร้อมใช้ |
| npm | 9.2.0 | |
| MySQL | **8.4.10** | ✅ รันอยู่ที่ 127.0.0.1:3306 |
| nginx | 1.28.3 | ✅ รันอยู่ port 80 + 443 |
| PHP | 8.5.4 | (ไม่ได้ใช้กับ TimeCareHub) |
| git | 2.53.0 | |
| pm2 | ✅ | รัน `monitor8999` อยู่ตัวเดียว |

> 🎉 **ไม่ต้องติดตั้งอะไรเพิ่มเลย** ทุกอย่างที่ TimeCareHub ต้องใช้มีครบแล้ว

---

## 🔥 nginx เตรียมไว้ให้ TimeCareHub แล้ว!

ไฟล์ `/etc/nginx/sites-enabled/timecarehub.com.conf` มีอยู่แล้ว:

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
    # include snippets/phpmyadmin.conf;   # เปิดปิด phpMyAdmin

    location / {
        proxy_pass http://127.0.0.1:8091;    # ← Node app ต้องรันที่ port นี้
        include snippets/proxy-common.conf;
    }
}
```

### 👉 สิ่งที่บอกเรา

| เรื่อง | ค่า |
|---|---|
| **Port ที่ Node ต้องรัน** | **8091** (nginx proxy มาให้แล้ว) |
| โดเมน | timecarehub.com (SSL self-signed) |
| โฟลเดอร์โปรเจค | `/home/server_live/timecarehub/` — **มีแล้ว แต่ยังว่างเปล่า** |

---

## เว็บอื่นบนเครื่องนี้ (อย่าไปชน)

| โดเมน | Port | สถานะตอนนี้ |
|---|---|---|
| chaungthai.com | 8086 | ⚠️ nginx ชี้ไว้ แต่ **ยังไม่มีอะไรรัน** (มีแต่โฟลเดอร์ `~/chaungthai/chaungthai_web`) |
| beingstory.com | ? | มีโฟลเดอร์ `~/beingstory` |
| timecarehub.com | **8091** | ⚠️ nginx ชี้ไว้ แต่ยังไม่มีอะไรรัน — **นี่คือของเรา** |
| (monitor) | 8999 | ✅ รันอยู่ (pm2: `monitor8999`) |

**Port ที่ถูกใช้จริงตอนนี้:** 22 (ssh), 80/443 (nginx), 3306 (mysql), 8999 (monitor)
→ **8091 ว่าง พร้อมใช้** ✅

---

## ❓ ที่ยังติด

**เข้า MySQL ไม่ได้** — `mysql -u root` โดนปฏิเสธ (ต้องใช้รหัสผ่าน)

```
ERROR 1045 (28000): Access denied for user 'root'@'localhost' (using password: NO)
```

ต้องรู้ว่า:
1. root password ของ MySQL คืออะไร (หรือใช้ `sudo mysql` ได้ไหม)
2. จะสร้าง DB user แยกสำหรับ TimeCareHub เลยไหม (แนะนำ — ไม่ควรให้แอพใช้ root)

> **แนะนำ:** สร้าง user เฉพาะของโปรเจคนี้
> ```sql
> CREATE DATABASE timecarehub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
> CREATE USER 'timecare'@'localhost' IDENTIFIED BY '<รหัสใหม่>';
> GRANT ALL PRIVILEGES ON timecarehub.* TO 'timecare'@'localhost';
> FLUSH PRIVILEGES;
> ```
> (พี่ดิวรันเอง เก็บรหัสไว้ในไฟล์ `.env` ไม่ต้องบอกผมก็ได้)

---

## แผน deploy TimeCareHub

```
/home/server_live/timecarehub/
├── server.js            ← Express รันที่ port 8091
├── .env                 ← DB credentials (ไม่ commit)
├── package.json
├── db/schema.sql
├── routes/
└── public/              ← หน้าเว็บ (HTML/JS/CSS + Leaflet)

pm2 start server.js --name timecarehub
```
nginx ไม่ต้องแตะเลย เพราะเขาชี้มา 8091 ไว้ให้แล้ว
