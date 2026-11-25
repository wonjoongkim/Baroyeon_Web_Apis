const express = require("express");
const router = express.Router();
const contractUpload = require('../middleware/contractUpload');
const { requireSignToken } = require('../middleware/contractSign');

const {
    CHK_MEM,
    UPLOAD_CONTRACT,
    UPLOAD_INFORMATION,
} = require("../controllers/contractController");

router.post("/CHK_MEM", async (req, res, next) => {
    try {
        await CHK_MEM(req, res);
    } catch (error) {
        next(error);
    }
});

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####                 계약서 업로드 Start                ######
//#############################################################

// 서명 토큰(CHK_MEM 이 내려 준 X-Sign-Token)을 파일 저장보다 먼저 확인한다
router.post("/UPLOAD_CONTRACT", requireSignToken, contractUpload.single("file"), UPLOAD_CONTRACT);

//#############################################################
//#####                 계약서 업로드 End                ######
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####              사실확인서 업로드 Start                ######
//#############################################################

router.post("/UPLOAD_INFORMATION", requireSignToken, contractUpload.single("file"), UPLOAD_INFORMATION);

//#############################################################
//#####                사실확인서 업로드 End               ######
//#############################################################

module.exports = router;
