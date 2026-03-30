const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const stream = require('stream');

// ── 初始化 Google Drive 認證 ────────────────────────────────
let driveClient = null;

const getDriveClient = () => {
  if (driveClient) return driveClient;

  // 從環境變數讀取 Service Account 憑證
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  driveClient = google.drive({ version: 'v3', auth });
  return driveClient;
};

// ── 取得或建立資料夾 ─────────────────────────────────────────
const getOrCreateFolder = async (drive, folderName, parentId) => {
  // 先搜尋是否已存在
  const searchRes = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id, name)',
  });

  if (searchRes.data.files.length > 0) {
    return searchRes.data.files[0].id;
  }

  // 不存在則建立
  const createRes = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });

  return createRes.data.id;
};

// ── 建立案件完整資料夾結構 ───────────────────────────────────
// 結構：根目錄 / 案件編號 / 子資料夾
const createCaseFolderStructure = async (caseNumber) => {
  const drive = getDriveClient();
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

  if (!rootFolderId) throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID 未設定');

  // 建立案件根資料夾
  const caseFolderId = await getOrCreateFolder(drive, caseNumber, rootFolderId);

  // 建立子資料夾
  const subFolders = {
    before:    await getOrCreateFolder(drive, '現場照片-施工前', caseFolderId),
    during:    await getOrCreateFolder(drive, '現場照片-施工中', caseFolderId),
    after:     await getOrCreateFolder(drive, '現場照片-施工後', caseFolderId),
    signature: await getOrCreateFolder(drive, '結案簽收照片',   caseFolderId),
    notes:     await getOrCreateFolder(drive, '案件記錄',       caseFolderId),
    pdf:       await getOrCreateFolder(drive, '結案文件PDF',    caseFolderId),
  };

  return { caseFolderId, subFolders };
};

// ── 上傳本地檔案到 Google Drive ─────────────────────────────
const uploadFileToDrive = async (localFilePath, fileName, folderId, mimeType = 'image/jpeg') => {
  const drive = getDriveClient();

  if (!fs.existsSync(localFilePath)) {
    throw new Error(`本地檔案不存在：${localFilePath}`);
  }

  const fileStream = fs.createReadStream(localFilePath);
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: fileStream,
    },
    fields: 'id, name, webViewLink, webContentLink',
  });

  return res.data;
};

// ── 上傳 Buffer/Base64 到 Google Drive ──────────────────────
const uploadBufferToDrive = async (buffer, fileName, folderId, mimeType = 'image/png') => {
  const drive = getDriveClient();

  const bufferStream = new stream.PassThrough();
  bufferStream.end(buffer);

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: bufferStream,
    },
    fields: 'id, name, webViewLink, webContentLink',
  });

  return res.data;
};

// ── 上傳 Base64 Data URL ────────────────────────────────────
const uploadBase64ToDrive = async (dataUrl, fileName, folderId) => {
  const matches = dataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid base64 data URL');

  const mimeType = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');

  return uploadBufferToDrive(buffer, fileName, folderId, mimeType);
};

// ── 同步案件所有照片到 Google Drive ─────────────────────────
const syncCasePhotosToDrive = async (caseNumber, photos) => {
  const { subFolders } = await createCaseFolderStructure(caseNumber);
  const results = [];

  for (const photo of photos) {
    try {
      const localPath = path.join(process.cwd(), photo.file_url);
      const folderId = subFolders[photo.phase] || subFolders.after;
      const fileName = `${photo.phase}_${photo.id}_${photo.file_name || path.basename(photo.file_url)}`;

      const ext = path.extname(photo.file_url).toLowerCase();
      const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
      const mimeType = mimeMap[ext] || 'image/jpeg';

      const driveFile = await uploadFileToDrive(localPath, fileName, folderId, mimeType);
      results.push({ photoId: photo.id, driveId: driveFile.id, driveLink: driveFile.webViewLink });
    } catch (err) {
      console.error(`Photo sync failed for ${photo.id}:`, err.message);
      results.push({ photoId: photo.id, error: err.message });
    }
  }

  return results;
};

// ── 上傳簽名圖片 ────────────────────────────────────────────
const uploadSignatureToDrive = async (caseNumber, signatureDataUrl, caseId) => {
  const { subFolders } = await createCaseFolderStructure(caseNumber);
  const fileName = `簽收確認_${caseNumber}_${new Date().toISOString().slice(0,10)}.png`;
  return uploadBase64ToDrive(signatureDataUrl, fileName, subFolders.signature);
};

// ── 上傳 PDF 到 Google Drive ────────────────────────────────
const uploadPdfToDrive = async (caseNumber, pdfBuffer, pdfFileName) => {
  const { subFolders } = await createCaseFolderStructure(caseNumber);
  return uploadBufferToDrive(pdfBuffer, pdfFileName, subFolders.pdf, 'application/pdf');
};

// ── 上傳案件記錄照片 ────────────────────────────────────────
const uploadNotePhotoToDrive = async (caseNumber, localFilePath, fileName) => {
  const { subFolders } = await createCaseFolderStructure(caseNumber);

  const ext = path.extname(localFilePath).toLowerCase();
  const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
  const mimeType = mimeMap[ext] || 'image/jpeg';

  return uploadFileToDrive(localFilePath, fileName, subFolders.notes, mimeType);
};

module.exports = {
  getDriveClient,
  getOrCreateFolder,
  createCaseFolderStructure,
  uploadFileToDrive,
  uploadBufferToDrive,
  uploadBase64ToDrive,
  syncCasePhotosToDrive,
  uploadSignatureToDrive,
  uploadPdfToDrive,
  uploadNotePhotoToDrive,
};
