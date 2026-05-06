const path = require("path");
const { executeQuery, executeProcedure } = require("../server/database");
const sql = require("mssql");
require("dotenv").config();

const FILEUPLOAD_PATH = path.join("D:", "ROOT", "Baroyeon_file", "mCust", "automatic_transfer");

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####              회원 계약서 정보 Start                ######
//#############################################################
const CHK_MEM = async (req, res) => {
    try {
        const { tel_number } = req.body;
        const query = ` DECLARE @encTel VARCHAR(30);
                        SET @encTel = [baroyeon_crm].[dbo].UFN_GetHopeMaxLicense('2','0', @tel_number);

                        SELECT ac.*, am.addr_code, m.m_name
                        FROM [baroyeon_crm].[dbo].asso_contract ac
                        JOIN [baroyeon_crm].[dbo].Asso_mem am on ac.uid = am.idx
                        JOIN [baroyeon_crm].[dbo].baro_a001 a ON ac.uid = a.aid
                        JOIN [baroyeon_crm].[dbo].xManager m ON ac.counselor = m.m_id
                        WHERE a.tel_hand = @encTel; `;

        const params = [{ name: 'tel_number', type: sql.VarChar, value: tel_number }];

        const result = await executeQuery(query, params);

        res.status(200).json({
            RET_STAT: "success",
            RET_DESC: "✅ 조회 성공",
            RET_CODE: "0000",
            RET_DATA: result
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
    try {
        const { user_id, document_type, contract_select } = req.body;
        const file = req.file;

        if (!file || !user_id) {
            return res.status(400).json({
                RET_STAT: "fail",
                RET_DESC: "계약서 전송 중 오류가 발생하였습니다. 다시 시도해주세요.",
                RET_CODE: "1001"
            });
        }

        const filename = file.filename;

        // 파일 저장 프로시저 실행
        const transmitParams = [
            { name: 'asso_mem_idx', type: sql.Int, value: parseInt(user_id, 10) },
            { name: 'document_name', type: sql.VarChar(sql.MAX), value: filename },
            { name: 'document_type', type: sql.Int, value: parseInt(document_type, 10) },
            { name: 'contract_select', type: sql.Int, value: parseInt(contract_select, 10) }
        ];

        await executeProcedure('[baroyeon_crm].[dbo].[proc_transmit]', transmitParams);

        // 서명 완료 처리
        const ip = req.ip || req.connection.remoteAddress || '';
        const query = `
            UPDATE [baroyeon_crm].[dbo].asso_contract
            SET sign_yn = 'Y', sign_date = GETDATE(), sign_ip = @ip
            WHERE uid = @uid;
        `;

        const updateParams = [
            { name: 'ip', type: sql.VarChar, value: ip },
            { name: 'uid', type: sql.VarChar, value: user_id }
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
const UPLOAD_INFORMATION = async (req, res) => {
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