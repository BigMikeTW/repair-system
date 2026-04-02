const router = require('express').Router();
const { query } = require('../../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// GET /api/case-types - 公開（報修填單用，只取啟用）
router.get('/', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT * FROM case_types WHERE is_active = true ORDER BY sort_order, name`
  );
  res.json(result.rows);
}));

// GET /api/case-types/all - 管理用（含停用，按 sort_order 排序）
router.get('/all', authenticate, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT * FROM case_types ORDER BY sort_order, name`
  );
  res.json(result.rows);
}));

// POST /api/case-types - 新增類型
router.post('/', authenticate, authorize('admin', 'customer_service'), asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: '類型名稱必填' });

  const exists = await query('SELECT id FROM case_types WHERE name = $1', [name.trim()]);
  if (exists.rows.length) return res.status(409).json({ error: '此類型名稱已存在' });

  // 取得目前最大 sort_order + 1
  const maxOrder = await query('SELECT COALESCE(MAX(sort_order), 0) as max FROM case_types');
  const sort_order = parseInt(maxOrder.rows[0].max) + 1;

  const result = await query(
    `INSERT INTO case_types (name, description, sort_order) VALUES ($1, $2, $3) RETURNING *`,
    [name.trim(), description || null, sort_order]
  );
  res.status(201).json(result.rows[0]);
}));

// PUT /api/case-types/reorder - 拖曳排序（項目13）
router.put('/reorder', authenticate, authorize('admin', 'customer_service'), asyncHandler(async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: '格式錯誤' });

  // 依照新順序更新 sort_order（1, 2, 3...）
  for (let i = 0; i < orderedIds.length; i++) {
    await query('UPDATE case_types SET sort_order = $1 WHERE id = $2', [i + 1, orderedIds[i]]);
  }
  res.json({ message: '排序已更新' });
}));

// PUT /api/case-types/:id - 修改類型（項目12：不再允許手動改排序值，排序由拖曳決定）
router.put('/:id', authenticate, authorize('admin', 'customer_service'), asyncHandler(async (req, res) => {
  const { name, description, is_active, sort_order } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: '類型名稱必填' });

  // 檢查名稱是否與其他類型重複
  const dup = await query('SELECT id FROM case_types WHERE name = $1 AND id != $2', [name.trim(), req.params.id]);
  if (dup.rows.length) return res.status(409).json({ error: '此類型名稱已存在' });

  const result = await query(
    `UPDATE case_types SET name=$1, description=$2, is_active=$3, sort_order=$4 WHERE id=$5 RETURNING *`,
    [name.trim(), description || null, is_active !== false, sort_order || 99, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: '類型不存在' });
  res.json(result.rows[0]);
}));

// DELETE /api/case-types/:id - 刪除/停用
router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const inUse = await query(
    'SELECT COUNT(*) FROM cases WHERE case_type = (SELECT name FROM case_types WHERE id=$1)',
    [req.params.id]
  );
  if (parseInt(inUse.rows[0].count) > 0) {
    await query('UPDATE case_types SET is_active=false WHERE id=$1', [req.params.id]);
    return res.json({ message: '此類型已有關聯案件，已設為停用（不刪除）' });
  }
  await query('DELETE FROM case_types WHERE id=$1', [req.params.id]);
  res.json({ message: '類型已刪除' });
}));

module.exports = router;
