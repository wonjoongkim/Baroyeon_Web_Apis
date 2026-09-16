// utils/logError.js

/**
 * DB 쿼리 실행 중 에러 로깅 공통 함수
 * @param {string} context   - 어디서 난 에런지(함수/모듈 이름)
 * @param {Error} err        - 에러 객체
 * @param {string} [query]   - 실행한 쿼리(선택)
 * @param {any} [params]     - 바인딩 파라미터(선택)
 */
function logQueryError(context, err, query, params) {
    console.error(`🚨 [${context}] 조회 중 오류 발생`);
  
    console.error("  ▸ 메시지 :", err?.message);
    console.error("  ▸ 코드   :", err?.code);
    console.error("  ▸ 이름   :", err?.name);
    console.error("  ▸ 스택   :\n", err?.stack);
  
    if (err?.originalError) {
      console.error("  ▸ originalError :", err.originalError);
    }
    if (err?.precedingErrors && err.precedingErrors.length > 0) {
      console.error("  ▸ precedingErrors :", err.precedingErrors);
    }
  
    if (query) {
      console.error("  ▸ Query  :", query);
    }
    if (params) {
      console.error("  ▸ Params :", params);
    }
  }
  
  module.exports = { logQueryError };
  