const express = require("express");
const router = express.Router();
const contractUpload = require('../middleware/contractUpload');

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

router.post("/UPLOAD_CONTRACT", contractUpload.single("file"), UPLOAD_CONTRACT);

//#############################################################
//#####                 계약서 업로드 End                ######
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####              사실확인서 업로드 Start                ######
//#############################################################

router.post("/UPLOAD_INFORMATION", contractUpload.single("file"), UPLOAD_INFORMATION);

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####                사실확인서 업로드 End               ######
//#############################################################

module.exports = router;