const multer = require("multer");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");

// 저장 경로: 실제 서버의 바깥 폴더 또는 다른 위치인 경우
const SAVE_PATH = process.env.FILEUPLOAD_SAVE_PATH_SUNEDITOR;


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

const sunEditor = multer({ storage }); // 여기서 `.array(...)`는 라우터에서 사용
module.exports = sunEditor;
