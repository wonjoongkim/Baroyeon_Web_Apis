// middleware/ipAllow.js
//
// 사내 전용 API 를 접속 IP 로 제한한다.
//
// 랜딩 리드 목록(LeadList) 화면은 프론트에서 허용 IP 를 검사하지만, 그건 화면을 가릴 뿐
// API 는 주소만 알면 누구나 호출할 수 있었다. 같은 기준을 서버에서도 강제한다.
//
// 허용 IP 는 .env 의 INTERNAL_ALLOWED_IPS (쉼표 구분)로 바꾼다.
// 값이 없으면 프론트 화면에 이미 쓰던 두 개의 사무실 IP 를 기본으로 쓴다.
//
// [주의] req.ip 는 IIS(ARR)가 X-Forwarded-For 를 제대로 넘겨줘야 실제 접속자 IP 가 된다.
//        넘겨주지 않으면 모든 요청이 127.0.0.1 로 보여 전부 차단된다(안전한 쪽으로 실패).
//        배포 후 /api/_metrics/whoami 로 먼저 확인할 것.

const DEFAULT_IPS = ['121.66.237.141', '222.106.157.141'];

const normalize = (ip) => String(ip || '').trim().replace(/^::ffff:/, '');

const allowed = new Set(
  (process.env.INTERNAL_ALLOWED_IPS
    ? process.env.INTERNAL_ALLOWED_IPS.split(',')
    : DEFAULT_IPS
  ).map(normalize).filter(Boolean)
);

const internalOnly = (req, res, next) => {
  if (allowed.has(normalize(req.ip))) return next();
  console.warn(`⚠️ [internalOnly] 차단 ip=${normalize(req.ip)} path=${req.originalUrl}`);
  return res.status(403).json({
    RET_STAT: 'error',
    RET_DESC: '❌ 접근이 제한된 IP입니다.',
    RET_CODE: '0005',
  });
};

module.exports = { internalOnly };
