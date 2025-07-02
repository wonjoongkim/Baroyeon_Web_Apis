const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();

const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();
const PORT = process.env.PORT || 8585;

// 미들웨어 설정
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      "https://baroyeon.net",
      "https://www.baroyeon.net",
      "http://baroyeon.net",
      "http://www.baroyeon.net",
      "http://adm.baroyeon.net",
      "http://localhost:5173"
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS 차단: " + origin));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // Preflight 응답

// app.use(cors());
app.use(bodyParser.json());
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);

// 에러 처리
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "서버 오류 발생!" });
});

app.listen(PORT, () => {
  //console.log(`🚀 서버 실행 중: http://10.107.18.226/:${PORT}`);
  // console.log(`🚀 서버 실행 중: http://210.116.114.226/:${PORT}`);
  console.log(`🚀 서버 실행 중 `);
});

module.exports = app;
