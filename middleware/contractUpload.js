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

        // 파일 이름은 클라이언트가 정하는 값이라 그대로 쓰면 "..\\..\\x.pdf" 처럼 저장 폴더 밖에 쓸 수 있다.
        // 경로 부분을 모두 버리고, 한글·영문·숫자·공백·_ ( ) . - 만 남긴다. (화면이 만드는 "바로연 계약서_번호_이름.pdf" 형식은 그대로 유지된다)
        const originalFilename = Buffer.from(file.originalname, 'latin1').toString('utf8'); // 한글 깨짐 방지
        const justName = path.basename(originalFilename.replace(/\\/g, '/'));
        const ext = '.pdf'; // fileFilter 가 .pdf 만 통과시킨다
        const baseName =
            path.basename(justName, path.extname(justName))
                .replace(/[^0-9A-Za-z가-힣 _().\-]/g, '_')
                .replace(/^\.+/, '')
                .slice(0, 80) || 'contract';

        const uploadDir = SAVE_PATH;

        let filename = `${baseName}${ext}`;
        let fullPath = path.join(uploadDir, filename);
        let count = 1;

        while (fs.existsSync(fullPath)) {
            filename = `${baseName}(${count})${ext}`;
            fullPath = path.join(uploadDir, filename);
            count++;
        }

        // 최종 방어: 계산된 경로가 저장 폴더 안이 아니면 거절
        const root = path.resolve(uploadDir) + path.sep;
        if (!path.resolve(fullPath).startsWith(root)) {
            return cb(new Error('허용되지 않은 파일 이름입니다.'));
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