const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// CẤU HÌNH KẾT NỐI POSTGRESQL
const pool = new Pool({
  user: 'postgres.vgjohsviqqhunanohxeu',
  host: 'aws-0-ap-southeast-1.pooler.supabase.com',
  database: 'postgres',
  password: '@Dong301199@', // Cứ gõ thẳng mật khẩu thật vào đây giữa 2 dấu nháy đơn
  port: 6543,
  ssl: { rejectUnauthorized: false }
});
// Kiểm tra kết nối tới DB
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Lỗi kết nối PostgreSQL:', err.message);
  } else {
    console.log('✅ Đã kết nối thành công tới Database foodrescue_db!');
    release();
  }
});

// 1. API: Lấy danh sách deal (Buyer)
app.get('/api/deals', async (req, res) => {
  try {
    const query = `
      SELECT d.*, s.name AS store_name, s.address
      FROM deals d
      LEFT JOIN stores s ON d.store_id = s.id
      WHERE d.status = 'ACTIVE' AND d.quantity > 0 AND d.expired_at > NOW()
      ORDER BY d.id DESC;
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. API: Khách giữ chỗ món (Tạo order + Trừ số lượng)
app.post('/api/orders/reserve', async (req, res) => {
  const { deal_id, buyer_id } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const dealRes = await client.query(
      'SELECT quantity FROM deals WHERE id = $1 FOR UPDATE',
      [deal_id]
    );

    if (dealRes.rows.length === 0 || dealRes.rows[0].quantity <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Món này đã hết suất!' });
    }

    await client.query(
      'UPDATE deals SET quantity = quantity - 1 WHERE id = $1',
      [deal_id]
    );

    const pickupCode = Math.floor(100000 + Math.random() * 900000).toString();

    const orderRes = await client.query(
      'INSERT INTO orders (deal_id, buyer_id, pickup_code) VALUES ($1, $2, $3) RETURNING *',
      [deal_id, buyer_id || 1, pickupCode]
    );

    await client.query('COMMIT');
    res.json({ message: 'Giữ chỗ thành công!', order: orderRes.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 3. API: Quán đăng thêm món cận date (Seller)
app.post('/api/deals/create', async (req, res) => {
  const { store_id, title, original_price, current_price, quantity, hours_left } = req.body;
  try {
    const expired_at = new Date(Date.now() + (hours_left || 2) * 60 * 60 * 1000);
    const query = `
      INSERT INTO deals (store_id, title, original_price, current_price, quantity, expired_at)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
    `;
    const { rows } = await pool.query(query, [
      store_id || 1,
      title,
      original_price,
      current_price,
      quantity,
      expired_at,
    ]);
    res.json({ message: 'Đăng món thành công!', deal: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. API: Xác nhận mã nhận hàng (Seller)
app.post('/api/orders/verify', async (req, res) => {
  const { pickup_code } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE orders SET status = 'COMPLETED'
       WHERE pickup_code = $1 AND status = 'PENDING' RETURNING *;`,
      [pickup_code]
    );

    if (rows.length === 0) {
      return res.status(400).json({ message: 'Mã không hợp lệ hoặc đơn đã nhận rồi!' });
    }

    res.json({ message: 'Xác nhận giao hàng thành công!', order: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server Backend đang chạy tại port ${PORT}`);
});