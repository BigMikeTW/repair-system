const router = require('express').Router();
const { body, query: qv, validationResult } = require('express-validator');
const { query } = require('../../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// Generate case number
const generateCaseNumber = async () => {
  const year = new Date().getFullYear();
  const result = await query(
    `SELECT COUNT(*) FROM cases WHERE created_at >= date_trunc('year', NOW())`
  );
  const count = parseInt(result.rows[0].count) + 1;
  return `WO-${year}-${String(count).padStart(4, '0')}`;
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

// GET /api/cases - list with filters
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { status, urgency, type, assigned_to, owner_id, search, page = 1, limit = 20, date_from, date_to } = req.query;
  
  let conditions = [];
  let params = [];
  let i = 1;

  // Role-based filtering
  if (req.user.role === 'owner') {
    conditions.push(`c.owner_id = $${i++}`); params.push(req.user.id);
  } else if (req.user.role === 'engineer') {
    conditions.push(`c.assigned_engineer_id = $${i++}`); params.push(req.user.id);
  }

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

  const countResult = await query(
    `SELECT COUNT(*) FROM cases c ${where}`, params
  );
  const total = parseInt(countResult.rows[0].count);

  const result = await query(`
    SELECT c.*,
      u1.name as engineer_name,
      u2.name as assigned_by_name
    FROM cases c
    LEFT JOIN users u1 ON c.assigned_engineer_id = u1.id
    LEFT JOIN users u2 ON c.assigned_by = u2.id
    ${where}
    ORDER BY 
      CASE urgency WHEN 'emergency' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      c.created_at DESC
    LIMIT $${i++} OFFSET $${i++}
  `, [...params, parseInt(limit), offset]);

  res.json({
    cases: result.rows,
    total,
    page: parseInt(page),
    totalPages: Math.ceil(total / parseInt(limit))
  });
}));

// GET /api/cases/stats
router.get('/stats', authenticate, authorize('admin', 'customer_service'), asyncHandler(async (req, res) => {
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
    SELECT c.*,
      u1.name as engineer_name, u1.phone as engineer_phone,
      u2.name as assigned_by_name,
      u3.name as owner_user_name
    FROM cases c
    LEFT JOIN users u1 ON c.assigned_engineer_id = u1.id
    LEFT JOIN users u2 ON c.assigned_by = u2.id
    LEFT JOIN users u3 ON c.owner_id = u3.id
    WHERE c.id = $1
  `, [req.params.id]);

  if (!result.rows.length) return res.status(404).json({ error: '案件不存在' });
  const caseData = result.rows[0];

  // Check access
  if (req.user.role === 'owner' && caseData.owner_id !== req.user.id) {
    return res.status(403).json({ error: '無權限查看此案件' });
  }
  if (req.user.role === 'engineer' && caseData.assigned_engineer_id !== req.user.id) {
    return res.status(403).json({ error: '無權限查看此案件' });
  }

  // Get photos
  const photos = await query(
    `SELECT * FROM case_photos WHERE case_id=$1 ORDER BY phase, created_at`,
    [req.params.id]
  );

  // Get activities
  const activities = await query(
    `SELECT * FROM case_activities WHERE case_id=$1 ORDER BY created_at`,
    [req.params.id]
  );

  res.json({ ...caseData, photos: photos.rows, activities: activities.rows });
}));

// POST /api/cases - create case
router.post('/', authenticate, [
  body('title').trim().notEmpty().withMessage('標題必填'),
  body('description').trim().notEmpty().withMessage('描述必填'),
  body('case_type').notEmpty().withMessage('類型必填'),
  body('urgency').isIn(['emergency','normal','low']),
  body('location_address').notEmpty().withMessage('地址必填')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const {
    title, description, case_type, urgency, location_address,
    location_lat, location_lng, owner_name, owner_phone, owner_company, scheduled_start, scheduled_end
  } = req.body;

  const caseNumber = await generateCaseNumber();
  const ownerId = req.user.role === 'owner' ? req.user.id : null;

  const result = await query(`
    INSERT INTO cases (
      case_number, title, description, case_type, urgency, location_address,
      location_lat, location_lng, owner_id, owner_name, owner_phone, owner_company,
      scheduled_start, scheduled_end
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING *
  `, [caseNumber, title, description, case_type, urgency, location_address,
      location_lat || null, location_lng || null, ownerId,
      owner_name || req.user.name, owner_phone || req.user.phone, owner_company || null,
      scheduled_start || null, scheduled_end || null]);

  const newCase = result.rows[0];
  await addActivity(newCase.id, req.user.id, req.user.name, 'created', `案件 ${caseNumber} 已建立`);
  
  res.status(201).json(newCase);
}));

// PUT /api/cases/:id/status - change status
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

  const result = await query(
    `UPDATE cases SET status=$1 ${extraFields} WHERE id=$2 RETURNING *`, params
  );

  const statusLabels = {
    pending:'待受理', accepted:'已受理', dispatched:'派工中',
    in_progress:'施工中', signing:'簽收中', completed:'已完成', closed:'已結案', cancelled:'已取消'
  };

  await addActivity(req.params.id, req.user.id, req.user.name, 'status_changed',
    `案件狀態更新為：${statusLabels[status]}`, { status, notes });

  // Notify owner
  const c = caseResult.rows[0];
  if (c.owner_id) {
    await addNotification(c.owner_id, '案件狀態更新', `您的案件 ${c.case_number} 狀態已更新為：${statusLabels[status]}`, 'info', c.id);
  }

  res.json(result.rows[0]);
}));

// PUT /api/cases/:id/assign - dispatch engineer
router.put('/:id/assign', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const { engineer_id, scheduled_start, scheduled_end, notes } = req.body;
  if (!engineer_id) return res.status(400).json({ error: '請指定工程師' });

  const engResult = await query('SELECT * FROM users WHERE id=$1 AND role=$2', [engineer_id, 'engineer']);
  if (!engResult.rows.length) return res.status(404).json({ error: '工程師不存在' });

  const result = await query(`
    UPDATE cases SET
      assigned_engineer_id=$1, assigned_by=$2, assigned_at=NOW(),
      status='dispatched', scheduled_start=$3, scheduled_end=$4
    WHERE id=$5 RETURNING *
  `, [engineer_id, req.user.id, scheduled_start || null, scheduled_end || null, req.params.id]);

  if (!result.rows.length) return res.status(404).json({ error: '案件不存在' });

  await addActivity(req.params.id, req.user.id, req.user.name, 'assigned',
    `已指派工程師：${engResult.rows[0].name}`, { engineer_id, notes });

  // Notify engineer
  await addNotification(engineer_id, '新任務指派', `您有新的工程任務：${result.rows[0].case_number} - ${result.rows[0].title}`, 'info', req.params.id);

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

  res.json({ message: type === 'checkin' ? '到場打卡成功' : '離場打卡成功' });
}));

// POST /api/cases/:id/sign - owner signature
router.post('/:id/sign', authenticate, asyncHandler(async (req, res) => {
  const { signature, signed_by, completion_confirmed, notes } = req.body;
  if (!signature) return res.status(400).json({ error: '簽名不可為空' });

  const result = await query(`
    UPDATE cases SET
      owner_signature=$1, signed_at=NOW(), signed_by=$2,
      status='completed', completion_notes=$3
    WHERE id=$4 RETURNING *
  `, [signature, signed_by || req.user.name, notes, req.params.id]);

  if (!result.rows.length) return res.status(404).json({ error: '案件不存在' });

  await addActivity(req.params.id, req.user.id, req.user.name, 'signed',
    `業主 ${signed_by || req.user.name} 已簽名確認完工`);

  res.json(result.rows[0]);
}));

// GET /api/cases/:id/activities
router.get('/:id/activities', authenticate, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT * FROM case_activities WHERE case_id=$1 ORDER BY created_at`,
    [req.params.id]
  );
  res.json(result.rows);
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

module.exports = router;
