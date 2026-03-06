/**
 * 인증 라우터
 *
 * POST /api/auth/verify-token  - URL 토큰으로 수강생 로그인
 * POST /api/auth/admin-login   - 관리자 로그인
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const supabase = require('../models/db');
const { JWT_SECRET } = require('../middleware/auth');

// ─── 수강생: URL 토큰 → 세션 발급 ──────────────────────
router.post('/verify-token', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, message: '토큰이 없습니다' });

  // ─── 테스트용 마스터 토큰 바이패스 (개발/테스트용) ──────────────────
  if (token === 'test' || token === 'dev-test-token') {
    const { data: user } = await supabase.from('users').select('*').eq('id', 2).single();
    const { data: video } = await supabase.from('videos').select('*').eq('id', 1).single();

    if (user && video) {
      const session = jwt.sign(
        { userId: user.id, tokenId: 'test-token-id', videoId: video.id, name: user.name, phone: user.phone },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      return res.json({
        success: true,
        session,
        is_completed: false,
        user: { name: user.name, phone: user.phone },
        video: {
          id: video.id,
          title: video.title,
          url: video.url,
          thumbnail: video.thumbnail,
          description: video.description,
          duration: video.duration
        }
      });
    }
  }

  // Supabase에서 토큰 정보 조회 (Join 처리)
  const { data: row, error } = await supabase
    .from('access_tokens')
    .select(`
      *,
      users:user_id (name, phone, is_active),
      videos:video_id (title, url, thumbnail, description, duration)
    `)
    .eq('token', token)
    .single();

  if (error || !row) return res.status(404).json({ success: false, message: '유효하지 않은 링크입니다' });

  const user = row.users;
  const video = row.videos;

  if (!user || !user.is_active) return res.status(403).json({ success: false, message: '비활성화된 계정입니다' });

  const now = new Date();
  const expires = new Date(row.expires_at);
  if (now > expires) return res.status(403).json({ success: false, message: '링크가 만료되었습니다' });

  // 최초 접속시 정보 업데이트
  if (!row.is_used) {
    await supabase
      .from('access_tokens')
      .update({
        is_used: 1,
        used_at: new Date().toISOString(),
        ip_address: req.ip || req.connection.remoteAddress
      })
      .eq('id', row.id);
  }

  // 시청 완료 여부 확인
  let isCompleted = false;
  if (row.video_id) {
    const { data: log } = await supabase
      .from('view_logs')
      .select('id')
      .eq('user_id', row.user_id)
      .eq('video_id', row.video_id)
      .eq('completed', 1)
      .limit(1)
      .maybeSingle();
    if (log) isCompleted = true;
  }

  // JWT 세션 발급 (6시간)
  const session = jwt.sign(
    { userId: row.user_id, tokenId: row.id, videoId: row.video_id, name: user.name, phone: user.phone },
    JWT_SECRET,
    { expiresIn: '6h' }
  );

  res.json({
    success: true,
    session,
    is_completed: isCompleted,
    user: { name: user.name, phone: user.phone },
    video: row.video_id ? {
      id: row.video_id,
      title: video ? video.title : '알 수 없는 강의',
      url: video ? video.url : '',
      thumbnail: video ? video.thumbnail : '',
      description: video ? video.description : '',
      duration: video ? video.duration : 0,
    } : null
  });
});

// ─── 관리자 로그인 ───────────────────────────────────────
router.post('/admin-login', async (req, res) => {
  const { username, password } = req.body;

  const { data: admin, error } = await supabase
    .from('admins')
    .select('*')
    .eq('username', username)
    .single();

  if (error || !admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 틀렸습니다' });
  }

  const token = jwt.sign({ adminId: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ success: true, token, username: admin.username });
});

module.exports = router;
