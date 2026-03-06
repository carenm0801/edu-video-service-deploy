/**
 * Supabase Database Client
 * (기존 Mock DB/SQLite 대체)
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase 설정이 없습니다. .env 파일을 확인하세요.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 헬퍼 함수들 (기존 로직과 최대한 비슷하게 사용하기 위함)
const db = {
  supabase,

  // 수동 SQL 실행이 필요한 경우를 위해 (가능하면 supabase 클라이언트 직접 사용 권장)
  // 여기서는 단순히 supabase 객체 자체를 내보내거나 호환 레이어를 만듭니다.
};

module.exports = supabase;
