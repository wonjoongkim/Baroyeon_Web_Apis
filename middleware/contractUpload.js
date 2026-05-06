const multer = require("multer");
const path = require("path");
const fs = require("fs");

// 저장 경로: 실제 서버의 바깥 폴더 또는 다른 위치인 경우
const SAVE_PATH = process.env.FILEUPLOAD_SAVE_PATH_CONTRACT;

// 폴더 없으면 생성
if (!fs.existsSync(SAVE_PATH)) {
    fs.mkdirSync(SAVE_PATH, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, SAVE_PATH); // 안전한 절대경로 사용
    },
    filename: function (req, file, cb) {        

        const originalFilename = Buffer.from(file.originalname, 'latin1').toString('utf8'); // 한글 깨짐 방지
        const ext = path.extname(originalFilename); // .pdf
        let baseName = path.basename(originalFilename, ext); // 계약서

        baseName = baseName.replace(/[\\/]/g, '_');

        const uploadDir = SAVE_PATH;

        let filename = originalFilename;
        let fullPath = path.join(uploadDir, filename);
        let count = 1;

        while (fs.existsSync(fullPath)) {
            filename = `${baseName}(${count})${ext}`;
            fullPath = path.join(uploadDir, filename);
            count++;
        }

        cb(null, filename);    
    },
});

const contractUpload = multer({
    storage,
    limits: { fileSize: 30 * 1024 * 1024 }, // 30MB 제한
    fileFilter: (req, file, cb) => {
        const allowedExt = ['.pdf'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedExt.includes(ext)) {
            return cb(new Error('허용되지 않은 파일 형식입니다.'));
        }
        cb(null, true);
    }
}); // 여기서 `.array(...)`는 라우터에서 사용
module.exports = contractUpload;