const errorHandler = (err, req, res, next) => {
  console.error('Error:', err.stack || err.message);

  if (err.code === '23505') {
    return res.status(409).json({ error: '資料已存在，請勿重複新增' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: '關聯資料不存在' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: '檔案過大，請壓縮後再上傳' });
  }

  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? '伺服器錯誤，請稍後再試'
    : err.message || '未知錯誤';

  res.status(status).json({ error: message });
};

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { errorHandler, asyncHandler };
