const router = require('express').Router();
const { query } = require('../../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// GET /api/case-types - 取得所有案件類型（公開，報修填單需要）
router.get('/', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT * FROM case_types WHERE is_active = true ORDER BY sort_order, name`
  );
  res.json(result.rows);
}));

// POST /api/case-types - 新增類型（管理員/客服）
router.post('/', authenticate, authorize('admin', 'customer_service'), asyncHandler(async (req, res) => {
  const { name, description, sort_order } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '類型名稱必填' });

  const exists = await query('SELECT id FROM case_types WHERE name = $1', [name.trim()]);
  if (exists.rows.length) return res.status(409).json({ error: '此類型名稱已存在' });

  const result = await query(
    `INSERT INTO case_types (name, description, sort_order) VALUES ($1, $2, $3) RETURNING *`,
    [name.trim(), description || null, sort_order || 99]
  );
  res.status(201).json(result.rows[0]);
}));

// PUT /api/case-types/:id - 修改類型
router.put('/:id', authenticate, authorize('admin', 'customer_service'), asyncHandler(async (req, res) => {
  const { name, description, sort_order, is_active } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '類型名稱必填' });

  const result = await query(
    `UPDATE case_types SET name=$1, description=$2, sort_order=$3, is_active=$4 WHERE id=$5 RETURNING *`,
    [name.trim(), description || null, sort_order || 99, is_active !== false, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: '類型不存在' });
  res.json(result.rows[0]);
}));

// DELETE /api/case-types/:id - 停用類型（軟刪除）
router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const inUse = await query('SELECT COUNT(*) FROM cases WHERE case_type = (SELECT name FROM case_types WHERE id=$1)', [req.params.id]);
  if (parseInt(inUse.rows[0].count) > 0) {
    await query('UPDATE case_types SET is_active=false WHERE id=$1', [req.params.id]);
    return res.json({ message: '此類型已有關聯案件，已設為停用（不刪除）' });
  }
  await query('DELETE FROM case_types WHERE id=$1', [req.params.id]);
  res.json({ message: '類型已刪除' });
}));

module.exports = router;
