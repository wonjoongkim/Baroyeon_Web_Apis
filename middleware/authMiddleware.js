const jwt = require("jsonwebtoken");
require("dotenv").config();

/*
 * ─────────────────────────────────────────────────────────────
 *  JWT 비밀키
 * ─────────────────────────────────────────────────────────────
 *  예전에는 JWT_SECRET 이 없으면 "default_secret" / "CHANGE_ME_IN_PROD" 같은
 *  공개된 문자열로 서명·검증했다. 환경변수가 한 번만 빠져도 누구나 토큰을 위조할
 *  수 있으므로, 비밀키가 없으면 기본값으로 동작하지 않고 에러를 낸다.
 */
const WEAK_SECRETS = new Set(["default_secret", "CHANGE_ME_IN_PROD", "secret", "changeme"]);

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || WEAK_SECRETS.has(secret)) {
    throw new Error("JWT_SECRET 환경변수가 없거나 안전하지 않은 기본값입니다. .env 를 확인하세요.");
  }
  return secret;
}

// 서명/검증에 쓰는 알고리즘 고정 (alg 변조 공격 차단)
const JWT_ALGORITHMS = ["HS256"];

/*
 * ─────────────────────────────────────────────────────────────
 *  토큰 종류 구분
 * ─────────────────────────────────────────────────────────────
 *  E-매칭폼 토큰은 "이름+전화번호" 수준의 낮은 확신도로 발급되는 준회원용이다.
 *  같은 비밀키로 서명되는 일반/관리자 토큰과 섞여 쓰이면 준회원 토큰으로
 *  다른 API(/api/users 등)를 호출할 수 있으므로 서로 통과하지 못하게 나눈다.
 *    - EMFS 토큰 : payload 에 APPID 가 있고 kakao_id / ADM_ID 가 없다.
 */
const isEmfsPayload = (p) => !!(p && p.APPID && !p.kakao_id && !p.ADM_ID);

const extractToken = (req) => {
  const header = req.headers["authorization"];
  if (!header || typeof header !== "string") return null;
  const [scheme, token] = header.split(" ");
  if (!/^Bearer$/i.test(scheme) || !token) return null;
  return token;
};

const verifyCore = (req, res, next, accept) => {
  const accessToken = extractToken(req);

  if (!accessToken) {
    return res.status(401).json({
      error: "❌ 인증 토큰이 없습니다.",
      RET_DATA: {},
      RET_CODE: "0001",
    });
  }

  let secret;
  try {
    secret = getJwtSecret();
  } catch (e) {
    console.error("❌ [auth]", e.message);
    return res.status(500).json({ error: "서버 설정 오류", RET_DATA: {}, RET_CODE: "1000" });
  }

  jwt.verify(accessToken, secret, { algorithms: JWT_ALGORITHMS }, (err, decoded) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          error: "❌ 토큰이 만료되었습니다.",
          RET_DATA: {},
          RET_CODE: "3001",
        });
      }
      return res.status(403).json({
        error: "❌ 유효하지 않은 토큰입니다.",
        RET_DATA: {},
        RET_CODE: "0002",
      });
    }

    if (!accept(decoded)) {
      return res.status(403).json({
        error: "❌ 이 API에 사용할 수 없는 토큰입니다.",
        RET_DATA: {},
        RET_CODE: "0003",
      });
    }

    req.user = decoded;
    next();
  });
};

// 기존 라우트용: E-매칭폼(준회원) 토큰은 통과시키지 않는다.
const verifyBearerToken = (req, res, next) =>
  verifyCore(req, res, next, (d) => !isEmfsPayload(d));

// E-매칭폼 전용: EMFS 토큰만 통과시킨다.
const verifyEmfsToken = (req, res, next) =>
  verifyCore(req, res, next, isEmfsPayload);

/*
 * ─────────────────────────────────────────────────────────────
 *  본인 데이터 강제 (IDOR 방지)
 * ─────────────────────────────────────────────────────────────
 *  요청 본문/쿼리의 APPID 계열 값이 토큰의 APPID 와 다르면 403 으로 거부한다.
 *  값이 비어 있으면 토큰의 APPID 로 채워, 컨트롤러가 항상 "내 APPID" 로만
 *  동작하게 한다. (컨트롤러는 req.body.EMFS_APPID / APPID / AppId 를 읽는다)
 *
 *  verifyEmfsToken 뒤에 두고, multipart 라우트는 multer 뒤에 둔다.
 */
const APPID_KEYS = ["EMFS_APPID", "APPID", "AppId", "AppID"];

const normalizeAppId = (v) => String(v ?? "").trim().padStart(6, "0");

const enforceOwnApp = (req, res, next) => {
  if (!req.user || !req.user.APPID) {
    return res.status(403).json({ error: "❌ 권한이 없습니다.", RET_DATA: {}, RET_CODE: "0003" });
  }
  const ownId = normalizeAppId(req.user.APPID);

  for (const src of [req.body, req.query]) {
    if (!src || typeof src !== "object") continue;
    for (const key of APPID_KEYS) {
      const v = src[key];
      if (v === undefined || v === null || v === "") continue;
      if (typeof v === "object" || normalizeAppId(v) !== ownId) {
        console.warn(`⚠️ [IDOR 차단] token.APPID=${ownId} 요청 ${key}=${JSON.stringify(v)} ip=${req.ip} ${req.originalUrl}`);
        return res.status(403).json({
          RET_DESC: "❌ 본인의 정보만 접근할 수 있습니다.",
          RET_CODE: "0004",
          RET_DATA: null,
        });
      }
    }
  }

  if (!req.body || typeof req.body !== "object") req.body = {};
  for (const key of ["EMFS_APPID", "APPID", "AppId"]) {
    if (req.body[key] === undefined || req.body[key] === null || req.body[key] === "") {
      req.body[key] = String(req.user.APPID);
    }
  }
  next();
};

// 로그인 이후 EMFS API 공통 체인
const emfsAuth = [verifyEmfsToken, enforceOwnApp];

module.exports = {
  verifyBearerToken,
  verifyEmfsToken,
  enforceOwnApp,
  emfsAuth,
  getJwtSecret,
  JWT_ALGORITHMS,
  normalizeAppId,
};
