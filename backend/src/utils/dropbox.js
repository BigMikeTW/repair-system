/**
 * Dropbox 工具模組（使用 Refresh Token，長期有效）
 * Railway 環境變數需要：
 *   DROPBOX_APP_KEY
 *   DROPBOX_APP_SECRET
 *   DROPBOX_REFRESH_TOKEN
 */

const https = require('https');
const path = require('path');
const fs = require('fs');

const BASE_FOLDER = '/工程報修系統';

// ── Access Token 快取（每次重啟或過期後自動換新） ────────────
let cachedAccessToken = null;
let tokenExpiresAt = 0;

const getAccessToken = () => {
  return new Promise((resolve, reject) => {
    const appKey = process.env.DROPBOX_APP_KEY;
    const appSecret = process.env.DROPBOX_APP_SECRET;
    const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;

    if (!appKey || !appSecret || !refreshToken) {
      return reject(new Error('Dropbox 環境變數未設定（需要 DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN）'));
    }

    // 若 token 仍有效（還有 5 分鐘以上），直接回傳
    if (cachedAccessToken && Date.now() < tokenExpiresAt - 300000) {
      return resolve(cachedAccessToken);
    }

    // 用 Refresh Token 換新的 Access Token
    const body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`;
    const creds = Buffer.from(`${appKey}:${appSecret}`).toString('base64');

    const options = {
      hostname: 'api.dropbox.com',
      path: '/oauth2/token',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.access_token) {
            cachedAccessToken = parsed.access_token;
            tokenExpiresAt = Date.now() + (parsed.expires_in || 14400) * 1000;
            console.log('✅ Dropbox access token refreshed');
            resolve(cachedAccessToken);
          } else {
            reject(new Error(parsed.error_description || parsed.error || 'Token refresh failed'));
          }
        } catch (e) {
          reject(new Error(`Token parse error: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
};

// ── 呼叫 Dropbox API ─────────────────────────────────────────
const dropboxRequest = async (endpoint, body, isUpload = false, buffer = null) => {
  const token = await getAccessToken();

  return new Promise((resolve, reject) => {
    const bodyStr = isUpload ? null : JSON.stringify(body);

    const options = {
      hostname: isUpload ? 'content.dropboxapi.com' : 'api.dropboxapi.com',
      path: `/2/${endpoint}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': isUpload ? 'application/octet-stream' : 'application/json',
      }
    };

    if (isUpload && body) {
      options.headers['Dropbox-API-Arg'] = JSON.stringify(body);
      if (buffer) options.headers['Content-Length'] = buffer.length;
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(parsed.error_summary || parsed.error || `HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Parse error: ${data}`));
        }
      });
    });

    req.on('error', reject);

    if (isUpload && buffer) {
      req.write(buffer);
    } else if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
};

// ── 建立資料夾（若已存在不報錯） ─────────────────────────────
const createFolder = async (folderPath) => {
  try {
    const result = await dropboxRequest('files/create_folder_v2', {
      path: folderPath,
      autorename: false
    });
    return result.metadata;
  } catch (err) {
    if (err.message && err.message.includes('path/conflict/folder')) {
      return { path_lower: folderPath.toLowerCase() };
    }
    throw err;
  }
};

// ── 取得公開分享連結 ─────────────────────────────────────────
const getShareLink = async (filePath) => {
  try {
    const result = await dropboxRequest('sharing/create_shared_link_with_settings', {
      path: filePath,
      settings: { requested_visibility: 'public', audience: 'public', access: 'viewer' }
    });
    // ?raw=1 讓圖片可以直接在 <img> 顯示
    return result.url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '');
  } catch (err) {
    // 連結已存在，改用 list 取得
    if (err.message && err.message.includes('shared_link_already_exists')) {
      const listResult = await dropboxRequest('sharing/list_shared_links', {
        path: filePath,
        direct_only: true
      });
      if (listResult.links && listResult.links.length > 0) {
        return listResult.links[0].url
          .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
          .replace('?dl=0', '');
      }
    }
    throw err;
  }
};

// ── 建立案件完整資料夾結構 ───────────────────────────────────
const createCaseFolderStructure = async (caseNumber) => {
  const caseFolder = `${BASE_FOLDER}/${caseNumber}`;

  // 依序建立，避免父資料夾不存在的問題
  await createFolder(BASE_FOLDER);
  await createFolder(caseFolder);

  const subFolders = {
    before:    `${caseFolder}/現場照片-施工前`,
    during:    `${caseFolder}/現場照片-施工中`,
    after:     `${caseFolder}/現場照片-施工後`,
    signature: `${caseFolder}/結案簽收照片`,
    notes:     `${caseFolder}/案件記錄`,
    pdf:       `${caseFolder}/結案文件PDF`,
  };

  // 並行建立子資料夾
  await Promise.all(Object.values(subFolders).map(p => createFolder(p)));
  return { caseFolder, subFolders };
};

// ── 上傳 Buffer 到 Dropbox ───────────────────────────────────
const uploadBuffer = async (buffer, dropboxPath) => {
  const result = await dropboxRequest('files/upload', {
    path: dropboxPath,
    mode: 'add',
    autorename: true,
    mute: false,
  }, true, buffer);

  const shareUrl = await getShareLink(result.path_lower);
  return { id: result.id, path: result.path_lower, shareUrl, name: result.name };
};

// ── 上傳施工照片 ─────────────────────────────────────────────
const uploadPhoto = async (buffer, fileName, phase, caseNumber) => {
  const { subFolders } = await createCaseFolderStructure(caseNumber);
  const folderMap = {
    before: subFolders.before,
    during: subFolders.during,
    after:  subFolders.after
  };
  const targetFolder = folderMap[phase] || subFolders.after;
  return uploadBuffer(buffer, `${targetFolder}/${fileName}`);
};

// ── 上傳 Base64 簽名圖片 ─────────────────────────────────────
const uploadSignature = async (caseNumber, signatureDataUrl) => {
  const matches = signatureDataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid base64 data URL');
  const buffer = Buffer.from(matches[2], 'base64');
  const { subFolders } = await createCaseFolderStructure(caseNumber);
  const fileName = `簽收確認_${caseNumber}_${new Date().toISOString().slice(0, 10)}.png`;
  return uploadBuffer(buffer, `${subFolders.signature}/${fileName}`);
};

// ── 上傳 PDF ─────────────────────────────────────────────────
const uploadPdf = async (caseNumber, pdfBuffer, pdfFileName) => {
  const { subFolders } = await createCaseFolderStructure(caseNumber);
  return uploadBuffer(pdfBuffer, `${subFolders.pdf}/${pdfFileName}`);
};

// ── 上傳案件記錄照片 ─────────────────────────────────────────
const uploadNotePhoto = async (caseNumber, buffer, fileName) => {
  const { subFolders } = await createCaseFolderStructure(caseNumber);
  return uploadBuffer(buffer, `${subFolders.notes}/${fileName}`);
};

// ── 確認 Dropbox 是否已設定 ──────────────────────────────────
const isDropboxEnabled = () => {
  const enabled = !!(
    process.env.DROPBOX_APP_KEY &&
    process.env.DROPBOX_APP_SECRET &&
    process.env.DROPBOX_REFRESH_TOKEN
  );
  if (!enabled) {
    if (!process.env.DROPBOX_APP_KEY) console.warn('Dropbox: DROPBOX_APP_KEY not set');
    if (!process.env.DROPBOX_APP_SECRET) console.warn('Dropbox: DROPBOX_APP_SECRET not set');
    if (!process.env.DROPBOX_REFRESH_TOKEN) console.warn('Dropbox: DROPBOX_REFRESH_TOKEN not set');
  }
  return enabled;
};

module.exports = {
  isDropboxEnabled,
  createCaseFolderStructure,
  uploadPhoto,
  uploadBuffer,
  uploadSignature,
  uploadPdf,
  uploadNotePhoto,
};
