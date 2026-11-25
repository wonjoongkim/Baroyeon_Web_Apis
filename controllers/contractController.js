const path = require("path");
const fs = require("fs");
const { executeQuery, executeProcedure } = require("../server/database");
const { issueToken } = require("../utils/signedToken");
const sql = require("mssql");
require("dotenv").config();

const FILEUPLOAD_PATH = path.join("D:", "ROOT", "Baroyeon_file", "mCust", "automatic_transfer");

// 서명 토큰 유효 시간 - 전화번호 확인 후 계약서를 읽고 서명해 전송하기까지 걸리는 시간
const SIGN_TOKEN_TTL_SEC = Number(process.env.CONTRACT_TOKEN_TTL_SEC || 2 * 60 * 60);

/*
 * 전화번호 한 개당 확인 횟수 제한.
 * CHK_MEM 은 전화번호만 알면 계약 정보를 돌려주므로, 번호를 바꿔 가며 대입하는 시도를 막는다.
 * (접속 IP 제한은 rateLimit.js 에 따로 있다. 이쪽은 같은 번호를 여러 곳에서 두드리는 경우를 막는다)
 */
const TEL_WINDOW_MS = 10 * 60 * 1000;
const TEL_MAX = 10;
const telHits = new Map();
const telThrottled = (digits) => {
    const now = Date.now();
    if (telHits.size > 5000) {
        for (const [k, v] of telHits) if (v.resetAt < now) telHits.delete(k);
        if (telHits.size > 5000) telHits.clear();
    }
    const cur = telHits.get(digits);
    if (!cur || cur.resetAt < now) {
        telHits.set(digits, { count: 1, resetAt: now + TEL_WINDOW_MS });
        return false;
    }
    cur.count += 1;
    return cur.count > TEL_MAX;
};

const dropFile = (file) => {
    try { if (file?.path) fs.unlinkSync(file.path); } catch (_) {}
};

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####              회원 계약서 정보 Start                ######
//#############################################################
const CHK_MEM = async (req, res) => {
    try {
        const { tel_number } = req.body || {};

        // 형식 검사 - 숫자와 하이픈·공백만, 숫자 10~11자리
        const raw = String(tel_number ?? "").trim();
        const digits = raw.replace(/\D/g, "");
        if (!/^[0-9\-\s]+$/.test(raw) || digits.length < 10 || digits.length > 11) {
            return res.status(400).json({
                RET_STAT: "fail",
                RET_DESC: "❌ 올바른 휴대폰 번호를 입력해주세요.",
                RET_CODE: "1001",
            });
        }

        if (telThrottled(digits)) {
            return res.status(429).json({
                RET_STAT: "error",
                RET_DESC: "❌ 확인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
                RET_CODE: "4291",
            });
        }

        /* 예전에는 ac.* 로 계약 테이블의 모든 컬럼을 내려보냈다. 전화번호만 알면 누구나 받는 응답이라,
           서명 화면이 실제로 쓰는 컬럼만 내려보낸다. (내부 번호 idx · 작성/수정/서명 일시 · 서명 IP · 삭제 여부는 뺐다) */
        const query = ` DECLARE @encTel VARCHAR(30);
                        SET @encTel = [baroyeon_crm].[dbo].UFN_GetHopeMaxLicense('2','0', @tel_number);

                        SELECT ac.uid, ac.program, ac.uname, ac.birth_1, ac.birth_2, ac.birth_3,
                               ac.ct_name_1, ac.ct_name_2, ac.relationship, ac.counselor,
                               ac.ct_day_one, ac.ct_day_two, ac.ct_day_three,
                               ac.subscription_fee, ac.Marriage_fee, ac.ct_period, ac.ct_number,
                               ac.ct_year_1, ac.ct_mon_1, ac.ct_day_1,
                               ac.ct_year_2, ac.ct_mon_2, ac.ct_day_2,
                               ac.sign_yn, am.addr_code, m.m_name
                        FROM [baroyeon_crm].[dbo].asso_contract ac
                        JOIN [baroyeon_crm].[dbo].Asso_mem am on ac.uid = am.idx
                        JOIN [baroyeon_crm].[dbo].baro_a001 a ON ac.uid = a.aid
                        JOIN [baroyeon_crm].[dbo].xManager m ON ac.counselor = m.m_id
                        WHERE a.tel_hand = @encTel; `;

        const params = [{ name: 'tel_number', type: sql.VarChar, value: raw }];

        const result = await executeQuery(query, params);

        // 아직 서명하지 않은 계약에만, 그 회원 번호에 대해서만 유효한 서명 토큰을 붙인다.
        // 서명 화면이 이 값을 업로드 요청의 X-Sign-Token 헤더로 돌려보낸다.
        const rows = (result || []).map((r) =>
            String(r.sign_yn ?? "").trim().toUpperCase() === "Y"
                ? r
                : { ...r, sign_token: issueToken("contract", r.uid, SIGN_TOKEN_TTL_SEC) }
        );

        res.status(200).json({
            RET_STAT: "success",
            RET_DESC: "✅ 조회 성공",
            RET_CODE: "0000",
            RET_DATA: rows
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            RET_STAT: "error",
            RET_DESC: "❌ 서버 오류 발생",
            RET_CODE: "1000",
        });
    };
};
//############################################################
//#####                회원 계약서 정보 End                #####
//############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####          계약서 저장 + DB 업데이트 Start            ######
//#############################################################
const UPLOAD_CONTRACT = async (req, res) => {
    const file = req.file;
    try {
        const { user_id, document_type, contract_select } = req.body || {};

        if (!file || !user_id) {
            dropFile(file);
            return res.status(400).json({
                RET_STAT: "fail",
                RET_DESC: "계약서 전송 중 오류가 발생하였습니다. 다시 시도해주세요.",
                RET_CODE: "1001"
            });
        }

        const uid = parseInt(user_id, 10);
        const docType = parseInt(document_type, 10);
        const contractSel = parseInt(contract_select, 10);

        // 값 형식 - 화면은 문서종류 6(pdf), 계약구분 1(국내)·2(국제)만 보낸다
        if (!Number.isInteger(uid) || uid <= 0 || docType !== 6 || ![1, 2].includes(contractSel)) {
            dropFile(file);
            return res.status(400).json({
                RET_STAT: "fail",
                RET_DESC: "요청 값이 올바르지 않습니다.",
                RET_CODE: "1001"
            });
        }

        // 서명 토큰이 있으면 그 토큰이 허용한 회원 번호와 같아야 한다 (남의 번호로 올리는 것을 막는다)
        if (req.signUid !== undefined && String(uid) !== String(req.signUid)) {
            dropFile(file);
            return res.status(403).json({
                RET_STAT: "fail",
                RET_DESC: "❌ 본인 계약서만 전송할 수 있습니다.",
                RET_CODE: "0004"
            });
        }

        // 확장자만 .pdf 로 속인 파일을 막는다. 실제 내용이 PDF(%PDF-)인지 앞 5바이트로 확인한다.
        try {
            const fd = fs.openSync(file.path, 'r');
            const head = Buffer.alloc(5);
            fs.readSync(fd, head, 0, 5, 0);
            fs.closeSync(fd);
            if (head.toString('latin1') !== '%PDF-') throw new Error('not pdf');
        } catch (e) {
            dropFile(file);
            return res.status(400).json({
                RET_STAT: "fail",
                RET_DESC: "PDF 파일만 업로드할 수 있습니다.",
                RET_CODE: "1002"
            });
        }

        // 서명 전 계약이 있는 회원에게만 받는다. 없는 번호이거나 이미 서명한 계약이면 거절한다
        // (이전에는 어떤 번호든 받아서 서명 완료로 바꿨고, 이미 서명한 계약서도 덮어쓸 수 있었다)
        const [contract] = await executeQuery(
            ` SELECT TOP 1 sign_yn FROM [baroyeon_crm].[dbo].asso_contract WHERE uid = @uid; `,
            [{ name: 'uid', type: sql.Int, value: uid }]
        );
        if (!contract) {
            dropFile(file);
            return res.status(404).json({
                RET_STAT: "fail",
                RET_DESC: "계약 정보를 찾을 수 없습니다.",
                RET_CODE: "1004"
            });
        }
        if (String(contract.sign_yn ?? "").trim().toUpperCase() === "Y") {
            dropFile(file);
            return res.status(409).json({
                RET_STAT: "fail",
                RET_DESC: "이미 계약서를 작성하셨습니다.",
                RET_CODE: "1005"
            });
        }

        const filename = file.filename;

        // 파일 저장 프로시저 실행
        const transmitParams = [
            { name: 'asso_mem_idx', type: sql.Int, value: uid },
            { name: 'document_name', type: sql.VarChar(sql.MAX), value: filename },
            { name: 'document_type', type: sql.Int, value: docType },
            { name: 'contract_select', type: sql.Int, value: contractSel }
        ];

        await executeProcedure('[baroyeon_crm].[dbo].[proc_transmit]', transmitParams);

        // 서명 완료 처리 - 이미 서명된 행은 건드리지 않는다
        const ip = req.ip || req.connection.remoteAddress || '';
        const query = `
            UPDATE [baroyeon_crm].[dbo].asso_contract
            SET sign_yn = 'Y', sign_date = GETDATE(), sign_ip = @ip
            WHERE uid = @uid AND ISNULL(sign_yn, 'N') <> 'Y';
        `;

        const updateParams = [
            { name: 'ip', type: sql.VarChar, value: ip },
            { name: 'uid', type: sql.Int, value: uid }
        ];

        await executeQuery(query, updateParams);

        res.status(200).json({
            RET_STAT: "success",
            RET_DESC: "✅ 파일 업로드 성공",
            RET_CODE: "0000",
            RET_DATA: []
        });

    } catch (err) {
        console.error("파일 저장 중 오류 발생:", err);
        res.status(500).json({
            RET_STAT: "error",
            RET_DESC: "❌ 서버 오류 발생",
            RET_CODE: "1000"
        });
    }
};
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####           계약서 저장 + DB 업데이트 END             ######
//#############################################################

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####                 사실확인서 저장 Start              ######
//#############################################################
// 파일 자체는 multer(contractUpload)가 저장한다. 여기서는 PDF 가 아니면 지운다.
const UPLOAD_INFORMATION = async (req, res) => {
    const file = req.file;
    try {
        if (!file) {
            return res.status(400).json({ RET_STAT: "fail", RET_DESC: "파일이 없습니다.", RET_CODE: "1001" });
        }
        const fd = fs.openSync(file.path, 'r');
        const head = Buffer.alloc(5);
        fs.readSync(fd, head, 0, 5, 0);
        fs.closeSync(fd);
        if (head.toString('latin1') !== '%PDF-') {
            dropFile(file);
            return res.status(400).json({ RET_STAT: "fail", RET_DESC: "PDF 파일만 업로드할 수 있습니다.", RET_CODE: "1002" });
        }
    } catch (e) {
        dropFile(file);
        return res.status(500).json({ RET_STAT: "error", RET_DESC: "❌ 서버 오류 발생", RET_CODE: "1000" });
    }

    res.status(200).json({
        RET_STAT: "success",
        RET_DESC: "✅ 파일 업로드 성공",
        RET_CODE: "0000",
        RET_DATA: []
    });
}
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####                 사실확인서 저장 End                ######
//#############################################################

module.exports = {
    CHK_MEM,
    UPLOAD_CONTRACT,
    UPLOAD_INFORMATION,
};
