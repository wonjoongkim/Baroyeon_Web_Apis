const express = require('express');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8585;

// HTTPS Termination(프록시) 환경이면 권장
app.set('trust proxy', true);

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
app.use(express.json({ limit: '120mb' }));
app.use(express.urlencoded({ extended: true, limit: '120mb' }));

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

app.listen(PORT, () => {
  console.log(`🚀 서버 실행 중... Port:[${PORT}]`);
});
