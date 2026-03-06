/**
 * Supabase Database Client
 * (기존 Mock DB/SQLite 대체)
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase 환경 변수가 설정되지 않았습니다. Vercel 설정에서 SUPABASE_URL과 SUPABASE_ANON_KEY를 추가해주세요.');
}

const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey)
  : { from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: new Error('DB Not Initialized') }) }) }) }) }; // Fallback to avoid crash

// 헬퍼 함수들 (기존 로직과 최대한 비슷하게 사용하기 위함)
const db = {
  supabase,

  // 수동 SQL 실행이 필요한 경우를 위해 (가능하면 supabase 클라이언트 직접 사용 권장)
  // 여기서는 단순히 supabase 객체 자체를 내보내거나 호환 레이어를 만듭니다.
};

module.exports = supabase;
