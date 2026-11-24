// E-매칭폼 사진 업로드 전용 multer.
// editor.js 와 같은 저장 방식이지만 용량 한도만 사진용(기본 40MB)으로 따로 둔다 — editor 는 게시판 등 다른 곳과 같이 쓰기 때문.
// 화면은 올리기 전에 가로 600px 로 줄여 보내므로 실제로는 작은 파일이 오지만, 줄이기에 실패한 원본이 와도 받을 수 있게 40MB 까지 허용한다.
const multer = require("multer");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");

const SAVE_PATH = process.env.FILEUPLOAD_SAVE_PATH_EDITOR;
if (!fs.existsSync(SAVE_PATH)) {
  fs.mkdirSync(SAVE_PATH, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, SAVE_PATH),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});

const emfsPhotoUpload = multer({
  storage,
  limits: {
    fileSize: Number(process.env.EMFS_PHOTO_MAX_MB || 40) * 1024 * 1024,
    files: 1,
    fields: 50,
  },
});

module.exports = emfsPhotoUpload;
