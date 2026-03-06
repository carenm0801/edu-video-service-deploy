/**
 * 관리자 라우터 - 수강생/동영상 CRUD, 통계
 */
const express = require('express');
const router = express.Router();
const supabase = require('../models/db');
const { adminAuth } = require('../middleware/auth');

// 수강생 목록 (검색 및 페이지네이션)
router.get('/users', adminAuth, async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';

  let query = supabase
    .from('users')
    .select('*', { count: 'exact' });

  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  const { data: users, count: total, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ success: false, message: error.message });

  res.json({ success: true, users, total, page });
});

// 특정 수강생 조회
router.get('/users/:id', adminAuth, async (req, res) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !user) return res.status(404).json({ success: false, message: '없음' });
  res.json({ success: true, user });
});

// 수강생 등록
router.post('/users', adminAuth, async (req, res) => {
  const { name, phone, email, memo } = req.body;
  if (!name || !phone) return res.status(400).json({ success: false, message: 'name, phone 필수' });

  const { data, error } = await supabase
    .from('users')
    .insert([{
      name,
      phone: phone.replace(/[^0-9]/g, ''),
      email: email || null,
      memo: memo || null
    }])
    .select()
    .single();

  if (error) {
    return res.status(409).json({ success: false, message: '이미 등록된 정보이거나 오류 발생' });
  }
  res.json({ success: true, id: data.id });
});

// 수강생 대량 등록
router.post('/users/bulk', adminAuth, async (req, res) => {
  const { users } = req.body;
  if (!Array.isArray(users)) return res.status(400).json({ success: false, message: 'users 배열 필요' });

  const preparedUsers = users.map(u => ({
    name: u.name,
    phone: u.phone.replace(/[^0-9]/g, ''),
    email: u.email || null,
    memo: u.memo || null
  }));

  const { error } = await supabase
    .from('users')
    .insert(preparedUsers);

  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, count: users.length });
});

// 수강생 수정
router.put('/users/:id', adminAuth, async (req, res) => {
  const { name, phone, email, memo, is_active } = req.body;

  const { error } = await supabase
    .from('users')
    .update({
      name,
      phone: phone.replace(/[^0-9]/g, ''),
      email: email || null,
      memo: memo || null,
      is_active: is_active != null ? is_active : 1,
      updated_at: new Date().toISOString()
    })
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true });
});

// 수강생 삭제
router.delete('/users/:id', adminAuth, async (req, res) => {
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true });
});

// 동영상 목록
router.get('/videos', adminAuth, async (req, res) => {
  const { data: videos, error } = await supabase
    .from('videos')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, videos });
});

// 동영상 등록
router.post('/videos', adminAuth, async (req, res) => {
  const { title, description, url, thumbnail, duration, category } = req.body;
  if (!title || !url) return res.status(400).json({ success: false, message: 'title, url 필수' });

  const { data, error } = await supabase
    .from('videos')
    .insert([{
      title,
      description: description || null,
      url,
      thumbnail: thumbnail || null,
      duration: duration || 0,
      category: category || '일반'
    }])
    .select()
    .single();

  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, id: data.id });
});

// 동영상 수정
router.put('/videos/:id', adminAuth, async (req, res) => {
  const { title, description, url, thumbnail, duration, category, is_active } = req.body;

  const { error } = await supabase
    .from('videos')
    .update({
      title,
      description: description || null,
      url,
      thumbnail: thumbnail || null,
      duration: duration || 0,
      category: category || '일반',
      is_active: is_active != null ? is_active : 1
    })
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true });
});

// 동영상 삭제
router.delete('/videos/:id', adminAuth, async (req, res) => {
  const { error } = await supabase
    .from('videos')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true });
});

// 대시보드 통계
router.get('/stats', adminAuth, async (req, res) => {
  const { count: totalUsers } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_active', 1);
  const { count: totalVideos } = await supabase.from('videos').select('*', { count: 'exact', head: true }).eq('is_active', 1);
  const { count: totalSent } = await supabase.from('send_logs').select('*', { count: 'exact', head: true });
  const { count: totalViews } = await supabase.from('view_logs').select('*', { count: 'exact', head: true });

  const { data: recentSends } = await supabase
    .from('send_logs')
    .select('*, users(name)')
    .order('created_at', { ascending: false })
    .limit(10);

  res.json({
    success: true,
    stats: {
      totalUsers: totalUsers || 0,
      totalVideos: totalVideos || 0,
      totalSent: totalSent || 0,
      totalViews: totalViews || 0,
      recentSends: (recentSends || []).map(s => ({ ...s, name: s.users?.name }))
    }
  });
});

// 발급 링크 목록
router.get('/tokens', adminAuth, async (req, res) => {
  const { data: tokens, error } = await supabase
    .from('access_tokens')
    .select(`
      *,
      users:user_id (name, phone),
      videos:video_id (title)
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ success: false, message: error.message });

  const formattedTokens = tokens.map(t => ({
    ...t,
    name: t.users?.name,
    phone: t.users?.phone,
    video_title: t.videos?.title
  }));

  res.json({ success: true, tokens: formattedTokens });
});

module.exports = router;
