const router = require('express').Router();
const PDFDocument = require('pdfkit');
const { body, validationResult } = require('express-validator');
const { query } = require('../../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { uploadSignature, uploadPdf, createCaseFolderStructure, isDropboxEnabled } = require('../utils/dropbox');
const { notifyOwner, notifyEngineer } = require('../utils/lineService');

const generateCaseNumber = async () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const result = await query(`SELECT COUNT(*) FROM cases WHERE DATE(created_at) = CURRENT_DATE`);
  const seq = String(parseInt(result.rows[0].count) + 1).padStart(3, '0');
  return `WOR${y}${m}${d}${seq}`;
};

const addActivity = async (caseId, actorId, actorName, action, description, metadata = null) => {
  await query(
    `INSERT INTO case_activities (case_id, actor_id, actor_name, action, description, metadata) VALUES ($1,$2,$3,$4,$5,$6)`,
    [caseId, actorId, actorName, action, description, metadata ? JSON.stringify(metadata) : null]
  );
};

const addNotification = async (userId, title, message, type, caseId) => {
  await query(
    `INSERT INTO notifications (user_id, title, message, type, case_id) VALUES ($1,$2,$3,$4,$5)`,
    [userId, title, message, type, caseId]
  );
};

// ── 產生結案 PDF Buffer ─────────────────────────────────────
const generateClosurePdf = async (c, notes) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).text('工 程 結 案 報 告', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).text(`案件編號：${c.case_number}    結案日期：${new Date(c.signed_at).toLocaleDateString('zh-TW')}`, { align: 'right' });
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // 基本資訊
    doc.fontSize(10);
    doc.text(`業主/公司：${c.owner_company || c.owner_name || '--'}`);
    doc.text(`聯絡人：${c.owner_name || '--'}    電話：${c.owner_phone || '--'}`);
    doc.text(`施工地點：${c.location_address || '--'}`);
    doc.text(`工程類型：${c.case_type || '--'}    緊急程度：${c.urgency || '--'}`);
    doc.text(`負責工程師：${c.engineer_name || '--'}`);
    doc.moveDown(0.5);

    // 時間記錄
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke(); doc.moveDown(0.3);
    doc.font('Helvetica-Bold').text('施工時間記錄');
    doc.font('Helvetica').fontSize(9);
    if (c.checkin_time) doc.text(`到場時間：${new Date(c.checkin_time).toLocaleString('zh-TW')}`);
    if (c.checkout_time) doc.text(`離場時間：${new Date(c.checkout_time).toLocaleString('zh-TW')}`);
    if (c.signed_at) doc.text(`結案時間：${new Date(c.signed_at).toLocaleString('zh-TW')}`);
    doc.moveDown(0.5);

    // 工程說明
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke(); doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(10).text('報修說明');
    doc.font('Helvetica').fontSize(9).text(c.description || '--');
    doc.moveDown(0.5);

    // 案件記錄
    if (notes && notes.length > 0) {
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke(); doc.moveDown(0.3);
      doc.font('Helvetica-Bold').fontSize(10).text('現場作業記錄');
      doc.font('Helvetica').fontSize(9);
      notes.forEach((n, i) => {
        doc.text(`${i + 1}. [${new Date(n.created_at).toLocaleString('zh-TW')}] ${n.author_name}：`);
        doc.text(`   ${n.content}`, { indent: 20 });
        doc.moveDown(0.3);
      });
    }

    // 業主簽收
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke(); doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(10).text('業主簽收確認');
    doc.font('Helvetica').fontSize(9);
    doc.text(`簽收人：${c.signed_by || '--'}`);
    doc.text(`簽收時間：${new Date(c.signed_at).toLocaleString('zh-TW')}`);
    if (c.completion_notes) doc.text(`備注：${c.completion_notes}`);

    // 嵌入簽名圖片
    if (c.owner_signature && c.owner_signature.startsWith('data:image')) {
      try {
        const base64Data = c.owner_signature.split(',')[1];
        const imgBuffer = Buffer.from(base64Data, 'base64');
        doc.moveDown(0.5);
        doc.text('業主簽名：');
        doc.image(imgBuffer, doc.x, doc.y, { width: 200, height: 60 });
        doc.moveDown(4);
      } catch (e) {
        doc.text('（簽名圖片無法顯示）');
      }
    }

    doc.end();
  });
};


// ── 公開 API（不需登入）─────────────────────────────────────

// POST /api/cases/public - 客戶自助報修
router.post('/public', asyncHandler(async (req, res) => {
  const { title, description, case_type, urgency, location_address,
    owner_name, owner_phone, owner_company } = req.body;

  if (!title || !description || !case_type || !location_address || !owner_name || !owner_phone) {
    return res.status(400).json({ error: '標題、說明、類型、地址、姓名、電話為必填' });
  }

  const caseNumber = await generateCaseNumber();
  const result = await query(`
    INSERT INTO cases (case_number, title, description, case_type, urgency,
      location_address, owner_name, owner_phone, owner_company, source)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'public') RETURNING *
  `, [caseNumber, title, description, case_type, urgency || 'normal',
      location_address, owner_name, owner_phone, owner_company || null]);

  const newCase = result.rows[0];
  await addActivity(newCase.id, null, owner_name, 'created', `客戶自助報修：${caseNumber} 已建立`);

  res.status(201).json({ case_number: newCase.case_number, id: newCase.id, status: newCase.status });
}));

// GET /api/cases/track/:caseNumber - 公開案件追蹤
router.get('/track/:caseNumber', asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT c.case_number, c.title, c.status, c.urgency, c.case_type,
      c.location_address, c.created_at, c.scheduled_start, c.signed_at,
      c.checkin_time, c.checkout_time,
      u.name as engineer_name
    FROM cases c
    LEFT JOIN users u ON c.assigned_engineer_id = u.id
    WHERE c.case_number = $1
  `, [req.params.caseNumber.toUpperCase()]);

  if (!result.rows.length) return res.status(404).json({ error: '案件不存在' });

  const activities = await query(`
    SELECT description, created_at, action FROM case_activities
    WHERE case_id = (SELECT id FROM cases WHERE case_number = $1)
    ORDER BY created_at DESC LIMIT 10
  `, [req.params.caseNumber.toUpperCase()]);

  res.json({ ...result.rows[0], activities: activities.rows });
}));

// GET /api/cases
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { status, urgency, type, assigned_to, owner_id, search, page = 1, limit = 20, date_from, date_to } = req.query;
  let conditions = [], params = [], i = 1;

  if (req.user.role === 'owner') { conditions.push(`c.owner_id = $${i++}`); params.push(req.user.id); }
  else if (req.user.role === 'engineer') { conditions.push(`c.assigned_engineer_id = $${i++}`); params.push(req.user.id); }

  if (status) { conditions.push(`c.status = $${i++}`); params.push(status); }
  if (urgency) { conditions.push(`c.urgency = $${i++}`); params.push(urgency); }
  if (type) { conditions.push(`c.case_type = $${i++}`); params.push(type); }
  if (assigned_to) { conditions.push(`c.assigned_engineer_id = $${i++}`); params.push(assigned_to); }
  if (owner_id) { conditions.push(`c.owner_id = $${i++}`); params.push(owner_id); }
  if (date_from) { conditions.push(`c.created_at >= $${i++}`); params.push(date_from); }
  if (date_to) { conditions.push(`c.created_at <= $${i++}`); params.push(date_to + 'T23:59:59'); }
  if (search) {
    conditions.push(`(c.case_number ILIKE $${i} OR c.title ILIKE $${i} OR c.owner_company ILIKE $${i} OR c.owner_name ILIKE $${i})`);
    params.push(`%${search}%`); i++;
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const countResult = await query(`SELECT COUNT(*) FROM cases c ${where}`, params);
  const total = parseInt(countResult.rows[0].count);

  const result = await query(`
    SELECT c.*, u1.name as engineer_name, u2.name as assigned_by_name
    FROM cases c
    LEFT JOIN users u1 ON c.assigned_engineer_id = u1.id
    LEFT JOIN users u2 ON c.assigned_by = u2.id
    ${where}
    ORDER BY CASE urgency WHEN 'emergency' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, c.created_at DESC
    LIMIT $${i++} OFFSET $${i++}
  `, [...params, parseInt(limit), offset]);

  res.json({ cases: result.rows, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
}));

// GET /api/cases/stats
router.get('/stats', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending') AS pending,
      COUNT(*) FILTER (WHERE status = 'accepted') AS accepted,
      COUNT(*) FILTER (WHERE status = 'dispatched') AS dispatched,
      COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
      COUNT(*) FILTER (WHERE status = 'signing') AS signing,
      COUNT(*) FILTER (WHERE status = 'completed' OR status = 'closed') AS completed,
      COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW())) AS this_month,
      COUNT(*) FILTER (WHERE urgency = 'emergency' AND status NOT IN ('completed','closed','cancelled')) AS emergency_active
    FROM cases
  `);
  res.json(result.rows[0]);
}));

// GET /api/cases/:id
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT c.*, u1.name as engineer_name, u1.phone as engineer_phone,
      u2.name as assigned_by_name, u3.name as owner_user_name
    FROM cases c
    LEFT JOIN users u1 ON c.assigned_engineer_id = u1.id
    LEFT JOIN users u2 ON c.assigned_by = u2.id
    LEFT JOIN users u3 ON c.owner_id = u3.id
    WHERE c.id = $1
  `, [req.params.id]);

  if (!result.rows.length) return res.status(404).json({ error: '案件不存在' });
  const caseData = result.rows[0];

  if (req.user.role === 'owner' && caseData.owner_id !== req.user.id) return res.status(403).json({ error: '無權限' });
  if (req.user.role === 'engineer' && caseData.assigned_engineer_id !== req.user.id) return res.status(403).json({ error: '無權限' });

  const [photos, activities] = await Promise.all([
    query(`SELECT * FROM case_photos WHERE case_id=$1 ORDER BY phase, created_at`, [req.params.id]),
    query(`SELECT * FROM case_activities WHERE case_id=$1 ORDER BY created_at`, [req.params.id]),
  ]);

  res.json({ ...caseData, photos: photos.rows, activities: activities.rows });
}));

// POST /api/cases
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { title, description, case_type, urgency, location_address, location_lat, location_lng,
    owner_name, owner_phone, owner_company, scheduled_start, scheduled_end } = req.body;

  if (!title || !description || !case_type || !location_address) {
    return res.status(400).json({ error: '標題、說明、類型、地址為必填' });
  }

  const caseNumber = await generateCaseNumber();
  const ownerId = req.user.role === 'owner' ? req.user.id : null;

  const result = await query(`
    INSERT INTO cases (case_number, title, description, case_type, urgency, location_address,
      location_lat, location_lng, owner_id, owner_name, owner_phone, owner_company, scheduled_start, scheduled_end)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *
  `, [caseNumber, title, description, case_type, urgency || 'normal', location_address,
      location_lat || null, location_lng || null, ownerId,
      owner_name || req.user.name, owner_phone || req.user.phone, owner_company || null,
      scheduled_start || null, scheduled_end || null]);

  const newCase = result.rows[0];
  await addActivity(newCase.id, req.user.id, req.user.name, 'created', `案件 ${caseNumber} 已建立`);

  // 在 Dropbox 預先建立案件資料夾（非同步）
  if (isDropboxEnabled()) {
    setImmediate(async () => {
      try {
        const { caseFolder } = await createCaseFolderStructure(caseNumber);
        await query(`UPDATE cases SET drive_folder_id=$1 WHERE id=$2`, [caseFolder, newCase.id]);
        console.log(`✅ Dropbox folder created for ${caseNumber}`);
      } catch (err) {
        console.error('Dropbox folder creation error:', err.message);
      }
    });
  }

  res.status(201).json(newCase);
}));

// PUT /api/cases/:id/status
router.put('/:id/status', authenticate, authorize('admin','customer_service','engineer'), asyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  const validStatuses = ['pending','accepted','dispatched','in_progress','signing','completed','closed','cancelled'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: '無效狀態' });

  const caseResult = await query('SELECT * FROM cases WHERE id=$1', [req.params.id]);
  if (!caseResult.rows.length) return res.status(404).json({ error: '案件不存在' });

  let extraFields = '';
  const params = [status, req.params.id];
  if (status === 'in_progress') extraFields = ', actual_start = NOW()';
  if (status === 'completed' || status === 'signing') extraFields = ', actual_end = NOW()';

  const result = await query(`UPDATE cases SET status=$1 ${extraFields} WHERE id=$2 RETURNING *`, params);
  const statusLabels = {
    pending:'待受理', accepted:'已受理', dispatched:'派工中',
    in_progress:'施工中', signing:'簽收中', completed:'已完成', closed:'已結案', cancelled:'已取消'
  };

  await addActivity(req.params.id, req.user.id, req.user.name, 'status_changed',
    `案件狀態更新為：${statusLabels[status]}`, { status, notes });

  const c = caseResult.rows[0];
  if (c.owner_id) {
    await addNotification(c.owner_id, '案件狀態更新',
      `您的案件 ${c.case_number} 狀態已更新為：${statusLabels[status]}`, 'info', c.id);
  }

  res.json(result.rows[0]);
}));

// PUT /api/cases/:id/assign
router.put('/:id/assign', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const { engineer_id, scheduled_start, scheduled_end, notes } = req.body;
  if (!engineer_id) return res.status(400).json({ error: '請指定工程師' });

  const engResult = await query('SELECT * FROM users WHERE id=$1 AND role=$2', [engineer_id, 'engineer']);
  if (!engResult.rows.length) return res.status(404).json({ error: '工程師不存在' });

  const result = await query(`
    UPDATE cases SET assigned_engineer_id=$1, assigned_by=$2, assigned_at=NOW(),
      status='dispatched', scheduled_start=$3, scheduled_end=$4
    WHERE id=$5 RETURNING *
  `, [engineer_id, req.user.id, scheduled_start || null, scheduled_end || null, req.params.id]);

  if (!result.rows.length) return res.status(404).json({ error: '案件不存在' });

  await addActivity(req.params.id, req.user.id, req.user.name, 'assigned',
    `已指派工程師：${engResult.rows[0].name}`, { engineer_id, notes });
  await addNotification(engineer_id, '新任務指派',
    `您有新的工程任務：${result.rows[0].case_number} - ${result.rows[0].title}`, 'info', req.params.id);

  // LINE 通知：推播給業主和工程師
  setImmediate(async () => {
    try {
      const caseDetail = await query(`
        SELECT c.*, u.name as engineer_name, u.line_user_id as engineer_line_id,
          ow.line_user_id as owner_line_id
        FROM cases c
        LEFT JOIN users u ON c.assigned_engineer_id = u.id
        LEFT JOIN users ow ON c.owner_id = ow.id
        WHERE c.id = $1
      `, [req.params.id]);
      const cd = caseDetail.rows[0];
      if (cd) {
        await notifyOwner({ ...cd, owner_line_id: cd.owner_line_id }, 'dispatched');
        if (cd.engineer_line_id) {
          await notifyEngineer(cd, cd.engineer_line_id, cd.engineer_name);
        }
      }
    } catch(e) { console.error('LINE notify error:', e.message); }
  });

  res.json(result.rows[0]);
}));

// POST /api/cases/:id/checkin
router.post('/:id/checkin', authenticate, authorize('engineer'), asyncHandler(async (req, res) => {
  const { type, latitude, longitude, address, notes } = req.body;
  if (!['checkin','checkout'].includes(type)) return res.status(400).json({ error: '無效打卡類型' });

  await query(`
    INSERT INTO checkin_logs (case_id, engineer_id, type, latitude, longitude, address, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
  `, [req.params.id, req.user.id, type, latitude, longitude, address, notes]);

  const field = type === 'checkin'
    ? `checkin_time=NOW(), checkin_lat=$1, checkin_lng=$2, status='in_progress'`
    : `checkout_time=NOW(), checkout_lat=$1, checkout_lng=$2`;

  await query(`UPDATE cases SET ${field} WHERE id=$3`, [latitude, longitude, req.params.id]);

  await addActivity(req.params.id, req.user.id, req.user.name,
    type === 'checkin' ? 'checked_in' : 'checked_out',
    type === 'checkin' ? `工程師 ${req.user.name} 已到場打卡` : `工程師 ${req.user.name} 已離場打卡`,
    { latitude, longitude, address }
  );

  // LINE 通知業主：工程師到場
  if (type === 'checkin') {
    setImmediate(async () => {
      try {
        const cd = await query(`
          SELECT c.*, u.name as engineer_name, ow.line_user_id as owner_line_id
          FROM cases c LEFT JOIN users u ON c.assigned_engineer_id=u.id
          LEFT JOIN users ow ON c.owner_id=ow.id WHERE c.id=$1
        `, [req.params.id]);
        if (cd.rows[0]?.owner_line_id) await notifyOwner(cd.rows[0], 'in_progress');
      } catch(e) { console.error('LINE checkin notify error:', e.message); }
    });
  }

  res.json({ message: type === 'checkin' ? '到場打卡成功' : '離場打卡成功' });
}));

// POST /api/cases/:id/sign - 業主簽收（含自動 PDF 產生和 Drive 上傳）
router.post('/:id/sign', authenticate, asyncHandler(async (req, res) => {
  const { signature, signed_by, completion_confirmed, notes } = req.body;
  if (!signature) return res.status(400).json({ error: '簽名不可為空' });
  if (!signed_by?.trim()) return res.status(400).json({ error: '請填寫簽收人姓名' });

  // 更新案件
  const result = await query(`
    UPDATE cases SET owner_signature=$1, signed_at=NOW(), signed_by=$2,
      status='completed', completion_notes=$3
    WHERE id=$4 RETURNING *
  `, [signature, signed_by.trim(), notes, req.params.id]);

  if (!result.rows.length) return res.status(404).json({ error: '案件不存在' });
  const c = result.rows[0];

  await addActivity(req.params.id, req.user.id, req.user.name, 'signed',
    `業主 ${signed_by.trim()} 已簽名確認完工`);

  // LINE 通知業主：工程完成
  setImmediate(async () => {
    try {
      const cd = await query(`
        SELECT c.*, u.name as engineer_name, ow.line_user_id as owner_line_id
        FROM cases c LEFT JOIN users u ON c.assigned_engineer_id=u.id
        LEFT JOIN users ow ON c.owner_id=ow.id WHERE c.id=$1
      `, [req.params.id]);
      if (cd.rows[0]?.owner_line_id) await notifyOwner(cd.rows[0], 'completed');
    } catch(e) { console.error('LINE sign notify error:', e.message); }
  });

  // 非同步：上傳簽名圖片和 PDF 到 Dropbox
  if (isDropboxEnabled()) {
    setImmediate(async () => {
      try {
        const caseDetail = await query(`
          SELECT c.*, u.name as engineer_name FROM cases c
          LEFT JOIN users u ON c.assigned_engineer_id = u.id WHERE c.id = $1
        `, [req.params.id]);
        const caseData = caseDetail.rows[0];

        // 1. 上傳簽名圖片
        const sigFile = await uploadSignature(caseData.case_number, signature);
        await query(`UPDATE cases SET signature_drive_link=$1 WHERE id=$2`,
          [sigFile.shareUrl, req.params.id]);

        // 2. 取得案件記錄
        const notesResult = await query(`
          SELECT cn.*, u.name as author_name FROM case_notes cn
          LEFT JOIN users u ON cn.author_id = u.id WHERE cn.case_id=$1 ORDER BY cn.created_at
        `, [req.params.id]);

        // 3. 產生 PDF
        const pdfBuffer = await generateClosurePdf(caseData, notesResult.rows);
        const pdfFileName = `結案報告_${caseData.case_number}_${new Date().toISOString().slice(0,10)}.pdf`;

        // 4. 上傳 PDF 到 Dropbox
        const pdfFile = await uploadPdf(caseData.case_number, pdfBuffer, pdfFileName);
        await query(`UPDATE cases SET drive_pdf_link=$1 WHERE id=$2`,
          [pdfFile.shareUrl, req.params.id]);

        console.log(`✅ Case ${caseData.case_number} closure PDF and signature uploaded to Dropbox`);
      } catch (err) {
        console.error('Dropbox closure upload error:', err.message);
      }
    });
  }

  res.json(result.rows[0]);
}));

// PUT /api/cases/:id
router.put('/:id', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const { title, description, case_type, urgency, location_address, owner_name, owner_phone, owner_company } = req.body;
  const result = await query(`
    UPDATE cases SET title=$1, description=$2, case_type=$3, urgency=$4,
      location_address=$5, owner_name=$6, owner_phone=$7, owner_company=$8
    WHERE id=$9 RETURNING *
  `, [title, description, case_type, urgency, location_address, owner_name, owner_phone, owner_company, req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: '案件不存在' });
  await addActivity(req.params.id, req.user.id, req.user.name, 'updated', '案件資料已更新');
  res.json(result.rows[0]);
}));

// GET /api/cases/:id/activities
router.get('/:id/activities', authenticate, asyncHandler(async (req, res) => {
  const result = await query(`SELECT * FROM case_activities WHERE case_id=$1 ORDER BY created_at`, [req.params.id]);
  res.json(result.rows);
}));

// DELETE /api/cases/:id - 刪除案件（受權限管制）
router.delete('/:id', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const caseResult = await query('SELECT * FROM cases WHERE id=$1', [req.params.id]);
  if (!caseResult.rows.length) return res.status(404).json({ error: '案件不存在' });

  // 只有 admin 可刪除已派工/進行中案件，customer_service 只能刪除 pending/accepted
  const c = caseResult.rows[0];
  const restrictedStatuses = ['dispatched','in_progress','signing','completed','closed'];
  if (req.user.role === 'customer_service' && restrictedStatuses.includes(c.status)) {
    return res.status(403).json({ error: '無法刪除已派工或進行中的案件，請聯絡管理員' });
  }

  await query('DELETE FROM case_activities WHERE case_id=$1', [req.params.id]);
  await query('DELETE FROM case_notes WHERE case_id=$1', [req.params.id]);
  await query('DELETE FROM notifications WHERE case_id=$1', [req.params.id]);
  await query('DELETE FROM cases WHERE id=$1', [req.params.id]);

  res.json({ message: '案件已刪除', case_number: c.case_number });
}));

// PUT /api/cases/:id/cancel-dispatch - 取消派工
router.put('/:id/cancel-dispatch', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const caseResult = await query('SELECT * FROM cases WHERE id=$1', [req.params.id]);
  if (!caseResult.rows.length) return res.status(404).json({ error: '案件不存在' });
  if (caseResult.rows[0].status !== 'dispatched') return res.status(400).json({ error: '只能取消派工中的案件' });

  const result = await query(`
    UPDATE cases SET status='accepted', assigned_engineer_id=NULL, assigned_by=NULL,
      assigned_at=NULL, scheduled_start=NULL, scheduled_end=NULL
    WHERE id=$1 RETURNING *
  `, [req.params.id]);

  await addActivity(req.params.id, req.user.id, req.user.name, 'dispatch_cancelled',
    `派工已取消${reason ? '：' + reason : ''}`, { reason });

  // 通知原工程師
  if (caseResult.rows[0].assigned_engineer_id) {
    await addNotification(caseResult.rows[0].assigned_engineer_id, '派工已取消',
      `案件 ${caseResult.rows[0].case_number} 的派工已被取消`, 'warning', req.params.id);
  }

  res.json(result.rows[0]);
}));

// PUT /api/cases/:id/reassign - 派工變更（重新指派）
router.put('/:id/reassign', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const { engineer_id, scheduled_start, scheduled_end, notes, reason } = req.body;
  if (!engineer_id) return res.status(400).json({ error: '請指定工程師' });

  const caseResult = await query('SELECT * FROM cases WHERE id=$1', [req.params.id]);
  if (!caseResult.rows.length) return res.status(404).json({ error: '案件不存在' });

  const engResult = await query('SELECT * FROM users WHERE id=$1 AND role=$2', [engineer_id, 'engineer']);
  if (!engResult.rows.length) return res.status(404).json({ error: '工程師不存在' });

  const oldEngId = caseResult.rows[0].assigned_engineer_id;

  const result = await query(`
    UPDATE cases SET assigned_engineer_id=$1, assigned_by=$2, assigned_at=NOW(),
      status='dispatched', scheduled_start=$3, scheduled_end=$4
    WHERE id=$5 RETURNING *
  `, [engineer_id, req.user.id, scheduled_start || null, scheduled_end || null, req.params.id]);

  await addActivity(req.params.id, req.user.id, req.user.name, 'reassigned',
    `派工已變更，新指派工程師：${engResult.rows[0].name}${reason ? '（原因：' + reason + '）' : ''}`,
    { engineer_id, reason });

  // 通知原工程師
  if (oldEngId && oldEngId !== parseInt(engineer_id)) {
    await addNotification(oldEngId, '任務已重新指派',
      `案件 ${caseResult.rows[0].case_number} 已重新指派給其他工程師`, 'warning', req.params.id);
  }
  // 通知新工程師
  await addNotification(engineer_id, '新任務指派',
    `您有新的工程任務：${result.rows[0].case_number} - ${result.rows[0].title}`, 'info', req.params.id);

  res.json(result.rows[0]);
}));

module.exports = router;
