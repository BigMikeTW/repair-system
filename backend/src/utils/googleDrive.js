const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const stream = require('stream');

let driveClient = null;

const getDriveClient = () => {
  if (driveClient) return driveClient;
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  driveClient = google.drive({ version: 'v3', auth });
  return driveClient;
};

// ── 上傳後設為公開可讀 ───────────────────────────────────────
const makeFilePublic = async (drive, fileId) => {
  try {
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });
  } catch (e) {
    console.warn('⚠️ makeFilePublic failed:', e.message);
  }
};

const getOrCreateFolder = async (drive, folderName, parentId) => {
  const searchRes = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id, name)',
  });
  if (searchRes.data.files.length > 0) return searchRes.data.files[0].id;

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

const createCaseFolderStructure = async (caseNumber) => {
  const drive = getDriveClient();
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!rootFolderId) throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID 未設定');

  const caseFolderId = await getOrCreateFolder(drive, caseNumber, rootFolderId);
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

// ── 上傳本地檔案到 Google Drive（並設為公開） ───────────────
const uploadFileToDrive = async (localFilePath, fileName, folderId, mimeType = 'image/jpeg') => {
  const drive = getDriveClient();
  if (!fs.existsSync(localFilePath)) throw new Error(`本地檔案不存在：${localFilePath}`);

  const fileStream = fs.createReadStream(localFilePath);
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType, body: fileStream },
    fields: 'id, name, webViewLink, webContentLink',
  });

  await makeFilePublic(drive, res.data.id);
  return res.data;
};

// ── 上傳 Buffer 到 Google Drive（並設為公開） ───────────────
const uploadBufferToDrive = async (buffer, fileName, folderId, mimeType = 'image/jpeg') => {
  const drive = getDriveClient();

  const bufferStream = new stream.PassThrough();
  bufferStream.end(buffer);

  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType, body: bufferStream },
    fields: 'id, name, webViewLink, webContentLink',
  });

  await makeFilePublic(drive, res.data.id);
  return res.data;
};

const uploadBase64ToDrive = async (dataUrl, fileName, folderId) => {
  const matches = dataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid base64 data URL');
  const mimeType = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  return uploadBufferToDrive(buffer, fileName, folderId, mimeType);
};

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

const uploadSignatureToDrive = async (caseNumber, signatureDataUrl, caseId) => {
  const { subFolders } = await createCaseFolderStructure(caseNumber);
  const fileName = `簽收確認_${caseNumber}_${new Date().toISOString().slice(0,10)}.png`;
  return uploadBase64ToDrive(signatureDataUrl, fileName, subFolders.signature);
};

const uploadPdfToDrive = async (caseNumber, pdfBuffer, pdfFileName) => {
  const { subFolders } = await createCaseFolderStructure(caseNumber);
  return uploadBufferToDrive(pdfBuffer, pdfFileName, subFolders.pdf, 'application/pdf');
};

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
