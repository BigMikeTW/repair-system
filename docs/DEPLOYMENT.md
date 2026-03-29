# 工程報修管理系統 - 部署指南

## 系統架構
- **前端**：React 18 + Vite + Tailwind CSS
- **後端**：Node.js + Express + Socket.io
- **資料庫**：PostgreSQL 15
- **Web 伺服器**：Nginx
- **部署方式**：Docker Compose（推薦）或 PM2（直接部署）

---

## 方式一：Docker Compose 部署（推薦）

### 環境需求
- Docker >= 24
- Docker Compose >= 2.x
- 雲端伺服器（4 核 / 4GB RAM 以上）
- 已指向伺服器的域名（可選，建議用於 HTTPS）

### 步驟

#### 1. 上傳專案至伺服器
```bash
# 方式A：直接複製
scp -r repair-system/ user@your-server:/var/www/

# 方式B：Git
git clone https://github.com/yourrepo/repair-system.git /var/www/repair-system
```

#### 2. 設定環境變數
```bash
cd /var/www/repair-system
cp backend/.env.example .env
nano .env
```

必填項目：
```
DB_PASSWORD=請設定強密碼
JWT_SECRET=請設定至少32字元的隨機字串
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=Admin@123456
FRONTEND_URL=https://yourdomain.com
```

#### 3. 啟動服務
```bash
cd /var/www/repair-system
docker compose up -d

# 查看啟動日誌
docker compose logs -f

# 執行資料庫初始化
docker compose exec backend node src/utils/migrate.js
docker compose exec backend node src/utils/seed.js
```

#### 4. 設定 HTTPS（使用 Let's Encrypt）
```bash
# 安裝 certbot
apt install certbot python3-certbot-nginx -y

# 申請憑證
certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# 使用正式 nginx 設定（含 SSL）
cp nginx/repair-system.conf /etc/nginx/sites-available/repair-system
# 修改 nginx/repair-system.conf 中的 yourdomain.com
ln -s /etc/nginx/sites-available/repair-system /etc/nginx/sites-enabled/
nginx -t && nginx -s reload
```

#### 5. 驗證部署
```bash
curl http://yourdomain.com/api/health
# 應回傳：{"status":"ok","timestamp":"..."}
```

---

## 方式二：PM2 直接部署（VPS 無 Docker）

### 環境需求
```bash
# 安裝 Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 安裝 PostgreSQL
apt install -y postgresql postgresql-contrib

# 安裝 PM2
npm install -g pm2

# 安裝 Nginx
apt install -y nginx
```

### 步驟

#### 1. 設定 PostgreSQL
```bash
sudo -u postgres psql
CREATE DATABASE repair_system;
CREATE USER repair_admin WITH ENCRYPTED PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE repair_system TO repair_admin;
\c repair_system
GRANT ALL ON SCHEMA public TO repair_admin;
\q
```

#### 2. 安裝後端依賴並初始化
```bash
cd /var/www/repair-system/backend
cp ../.env.example .env
# 編輯 .env 填入正確設定
nano .env

npm install
node src/utils/migrate.js
node src/utils/seed.js
```

#### 3. 建置前端
```bash
cd /var/www/repair-system/frontend
npm install
npm run build
# 產生 dist/ 目錄
```

#### 4. 啟動後端
```bash
cd /var/www/repair-system
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # 設定開機自動啟動（依提示執行輸出的指令）
```

#### 5. 設定 Nginx
```bash
# 修改設定中的 yourdomain.com 為實際域名或伺服器 IP
cp /var/www/repair-system/nginx/repair-system.conf /etc/nginx/sites-available/repair-system

# 如果無 HTTPS（測試用），使用簡易設定：
cat > /etc/nginx/sites-available/repair-system << 'EOF'
server {
    listen 80;
    server_name _;
    client_max_body_size 20M;
    root /var/www/repair-system/frontend/dist;

    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    location /socket.io/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    location /uploads/ {
        proxy_pass http://localhost:5000;
    }
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

ln -s /etc/nginx/sites-available/repair-system /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
```

---

## 常用管理指令

```bash
# 查看後端狀態
pm2 status
pm2 logs repair-system-api

# 重啟後端
pm2 restart repair-system-api

# 更新程式後重部署
cd /var/www/repair-system
git pull
cd frontend && npm run build
pm2 restart repair-system-api

# 手動備份資料庫
docker compose exec backend node src/utils/migrate.js
# 或 PM2:
node /var/www/repair-system/backend/src/utils/migrate.js

# 查看 Nginx 日誌
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

---

## 預設帳號

| 角色 | Email | 密碼 |
|------|-------|------|
| 系統管理員 | admin@repairsystem.com | Admin@123456 |
| 工程師 | chang@repairsystem.com | Engineer@123 |
| 工程師 | lee@repairsystem.com | Engineer@123 |
| 客服 | cs@repairsystem.com | Service@123 |
| 業主 | owner@tsmc.com | Owner@123 |

> ⚠️ 正式上線前請務必更改所有預設密碼！

---

## 功能模組說明

| 功能 | 角色 | 說明 |
|------|------|------|
| 業主自助報修 | 業主 | 線上提交報修、追蹤進度 |
| 案件管理 | 管理員/客服 | 受理、搜尋、篩選、狀態更新 |
| 派工管理 | 管理員/客服 | 指派工程師、排班管理 |
| 現場作業 | 工程師 | GPS 打卡、施工前中後拍照 |
| 業主簽收 | 任何角色 | 電子簽名結案 |
| 線上客服 | 全部角色 | Socket.io 即時對談 |
| 報價單 | 管理員/客服 | 自動產生 PDF 報價單 |
| 請款單 | 管理員/客服 | 自動產生 PDF 結案請款單 |
| 收款記錄 | 管理員/客服 | 付款追蹤、逾期提醒 |
| 人員管理 | 管理員 | 帳號建立/停用、角色設定 |
| 備份匯出 | 管理員 | 自動備份、CSV 匯出 |
| 即時通知 | 全部 | 狀態變更推播通知 |

---

## 防火牆設定

```bash
# Ubuntu UFW
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable
```

---

## 常見問題

**Q: 無法上傳照片**
A: 確認 `uploads/` 目錄存在且有寫入權限：
```bash
mkdir -p /var/www/repair-system/backend/uploads
chown -R www-data:www-data /var/www/repair-system/backend/uploads
chmod 755 /var/www/repair-system/backend/uploads
```

**Q: Socket.io 連線失敗**
A: 確認 Nginx 已正確設定 WebSocket upgrade headers，參考 nginx 設定中的 `/socket.io/` 區塊。

**Q: PDF 產生失敗（中文顯示亂碼）**
A: PDFKit 內建字型不支援中文。如需完整中文 PDF，建議：
1. 在伺服器安裝 NotoSans CJK 字型
2. 在 `finance.js` 的 PDF 建立處加入：`doc.font('/path/to/NotoSansCJK-Regular.ttf')`
