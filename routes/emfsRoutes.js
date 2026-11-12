const express = require("express");
const { verifyEmfsToken, enforceOwnApp, emfsAuth } = require("../middleware/authMiddleware");
const editor = require("../middleware/editor");

const C = require("../controllers/emfsController");

const router = express.Router();

// async 컨트롤러의 예외를 에러 핸들러(next)로 넘긴다.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
// 1) 인증 불필요 : 로그인 (레이트 리밋은 web.js 의 authLimiter 가 건다)
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
router.post("/EMFS_LOGIN", wrap(C.EMFS_LOGIN));   // E-매칭폼 회원 로그인
router.post("/INTRA_LOGIN", wrap(C.INTRA_LOGIN)); // 인트라 로그인 (서명 검증은 컨트롤러)
router.post("/EMFS_REOPEN", wrap(C.EMFS_REOPEN)); // 상담원 재오픈 (서명 필수)

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
// 2) 로그인 필요 : EMFS 토큰 + 본인 APPID 강제 (emfsAuth)
//    요청의 EMFS_APPID/APPID/AppId 가 토큰의 APPID 와 다르면 403.
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

// 공통 코드 (직업 / 직업상세 / 학교 / 코드검색 / 중요순위)
router.post("/EMFS_JOB",       emfsAuth, wrap(C.EMFS_JOB));
router.post("/EMFS_JOBDETAIL", emfsAuth, wrap(C.EMFS_JOBDETAIL));
router.post("/EMFS_SCHOOL",    emfsAuth, wrap(C.EMFS_SCHOOL));
router.post("/EMFS_CODES",     emfsAuth, wrap(C.EMFS_CODES));
router.post("/EMFS_IMPORTANT", emfsAuth, wrap(C.EMFS_IMPORTANT));

// 회원 정보 (체크 / 조회 / 기본정보)
router.post("/EMFS_CHK",     emfsAuth, wrap(C.EMFS_CHK));
router.post("/EMFS_CHK_SEL", emfsAuth, wrap(C.EMFS_CHK_SEL));
router.post("/EMFS_APPMEM",  emfsAuth, wrap(C.EMFS_APPMEM));

// 동의서
router.post("/EMFS_AGREE",     emfsAuth, wrap(C.EMFS_AGREE));
router.post("/EMFS_AGREE_SEL", emfsAuth, wrap(C.EMFS_AGREE_SEL));

// 파일
// [순서 주의] 인증 → multer → 본인확인. 인증이 multer 보다 먼저여야 토큰 없는 요청이
// 파일을 디스크에 쓰지 못한다. multipart 본문(EMFS_APPID)은 multer 이후에야 채워지므로
// 본인확인(enforceOwnApp)은 multer 뒤에 건다.
router.post("/EMFS_FILEUPLOAD", verifyEmfsToken, editor.array("files", 1), enforceOwnApp, wrap(C.EMFS_FILEUPLOAD));
router.post("/EMFS_FILEDELETE", emfsAuth, wrap(C.EMFS_FILEDELETE));

// 작성 완료 체크 + 단계별 등록/조회
// (본인소개, 경제력/직업, 학력, 가족, 희망상대, 추가정보, 사진, 작성완료)
router.post("/EMFS_APP",      emfsAuth, wrap(C.EMFS_APP));
router.post("/EMFS_APP1",     emfsAuth, wrap(C.EMFS_APP1));
router.post("/EMFS_APP1_SEL", emfsAuth, wrap(C.EMFS_APP1_SEL));
router.post("/EMFS_APP2",     emfsAuth, wrap(C.EMFS_APP2));
router.post("/EMFS_APP2_SEL", emfsAuth, wrap(C.EMFS_APP2_SEL));
router.post("/EMFS_APP3",     emfsAuth, wrap(C.EMFS_APP3));
router.post("/EMFS_APP3_SEL", emfsAuth, wrap(C.EMFS_APP3_SEL));
router.post("/EMFS_APP4",     emfsAuth, wrap(C.EMFS_APP4));
router.post("/EMFS_APP4_SEL", emfsAuth, wrap(C.EMFS_APP4_SEL));
router.post("/EMFS_APP5",     emfsAuth, wrap(C.EMFS_APP5));
router.post("/EMFS_APP5_SEL", emfsAuth, wrap(C.EMFS_APP5_SEL));
router.post("/EMFS_APP6",     emfsAuth, wrap(C.EMFS_APP6));
router.post("/EMFS_APP6_SEL", emfsAuth, wrap(C.EMFS_APP6_SEL));
router.post("/EMFS_APP7",     emfsAuth, wrap(C.EMFS_APP7));
router.post("/EMFS_APP7_SEL", emfsAuth, wrap(C.EMFS_APP7_SEL));
router.post("/EMFS_APP8",     emfsAuth, wrap(C.EMFS_APP8));

module.exports = router;
