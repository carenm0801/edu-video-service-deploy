const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'edu-service-secret-key-change-in-prod';

// 관리자 JWT 검증
function adminAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: '인증 필요' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, message: '토큰 만료 또는 무효' });
  }
}

// 수강생 세션 토큰 검증
function userAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] || req.query.session;
  if (!token) return res.status(401).json({ success: false, message: '접근 권한 없음' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, message: '세션이 만료되었습니다' });
  }
}

module.exports = { adminAuth, userAuth, JWT_SECRET };
