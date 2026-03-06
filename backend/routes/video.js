/**
 * 동영상 시청 라우터 (수강생용)
 */
const express = require('express');
const router = express.Router();
const supabase = require('../models/db');
const { userAuth } = require('../middleware/auth');

// 내 동영상 목록
router.get('/list', userAuth, async (req, res) => {
  const { videoId } = req.user;

  if (videoId) {
    const { data: video } = await supabase
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .eq('is_active', 1)
      .single();

    return res.json({ success: true, videos: video ? [video] : [] });
  }

  const { data: videos } = await supabase
    .from('videos')
    .select('*')
    .eq('is_active', 1)
    .order('created_at', { ascending: false });

  res.json({ success: true, videos: videos || [] });
});

// 시청 기록 저장
router.post('/progress', userAuth, async (req, res) => {
  const { videoId, watchTime, completed } = req.body;
  const { userId, tokenId } = req.user;

  await supabase
    .from('view_logs')
    .insert([{
      user_id: userId,
      video_id: videoId,
      token_id: tokenId || null,
      duration: watchTime || 0, // Mock DB에서는 watch_time이었으나 스키마에는 duration으로 정의함 (수정하거나 맞춤)
      // completed 필드는 스키마에 없었으므로 여기서는 duration에 합치거나 스키마를 보강해야 함
      // 일단 duration(시청 시간)만 기록
    }]);

  res.json({ success: true });
});

module.exports = router;
