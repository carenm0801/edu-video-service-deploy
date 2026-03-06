/**
 * 메시지 발송 서비스
 *
 * SMS / 카카오 알림톡 발송 (솔라피 API 사용)
 */

const axios = require('axios');
const crypto = require('crypto');
const supabase = require('../models/db');

const SOLAPI_API_KEY = process.env.SOLAPI_API_KEY || '';
const SOLAPI_API_SECRET = process.env.SOLAPI_API_SECRET || '';
const SENDER_PHONE = process.env.SENDER_PHONE || '';
const KAKAO_SENDER_KEY = process.env.KAKAO_SENDER_KEY || '';
const KAKAO_TEMPLATE_ID = process.env.KAKAO_TEMPLATE_ID || '';
const SERVICE_BASE_URL = process.env.SERVICE_BASE_URL || 'http://localhost:3000';

function getSolapiAuthHeader() {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString('hex');
  const hmac = crypto.createHmac('sha256', SOLAPI_API_SECRET);
  hmac.update(date + salt);
  const signature = hmac.digest('hex');
  return `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`;
}

function normalizePhone(phone) {
  return phone.replace(/[^0-9]/g, '');
}

async function logMessage({ userId, tokenId, phone, sendType, message, status, response }) {
  await supabase
    .from('send_logs')
    .insert([{
      user_id: userId || null,
      token_id: tokenId || null,
      send_type: sendType,
      phone: phone,
      message: message,
      status: status,
      message_id: response?.messageId || null
    }]);
}

async function sendSMS({ phone, message, userId, tokenId }) {
  const normalized = normalizePhone(phone);

  if (!SOLAPI_API_KEY) {
    console.log('[DEV] SMS 발송 → ' + normalized);
    await logMessage({ userId, tokenId, phone: normalized, sendType: 'sms', message, status: 'dev_mock', response: { messageId: 'dev-' + Date.now() } });
    return { success: true, dev: true };
  }

  try {
    const response = await axios.post(
      'https://api.solapi.com/messages/v4/send',
      { message: { to: normalized, from: SENDER_PHONE, text: message } },
      { headers: { Authorization: getSolapiAuthHeader(), 'Content-Type': 'application/json' } }
    );
    await logMessage({ userId, tokenId, phone: normalized, sendType: 'sms', message, status: 'success', response: response.data });
    return { success: true, data: response.data };
  } catch (err) {
    const errMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    await logMessage({ userId, tokenId, phone: normalized, sendType: 'sms', message, status: 'failed', response: { error: errMsg } });
    throw new Error('SMS 발송 실패: ' + errMsg);
  }
}

async function sendKakao({ phone, variables, userId, tokenId }) {
  const normalized = normalizePhone(phone);
  const message = variables['message'] || '';

  if (!SOLAPI_API_KEY || !KAKAO_SENDER_KEY) {
    console.log('[DEV] 카카오 알림톡 → ' + normalized);
    await logMessage({ userId, tokenId, phone: normalized, sendType: 'kakao', message, status: 'dev_mock', response: { messageId: 'kakao-' + Date.now() } });
    return { success: true, dev: true };
  }

  try {
    const response = await axios.post(
      'https://api.solapi.com/messages/v4/send',
      {
        message: {
          to: normalized,
          from: SENDER_PHONE,
          kakaoOptions: {
            pfId: KAKAO_SENDER_KEY,
            templateId: KAKAO_TEMPLATE_ID,
            variables,
          }
        }
      },
      { headers: { Authorization: getSolapiAuthHeader(), 'Content-Type': 'application/json' } }
    );
    await logMessage({ userId, tokenId, phone: normalized, sendType: 'kakao', message, status: 'success', response: response.data });
    return { success: true, data: response.data };
  } catch (err) {
    const errMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    await logMessage({ userId, tokenId, phone: normalized, sendType: 'kakao', message, status: 'failed', response: { error: errMsg } });
    throw new Error('카카오 발송 실패: ' + errMsg);
  }
}

async function sendVideoLink({ userId, tokenId, token, phone, userName, videoTitle, sendType, baseUrl }) {
  // 전달받은 baseUrl이 있으면 사용, 없으면 환경변수나 기본값 사용
  const finalBaseUrl = baseUrl || process.env.SERVICE_BASE_URL || 'http://localhost:3099';
  const url = finalBaseUrl + '/watch?token=' + token;

  if (sendType === 'kakao') {
    return sendKakao({
      phone, userId, tokenId,
      variables: {
        '#{이름}': userName,
        '#{동영상제목}': videoTitle,
        '#{링크}': url,
        message: '[교육동영상] ' + userName + '님, "' + videoTitle + '" 강의: ' + url,
      }
    });
  }

  const smsMsg =
    '[교육동영상]\n' + userName + '님 안녕하세요!\n"' + videoTitle + '" 강의 링크입니다.\n\n' +
    url + '\n\n링크는 24시간 유효합니다.';

  if (sendType === 'both') {
    await sendKakao({
      phone, userId, tokenId,
      variables: { '#{이름}': userName, '#{동영상제목}': videoTitle, '#{링크}': url, message: smsMsg }
    }).catch(() => null);
    return sendSMS({ phone, message: smsMsg, userId, tokenId });
  }

  return sendSMS({ phone, message: smsMsg, userId, tokenId });
}

module.exports = { sendSMS, sendKakao, sendVideoLink };
