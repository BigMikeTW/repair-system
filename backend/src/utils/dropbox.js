/**
 * Dropbox 工具模組
 * 取代原本的 googleDrive.js
 * 需要 Railway 環境變數：DROPBOX_ACCESS_TOKEN
 */

const https = require('https');
const path = require('path');
const fs = require('fs');
const stream = require('stream');

const BASE_FOLDER = '/工程報修系統';

// ── 呼叫 Dropbox API（通用） ─────────────────────────────────
const dropboxRequest = (endpoint, body, isUpload = false, buffer = null) => {
  return new Promise((resolve, reject) => {
    const token = process.env.DROPBOX_ACCESS_TOKEN;
    if (!token) return reject(new Error('DROPBOX_ACCESS_TOKEN not set'));

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
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(parsed.error_summary || parsed.error || `HTTP ${res.statusCode}`));
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
    const result = await dropboxRequest('files/create_folder_v2', { path: folderPath, autorename: false });
    return result.metadata;
  } catch (err) {
    // 已存在的錯誤忽略
    if (err.message && err.message.includes('path/conflict/folder')) return { path_lower: folderPath.toLowerCase() };
    throw err;
  }
};

// ── 取得檔案的公開分享連結 ───────────────────────────────────
const getShareLink = async (filePath) => {
  try {
    // 先嘗試建立新分享連結
    const result = await dropboxRequest('sharing/create_shared_link_with_settings', {
      path: filePath,
      settings: { requested_visibility: 'public', audience: 'public', access: 'viewer' }
    });
    // 把 ?dl=0 改成 ?raw=1 讓圖片可以直接顯示
    return result.url.replace('?dl=0', '?raw=1');
  } catch (err) {
    // 如果連結已存在，改用 list 取得
    if (err.message && err.message.includes('shared_link_already_exists')) {
      const listResult = await dropboxRequest('sharing/list_shared_links', { path: filePath, direct_only: true });
      if (listResult.links && listResult.links.length > 0) {
        return listResult.links[0].url.replace('?dl=0', '?raw=1');
      }
    }
    throw err;
  }
};

// ── 建立案件完整資料夾結構 ───────────────────────────────────
const createCaseFolderStructure = async (caseNumber) => {
  const caseFolder = `${BASE_FOLDER}/${caseNumber}`;
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

  await Promise.all(Object.values(subFolders).map(p => createFolder(p)));
  return { caseFolder, subFolders };
};

// ── 上傳 Buffer 到 Dropbox ───────────────────────────────────
const uploadBuffer = async (buffer, dropboxPath, mimeType = 'image/jpeg') => {
  const result = await dropboxRequest('files/upload', {
    path: dropboxPath,
    mode: 'add',
    autorename: true,
    mute: false,
  }, true, buffer);

  // 取得公開分享連結
  const shareUrl = await getShareLink(result.path_lower);
  return { id: result.id, path: result.path_lower, shareUrl, name: result.name };
};

// ── 上傳本地檔案到 Dropbox ───────────────────────────────────
const uploadFile = async (localFilePath, dropboxPath) => {
  if (!fs.existsSync(localFilePath)) throw new Error(`本地檔案不存在：${localFilePath}`);
  const buffer = fs.readFileSync(localFilePath);
  return uploadBuffer(buffer, dropboxPath);
};

// ── 上傳施工照片 ─────────────────────────────────────────────
const uploadPhoto = async (buffer, fileName, phase, caseNumber) => {
  const { subFolders } = await createCaseFolderStructure(caseNumber);
  const folderMap = { before: subFolders.before, during: subFolders.during, after: subFolders.after };
  const targetFolder = folderMap[phase] || subFolders.after;
  const dropboxPath = `${targetFolder}/${fileName}`;
  return uploadBuffer(buffer, dropboxPath);
};

// ── 上傳 Base64 簽名圖片 ─────────────────────────────────────
const uploadSignature = async (caseNumber, signatureDataUrl) => {
  const matches = signatureDataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid base64 data URL');
  const buffer = Buffer.from(matches[2], 'base64');
  const { subFolders } = await createCaseFolderStructure(caseNumber);
  const fileName = `簽收確認_${caseNumber}_${new Date().toISOString().slice(0,10)}.png`;
  const dropboxPath = `${subFolders.signature}/${fileName}`;
  return uploadBuffer(buffer, dropboxPath, 'image/png');
};

// ── 上傳 PDF ─────────────────────────────────────────────────
const uploadPdf = async (caseNumber, pdfBuffer, pdfFileName) => {
  const { subFolders } = await createCaseFolderStructure(caseNumber);
  const dropboxPath = `${subFolders.pdf}/${pdfFileName}`;
  return uploadBuffer(pdfBuffer, dropboxPath, 'application/pdf');
};

// ── 上傳案件記錄照片 ─────────────────────────────────────────
const uploadNotePhoto = async (caseNumber, buffer, fileName) => {
  const { subFolders } = await createCaseFolderStructure(caseNumber);
  const dropboxPath = `${subFolders.notes}/${fileName}`;
  return uploadBuffer(buffer, dropboxPath);
};

// ── 確認 Dropbox 是否已設定 ──────────────────────────────────
const isDropboxEnabled = () => !!process.env.DROPBOX_ACCESS_TOKEN;

module.exports = {
  isDropboxEnabled,
  createCaseFolderStructure,
  uploadPhoto,
  uploadFile,
  uploadBuffer,
  uploadSignature,
  uploadPdf,
  uploadNotePhoto,
};
