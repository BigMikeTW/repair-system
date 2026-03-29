# 工程報修管理系統

專業工程報修管理平台，整合案件追蹤、派工管理、現場作業、財務管理於一體。

## 技術架構

```
repair-system/
├── backend/                  # Node.js + Express API
│   ├── src/
│   │   ├── index.js          # 主程式入口（含 Socket.io）
│   │   ├── routes/
│   │   │   ├── auth.js       # 登入/註冊/個人資料
│   │   │   ├── cases.js      # 案件 CRUD、派工、打卡、簽收
│   │   │   ├── photos.js     # 照片上傳管理
│   │   │   ├── chat.js       # 客服對談
│   │   │   ├── finance.js    # 報價單/請款單/PDF
│   │   │   ├── users.js      # 人員管理/通知
│   │   │   └── backup.js     # 備份/CSV 匯出
│   │   ├── middleware/
│   │   │   ├── auth.js       # JWT 認證
│   │   │   └── errorHandler.js
│   │   └── utils/
│   │       ├── migrate.js    # 資料庫建表
│   │       └── seed.js       # 初始資料
│   └── config/
│       └── database.js       # PostgreSQL 連線
│
├── frontend/                 # React 18 + Vite + Tailwind
│   └── src/
│       ├── App.jsx           # 路由設定
│       ├── pages/            # 各功能頁面
│       ├── components/       # 共用元件
│       ├── hooks/            # Socket.io hook
│       ├── store/            # Zustand 狀態管理
│       └── utils/            # API service / helpers
│
├── nginx/                    # Nginx 設定
├── docs/                     # 部署文件
├── docker-compose.yml        # Docker 部署
└── ecosystem.config.js       # PM2 設定
```

## 快速啟動（開發）

```bash
# 1. 啟動 PostgreSQL
docker run -d --name postgres -e POSTGRES_PASSWORD=dev123 -e POSTGRES_DB=repair_system -p 5432:5432 postgres:15

# 2. 後端
cd backend
cp .env.example .env    # 填入設定
npm install
node src/utils/migrate.js
node src/utils/seed.js
npm run dev             # 啟動於 :5000

# 3. 前端（另開終端）
cd frontend
npm install
npm run dev             # 啟動於 :3000，自動代理 API
```

## 雲端部署

詳見 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## 授權

MIT
