/**
 * 교육 동영상 서비스 - 메인 서버
 * Node.js + Express
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const app = express();

// ─── 미들웨어 ───────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend/public')));

// ─── 라우터 ─────────────────────────────────────────────
const authRoutes    = require('./routes/auth');
const videoRoutes   = require('./routes/video');
const adminRoutes   = require('./routes/admin');
const messageRoutes = require('./routes/message');

app.use('/api/auth',    authRoutes);
app.use('/api/video',   videoRoutes);
app.use('/api/admin',   adminRoutes);
app.use('/api/message', messageRoutes);

// ─── SPA 폴백 ────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// ─── 에러 핸들러 ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ success: false, message: err.message || '서버 오류' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ 서버 실행중: http://localhost:${PORT}`);
});

module.exports = app;
