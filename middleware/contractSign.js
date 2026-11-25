// middleware/contractSign.js
//
// 계약서·사실확인서 업로드는 로그인 없는 공개 화면에서 올라온다. 예전에는 아무 확인 없이 파일을 디스크에 쓰고
// 본문의 user_id 를 그대로 믿었다. 이제 CHK_MEM(전화번호 확인)이 내려 준 서명 토큰을 요구한다.
//
// 토큰은 헤더 X-Sign-Token 으로 받는다. 파일 저장(multer)보다 먼저 확인해야 해서 본문 필드가 아니라 헤더다 -
// multipart 본문은 multer 가 읽은 뒤에야 알 수 있고, 그때는 이미 파일이 디스크에 써진 뒤이기 때문이다.
//
// 전환 방법
//   · 기본(.env 에 CONTRACT_REQUIRE_TOKEN 없음): 토큰이 있으면 반드시 검증하고, 없으면 예전처럼 통과시킨다.
//     (서명 화면을 새로 배포하기 전에 서버를 먼저 올려도 고객의 계약서 작성이 끊기지 않게 하려는 것이다)
//     대신 UPLOAD_CONTRACT 는 토큰이 없어도 "서명 전 계약이 있는 회원"인지 확인한다(contractController).
//   · 서명 화면 배포가 끝나면 CONTRACT_REQUIRE_TOKEN=1 을 넣는다. 그때부터 토큰 없는 업로드는 모두 거절된다.

const { verifyToken } = require("../utils/signedToken");

const deny = (res, code, desc) =>
  res.status(403).json({ RET_STAT: "fail", RET_DESC: desc, RET_CODE: code });

let lastWarn = 0;

const requireSignToken = (req, res, next) => {
  const token = req.headers["x-sign-token"];

  if (token) {
    const uid = verifyToken("contract", token);
    if (!uid) return deny(res, "0006", "❌ 인증이 만료되었거나 올바르지 않습니다. 전화번호 확인부터 다시 진행해 주세요.");
    req.signUid = uid; // 이 토큰이 허용하는 회원 번호
    return next();
  }

  if (process.env.CONTRACT_REQUIRE_TOKEN === "1") {
    return deny(res, "0006", "❌ 인증 정보가 없습니다. 전화번호 확인부터 다시 진행해 주세요.");
  }

  // 전환 기간: 토큰 없는 업로드가 얼마나 남았는지 볼 수 있게 1분에 한 번만 남긴다
  const now = Date.now();
  if (now - lastWarn > 60 * 1000) {
    lastWarn = now;
    console.warn(`⚠️ [contractSign] 서명 토큰 없는 업로드 허용 중(CONTRACT_REQUIRE_TOKEN 미설정) ip=${req.ip} path=${req.originalUrl}`);
  }
  next();
};

module.exports = { requireSignToken };
