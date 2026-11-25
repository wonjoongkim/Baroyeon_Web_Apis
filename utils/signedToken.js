// utils/signedToken.js
//
// 로그인 없는 공개 화면(계약서 서명, 상담 예약)이 "방금 서버가 알려 준 대상"에 한해서만
// 다음 요청을 할 수 있게 하는 짧은 수명의 서명 토큰.
//
// 왜 필요한가
//   · 계약서 업로드(UPLOAD_CONTRACT)는 본문의 user_id 를 그대로 믿어 누구나 남의 계약서에 서명 완료를 찍을 수 있었다.
//   · DB유입 수정(DbInFlow_Update)은 idx 번호만 넣으면 남의 신청 메모를 덮어쓸 수 있었다.
//   서버가 조회·등록 응답에 "이 id 에 대해서만 유효한 토큰"을 함께 내려 주고, 다음 요청에서 그것을 요구한다.
//
// 설계
//   · JWT 가 아니라 별도 형식이다 - 직원/회원 로그인 토큰(JWT)과 서로 통용되지 않는다.
//   · 서명 키는 JWT_SECRET 에서 용도(purpose)별로 파생한다. 용도가 다르면 같은 id 라도 통과하지 못한다.
//   · 토큰 = base64url(JSON{p, id, exp}) + "." + base64url(HMAC-SHA256)
//   · 서버에 저장하지 않는다(무상태). 만료 시각은 토큰 안에 있다.

const crypto = require("crypto");

const baseKey = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET 환경변수가 없습니다.");
  return s;
};

const keyFor = (purpose) =>
  crypto.createHmac("sha256", baseKey()).update("signed-token:" + purpose).digest();

const sign = (purpose, body) =>
  crypto.createHmac("sha256", keyFor(purpose)).update(body).digest("base64url");

/** purpose 용도로 id 에 대해서만 유효한 토큰을 만든다. ttlSec 초 뒤 만료. */
function issueToken(purpose, id, ttlSec) {
  const payload = Buffer.from(
    JSON.stringify({ p: purpose, id: String(id), exp: Math.floor(Date.now() / 1000) + ttlSec })
  ).toString("base64url");
  return payload + "." + sign(purpose, payload);
}

/** 맞으면 토큰에 담긴 id(문자열)를, 아니면(위조·만료·용도 불일치) null 을 돌려준다. */
function verifyToken(purpose, token) {
  try {
    if (typeof token !== "string" || token.length > 512) return null;
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;

    const expected = sign(purpose, payload);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (body.p !== purpose) return null;
    if (!Number.isFinite(body.exp) || body.exp < Math.floor(Date.now() / 1000)) return null;
    return String(body.id);
  } catch (e) {
    return null;
  }
}

module.exports = { issueToken, verifyToken };
