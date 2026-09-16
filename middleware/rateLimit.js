// middleware/rateLimit.js
//
// IP 단위 요청 제한.
//
// 목적은 두 가지다.
//  1) 크롤러/스크립트가 목록 API를 연타해서 트래픽을 끌어올리는 걸 막는다.
//  2) 요청이 폭주할 때 큐에 쌓이는 요청 객체 때문에 메모리가 차는 걸 앞단에서 끊는다.
//
// 값은 .env로 조정한다. 처음엔 넉넉하게 두고, /api/_metrics 의 호출수를 보면서
// 실제 사용량 기준으로 좁혀 나가는 걸 권장한다.

const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");

/*
 * [중요] 제한 단위를 IP가 아니라 "로그인 사용자"로 잡는다.
 *
 * 사무실은 보통 공인 IP 하나를 NAT로 공유한다. IP로만 세면 같은 사무실 인원
 * 전체가 한 바구니를 나눠 쓰게 되어, 정상 업무 중에 429가 터진다.
 * 토큰이 있으면 토큰 기준으로, 없으면(공개 API) IP로 떨어뜨린다.
 *
 * 토큰은 여기서 검증하지 않는다. 이 미들웨어는 인증보다 먼저 돌고, 목적도
 * "구분"일 뿐이다. 실제 검증은 뒤의 verifyBearerToken이 한다.
 * 토큰 원문을 메모리에 들고 있지 않도록 해시만 키로 쓴다.
 */
const keyByUserOrIp = (req, res) => {
  const header = req.headers["authorization"];
  const token = header ? header.split(" ")[1] : null;
  if (token) {
    return "t:" + crypto.createHash("sha256").update(token).digest("hex").slice(0, 32);
  }
  // IPv6는 /64 단위로 묶어주는 헬퍼를 써야 한 사용자가 주소를 바꿔가며 우회하지 못한다.
  return "i:" + ipKeyGenerator(req.ip);
};

const COMMON = {
  standardHeaders: "draft-7", // RateLimit-* 헤더
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  // 이 API는 IIS(ARR) 리버스 프록시 뒤에 있어서 web.js가 trust proxy=true로 둔다.
  // express-rate-limit은 그 설정이 permissive하다고 경고하는데, 프록시가 같은
  // 호스트의 ARR 하나뿐이라 X-Forwarded-For를 신뢰할 수 있는 구성이다.
  // 앞단에 외부 프록시/CDN을 더 붙이게 되면 이 검증을 다시 켜고 재검토해야 한다.
  validate: { trustProxy: false, xForwardedForHeader: false },
};

// 일반 API - 한 IP가 1분에 보낼 수 있는 요청 수
const generalLimiter = rateLimit({
  ...COMMON,
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60 * 1000),
  limit: Number(process.env.RATE_LIMIT_MAX || 300),
  // 프리플라이트는 세지 않는다 (CORS 때문에 실제 요청마다 한 번씩 더 오는 경우가 있다)
  skip: (req) => req.method === "OPTIONS",
  message: {
    RET_STAT: "error",
    RET_DESC: "❌ 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    RET_CODE: "4290",
  },
});

// 로그인/인증 - 자격증명 대입 시도를 막기 위해 훨씬 빡빡하게 건다
const authLimiter = rateLimit({
  ...COMMON,
  windowMs: Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS || 5 * 60 * 1000),
  limit: Number(process.env.RATE_LIMIT_AUTH_MAX || 20),
  // [주의] skipSuccessfulRequests 는 쓰지 않는다.
  // 이 API들은 로그인 실패도 HTTP 200 + 본문 RET_CODE 로 응답하기 때문에,
  // 성공 응답을 제외하면 실패 시도가 하나도 집계되지 않아 제한이 무력화된다.
  // 대신 성공/실패를 가리지 않고 5분 20회로 잡는다(정상 사용자에겐 충분한 여유).
  message: {
    RET_STAT: "error",
    RET_DESC: "❌ 인증 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    RET_CODE: "4291",
  },
});

// 파일 업로드 - 건당 비용이 크므로 별도로 더 좁게
const uploadLimiter = rateLimit({
  ...COMMON,
  windowMs: Number(process.env.RATE_LIMIT_UPLOAD_WINDOW_MS || 60 * 1000),
  limit: Number(process.env.RATE_LIMIT_UPLOAD_MAX || 30),
  message: {
    RET_STAT: "error",
    RET_DESC: "❌ 업로드 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    RET_CODE: "4292",
  },
});

module.exports = { generalLimiter, authLimiter, uploadLimiter };
