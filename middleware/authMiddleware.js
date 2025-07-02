const jwt = require("jsonwebtoken");
require("dotenv").config();

const verifyBearerToken = (req, res, next) => {
  const tokenHeader = req.headers["authorization"];
  const accessToken = tokenHeader ? tokenHeader.split(" ")[1] : null;

  if (!accessToken) {
    return res.status(401).json({
      error: "❌ 인증 토큰이 없습니다.",
      RET_DATA: {},
      RET_CODE: "0001",
    });
  }

  jwt.verify(
    accessToken,
    process.env.JWT_SECRET || "default_secret",
    (err, decoded) => {
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

      req.user = decoded;
      next();
    }
  );
};

module.exports = { verifyBearerToken };
