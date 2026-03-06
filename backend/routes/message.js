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

// 발송 전 미리보기 (토큰 생성 및 메시지 내용 확인)
router.post('/preview', adminAuth, async (req, res) => {
  const { userId, videoId, expiresHours = 24 } = req.body;

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (!user) return res.status(404).json({ success: false, message: '수강생 없음' });

  let video = null;
  if (videoId) {
    const { data } = await supabase.from('videos').select('*').eq('id', videoId).single();
    video = data;
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

  // 서비스 베이스 URL 결정 (환경 변수 우선, 없으면 현재 요청 도메인 사용)
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers.host;
  const baseUrl = process.env.SERVICE_BASE_URL || `${protocol}://${host}`;
  const watchUrl = baseUrl + '/watch?token=' + token;
  const videoTitle = video ? video.title : '전체 강의';
  const messageBody = `[교육동영상]\n${user.name}님 안녕하세요!\n"${videoTitle}" 강의 링크입니다.\n\n${watchUrl}\n\n링크는 ${expiresHours}시간 유효합니다.`;

  res.json({
    success: true,
    token,
    tokenId: tokenResult.id, // DB상의 ID 추가
    watchUrl,
    messageBody,
    user: { name: user.name, phone: user.phone },
    video: video ? { title: video.title } : null
  });
});

// 개별 발송
router.post('/send', adminAuth, async (req, res) => {
  const { userId, videoId, sendType = 'sms', expiresHours = 24, tokenId, token } = req.body;

  // 서비스 베이스 URL 결정
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers.host;
  const baseUrl = process.env.SERVICE_BASE_URL || `${protocol}://${host}`;

  // 이미 생성된 토큰이 있으면 해당 정보 사용, 없으면 새로 생성 (하위 호환)
  let finalTokenId = tokenId;
  let finalTokenValue = token;
  let user = null;
  let video = null;

  if (!finalTokenId || !finalTokenValue) {
    const { data: u } = await supabase.from('users').select('*').eq('id', userId).single();
    user = u;
    if (!user) return res.status(404).json({ success: false, message: '수강생 없음' });

    if (videoId) {
      const { data: v } = await supabase.from('videos').select('*').eq('id', videoId).single();
      video = v;
    }

    const t = uuidv4();
    const expiresAt = new Date(Date.now() + expiresHours * 3600000).toISOString();
    const { data: tr, error: te } = await supabase
      .from('access_tokens')
      .insert([{ token: t, user_id: userId, video_id: videoId || null, expires_at: expiresAt }])
      .select().single();
    if (te) return res.status(500).json({ success: false, message: '토큰 생성 실패' });
    finalTokenId = tr.id;
    finalTokenValue = t;
  } else {
    // 미리보기에서 전달된 토큰 사용 시 사용자/비디오 정보 다시 확인
    const { data: u } = await supabase.from('users').select('*').eq('id', userId).single();
    user = u;
    if (videoId) {
      const { data: v } = await supabase.from('videos').select('*').eq('id', videoId).single();
      video = v;
    }
  }

  try {
    await sendVideoLink({
      userId, tokenId: finalTokenId, token: finalTokenValue,
      phone: user.phone, userName: user.name,
      videoTitle: video ? video.title : '전체 강의', sendType,
      baseUrl // 도메인 정보 전달
    });
    res.json({ success: true, message: '발송 완료' });
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
