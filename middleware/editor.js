const multer = require("multer");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");

// 저장 경로: 실제 서버의 바깥 폴더 또는 다른 위치인 경우
const SAVE_PATH = process.env.FILEUPLOAD_SAVE_PATH_EDITOR;


// 폴더 없으면 생성
if (!fs.existsSync(SAVE_PATH)) {
  fs.mkdirSync(SAVE_PATH, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, SAVE_PATH); // 안전한 절대경로 사용
  },
  filename: function (req, file, cb) {
    const uniqueFileName = uuidv4();
    const fileExtension = path.extname(file.originalname);
    const fileName = `${uniqueFileName}${fileExtension}`;
    cb(null, fileName);
  },
});

// 용량 제한이 없으면 한 번의 요청으로 디스크와 메모리를 모두 소진시킬 수 있다.
const editor = multer({
  storage,
  limits: {
    fileSize: Number(process.env.UPLOAD_MAX_FILE_MB || 30) * 1024 * 1024,
    files: Number(process.env.UPLOAD_MAX_FILES || 20),
    fields: 200,
  },
}); // 여기서 `.array(...)`는 라우터에서 사용
module.exports = editor;
