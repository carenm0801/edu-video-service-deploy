/**
 * 메시지 발송 라우터 (관리자 전용)
 * POST /api/message/send   - 개별 발송
 * POST /api/message/bulk   - 일괄 발송
 * GET  /api/message/logs   - 발송 이력
 */
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const supabase = require('../models/db');
const { adminAuth } = require('../middleware/auth');
const { sendVideoLink } = require('../services/messageService');

// 개별 발송
router.post('/send', adminAuth, async (req, res) => {
  const { userId, videoId, sendType = 'sms', expiresHours = 24 } = req.body;

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .eq('is_active', 1)
    .single();

  if (!user) return res.status(404).json({ success: false, message: '수강생 없음' });

  let video = null;
  if (videoId) {
    const { data } = await supabase
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .eq('is_active', 1)
      .single();
    video = data;
    if (!video) return res.status(404).json({ success: false, message: '동영상 없음' });
  }

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + expiresHours * 3600000).toISOString();

  const { data: tokenResult, error: tokenError } = await supabase
    .from('access_tokens')
    .insert([{
      token,
      user_id: userId,
      video_id: videoId || null,
      expires_at: expiresAt
    }])
    .select()
    .single();

  if (tokenError) return res.status(500).json({ success: false, message: '토큰 생성 실패' });

  try {
    await sendVideoLink({
      userId, tokenId: tokenResult.id, token,
      phone: user.phone, userName: user.name,
      videoTitle: video ? video.title : '전체 강의', sendType
    });
    const watchUrl = (process.env.SERVICE_BASE_URL || 'http://localhost:3099') + '/watch?token=' + token;
    res.json({ success: true, message: '발송 완료', token, expiresAt, watchUrl });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 일괄 발송
router.post('/bulk', adminAuth, async (req, res) => {
  const { userIds, videoId, sendType = 'sms', expiresHours = 24 } = req.body;
  if (!Array.isArray(userIds) || !userIds.length) {
    return res.status(400).json({ success: false, message: 'userIds 배열 필요' });
  }

  let video = null;
  if (videoId) {
    const { data } = await supabase.from('videos').select('*').eq('id', videoId).single();
    video = data;
  }

  const results = [];

  for (const userId of userIds) {
    const { data: user } = await supabase.from('users').select('*').eq('id', userId).eq('is_active', 1).single();
    if (!user) { results.push({ userId, success: false, message: '사용자 없음' }); continue; }

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + expiresHours * 3600000).toISOString();

    const { data: tr, error } = await supabase
      .from('access_tokens')
      .insert([{ token, user_id: userId, video_id: videoId || null, expires_at: expiresAt }])
      .select()
      .single();

    if (error) { results.push({ userId, success: false, message: '토큰 생성 실패' }); continue; }

    try {
      await sendVideoLink({
        userId, tokenId: tr.id, token,
        phone: user.phone, userName: user.name,
        videoTitle: video ? video.title : '전체 강의', sendType
      });
      results.push({ userId, success: true, name: user.name, phone: user.phone });
    } catch (err) {
      results.push({ userId, success: false, message: err.message });
    }
  }

  const succeeded = results.filter(r => r.success).length;
  res.json({ success: true, total: userIds.length, succeeded, failed: userIds.length - succeeded, results });
});

// 발송 이력
router.get('/logs', adminAuth, async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const status = req.query.status;

  let query = supabase
    .from('send_logs')
    .select('*, users:user_id(name)', { count: 'exact' });

  if (status) query = query.eq('status', status);

  const { data: logs, count: total, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ success: false, message: error.message });

  const formattedLogs = (logs || []).map(l => ({
    ...l,
    user_name: l.users?.name,
    sent_at: l.created_at
  }));

  res.json({ success: true, logs: formattedLogs, total, page });
});

module.exports = router;
