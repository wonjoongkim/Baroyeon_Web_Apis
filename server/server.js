// 현재 server.js는 사용하고 있지 않고
// 실질적으로 web.js를 활용하고 있음

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();

const userRoutes = require("../routes/userRoutes");
const adminRoutes = require("../routes/adminRoutes");
const contractRoutes = require("../routes/contractRoutes");

const app = express();
const PORT = process.env.PORT || 8585;

// ✅ CORS 옵션 명시적으로 설정
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      "http://localhost:5173",
      "https://baroyeon.net",
      "https://www.baroyeon.net",
      "http://adm.baroyeon.net",
      "https://adm.baroyeon.net"
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS 차단: " + origin));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // Preflight 응답

// 미들웨어 설정
// app.use(cors());
app.use(bodyParser.json());
app.use("/api/users", userRoutes);  //프론트 접근시
app.use("/api/admin", adminRoutes); //어드민 접근시
app.use("/api/contract", contractRoutes); // 전자 계약서

// 에러 처리
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "서버 오류 발생!" });
});

app.listen(PORT, () => {
  console.log(`🚀 서버 실행 중: https://www.baroyeon.net:${PORT}`);
});

module.exports = app;
