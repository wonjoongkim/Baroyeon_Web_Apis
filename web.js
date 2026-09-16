const express = require('express');
const cors = require('cors');
<<<<<<< HEAD
const compression = require('compression');
const { metricsMiddleware, metricsRouter } = require('./middleware/metrics');
const { generalLimiter, authLimiter, uploadLimiter } = require('./middleware/rateLimit');
=======
const fs = require('fs');
require('dotenv').config();
>>>>>>> 44461884c7233b9b614c5a0a469c558ce536c929

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 8585;

// HTTPS Termination(프록시) 환경이면 권장
//
// [주의] true 로 두면 안 된다.
// true 는 X-Forwarded-For 체인 전체를 신뢰하고 "맨 왼쪽" 값을 req.ip 로 쓴다.
// 그런데 맨 왼쪽은 클라이언트가 직접 써넣을 수 있는 값이라, 헤더만 바꿔가며
// 레이트 리밋을 얼마든지 우회할 수 있다.
//
// 이 서비스는 web.config 가 IIS(ARR) -> http://localhost 로 rewrite 하는
// 같은 장비 1홉 구성이므로 1 이 맞다. 1 이면 뒤에서 첫 번째 값, 즉 ARR 이
// 직접 붙인 실제 접속 IP만 신뢰한다.
//
// 앞단에 CDN 등 프록시를 더 붙이면 그 홉 수만큼 TRUST_PROXY 를 올려야 한다.
// 값 형식: 숫자(홉 수) | true/false | 'loopback' 같은 프리셋 | IP 목록
// 환경변수는 항상 문자열로 들어오는데, express는 문자열 'true'를 IP 목록으로
// 해석해 기동 자체가 실패한다. 여기서 타입을 맞춰 준다.
function parseTrustProxy(raw) {
  if (raw === undefined || raw === null || raw === '') return 1;
  const v = String(raw).trim();
  if (v.toLowerCase() === 'true') return true;
  if (v.toLowerCase() === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v; // 'loopback', '10.0.0.1' 등은 그대로 넘긴다
}
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

// 허용 오리진 (개발/운영/모바일 포함)
const allowedOrigins = [
  'https://baroyeon.net',
  'https://www.baroyeon.net',
  'http://baroyeon.net',
  'http://www.baroyeon.net',
  'http://adm.baroyeon.net',
  'http://sign.baroyeon.net',
  'https://sign.baroyeon.net',
  'http://emfs.baroyeon.net',
  'https://emfs.baroyeon.net',
  'http://localhost:5173',
  'http://localhost:5174',
];

const corsOptions = {
  origin(origin, callback) {
    // 서버-서버/포스트맨 등 Origin 없는 경우 허용
    if (!origin) return callback(null, true);
    return allowedOrigins.includes(origin)
      ? callback(null, true)
      : callback(new Error('CORS 차단: ' + origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
};

// API별 트래픽/응답시간 계측 (라우트보다 먼저)
app.use(metricsMiddleware);

// gzip 압축 - JSON 응답 트래픽을 크게 줄인다.
// (이미 압축된 파일 다운로드나 클라이언트가 x-no-compression을 보낸 경우는 건너뛴다)
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));

// CORS 최상단 (모든 라우트/미들웨어보다 먼저)
app.use(cors(corsOptions));
// 프리플라이트 응답
app.options('*', cors(corsOptions), (req, res) => res.sendStatus(204));

// 캐시/프록시 안전성을 위한 Vary 헤더
app.use((req, res, next) => {
  res.header('Vary', 'Origin');
  next();
});


// 바디 파서
// 파일 업로드는 multer(multipart)가 디스크로 직접 받으므로 이 한도를 타지 않는다.
// JSON/urlencoded 본문은 통째로 힙에 올라가기 때문에 크게 잡아두면 동시요청 몇 건에
// 메모리가 바로 바닥난다. 실제 필요치(수백 KB)보다 넉넉한 선에서 제한한다.
const JSON_LIMIT = process.env.BODY_LIMIT_JSON || '10mb';
app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_LIMIT }));

// 요청 제한 - 라우트보다 먼저 건다.
// 로그인/업로드처럼 건당 비용이 큰 경로는 더 좁은 제한을 따로 얹는다.
app.use([
  '/api/users/MEM_LOGIN',
  '/api/users/MEM_APPLY',
  '/api/users/KAKAO_AUTH',
  '/api/users/NAVER_CALLBACK',
  '/api/emfs/EMFS_LOGIN',
  '/api/emfs/INTRA_LOGIN',
], authLimiter);
app.use([
  '/api/emfs/EMFS_FILEUPLOAD',
  '/api/contract/UPLOAD_CONTRACT',
], uploadLimiter);
app.use('/api', generalLimiter);

// 계측 조회 (localhost 또는 METRICS_TOKEN 헤더만 허용)
app.use('/api/_metrics', metricsRouter);

// 라우트
const employeePhotoBasePath = String(process.env.FILEUPLOAD_SAVE_PATH_EMPLOYEE || '').trim();
if (employeePhotoBasePath && fs.existsSync(employeePhotoBasePath)) {
  app.use('/xFile/Manager', express.static(employeePhotoBasePath));
}

app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/emfs', require('./routes/emfsRoutes'));
app.use('/api/contract', require('./routes/contractRoutes'));

// (선택) 404
app.use((req, res, next) => {
  res.status(404).json({ error: 'Not Found' });
});

// 4) 에러 핸들러 (에러 응답에도 CORS 헤더 유지)
app.use((err, req, res, next) => {
  console.error(err);

  // 에러 응답에도 CORS 헤더 보장
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.header('Vary', 'Origin');
  }

  const status = err.status || 500;
  res.status(status).json({ error: err.message || '서버 오류 발생!' });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 서버 실행 중... Port:[${PORT}]`);
});
<<<<<<< HEAD

// 소켓 타임아웃 - 이 값들이 없으면 끊어진 클라이언트의 연결과 그 요청 객체가
// 계속 살아남아 메모리를 잠식한다.
server.keepAliveTimeout = Number(process.env.KEEPALIVE_TIMEOUT_MS || 65000);
server.headersTimeout = server.keepAliveTimeout + 5000;
server.requestTimeout = Number(process.env.REQUEST_TIMEOUT_MS || 120000);

// 포트 바인딩 실패 같은 기동 오류는 되살릴 방법이 없으므로 즉시 죽어야 한다.
// (조용히 살아남으면 "떠 있는데 응답이 없는" 상태가 되어 원인 파악이 더 어렵다)
server.on('error', (err) => {
  console.error('❌ [server.error] 서버 기동 실패:', err);
  process.exit(1);
});

// 처리되지 않은 거부는 로그만 남긴다. 대부분 특정 요청 하나의 문제라
// 프로세스를 죽일 이유가 없다.
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ [unhandledRejection]', reason);
});

// uncaughtException 이후의 프로세스 상태는 신뢰할 수 없다. 로그를 남길 시간만
// 확보하고 종료해서 서비스 관리자가 깨끗한 프로세스로 재시작하게 한다.
// (예전 database.js의 즉시 process.exit(1)과 달리, 여기선 DB 일시 장애가 아니라
//  실제 코드 예외이므로 재시작이 맞다)
process.on('uncaughtException', (err) => {
  console.error('⚠️ [uncaughtException]', err);
  server.close(() => process.exit(1));
  setTimeout(() => process.exit(1), 3000).unref();
});
=======
>>>>>>> 44461884c7233b9b614c5a0a469c558ce536c929
