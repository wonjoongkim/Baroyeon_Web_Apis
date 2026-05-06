const { executeQuery } = require("../server/database");
const sql = require("mssql");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//############################################################
//#####               비밀번호 해싱 함수 Start            #####
//############################################################
async function hashPassword(password) {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}
//############################################################
//#####                비밀번호 해싱 함수 End             #####
//############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#############           Common Start          ###############
//#############################################################

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
// 파일 업로드
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

// YYYYMM 폴더명 생성 함수
const getYYYYMM = () => {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const EMFS_FILEUPLOAD = async (req, res) => {
  try {
    const files = req.files;
    const idx = parseInt(req.body.FileType);
    const appId = String(req.body.EMFS_APPID ?? "").trim().padStart(6, "0");

    if (!Number.isInteger(idx)) {
      return res.status(400).json({
        RET_DATA: null,
        RET_DESC: "유효하지 않은 FileType 입니다.",
        RET_CODE: "1005",
      });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({
        RET_DATA: null,
        RET_DESC: "업로드할 파일이 없습니다.",
        RET_CODE: "1001",
      });
    }

    // 저장 루트 경로
    const basePath = process.env.FILEUPLOAD_SAVE_PATH_MAPPINGAPP;
    if (!basePath) {
      return res.status(500).json({
        RET_DATA: null,
        RET_DESC: "서버 설정에 FILEUPLOAD_SAVE_PATH_MAPPINGAPP 경로가 없습니다.",
        RET_CODE: "1003",
      });
    }

    // 오늘 날짜 폴더 경로
    const yyyymm = getYYYYMM();
    const targetDir = path.join(basePath, yyyymm);

    // 폴더 없으면 생성
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const file = files[0];

      const File_Ext = file.originalname.split(".").pop().toLowerCase();
      const allowedExt = ["jpg", "jpeg", "png", "pdf", "gif"];
      if (!allowedExt.includes(File_Ext)) {
        return res.status(400).json({
          RET_DATA: null,
          RET_DESC: `허용되지 않은 파일 형식입니다: .${File_Ext}`,
          RET_CODE: "1002",
        });
      }

      // 새 파일명: APPID_idx.ext
      const newFileName = `${appId}_${idx}.${File_Ext}`;
      const newFilePath = path.join(targetDir, newFileName);

      if (!file.path) {
        return res.status(500).json({
          RET_DATA: null,
          RET_DESC: "multer가 diskStorage가 아닙니다. diskStorage로 설정하거나 buffer 저장 로직을 사용하세요.",
          RET_CODE: "1004",
        });
      }

      // 업로드된 파일을 새 위치/이름으로 이동
      fs.renameSync(file.path, newFilePath);

      const insertedFiles = {};
      insertedFiles[idx] = {
        FILE_PATH: newFilePath,
        FULL_FILE_URL: `${targetDir}/${newFileName}`, // 절대 경로
        ORG_FILE_NAME: file.originalname,
        SAVE_FILE_NAME: newFileName,
        YYYYMM: '/xApp/photo/' + yyyymm
      };

    return res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 파일 업로드 성공",
      RET_CODE: "0000",
      RET_DATA: insertedFiles,
    });
  } catch (err) {
    console.error("파일 저장 중 오류 발생:", err);
    return res.status(500).json({
      RET_STAT: "error",
      RET_DESC: "❌ 서버 오류 발생",
      RET_CODE: "1000",
    });
  }
};

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
// 파일 삭제
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
const EMFS_FILEDELETE = async (req, res) => {
  try {
    const {EMFS_APPID, FileName, FilePath, FileType  } = req.body;

    if (!EMFS_APPID || !FilePath || !FileName) {
      return res.status(400).json({
        RET_DATA: null,
        RET_DESC: "필수 값이 누락되었습니다.",
        RET_CODE: "1001",
      });
    }

    const Query = ` DELETE [baroyeon_crm].[dbo].APPMEMBERPROFILE5_PHOTO WHERE APPID = @EMFS_APPID AND P_TYPE = @P_TYPE `
    // 안전한 숫자 변환 + 1 (1-base 보정)
    const pType = Number.isFinite(+FileType) ? Number(FileType) + 1 : 1;

    // appID 공백 제거 및 길이 제한(선택)
    const appId = (EMFS_APPID ?? '').toString().trim();

    const Params = [
      { name: 'EMFS_APPID', type: sql.VarChar(20), value: appId },
      { name: 'P_Type',     type: sql.TinyInt,     value: FileType },   // ← tinyint로!
    ];
    await executeQuery(Query, Params);

    // 실제 파일 삭제
    DeletePath = path.join(process.env.FILEUPLOAD_SAVE_PATH_MAPPINGAPP, `${FilePath}/${FileName}`);

    try {
      await fs.promises.unlink(DeletePath);
      console.log(`✅ 파일 삭제 성공: ${DeletePath}`);
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.warn(`⚠️ 파일이 존재하지 않아 삭제되지 않았습니다: ${DeletePath}`);
      } else {
        console.error("❌ 파일 삭제 중 오류:", err);
        return res.status(500).json({
          RET_DATA: null,
          RET_DESC: "❌ 파일 삭제 중 오류가 발생했습니다.",
          RET_CODE: "1002",
        });
      }
    }

    return res.status(200).json({
      RET_DESC: "✅ 파일 삭제 완료",
      RET_CODE: "0000",
      RET_DATA: ""
    });
  } catch (err) {
    console.error("❌ 파일 삭제 중 예외 발생:", err);
    return res.status(500).json({
      RET_DATA: null,
      RET_DESC: `❌ 서버 오류 발생: ${err.message}`,
      RET_CODE: "1000",
    });
  }
};

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
// 직업 코드
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
const EMFS_JOB = async (req, res) => {
  try {
    // 직업
    const query = ` SELECT CODEKEY, CODEVALUE FROM [baroyeon_crm].[dbo].XCODELIST WHERE DEPTH = '1' AND CODEGROUP = 'jcd' AND LIVEDATE IS NULL ORDER BY CODEKEY ASC`
    const JobInfo = await executeQuery(query);

    return res.status(200).json({
        RET_DESC: "✅ 정보 조회 성공",
        RET_CODE: "0000",
        RET_DATA: JobInfo,
      });
  } catch (err) {   
    console.error("❌ EMFS_JOB 오류:", err);
    // 에러 처리
    res.status(500).json({
      RET_DATA: null,
      RET_DESC: "❌ 서버 오류 발생",
      RET_CODE: "1000",
    });
  }
}

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
// 직업 상세 코드
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
const EMFS_JOBDETAIL = async (req, res) => {
  const { JOBCODE } = req.body;
  try {
    // 직업 상세
    const query = `SELECT CODEKEY, CODEVALUE, DEPTH FROM [baroyeon_crm].[dbo].XCODELIST WHERE DEPTH <> '1' AND CODEGROUP = 'jcd' AND LEFT(CODEKEY, 2) = LEFT(@JOBCODE, 2) AND LIVEDATE IS NULL ORDER BY SORT ASC`
    const params = [{ name: "JOBCODE", type: sql.VarChar, value: JOBCODE }];
    const JobDetail = await executeQuery(query, params);

    if (!JobDetail) {
      return res.status(404).json({
        RET_DESC: "❌ 직업 정보를 찾을 수 없습니다.",
        RET_CODE: "4003",
        RET_DATA: null,
      });
    }

    return res.status(200).json({
      RET_DESC: "✅ 정보 조회 성공",
      RET_CODE: "0000",
      RET_DATA: JobDetail,
    });
  } catch (err) {
    res.status(500).json({
      RET_DATA: null,
      RET_DESC: "❌ 서버 오류 발생",
      RET_CODE: "1000",
    });
  }
}

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
// 최종학력
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
const EMFS_SCHOOL = async (req, res) => {
  try {
    const query = ` SELECT CODEKEY, CODEVALUE FROM [baroyeon_crm].[dbo].XCODELIST WHERE CODEGROUP = 'school' AND DEPTH = '1' AND LIVEDATE IS NULL; `;
    const SchoolInfo = await executeQuery(query);

    return res.status(200).json({
        RET_DESC: "✅ 정보 조회 성공",
        RET_CODE: "0000",
        RET_DATA: SchoolInfo,
      });
  } catch (err) {
    res.status(500).json({
      RET_DATA: null,
      RET_DESC: "❌ 서버 오류 발생",
      RET_CODE: "1000",
    });
  }
}

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
// 희망상대 - 코드검색
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
const EMFS_CODES = async (req, res) => {
  try {
    const { DivCode, CodeGroup, AppId } = req.body;

    query = ` SELECT CODEKEY, CODEVALUE, DEPTH, 
              (SELECT TOP 1 HOPEMATCH FROM [baroyeon_crm].[dbo].APPMEMBERPROFILE4 WHERE DIVCODE = @DIVCODE AND CODEKEY = DETCODE 
              AND APPID = @APPID ORDER BY COPYDIV DESC) AS CODEKEY_DATA
              FROM [baroyeon_crm].[dbo].XCODELIST WHERE DEPTH = '1' AND CODEGROUP =  @CODEGROUP AND LIVEDATE IS NULL ORDER BY SORT `
    const CodeParams = [
      { name: 'DIVCODE', type: sql.VarChar, value: DivCode },
      { name: 'CODEGROUP', type: sql.VarChar, value: CodeGroup },
      { name: 'APPID', type: sql.VarChar, value: AppId }
    ];
    const CodeInfo = await executeQuery(query, CodeParams);
    
    return res.status(200).json({
          RET_DESC: "✅ 정보 조회 성공",
          RET_CODE: "0000",
          RET_DATA: CodeInfo,
    });
  } catch (err) {
    res.status(500).json({
      RET_DATA: null,
      RET_DESC: "❌ 서버 오류 발생",
      RET_CODE: "1000",
    });
  }
}

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
// 희망상대 - 중요순위 코드
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
const EMFS_IMPORTANT = async (req, res) => {
  try {
    // query = ` SELECT CODEKEY, CODEVALUE FROM [baroyeon_crm].[dbo].xCodeList WHERE CODEGROUP = 'important' AND DEPTH = '1' AND LIVEDATE IS NULL ORDER BY SORT `
    query = ` SELECT CODEKEY, CODEVALUE FROM [baroyeon_crm].[dbo].xCodeList WHERE CODEGROUP = 'important' AND CODEKEY IN ('1','2','4','6','10') ORDER BY SORT  `
    const CodeInfo = await executeQuery(query);
    
    return res.status(200).json({
          RET_DESC: "✅ 정보 조회 성공",
          RET_CODE: "0000",
          RET_DATA: CodeInfo,
    });
  } catch (err) {
    res.status(500).json({
      RET_DATA: null,
      RET_DESC: "❌ 서버 오류 발생",
      RET_CODE: "1000",
    });
  }
}

//#############################################################
//#############           Common End            ###############
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓


//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####           E-매칭폼 회원정보 체크 Start            ######
//#############################################################
const EMFS_CHK = async (req, res) => {
try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        RET_DESC: "❌ 토큰이 없습니다.",
        RET_CODE: "4001",
        RET_DATA: null,
      });
    }

    const token = authHeader.split(" ")[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          RET_DESC: "❌ 토큰이 만료되었습니다.",
          RET_CODE: "3001",
          RET_DATA: null,
        });
      } else {
        return res.status(403).json({
          RET_DESC: "❌ 유효하지 않은 토큰입니다.",
          RET_CODE: "4004",
          RET_DATA: null,
        });
      }
    }

    const APPID = decoded.APPID;

    if (!APPID) {
      return res.status(400).json({
        RET_DESC: "❌ APPID 정보가 없습니다.",
        RET_CODE: "4002",
        RET_DATA: null,
      });
    }

    const query = `SELECT APPID FROM [baroyeon_crm].[dbo].APPMEMBER WHERE APPID = @APPID`;
    const params = [{ name: "APPID", type: sql.VarChar, value: APPID }];
    const [userInfo] = await executeQuery(query, params);

    if (!userInfo) {
      return res.status(404).json({
        RET_DESC: "❌ 사용자 정보를 찾을 수 없습니다.",
        RET_CODE: "4003",
        RET_DATA: null,
      });
    }

    return res.status(200).json({
      RET_DESC: "✅ 정보 조회 성공",
      RET_CODE: "0000",
      RET_DATA: userInfo,
    });
  } catch (err) {
   
    res.status(500).json({
      RET_DATA: null,
      RET_DESC: "❌ 서버 오류 발생",
      RET_CODE: "1000",
    });
  }
}
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####           E-매칭폼 회원정보 체크 End               ######
//#############################################################



//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####           E-매칭폼 준회원 체크 Start              ######
//#############################################################
const EMFS_LOGIN = async (req, res) => {
  try {
    const {
      Emfs_Name,        // 이름
      Emfs_IdNumberF,   // 주민번호 앞자리
      Emfs_IdNumberB,   // 주민번호 뒷자리
      Emfs_HandPhone,   // 휴대폰 번호 (예: 010-1234-5678)
      Emfs_Nationality  // 국가
    } = req.body;

    // ─────────────────────────────────────────
    // 1) 유효성 검사
    // ─────────────────────────────────────────
    if (!Emfs_Name || !Emfs_IdNumberF || !Emfs_IdNumberB || !Emfs_HandPhone || !Emfs_Nationality) {
      return res.status(200).json({
        RET_DATA: null,
        RET_DESC: "❌ 이름, 주민번호, 휴대폰번호, 국가선택은 필수입니다.",
        RET_CODE: "1001"
      });
    }

    // 국가명 → 코드 매핑 (미정의 국가 가드)
    const nationalityMap = { "대한민국": 0, "시민권자": 1, "영주권자": 2 };
    const nationalityInt = nationalityMap[Emfs_Nationality];
    if (nationalityInt == null) {
      return res.status(200).json({
        RET_DATA: null,
        RET_DESC: "❌ 지원하지 않는 국가입니다.",
        RET_CODE: "1003"
      });
    }

    // 전화번호 형식 검증
    const phoneRaw = String(Emfs_HandPhone || '').trim();
    if (!/^\d{2,3}-\d{3,4}-\d{4}$/.test(phoneRaw)) {
      return res.status(200).json({
        RET_DATA: null,
        RET_DESC: "❌ 유효하지 않은 전화번호 형식입니다. 예) 010-1234-5678",
        RET_CODE: "1002"
      });
    }
    const [Phone1] = phoneRaw.split('-');

    // ─────────────────────────────────────────
    // 2) 메인 쿼리: 전화번호+이름으로 회원 조회
    // ─────────────────────────────────────────
    const params = [
      { name: 'Phone1Input', type: sql.VarChar, value: Phone1 },
      { name: 'RawPhoneInput', type: sql.VarChar, value: phoneRaw },
      { name: 'Emfs_Name', type: sql.VarChar, value: Emfs_Name },
    ];

    const Query = `
      DECLARE @Phone2 VARCHAR(10), @Phone3 VARCHAR(10), @FullPhone VARCHAR(20);
      SET @Phone2 = [baroyeon_crm].[dbo].UFN_GetHopeMaxLicense('2', '2', @RawPhoneInput);
      SET @Phone3 = [baroyeon_crm].[dbo].UFN_GetHopeMaxLicense('2', '3', @RawPhoneInput);
      SET @FullPhone = @Phone1Input + '-' + @Phone2 + '-' + @Phone3;

      SELECT TOP 1 a.idx, b.aid, a.last_counsel, a.state, a.c_manager AS counselor, a.network,
                   a.cust_idx, a.uname, a.jumin1, a.jumin2, a.sex, a.married
      FROM [baroyeon_crm].[dbo].Asso_mem a
      INNER JOIN [baroyeon_crm].[dbo].baro_a001 b WITH (NOLOCK) ON a.idx = b.aid
      WHERE LEN(@FullPhone) > 8
        AND (
          b.tel_hand = @FullPhone OR b.tel_home = @FullPhone OR
          b.tel_etc_a = @FullPhone OR b.tel_etc_b = @FullPhone OR b.tel_etc_c = @FullPhone OR
          b.cust_tel_hand = @FullPhone OR b.cust_tel_home = @FullPhone OR
          b.cust_tel_etc_a = @FullPhone OR b.cust_tel_etc_b = @FullPhone OR b.cust_tel_etc_c = @FullPhone
        )
        AND a.uname = @Emfs_Name;
    `;

    const [user] = await executeQuery(Query, params);

    if (!user) {
      return res.status(200).json({
        RET_DATA: null,
        RET_DESC: "❌ 가입회원에 존재하지 않습니다.",
        RET_CODE: "2000"
      });
    }

    // ─────────────────────────────────────────
// 3) 이름+주민번호로 APPMEMBER 조회
// ─────────────────────────────────────────
const Query_S = `
SELECT TOP 1 APPID, TAPMENU1, TAPMENU2, TAPMENU3, TAPMENU4, TAPMENU5, TAPMENU6, TAPMENU7, STEP, 
       U_AGREE1, U_AGREE2, U_AGREE3, U_AGREE4,
       U_AGREE6, U_AGREE7, M_DATE_ADD, UNAMESIGN_ADD,
       U_AGREE5, U_AGREE5_DT, INSERT_IP, M_DATE, UNAMESIGN
FROM [baroyeon_crm].[dbo].APPMEMBER
WHERE UNAME = @Emfs_Name AND REPLACE(JUMIN1, '-', '') = @Jumin1
ORDER BY APPID DESC
`;

const juminParams = [
{ name: 'Emfs_Name', type: sql.VarChar, value: Emfs_Name },
{ name: 'Jumin1', type: sql.Int, value: parseInt(Emfs_IdNumberF, 10) },
];

const [user_chk] = await executeQuery(Query_S, juminParams);

// 완료/미완료 판단
//const allOnes = !!user_chk && [1,2,3,4,5,6,7].every(i => Number(user_chk[`TAPMENU${i}`] ?? 0) === 1);
//const stepIsOne = !!user_chk && Number(user_chk.STEP ?? 0) === 1;

// 새 APPID 생성 쿼리/INSERT
const Query_N = `
SELECT APPID = RIGHT('000000' + CAST(ISNULL(MAX(APPID), 0) + 1 AS VARCHAR), 6)
FROM [baroyeon_crm].[dbo].APPMEMBER
`;
const insertNewAppMember = async (newAppId) => {
// 뒷자리는 UI 정책상 첫 자리만 의미 → '첫자리 + 000000'로 저장
const jumin2Composed = String(Emfs_IdNumberB || '').charAt(0) + '000000';
const Query_I = `
  INSERT INTO [baroyeon_crm].[dbo].APPMEMBER
  (APPID, ASSO_IDX, FORMTYPE, UNAME, JUMIN1, JUMIN2, SEX, FOREIGN_TYPE, FOREIGN_COUNTRY, STEP, REGDATE, REGTIME)
  VALUES
  (
    @APPID, @ASSO_IDX, 'C', @UNAME, @JUMIN1, @JUMIN2,
    LEFT(@JUMIN2, 1),
    @FOREIGN_TYPE, @FOREIGN_COUNTRY, '0',
    CONVERT(VARCHAR(8), GETDATE(), 112),
    REPLACE(CONVERT(VARCHAR(8), GETDATE(), 114), ':', '')
  )
`;
const insertParams = [
  { name: 'APPID', type: sql.VarChar, value: newAppId },
  { name: 'ASSO_IDX', type: sql.Int, value: user.idx },      // 2) 메인 조회에서 얻은 사용자
  { name: 'UNAME', type: sql.VarChar, value: user.uname },
  { name: 'JUMIN1', type: sql.Int, value: parseInt(Emfs_IdNumberF, 10) },
  { name: 'JUMIN2', type: sql.VarChar, value: jumin2Composed }, // VarChar 권장
  { name: 'FOREIGN_TYPE', type: sql.Int, value: nationalityInt },
  { name: 'FOREIGN_COUNTRY', type: sql.VarChar, value: Emfs_Nationality },
];
await executeQuery(Query_I, insertParams);
};

let APPID = '';
let STEPS = '0';

if (!user_chk) {
  // ▶ 레코드 없음 또는 모두 1(작성완료) → 새 APPID 생성
  const [user_n] = await executeQuery(Query_N);
  APPID = user_n.APPID;
  await insertNewAppMember(APPID);
  STEPS = '0'; // 새 신청서 시작
} else {
  // ▶ 이전 e-매칭폼이 없으면 → 기존 APPID 사용
  APPID = user_chk.APPID;

  // 필요 시 진행도 계산 유지
  const computeSteps = (u) => {
    const hasAgree1 = u.U_AGREE1 == 1 || u.U_AGREE2 == 1 || u.U_AGREE3 == 1;
    const hasAgree2 = u.U_AGREE6 == 1 || u.U_AGREE7 == 1 || (u.M_DATE_ADD || '').length > 0 || (u.UNAMESIGN_ADD || '').length > 0;
    const hasAgree3 = u.U_AGREE5 == 1 || (u.U_AGREE5_DT || '').length > 0 || (u.INSERT_IP || '').length > 0 || (u.M_DATE || '').length > 0 || (u.UNAMESIGN || '').length > 0;

    if (!hasAgree1) return '0';
    if (hasAgree1 && !hasAgree2) return 'a2';
    if (hasAgree1 && hasAgree2 && !hasAgree3) return 'a3';

    const taps = [u.TAPMENU1,u.TAPMENU2,u.TAPMENU3,u.TAPMENU4,u.TAPMENU5,u.TAPMENU6,u.TAPMENU7];
    const firstZeroIdx = taps.findIndex(v => Number(v) === 0);
    if (firstZeroIdx >= 0) return `t${firstZeroIdx + 1}`;
      return 't8';
  };
  STEPS = computeSteps(user_chk);
}
    // ─────────────────────────────────────────
    // 4) JWT 발급
    // ─────────────────────────────────────────
    const secret = process.env.JWT_SECRET || 'CHANGE_ME_IN_PROD';
    const AccessToken = jwt.sign({ APPID: APPID }, secret, { expiresIn: "8h" });

    // ─────────────────────────────────────────
    // 5) 성공 응답
    // ─────────────────────────────────────────
    return res.status(200).json({
      RET_DATA: {
        AccessToken,
        LOGIN_IDX: user.idx,
        LOGIN_CUST_IDX: user.cust_idx,
        LOGIN_NAME: user.uname,
        LOGIN_JUMIN1: String(Emfs_IdNumberF),
        LOGIN_GENDER:  String(Emfs_IdNumberB).charAt(0),
        APPID: APPID,
        STEPS: STEPS,
        COUNTRY_TYPE: nationalityInt,
        COUNTRY: Emfs_Nationality
      },
      RET_DESC: "✅ Login Success",
      RET_CODE: "0000"
    });

  } catch (err) {
    console.error("❌ 로그인 처리 중 오류:", err);
    return res.status(500).json({
      RET_DATA: null,
      RET_DESC: "❌ 서버 오류 발생",
      RET_CODE: "1000"
    });
  }
};
//############################################################
//#####           E-매칭폼 준회원 체크 End                #####
//############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓


//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####        E-매칭폼 인트라 로그인 체크 Start           ######
//#############################################################
const INTRA_LOGIN = async (req, res) => {
  try {
    const { EMFS_APPID, INTRA_MUID } = req.body;

    // ─────────────────────────────────────────
    // 1) 유효성 검사
    // ─────────────────────────────────────────
    if (!EMFS_APPID || !INTRA_MUID) {
      return res.status(200).json({
        RET_DATA: null,
        RET_DESC: "❌ 잘못된 접근이니다.",
        RET_CODE: "1001"
      });
    }

    // ─────────────────────────────────────────
    // 1) JWT 발급
    // ─────────────────────────────────────────
    const secret = process.env.JWT_SECRET || 'CHANGE_ME_IN_PROD';
    const AccessToken = jwt.sign({ APPID: EMFS_APPID }, secret, { expiresIn: "8h" });

    // ─────────────────────────────────────────
    // 2) 성공 응답
    // ─────────────────────────────────────────
    return res.status(200).json({
      RET_DATA: {
        AccessToken,
        APPID: EMFS_APPID,
        STEPS: '1',
      },
      RET_DESC: "✅ Login Success",
      RET_CODE: "0000"
    });

  } catch (err) {
    console.error("❌ 로그인 처리 중 오류:", err);
    return res.status(500).json({
      RET_DATA: null,
      RET_DESC: "❌ 서버 오류 발생",
      RET_CODE: "1000"
    });
  }
};
//############################################################
//#####        E-매칭폼 인트라 로그인 체크 End             #####
//############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//############################################################
//#####               동의서 등록 Start                   #####
//############################################################

function parseCheckVl(input) {
  if (!input) return new Set();
  if (Array.isArray(input)) return new Set(input.map(String));
  if (typeof input === 'string') {
    return new Set(
      input
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    );
  }
  return new Set();
}

const EMFS_AGREE = async (req, res) => {
  try {
    const { APPID, ERFS_NAME, AGREE_TYPE, M_DATE_ADD, M_DATE, CHECKVL, ITEMSCONTAINER } = req.body;
    
    if (!APPID || !AGREE_TYPE) {
      return res.status(400).json({
        RET_DESC: '❌ 잘못된 요청입니다. (필수값 누락)',
        RET_CODE: '1001',
        RET_DATA: null,
      });
    }

    const USER_IP = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';

    let Query = "";
    let params = [
      { name: "APPID", type: sql.VarChar, value: APPID }
    ];

    if (AGREE_TYPE === '1') {
      // 개인정보 수집 동의서: CHECKVL에 따라 개별 컬럼 설정
      // A→U_AGREE1, B→U_AGREE2, C→U_AGREE3, D→U_AGREE4
      const checked = parseCheckVl(CHECKVL);

      const U_AGREE1 = checked.has('A') ? '1' : '0';
      const U_AGREE2 = checked.has('B') ? '1' : '0';
      const U_AGREE3 = checked.has('C') ? '1' : '0';
      const U_AGREE4 = checked.has('D') ? '1' : '0';

      Query = ` 
        UPDATE [baroyeon_crm].[dbo].APPMEMBER
        SET 
          U_AGREE1 = @U_AGREE1,
          U_AGREE2 = @U_AGREE2,
          U_AGREE3 = @U_AGREE3,
          U_AGREE4 = @U_AGREE4 
        WHERE APPID = @APPID
      `;
      
      params.push(
        { name: 'U_AGREE1', type: sql.Char, value: U_AGREE1 },
        { name: 'U_AGREE2', type: sql.Char, value: U_AGREE2 },
        { name: 'U_AGREE3', type: sql.Char, value: U_AGREE3 },
        { name: 'U_AGREE4', type: sql.Char, value: U_AGREE4 },
      );

    } else if (AGREE_TYPE === '2') {
      Query = `
        UPDATE [baroyeon_crm].[dbo].APPMEMBER 
        SET U_AGREE6 = '1', U_AGREE7 = '1', M_DATE_ADD = @M_DATE_ADD, UNAMESIGN_ADD = @ERFS_NAME 
        WHERE APPID = @APPID
      `;
      params.push(
        { name: "M_DATE_ADD", type: sql.VarChar, value: M_DATE_ADD },
        { name: "ERFS_NAME", type: sql.VarChar, value: ERFS_NAME }
      );
    } else if (AGREE_TYPE === '3') {
      const { AgentSign, RelationShip, Birth, AgentTel1, AgentTel2, AgentTel3 } = ITEMSCONTAINER
      Query = `
        UPDATE [baroyeon_crm].[dbo].APPMEMBER 
        SET U_AGREE5 = '1', M_DATE = @M_DATE, UNAMESIGN = @ERFS_NAME, INSERT_IP = @INSERT_IP, 
        AGENTSIGN = @AGENTSIGN, RELATIONSHIP = @RELATIONSHIP, BIRTH = @BIRTH, AGENTTEL1 = @AGENTTEL1, AGENTTEL2 = @AGENTTEL2, AGENTTEL3 = @AGENTTEL3,        
        U_AGREE5_DT = getdate()
        WHERE APPID = @APPID
      `;
      params.push(
        { name: "M_DATE", type: sql.VarChar, value: M_DATE },
        { name: "ERFS_NAME", type: sql.VarChar, value: ERFS_NAME },
        { name: "INSERT_IP", type: sql.VarChar, value: USER_IP },
        { name: "AGENTSIGN", type: sql.VarChar, value: AgentSign },
        { name: "RELATIONSHIP", type: sql.VarChar, value: RelationShip },
        { name: "BIRTH", type: sql.VarChar, value: Birth },
        { name: "AGENTTEL1", type: sql.VarChar, value: AgentTel1 },
        { name: "AGENTTEL2", type: sql.VarChar, value: AgentTel2 },
        { name: "AGENTTEL3", type: sql.VarChar, value: AgentTel3 }
      );
    } else {
      return res.status(400).json({
        RET_DESC: "❌ AGREE_TYPE 값이 올바르지 않습니다.",
        RET_CODE: "4001",
        RET_DATA: null,
      });
    }

    await executeQuery(Query, params);

    return res.status(200).json({
      RET_DESC: "✅ 동의 정보 업데이트 성공",
      RET_CODE: "0000",
      RET_DATA: "success",
    });

  } catch (err) {
    console.error("❌ EMFS_AGREE 처리 중 오류 발생:", err);
    return res.status(500).json({
      RET_DESC: "❌ 서버 오류 발생",
      RET_CODE: "1000",
      RET_DATA: null,
    });
  }
};
//############################################################
//#####                동의서 등록 End                    #####
//############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
const EMFS_AGREE_SEL = async (req, res) => {
  try {
    const { APPID, AGREE_TYPE } = req.body;
    
    if (!APPID || !AGREE_TYPE) {
      return res.status(400).json({
        RET_DESC: '❌ 잘못된 요청입니다. (필수값 누락)',
        RET_CODE: '1001',
        RET_DATA: null,
      });
    }

    let Query = "";
    if (AGREE_TYPE === '1') {
      Query = ` SELECT U_AGREE1, U_AGREE2, U_AGREE3, U_AGREE4 FROM [baroyeon_crm].[dbo].APPMEMBER WHERE APPID = @APPID `;
    } else if (AGREE_TYPE === '2') {
      Query = ` SELECT U_AGREE6, U_AGREE7, M_DATE_ADD, UNAMESIGN_ADD [baroyeon_crm].[dbo].APPMEMBER FROM WHERE APPID = @APPID `;
    } else if (AGREE_TYPE === '3') {
      Query = ` SELECT U_AGREE5, M_DATE, UNAMESIGN, AGENTSIGN, RELATIONSHIP, BIRTH, AGENTTEL1, AGENTTEL2, AGENTTEL3, U_AGREE5_DT WHERE APPID = @APPID `;
    } else {
      return res.status(400).json({
        RET_DESC: "❌ AGREE_TYPE 값이 올바르지 않습니다.",
        RET_CODE: "4001",
        RET_DATA: null,
      });
    }
    const Params = [ 
      { name: "APPID", type: sql.VarChar, value: APPID } 
    ];
    const Result = await executeQuery(Query, Params);

    return res.status(200).json({
      RET_DESC: "✅ 조회 성공",
      RET_CODE: "0000",
      RET_DATA: Result,
    });

  } catch (err) {
    console.error("❌ 조회중 오류 발생:", err);
    return res.status(500).json({
      RET_DESC: "❌ 서버 오류 발생",
      RET_CODE: "1000",
      RET_DATA: null,
    });
  }
};
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//############################################################
//#####               동의서 조회 Start                   #####
//############################################################

//############################################################
//#####               동의서 조회 Start                   #####
//############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

// ############################################################
// #####               작성 완료 체크 Start                #####
// ############################################################
const EMFS_APP = async (req, res) => {
  try {
    const { EMFS_APPID } = req.body || {};

    if (!EMFS_APPID) {
      return res.status(400).json({
        RET_DESC: '❌ 잘못된 요청입니다. (필수값 누락)',
        RET_CODE: '1001',
      });
    }
    const Query = ` SELECT TapMenu1, TapMenu2,TapMenu3, TapMenu4, TapMenu5, TapMenu6, TapMenu7, Step FROM [baroyeon_crm].[dbo].[APPMEMBER] WHERE appID = @EMFS_APPID; `;
    const Params = [
      { name: 'EMFS_APPID', type: sql.VarChar, value: EMFS_APPID },
    ]
    const Result = await executeQuery(Query, Params);

    return res.status(200).json({
      RET_STAT: 'Success',
      RET_DESC: '✅ 등록 완료',
      RET_CODE: '0000',
      RET_DATA: Result
    });
  } catch (err) {
    console.error('본인소개 등록 중 오류 발생:', err);
    return res.status(500).json({
      RET_DATA: null,
      RET_DESC: '❌ 서버 오류 발생',
      RET_CODE: '1000',
    });
  }
}
// ############################################################
// #####                작성 완료 체크 End                 #####
// ############################################################

// ############################################################
// #####              본인소개 등록 Start                  #####
// ############################################################
const EMFS_APP1 = async (req, res) => {
  
  // 지역명 → 코드 매핑
  const CITY_MAP = {
    '서울': '01', '부산': '02', '대구': '03', '광주': '04', '인천': '05',
    '대전': '06', '울산': '07', '경기': '08', '강원': '09', '충북': '10',
    '충남': '11', '경북': '12', '경남': '13', '전북': '14', '전남': '15',
    '제주': '16', '해외': '17', '수원': '18', '세종': '19',
  };

  function mapCityCode(label) {
    if (!label) return null;
    const key = String(label).trim().substring(0, 2); // 앞 2글자
    return CITY_MAP[key] || null;
  }

  // 2자리/4자리 패딩
  const pad2 = (n) => String(n ?? '').padStart(2, '0');
  const pad4 = (n) => String(n ?? '').padStart(4, '0');

  // 생일 문자열(YYYY-MM-DD) 생성
  function buildBirthday(y, m, d) {
    if (!y || !m || !d) return null;
    const yyyy = pad4(y);
    const mm   = pad2(m);
    const dd   = pad2(d);
    return `${yyyy}${mm}${dd}`;
  }

  // 이메일 합성 (커스텀 도메인 고려)
  function buildEmail(local, domain, etcDomain) {
    if (!local) return null;
    const finalDomain = domain && domain !== 'etc' ? domain : (etcDomain || '');
    if (!finalDomain) return null;
    return `${local}@${finalDomain}`;
  }

  // 전화번호 합성 (빈 파트 제거)
  function buildPhone(a, b, c) {
    const parts = [a, b, c].map(v => (v || '').trim()).filter(Boolean);
    return parts.length ? parts.join('-') : null;
  }

  try {
    const { EMFS_APPID, EMFS_ITEMSCONTAINER } = req.body || {};

    if (!EMFS_APPID || !EMFS_ITEMSCONTAINER) {
      return res.status(400).json({
        RET_DESC: '❌ 잘못된 요청입니다. (필수값 누락)',
        RET_CODE: '1001',
      });
    }

    // 안전한 구조분해
    const {
      Addr_Domicile_1, Addr_Domicile_2, Addr_Domicile_3, Addr_Home_1, Addr_Home_2, Addr_Home_3, Ancestral, Army, Army_Etc, 
      BirthDay, BirthMonth, BirthType, BirthYear, Blood, Blood_Etc, Drinking, Email_1, Email_2, Glasses, Height_Txt, Live_Together,
      Gender, Married, Country,
      Problem_Chk, Religion, Religion_Str, Smoking, Tel_Etc_A1, Tel_Etc_A2, Tel_Etc_A3, Tel_Etc_B1, Tel_Etc_B2, Tel_Etc_B3,
      Tel_Self, Tel_Hope1, Tel_Hope2, Tel_Hope3, Tel_Hope_Mem, Tel_Hope_Mem_Etc, Weight_Txt
    } = EMFS_ITEMSCONTAINER;

    // 지역코드 매핑 (올바른 소스 사용)
    const Addr_Domicile = mapCityCode(Addr_Domicile_2);
    const Addr_Home = mapCityCode(Addr_Home_2);
    
    // 파생값 합성
    const birthday = buildBirthday(BirthYear, BirthMonth, BirthDay);
    const email = buildEmail(Email_1, Email_2);
    const telEtcA  = buildPhone(Tel_Etc_A1, Tel_Etc_A2, Tel_Etc_A3);
    const telEtcB  = buildPhone(Tel_Etc_B1, Tel_Etc_B2, Tel_Etc_B3);
    const telHope  = buildPhone(Tel_Hope1, Tel_Hope2, Tel_Hope3);

    // 존재 여부 확인
    const QueryChk = ` SELECT 1 FROM [baroyeon_crm].[dbo].[APPMEMBERPROFILE1] WHERE appID = @EMFS_APPID `;
    const Params_Chk = { name: 'EMFS_APPID', type: sql.VarChar, value: EMFS_APPID };
    const Chk_Result = await executeQuery(QueryChk, [Params_Chk]);

    // recordset 기반 존재 여부 판단
    const exists = Array.isArray(Chk_Result?.recordset) 
    ? Chk_Result.recordset.length > 0
    : Array.isArray(Chk_Result)
      ? Chk_Result.length > 0
      : !!Chk_Result;

    // 쿼리 문자열 준비 (UPDATE/INSERT 재사용)
    const UpdateSql = `
      UPDATE [baroyeon_crm].[dbo].[APPMEMBERPROFILE1]
        SET 
            addr_domicile     = @Addr_Domicile,
            post_domicile     = @Post_Domicile,
            addr_domicile1    = @Addr_Domicile1,
            addr_domicile2    = @Addr_Domicile2,
            addr_home         = @Addr_Home,
            post_home         = @Post_Home,
            addr_home1        = @Addr_Home_1,
            addr_home2        = @Addr_Home_2,
            ancestral         = @Ancestral,
            army              = @Army,
            army_Etc          = @Army_Etc,
            birthday          = @Birthday,
            birth_type        = @BirthType,
            blood             = @Blood,
            blood_Etc         = @Blood_Etc,
            Drinking          = @Drinking,
            email             = @Email,
            glasses           = @Glasses,
            height_txt        = @Height_Txt,
            live_together     = @Live_Together,
            problem_chk       = @Problem_Chk,
            religion          = @Religion,
            religion_str      = @Religion_Str,
            smoking           = @Smoking,
            tel_etc_a         = @Tel_Etc_A,
            tel_etc_b         = @Tel_Etc_B,
            tel_hand          = @Tel_Self,
            tel_etc_c         = @Tel_Hope,
            tel_hope_mem      = @Tel_Hope_Mem,
            tel_hope_mem_etc  = @Tel_Hope_Mem_Etc,
            weight_txt        = @Weight_Txt
      WHERE appID = @EMFS_APPID;
    `;

    const InsertSql = `
      INSERT INTO [baroyeon_crm].[dbo].[APPMEMBERPROFILE1] (
        appID,
        addr_domicile, post_domicile, addr_domicile1, addr_domicile2,
        addr_home, post_home, addr_home1, addr_home2,
        ancestral,
        army, army_Etc,
        birthday, birth_type, blood, blood_Etc,
        Drinking, email, glasses, height_txt,
        live_together, problem_chk, religion, religion_str, smoking,
        tel_etc_a, tel_etc_b, tel_hand, tel_etc_c, tel_hope_mem, tel_hope_mem_etc,
        weight_txt
      )
      VALUES (
        @EMFS_APPID,
        @Addr_Domicile, @Post_Domicile, @Addr_Domicile1, @Addr_Domicile2,
        @Addr_Home, @Post_Home, @Addr_Home_1, @Addr_Home_2,
        @Ancestral,
        @Army, @Army_Etc,
        @Birthday, @BirthType, @Blood, @Blood_Etc,
        @Drinking, @Email, @Glasses, @Height_Txt,
        @Live_Together, @Problem_Chk, @Religion, @Religion_Str, @Smoking,
        @Tel_Etc_A, @Tel_Etc_B, @Tel_Self, @Tel_Hope, @Tel_Hope_Mem, @Tel_Hope_Mem_Etc,
        @Weight_Txt
      );
    `;

    // 분기된 쿼리 선택
    let QueryApp = exists ? UpdateSql : InsertSql;

    const params = [
      { name: 'EMFS_APPID',         type: sql.VarChar,  value: EMFS_APPID },
      { name: 'Addr_Domicile',      type: sql.VarChar,  value: Addr_Domicile ?? null },
      { name: 'Post_Domicile',      type: sql.VarChar,  value: Addr_Domicile_1 ?? null },
      { name: 'Addr_Domicile1',     type: sql.VarChar,  value: Addr_Domicile_2 ?? null },
      { name: 'Addr_Domicile2',     type: sql.VarChar,  value: Addr_Domicile_3 ?? null },
      { name: 'Addr_Home',          type: sql.VarChar,  value: Addr_Home ?? null },
      { name: 'Post_Home',          type: sql.VarChar,  value: Addr_Home_1 ?? null },
      { name: 'Addr_Home_1',        type: sql.VarChar,  value: Addr_Home_2 ?? null },
      { name: 'Addr_Home_2',        type: sql.VarChar,  value: Addr_Home_3 ?? null },
      { name: 'Ancestral',          type: sql.VarChar,  value: Ancestral ?? null },
      { name: 'Army',               type: sql.VarChar,  value: Army ?? null },
      { name: 'Army_Etc',           type: sql.VarChar,  value: Army_Etc ?? null },
      { name: 'Birthday',           type: sql.Int,      value: birthday ?? null },
      { name: 'BirthType',          type: sql.Int,      value: BirthType ?? null },
      { name: 'Blood',              type: sql.VarChar,  value: Blood ?? null },
      { name: 'Blood_Etc',          type: sql.VarChar,  value: Blood_Etc ?? null },
      { name: 'Drinking',           type: sql.VarChar,  value: Drinking ?? null },
      { name: 'Email',              type: sql.VarChar,  value: email ?? null },
      { name: 'Glasses',            type: sql.VarChar,  value: Glasses ?? null },
      { name: 'Height_Txt',         type: sql.VarChar,  value: Height_Txt ?? null },
      { name: 'Live_Together',      type: sql.VarChar,  value: Live_Together ?? null },
      { name: 'Problem_Chk',        type: sql.VarChar,  value: Problem_Chk ?? null },
      { name: 'Religion',           type: sql.VarChar,  value: Religion ?? null },
      { name: 'Religion_Str',       type: sql.VarChar,  value: Religion_Str ?? null },
      { name: 'Smoking',            type: sql.VarChar,  value: Smoking ?? null },
      { name: 'Tel_Etc_A',          type: sql.VarChar,  value: telEtcA ?? null },
      { name: 'Tel_Etc_B',          type: sql.VarChar,  value: telEtcB ?? null },
      { name: 'Tel_Self',           type: sql.VarChar,  value: Tel_Self ?? null },
      { name: 'Tel_Hope',           type: sql.VarChar,  value: telHope ?? null },
      { name: 'Tel_Hope_Mem',       type: sql.Int,      value: Tel_Hope_Mem ?? null },
      { name: 'Tel_Hope_Mem_Etc',   type: sql.VarChar,  value: Tel_Hope_Mem_Etc ?? null },
      { name: 'Weight_Txt',         type: sql.VarChar,  value: Weight_Txt ?? null },
    ];

    try {
      await executeQuery(QueryApp, params);
    } catch (e) {
      // 동시요청 등으로 INSERT 중 PK 충돌(2627) 시 UPDATE로 폴백
      if (e?.number === 2627) {
        await executeQuery(UpdateSql, params);
      } else {
        throw e;
      }
    }

    const MemUpdateChk = `
      UPDATE [baroyeon_crm].[dbo].[APPMEMBER] 
        SET sex = @Gender, married = @Married, foreign_country = @Country, TAPMENU1 = '1'
      WHERE APPID = @EMFS_APPID;
    `;
    await executeQuery(MemUpdateChk, 
      [
        { name: 'EMFS_APPID',   type: sql.VarChar, value: EMFS_APPID },
        { name: 'Gender',       type: sql.Int, value: Gender },
        { name: 'Married',      type: sql.Int, value: Married },
        { name: 'Country',      type: sql.VarChar, value: Country }
      ]
    );

    return res.status(200).json({
      RET_STAT: 'Success',
      RET_DESC: '✅ 등록 완료',
      RET_CODE: '0000',
    });
  } catch (err) {
    console.error('본인소개 등록 중 오류 발생:', err);
    return res.status(500).json({
      RET_DATA: null,
      RET_DESC: '❌ 서버 오류 발생',
      RET_CODE: '1000',
    });
  }
};
// ############################################################
// #####                 본인소개 등록 End                 #####
// ############################################################

// ############################################################
// #####              본인소개 조회 Start                  #####
// ############################################################
const EMFS_APP1_SEL = async (req, res) => {
  try {
    const EMFS_APPID = (req.body?.EMFS_APPID ?? req.query?.EMFS_APPID ?? '').toString().trim();
    if (!EMFS_APPID) {
      return res.status(400).json({
        RET_DESC: '❌ 잘못된 요청입니다. (EMFS_APPID 누락)',
        RET_CODE: '1001',
      });
    }

    const Query = `
      SELECT
        A.Addr_Domicile, A.Post_Domicile, A.Addr_Domicile1, A.Addr_Domicile2, A.Addr_Home, A.Post_Home, A.Addr_Home1, A.Addr_Home2,
        A.Ancestral, A.Army, A.Army_Etc, A.Birthday, A.Birth_type, B.Jumin1, A.Blood, A.Blood_Etc, A.Drinking, A.Email, A.Glasses, 
        A.Height_Txt, A.Live_Together, A.Problem_Chk, A.Religion, A.Religion_Str, A.Smoking, 
        A.Tel_Etc_A, A.Tel_Etc_B, A.Tel_Hand, A.Tel_Etc_C, A.Tel_Hope_Mem, A.Tel_Hope_Mem_Etc, A.Weight_Txt,
        B.Uname, B.Sex, B.Married, B.Foreign_Type, B.Foreign_Country
      FROM [baroyeon_crm].[dbo].[APPMEMBERPROFILE1] AS A LEFT JOIN [baroyeon_crm].[dbo].[APPMEMBER] AS B ON A.APPID = B.APPID
      WHERE A.APPID = @EMFS_APPID
    `;

    const params = [{ name: 'EMFS_APPID', type: sql.VarChar(64), value: EMFS_APPID }];
    const result = await executeQuery(Query, params);

    const rows = Array.isArray(result?.recordset) ? result.recordset
               : Array.isArray(result) ? result
               : [];

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        RET_DESC: '🔎 조회 결과가 없습니다.',
        RET_CODE: '0404',
        RET_DATA: null,
      });
    }

    const data = rows[0];

    return res.status(200).json({
      RET_STAT: 'Success',
      RET_DESC: '✅ 조회 성공',
      RET_CODE: '0000',
      RET_DATA: data,
    });
  } catch (err) {
    console.error('본인소개 조회 중 오류 발생:', err);
    return res.status(500).json({
      RET_DATA: null,
      RET_DESC: '❌ 서버 오류가 발생했습니다.',
      RET_CODE: '1000',
    });
  }
};
// ############################################################
// #####                 본인소개 조회 End                 #####
// ############################################################

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#######             경제력/직업 등록 Start             #######
//#############################################################
const EMFS_APP2 = async (req, res) => {
  try{
    const { EMFS_APPID, EMFS_ASSETS } = req.body;
    
    if (!EMFS_APPID) {
      return res.status(400).json({
        RET_DESC: '❌ 잘못된 요청입니다. (필수값 누락)',
        RET_CODE: '1001',
      });
    }

    // 안전 유틸 (문자열로 온 경우도 처리)
    const normalizeMulti = (v) => {
      if (Array.isArray(v)) return v;
      try {
        const p = JSON.parse(v);
        if (Array.isArray(p)) return p;
      } catch {}
      return String(v ?? '').split(','); // "2,6"도 처리
    };
    const toCSV = (v) =>
      normalizeMulti(v).map(s => String(s).trim()).filter(Boolean).join(',') || null;

    // 컨트롤러에서
    const csvAssets2  = toCSV(EMFS_ASSETS.Assets2);  // "2,6"
    const csvPassets2 = toCSV(EMFS_ASSETS.Passets2); // "2,6"

    // 안전한 구조분해
    const {
      Assets, Assets2_Etc, Assets3, Assets4, Car, Car_Name, Com_Type, Com_Etc, Home_Pyeong, Home_Type, Home_Etc, 
      Income1, Income1_Desc, Income2, Income2_Desc, Income_Type1, Income_Type2, Job_Chk1, Job_Chk2, Job_Code1, Job_Code2, 
      Job_Dept1, Job_Dept2, Job_Desc, Job_Emp1, Job_Emp2, Job_Join1, Job_Join2, Job_Location1, Job_Location2, 
      Job_Name1, Job_Name2, Job_Part1, Job_Part2, Job_Position1, Job_Position2, Job_Term1, Job_Term2, Job_Type1, Job_Type2, 
      Live2, Live2_Etc, Nlive_Type, Nlive_Etc, Passets, Passets2_Etc, Passets3, Passets4
    } = EMFS_ASSETS;


    // 존재 여부 확인
    const QueryChk = ` SELECT 1 FROM [baroyeon_crm].[dbo].[APPMEMBERPROFILE2] WHERE appID = @EMFS_APPID `;
    const Params_Chk = { name: 'EMFS_APPID', type: sql.VarChar, value: EMFS_APPID };
    const Chk_Result = await executeQuery(QueryChk, [Params_Chk]);

    // recordset 기반 존재 여부 판단
    const exists = Array.isArray(Chk_Result?.recordset) 
    ? Chk_Result.recordset.length > 0
    : Array.isArray(Chk_Result)
      ? Chk_Result.length > 0
      : !!Chk_Result;

    // 쿼리 문자열 준비 (UPDATE/INSERT 재사용)
    const UpdateSql = `
      UPDATE [baroyeon_crm].[dbo].[APPMEMBERPROFILE2]
        SET
          assets        = @Assets,
          assets2       = @Assets2,
          assets2_etc   = @Assets2_Etc,
          assets3       = @Assets3,
          assets4       = @Assets4,
          car           = @Car,
          car_name      = @Car_Name,
          com_type      = @Com_Type,
          com_etc       = @Com_Etc,
          home_pyeong   = @Home_Pyeong,
          home_type     = @Home_Type,
          home_etc      = @Home_Etc,
          income1       = @Income1,
          income1_desc  = @Income1_Desc,
          income2       = @Income2,
          income2_desc  = @Income2_Desc,
          income_type1  = @Income_Type1,
          income_type2  = @Income_Type2,
          job_chk1      = @Job_Chk1,
          job_chk2      = @Job_Chk2,
          job_code1     = @Job_Code1,
          job_code2     = @Job_Code2,
          job_dept1     = @Job_Dept1,
          job_dept2     = @Job_Dept2,
          job_desc      = @Job_Desc,
          job_emp1      = @Job_Emp1,
          job_emp2      = @Job_Emp2,
          job_join1     = @Job_Join1,
          job_join2     = @Job_Join2,
          job_location1 = @Job_Location1,
          job_location2 = @Job_Location2,
          job_name1     = @Job_Name1,
          job_name2     = @Job_Name2,
          job_part1     = @Job_Part1,
          job_part2     = @Job_Part2,
          job_position1 = @Job_Position1,
          job_position2 = @Job_Position2,
          job_term1     = @Job_Term1,
          job_term2     = @Job_Term2,
          job_type1     = @Job_Type1,
          job_type2     = @Job_Type2,
          live2         = @Live2,
          live2_etc     = @Live2_Etc,
          nlive_type    = @Nlive_Type,
          nlive_etc     = @Nlive_Etc,
          passets       = @Passets,
          passets2      = @Passets2,
          passets2_etc  = @Passets2_Etc,
          passets3      = @Passets3,
          passets4      = @Passets4
      WHERE appID = @EMFS_APPID;
    `;

    const InsertSql = `
      INSERT INTO [baroyeon_crm].[dbo].[APPMEMBERPROFILE2] (
        appID,
        assets, assets2, assets2_etc, assets3, assets4,
        car, car_name,
        com_type, com_etc,
        home_pyeong, home_type, home_etc,
        income1, income1_desc, income2, income2_desc,
        income_type1, income_type2,
        job_chk1, job_chk2,
        job_code1, job_code2,
        job_dept1, job_dept2,
        job_desc,
        job_emp1, job_emp2,
        job_join1, job_join2,
        job_location1, job_location2,
        job_name1, job_name2,
        job_part1, job_part2,
        job_position1, job_position2,
        job_term1, job_term2,
        job_type1, job_type2,
        live2, live2_etc,
        nlive_type, nlive_etc,
        passets, passets2, passets2_etc, passets3, passets4
      )
      VALUES (
        @EMFS_APPID,
        @Assets, @Assets2, @Assets2_Etc, @Assets3, @Assets4,
        @Car, @Car_Name,
        @Com_Type, @Com_Etc,
        @Home_Pyeong, @Home_Type, @Home_Etc,
        @Income1, @Income1_Desc, @Income2, @Income2_Desc,
        @Income_Type1, @Income_Type2,
        @Job_Chk1, @Job_Chk2,
        @Job_Code1, @Job_Code2,
        @Job_Dept1, @Job_Dept2,
        @Job_Desc,
        @Job_Emp1, @Job_Emp2,
        @Job_Join1, @Job_Join2,
        @Job_Location1, @Job_Location2,
        @Job_Name1, @Job_Name2,
        @Job_Part1, @Job_Part2,
        @Job_Position1, @Job_Position2,
        @Job_Term1, @Job_Term2,
        @Job_Type1, @Job_Type2,
        @Live2, @Live2_Etc,
        @Nlive_Type, @Nlive_Etc,
        @Passets, @Passets2, @Passets2_Etc, @Passets3, @Passets4
      );
    `;

    // 분기된 쿼리 선택
    let QueryApp = exists ? UpdateSql : InsertSql;

    const params = [
      { name: 'EMFS_APPID',    type: sql.VarChar, value: EMFS_APPID },
      { name: 'Assets',        type: sql.Int, value: Assets ?? null },
      { name: 'Assets2',       type: sql.VarChar, value: csvAssets2 ?? null },
      { name: 'Assets2_Etc',   type: sql.VarChar, value: Assets2_Etc ?? null },
      { name: 'Assets3',       type: sql.VarChar, value: Assets3 ?? null },
      { name: 'Assets4',       type: sql.VarChar, value: Assets4 ?? null },
      { name: 'Car',           type: sql.Int, value: Car ?? null },
      { name: 'Car_Name',      type: sql.VarChar, value: Car_Name ?? null },
      { name: 'Com_Type',      type: sql.Int, value: Com_Type ?? null },
      { name: 'Com_Etc',       type: sql.VarChar, value: Com_Etc ?? null },
      { name: 'Home_Pyeong',   type: sql.VarChar, value: Home_Pyeong ?? null },
      { name: 'Home_Type',     type: sql.Int, value: Home_Type ?? null },
      { name: 'Home_Etc',      type: sql.VarChar, value: Home_Etc ?? null },
      { name: 'Income1',       type: sql.VarChar, value: Income1 ?? null },
      { name: 'Income1_Desc',  type: sql.VarChar, value: Income1_Desc ?? null },
      { name: 'Income2',       type: sql.Int, value: Income2 ?? null },
      { name: 'Income2_Desc',  type: sql.VarChar, value: Income2_Desc ?? null },
      { name: 'Income_Type1',  type: sql.Int, value: Income_Type1 ?? null },
      { name: 'Income_Type2',  type: sql.Int, value: Income_Type2 ?? null },
      { name: 'Job_Chk1',      type: sql.Int, value: Job_Chk1 ?? null },
      { name: 'Job_Chk2',      type: sql.Int, value: Job_Chk2 ?? null },
      { name: 'Job_Code1',     type: sql.VarChar, value: Job_Code1 ?? null },
      { name: 'Job_Code2',     type: sql.VarChar, value: Job_Code2 ?? null },
      { name: 'Job_Dept1',     type: sql.VarChar, value: Job_Dept1 ?? null },
      { name: 'Job_Dept2',     type: sql.VarChar, value: Job_Dept2 ?? null },
      { name: 'Job_Desc',      type: sql.NVarChar, value: Job_Desc ?? null },
      { name: 'Job_Emp1',      type: sql.VarChar, value: Job_Emp1 ?? null },
      { name: 'Job_Emp2',      type: sql.VarChar, value: Job_Emp2 ?? null },
      { name: 'Job_Join1',     type: sql.VarChar, value: Job_Join1 ?? null },
      { name: 'Job_Join2',     type: sql.VarChar, value: Job_Join2 ?? null },
      { name: 'Job_Location1', type: sql.VarChar, value: Job_Location1 ?? null },
      { name: 'Job_Location2', type: sql.VarChar, value: Job_Location2 ?? null },
      { name: 'Job_Name1',     type: sql.VarChar, value: Job_Name1 ?? null },
      { name: 'Job_Name2',     type: sql.VarChar, value: Job_Name2 ?? null },
      { name: 'Job_Part1',     type: sql.VarChar, value: Job_Part1 ?? null },
      { name: 'Job_Part2',     type: sql.VarChar, value: Job_Part2 ?? null },
      { name: 'Job_Position1', type: sql.VarChar, value: Job_Position1 ?? null },
      { name: 'Job_Position2', type: sql.VarChar, value: Job_Position2 ?? null },
      { name: 'Job_Term1',     type: sql.VarChar, value: Job_Term1 ?? null },
      { name: 'Job_Term2',     type: sql.VarChar, value: Job_Term2 ?? null },
      { name: 'Job_Type1',     type: sql.VarChar, value: Job_Type1 ?? null },
      { name: 'Job_Type2',     type: sql.VarChar, value: Job_Type2 ?? null },
      { name: 'Live2',         type: sql.VarChar, value: Live2 ?? null },
      { name: 'Live2_Etc',     type: sql.VarChar, value: Live2_Etc ?? null },
      { name: 'Nlive_Type',    type: sql.Int, value: Nlive_Type ?? null },
      { name: 'Nlive_Etc',     type: sql.VarChar, value: Nlive_Etc ?? null },
      { name: 'Passets',       type: sql.Int, value: Passets ?? null },
      { name: 'Passets2',      type: sql.VarChar, value: csvPassets2 ?? null },
      { name: 'Passets2_Etc',  type: sql.VarChar, value: Passets2_Etc ?? null },
      { name: 'Passets3',      type: sql.VarChar, value: Passets3 ?? null },
      { name: 'Passets4',      type: sql.VarChar, value: Passets4 ?? null },
    ];

    try {
      await executeQuery(QueryApp, params);
    } catch (e) {
      // 동시요청 등으로 INSERT 중 PK 충돌(2627) 시 UPDATE로 폴백
      if (e?.number === 2627) {
        await executeQuery(UpdateSql, params);
      } else {
        throw e;
      }
    }

    const MemUpdateChk = `
      UPDATE [baroyeon_crm].[dbo].[APPMEMBER]
        SET TAPMENU2 = '1'
      WHERE appID = @EMFS_APPID;
    `;
    await executeQuery(MemUpdateChk, [{ name: 'EMFS_APPID', type: sql.VarChar, value: EMFS_APPID }]);

    return res.status(200).json({
      RET_STAT: 'Success',
      RET_DESC: '✅ 등록 완료',
      RET_CODE: '0000',
    });
  } catch (err) {
    console.error('경제력/직업 등록 중 오류 발생:', err);
    return res.status(500).json({
      RET_DATA: null,
      RET_DESC: '❌ 서버 오류 발생',
      RET_CODE: '1000',
    });
  }
};
//#############################################################
//########             경제력/직업 등록 End             ########
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

// ############################################################
// #####            경제력/직업 조회 Start                 #####
// ############################################################
const EMFS_APP2_SEL = async (req, res) => {
  try {
    const EMFS_APPID = req.body?.EMFS_APPID;
    if (!EMFS_APPID) {
      return res.status(400).json({
        RET_DESC: '❌ 잘못된 요청입니다. (EMFS_APPID 누락)',
        RET_CODE: '1001',
      });
    }

    const Query = `
      SELECT
        appID, assets, assets2, assets2_etc, assets3, assets4, car, car_name, com_type, com_etc, home_pyeong, home_type, home_etc,
        income1, income1_desc, income2, income2_desc, income_type1, income_type2, job_chk1, job_chk2, job_code1, job_code2,
        job_dept1, job_dept2, job_desc, job_emp1, job_emp2, job_join1, job_join2, job_location1, job_location2, job_name1, job_name2,
        job_part1, job_part2, job_position1, job_position2, job_term1, job_term2, job_type1, job_type2, live2, live2_etc,
        nlive_type, nlive_etc, passets, passets2, passets2_etc, passets3, passets4
      FROM [baroyeon_crm].[dbo].[APPMEMBERPROFILE2] 
      WHERE APPID = @EMFS_APPID
    `;

    const params = [{ name: 'EMFS_APPID', type: sql.VarChar(64), value: EMFS_APPID }];
    const result = await executeQuery(Query, params);

    const rows = Array.isArray(result?.recordset) ? result.recordset
               : Array.isArray(result) ? result
               : [];

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        RET_DESC: '🔎 조회 결과가 없습니다.',
        RET_CODE: '0404',
        RET_DATA: null,
      });
    }

    const data = rows[0];

    return res.status(200).json({
      RET_STAT: 'Success',
      RET_DESC: '✅ 조회 성공',
      RET_CODE: '0000',
      RET_DATA: data,
    });
  } catch (err) {
    console.error('경제력/직업 조회 중 오류 발생:', err);
    return res.status(500).json({
      RET_DATA: null,
      RET_DESC: '❌ 서버 오류가 발생했습니다.',
      RET_CODE: '1000',
    });
  }
};
// ############################################################
// #####               경제력/직업 조회 End                #####
// ############################################################

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//######                  학력 등록 Start                 ######
//#############################################################
const EMFS_APP3 = async (req, res) => {
  try{
    const { EMFS_APPID, EMFS_ITEMSCONTAINER } = req.body;
    
    if (!EMFS_APPID || !EMFS_ITEMSCONTAINER) {
      return res.status(400).json({
        RET_DESC: '❌ 잘못된 요청입니다. (필수값 누락)',
        RET_CODE: '1001',
      });
    }    

    const {
      Abroad, Abroad_Etc, Abroad_Specialty, Abroad_Mon, Abroad_Name, Abroad_Nation, Abroad_Type, Abroad_Year, 
      Sch_Desc2, Sch_Grade, Study, Study_Etc, Study_Mon, Study_Name, Study_Nation, Study_Year, Study_Year1, Study_Year2,
      Educations = []
    } = EMFS_ITEMSCONTAINER;

       // 존재 여부 확인
       const QueryChk = ` SELECT 1 FROM [baroyeon_crm].[dbo].[APPMEMBERPROFILE2] WHERE appID = @EMFS_APPID `;
       const Params_Chk = { name: 'EMFS_APPID', type: sql.VarChar, value: EMFS_APPID };
       const Chk_Result = await executeQuery(QueryChk, [Params_Chk]);
   
       // recordset 기반 존재 여부 판단
       const exists = Array.isArray(Chk_Result?.recordset) 
       ? Chk_Result.recordset.length > 0
       : Array.isArray(Chk_Result)
         ? Chk_Result.length > 0
         : !!Chk_Result;
   
       // 쿼리 문자열 준비 (UPDATE/INSERT 재사용)
       const UpdateSql = `
        UPDATE [baroyeon_crm].[dbo].[APPMEMBERPROFILE2]
        SET
          sch_grade     = @Sch_Grade,
          abroad        = @Abroad,
          abroad_nation = @Abroad_Nation,
          abroad_name   = @Abroad_Name,
          abroad_major  = @Abroad_Specialty,
          abroad_type   = @Abroad_Type,
          abroad_year   = @Abroad_Year,
          abroad_mon    = @Abroad_Mon,
          abroad_etc    = @Abroad_Etc,
          sch_desc2     = @Sch_Desc2,
          study         = @Study,
          study_nation  = @Study_Nation,
          study_name    = @Study_Name,
          study_year1   = @Study_Year1,
          study_year2   = @Study_Year2,
          study_year    = @Study_Year,
          study_mon     = @Study_Mon,
          study_etc     = @Study_Etc
        WHERE appID = @EMFS_APPID;
       `;
   
       const InsertSql = `
        INSERT INTO [baroyeon_crm].[dbo].[APPMEMBERPROFILE2] (
          appID,
          sch_grade,
          abroad,
          abroad_nation, abroad_name, abroad_major, abroad_type, abroad_year, abroad_mon, abroad_etc,
          sch_desc2,
          study,
          study_nation, study_name, study_year1, study_year2, study_year, study_mon, study_etc
        )
        VALUES (
          @EMFS_APPID,
          @Sch_Grade,
          @Abroad,
          @Abroad_Nation, @Abroad_Name, @Abroad_Specialty, @Abroad_Type, @Abroad_Year, @Abroad_Mon, @Abroad_Etc,
          @Sch_Desc2,
          @Study,
          @Study_Nation, @Study_Name, @Study_Year1, @Study_Year2, @Study_Year, @Study_Mon, @Study_Etc
        );
       `;
   
      // 분기된 쿼리 선택
      let QueryApp = exists ? UpdateSql : InsertSql;
       
      const params = [
        { name: 'EMFS_APPID',     type: sql.VarChar, value: EMFS_APPID },
        { name: 'Sch_Grade',      type: sql.VarChar, value: Sch_Grade },
        { name: 'Abroad',         type: sql.Int, value: Abroad },
        { name: 'Abroad_Nation',  type: sql.VarChar, value: Abroad_Nation },
        { name: 'Abroad_Name',    type: sql.VarChar, value: Abroad_Name },
        { name: 'Abroad_Specialty',   type: sql.VarChar, value: Abroad_Specialty },
        { name: 'Abroad_Type',    type: sql.Int, value: Abroad_Type },
        { name: 'Abroad_Year',    type: sql.VarChar, value: Abroad_Year },
        { name: 'Abroad_Mon',     type: sql.VarChar, value: Abroad_Mon },
        { name: 'Abroad_Etc',     type: sql.VarChar, value: Abroad_Etc },
        { name: 'Sch_Desc2',      type: sql.VarChar, value: Sch_Desc2 },
        { name: 'Study',          type: sql.Int, value: Study },
        { name: 'Study_Nation',   type: sql.VarChar, value: Study_Nation },
        { name: 'Study_Name',     type: sql.VarChar, value: Study_Name },
        { name: 'Study_Year1',    type: sql.VarChar, value: Study_Year1 },
        { name: 'Study_Year2',    type: sql.VarChar, value: Study_Year2 },
        { name: 'Study_Year',     type: sql.Int, value: Study_Year },
        { name: 'Study_Mon',      type: sql.Int, value: Study_Mon },
        { name: 'Study_Etc',      type: sql.VarChar, value: Study_Etc },
      ];
      await executeQuery(QueryApp, params);

      // 학력 등록된 DATA 삭제
      const DeleteSql = ` DELETE FROM [baroyeon_crm].[dbo].[APPMEMBERPROFILE2_SCHOOL] WHERE appID = @EMFS_APPID; `;
      const paramsD = [{ name: 'EMFS_APPID', type: sql.VarChar, value: EMFS_APPID }];
      await executeQuery(DeleteSql, paramsD);

      // 학력 등록 Educations수량 만큼 INSERT
      const SQuery = ` INSERT INTO [baroyeon_crm].[dbo].[APPMEMBERPROFILE2_SCHOOL] (
        appID, uid, sch_code, sch_eYear, sch_etc, sch_grad, sch_location, sch_major, sch_name, sch_sYear
      ) VALUES (
        @EMFS_APPID, 0, @Sch_Code, @Sch_EYear, @Sch_Etc, @Sch_Grad, @Sch_Location, @Sch_Specialty, @Sch_Name, @Sch_SYear
      ); `;

      for (const edu of Educations || []) {
        await executeQuery(SQuery, [
          { name: 'EMFS_APPID',   type: sql.VarChar, value: EMFS_APPID },
          { name: 'Sch_Code',     type: sql.VarChar, value: edu?.Sch_Code },
          { name: 'Sch_EYear',    type: sql.VarChar, value: edu?.Sch_EYear },
          { name: 'Sch_Etc',      type: sql.VarChar, value: edu?.Sch_Etc },
          { name: 'Sch_Grad',     type: sql.Int, value: edu?.Sch_Grad },
          { name: 'Sch_Location', type: sql.VarChar, value: edu?.Sch_Location },
          { name: 'Sch_Specialty',    type: sql.VarChar, value: edu?.Sch_Specialty },
          { name: 'Sch_Name',     type: sql.VarChar, value: edu?.Sch_Name },
          { name: 'Sch_SYear',    type: sql.VarChar, value: edu?.Sch_SYear },
        ]);
      }

    const MemUpdateChk = `
      UPDATE [baroyeon_crm].[dbo].[APPMEMBER]
        SET TAPMENU3 = '1'
      WHERE appID = @EMFS_APPID;
    `;
    await executeQuery(MemUpdateChk, [{ name: 'EMFS_APPID', type: sql.VarChar, value: EMFS_APPID }]);

    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 등록 성공",
      RET_CODE: "0000",
      
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      RET_STAT: "error",
      RET_DESC: "❌ 서버 오류 발생",
      RET_CODE: "1000",
    });
  }
}
//#############################################################
//#######                학력 등록 End                   #######
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

// ############################################################
// #####                학력 조회 Start                    #####
// ############################################################
const EMFS_APP3_SEL = async (req, res) => {
  try {
    const EMFS_APPID = req.body?.EMFS_APPID;
    if (!EMFS_APPID) {
      return res.status(400).json({
        RET_DESC: '❌ 잘못된 요청입니다. (EMFS_APPID 누락)',
        RET_CODE: '1001',
      });
    }

    const DQuery = ` SELECT
        Sch_Grade, Abroad, Abroad_Nation, Abroad_Name, Abroad_Major as Abroad_Specialty, Abroad_Type, Abroad_Year, Abroad_Mon, Abroad_Etc, 
        Sch_Desc2, Study, Study_Nation, Study_Name, Study_Year1, Study_Year2, Study_Year, Study_Mon, Study_Etc
      FROM [baroyeon_crm].[dbo].[APPMEMBERPROFILE2] 
      WHERE APPID = @EMFS_APPID
    `;

    const SQuery = ` SELECT
      Sch_Code, Sch_EYear, Sch_Etc, Sch_Grad, Sch_Location, Sch_Major as Sch_Specialty, Sch_Name, Sch_SYear
    FROM [baroyeon_crm].[dbo].[APPMEMBERPROFILE2_SCHOOL] 
    WHERE APPID = @EMFS_APPID
  `;

    const params = [{ name: 'EMFS_APPID', type: sql.VarChar, value: EMFS_APPID }];
    const resultD = await executeQuery(DQuery, params);
    const resultS = await executeQuery(SQuery, params);

    const dRows = Array.isArray(resultD?.recordset) ? resultD.recordset : (Array.isArray(resultD) ? resultD : []);
    const sRows = Array.isArray(resultS?.recordset) ? resultS.recordset : (Array.isArray(resultS) ? resultS : []);

    // 메인 프로필이 없으면 404
    if (!dRows || dRows.length === 0) {
      return res.status(404).json({
        RET_DESC: '🔎 조회 결과가 없습니다.',
        RET_CODE: '0404',
        RET_DATA: null,
      });
    }

    return res.status(200).json({
      RET_STAT: 'Success',
      RET_DESC: '✅ 조회 성공',
      RET_CODE: '0000',
      RET_DATA: dRows[0], sRows,
    });
  } catch (err) {
    console.error('학력 조회 중 오류 발생:', err);
    return res.status(500).json({
      RET_DATA: null,
      RET_DESC: '❌ 서버 오류가 발생했습니다.',
      RET_CODE: '1000',
    });
  }
};
// ############################################################
// #####                   학력 조회 End                   #####
// ############################################################

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####                   가족 등록 Start                  #####
//#############################################################
// EMFS_APP4: 가족 정보 등록 (PROFILE1 + PROFILE1_FAMILY 업서트, APPMEMBER.TAPMENU4=1)
const EMFS_APP4 = async (req, res) => {
  try {
    const { EMFS_APPID, EMFS4_ITEMSCONTAINER } = req.body;
    if (!EMFS_APPID || !EMFS4_ITEMSCONTAINER) {
      return res.status(400).json({ RET_DESC: '❌ 잘못된 요청입니다. (필수값 누락)', RET_CODE: '1001' });
    }

    // payload 구조
    const {
      F01_Age, F01_Job_Aft, F01_Job_Bef, F01_Live_With, F01_Etc, F01_Local, F01_Name, F01_School_Code, F01_School_Name, // 부
      F02_Age, F02_Job_Aft, F02_Job_Bef, F02_Live_With, F02_Etc, F02_Local, F02_Name, F02_School_Code, F02_School_Name, // 모
      Brother_M, Brother_W, Brother_Th, Family_Etc, // 형제/자매 수 & 가족소개
      // 재혼/자녀 요약
      Marry_Child_M, Marry_Child_W, Marry_Custody,
      Marry_Etc1, Marry_Etc2, Marry_Kind, Marry_Mon, Marry_Sau, Marry_Year1, Marry_Year2, Marry_Year3,
      Familycations = [],
      Childcations  = [],
    } = EMFS4_ITEMSCONTAINER;

    // 배열 슬라이싱 & 유틸
    const sibs = (Familycations || []).slice(0, 3);
    const kids = (Childcations  || []).slice(0, 3);
    const S = (i, k, d = null) => (sibs[i] && sibs[i][k] != null ? sibs[i][k] : d);
    const C = (i, k, d = null) => (kids[i] && kids[i][k] != null ? kids[i][k] : d);

    // ──────────────────────────────────────────────────────────────
    // PROFILE1 존재여부 확인
    // ──────────────────────────────────────────────────────────────
    const QueryChk1 = ` SELECT 1 FROM [baroyeon_crm].[dbo].[APPMEMBERPROFILE1] WHERE appID = @EMFS_APPID; `;
    const chk1 = await executeQuery(QueryChk1, [
      { name: 'EMFS_APPID', type: sql.VarChar, value: EMFS_APPID },
    ]);
    const exists1 =
      Array.isArray(chk1?.recordset) ? chk1.recordset.length > 0 :
      Array.isArray(chk1) ? chk1.length > 0 : !!chk1;

    // PROFILE1 UPSERT (형제수/가족소개 + 재혼/자녀 요약)
    const UpdateSql1 = `
      UPDATE [baroyeon_crm].[dbo].[APPMEMBERPROFILE1]
      SET
        brother_m      = COALESCE(NULLIF(@Brother_M, ''), brother_m),
        brother_w      = COALESCE(NULLIF(@Brother_W, ''), brother_w),
        brother_th     = COALESCE(NULLIF(@Brother_Th, ''), brother_th),
        family_etc     = COALESCE(@Family_Etc, family_etc),

        marry_child_M  = COALESCE(NULLIF(@Marry_Child_M, ''), marry_child_M),
        marry_child_W  = COALESCE(NULLIF(@Marry_Child_W, ''), marry_child_W),
        marry_custody  = COALESCE(@Marry_Custody, marry_custody),
        marry_etc1     = COALESCE(@Marry_Etc1, marry_etc1),
        marry_etc2     = COALESCE(@Marry_Etc2, marry_etc2),
        marry_kind     = COALESCE(@Marry_Kind, marry_kind),
        marry_mon      = COALESCE(@Marry_Mon, marry_mon),
        marry_sau      = COALESCE(@Marry_Sau, marry_sau),
        marry_year1    = COALESCE(@Marry_Year1, marry_year1),
        marry_year2    = COALESCE(@Marry_Year2, marry_year2),
        marry_year3    = COALESCE(@Marry_Year3, marry_year3)
      WHERE appID = @EMFS_APPID;
      `;
    const InsertSql1 = `
      INSERT INTO [baroyeon_crm].[dbo].[APPMEMBERPROFILE1] (
        appID, brother_m, brother_w, brother_th, family_etc,
        marry_child_M, marry_child_W, marry_custody,
        marry_etc1, marry_etc2, marry_kind, marry_mon, marry_sau, marry_year1, marry_year2, marry_year3
      ) VALUES (
        @EMFS_APPID,
        COALESCE(NULLIF(@Brother_M, ''), 0),
        COALESCE(NULLIF(@Brother_W, ''), 0),
        COALESCE(NULLIF(@Brother_Th, ''), 0),
        @Family_Etc,

        COALESCE(NULLIF(@Marry_Child_M, ''), 0),
        COALESCE(NULLIF(@Marry_Child_W, ''), 0),
        @Marry_Custody,
        @Marry_Etc1, @Marry_Etc2, @Marry_Kind,
        COALESCE(@Marry_Mon, 0),
        @Marry_Sau, @Marry_Year1, @Marry_Year2, COALESCE(@Marry_Year3, 0)
      );
    `;
    const Params1 = [
      { name: 'EMFS_APPID',    type: sql.VarChar, value: EMFS_APPID },
      { name: 'Brother_M',     type: sql.Int, value: Brother_M ?? null },
      { name: 'Brother_W',     type: sql.Int, value: Brother_W ?? null },
      { name: 'Brother_Th',    type: sql.Int, value: Brother_Th ?? null },
      { name: 'Family_Etc',    type: sql.VarChar, value: Family_Etc ?? null },
      { name: 'Marry_Child_M', type: sql.Int, value: Marry_Child_M ?? null },
      { name: 'Marry_Child_W', type: sql.Int, value: Marry_Child_W ?? null },
      { name: 'Marry_Custody', type: sql.Int, value: Marry_Custody ?? null },
      { name: 'Marry_Etc1',    type: sql.VarChar, value: Marry_Etc1 ?? null },
      { name: 'Marry_Etc2',    type: sql.VarChar, value: Marry_Etc2 ?? null },
      { name: 'Marry_Kind',    type: sql.VarChar, value: Marry_Kind ?? null },
      { name: 'Marry_Mon',     type: sql.Int,     value: Marry_Mon ?? null },   // 개월 수
      { name: 'Marry_Sau',     type: sql.VarChar, value: Marry_Sau ?? null },
      { name: 'Marry_Year1',   type: sql.VarChar, value: Marry_Year1 ?? null }, // 'YYYY-MM'
      { name: 'Marry_Year2',   type: sql.VarChar, value: Marry_Year2 ?? null }, // 'YYYY-MM'
      { name: 'Marry_Year3',   type: sql.Int,     value: Marry_Year3 ?? null }, // 년 수
    ];
    await executeQuery(exists1 ? UpdateSql1 : InsertSql1, Params1);

    // ──────────────────────────────────────────────────────────────
    // PROFILE1_FAMILY 존재여부 확인
    // ──────────────────────────────────────────────────────────────
    const QueryChk2 = `
      SELECT 1
      FROM [baroyeon_crm].[dbo].[APPMEMBERPROFILE1_FAMILY]
      WHERE appID = @EMFS_APPID;
    `;
    const chk2 = await executeQuery(QueryChk2, [
      { name: 'EMFS_APPID', type: sql.VarChar, value: EMFS_APPID },
    ]);
    const exists2 =
      Array.isArray(chk2?.recordset) ? chk2.recordset.length > 0 :
      Array.isArray(chk2)            ? chk2.length > 0 : !!chk2;

    // PROFILE1_FAMILY UPSERT (부/모 + 형제 3 + 자녀 3)
    const UpdateSql2 = `
      UPDATE [baroyeon_crm].[dbo].[APPMEMBERPROFILE1_FAMILY]
      SET
        -- 부
        f01_age=@F01_Age, f01_job_after=@F01_Job_Aft, f01_job_before=@F01_Job_Bef, f01_live_with=@F01_Live_With,
        f01_etc=@F01_Etc, f01_local=@F01_Local, f01_name=@F01_Name, f01_school_code=@F01_School_Code, f01_school_name=@F01_School_Name,
        -- 모
        f02_age=@F02_Age, f02_job_after=@F02_Job_Aft, f02_job_before=@F02_Job_Bef, f02_live_with=@F02_Live_With,
        f02_etc=@F02_Etc, f02_local=@F02_Local, f02_name=@F02_Name, f02_school_code=@F02_School_Code, f02_school_name=@F02_School_Name,
        -- 형제 f03~f05
        f03_age=@F03_Age, f03_job=@F03_Job, f03_live_with=@F03_Live_With, f03_local=@F03_Local, f03_married=@F03_Married,
        f03_name=@F03_Name, f03_relation=@F03_Relation, f03_school_code=@F03_School_Code, f03_school_name=@F03_School_Name,
        f04_age=@F04_Age, f04_job=@F04_Job, f04_live_with=@F04_Live_With, f04_local=@F04_Local, f04_married=@F04_Married,
        f04_name=@F04_Name, f04_relation=@F04_Relation, f04_school_code=@F04_School_Code, f04_school_name=@F04_School_Name,
        f05_age=@F05_Age, f05_job=@F05_Job, f05_live_with=@F05_Live_With, f05_local=@F05_Local, f05_married=@F05_Married,
        f05_name=@F05_Name, f05_relation=@F05_Relation, f05_school_code=@F05_School_Code, f05_school_name=@F05_School_Name,
        -- 자녀 c01~c03
        c01_age=@C01_Age, c01_job=@C01_Job, c01_live_with=@C01_Live_With, c01_married=@C01_Married,
        c01_name=@C01_Name, c01_school_code=@C01_School_Code, c01_school_name=@C01_School_Name,
        c01_sex=@C01_Sex, c01_type1=@C01_Type1, c01_type2=@C01_Type2, c01_type3=@C01_Type3,
        c02_age=@C02_Age, c02_job=@C02_Job, c02_live_with=@C02_Live_With, c02_married=@C02_Married,
        c02_name=@C02_Name, c02_school_code=@C02_School_Code, c02_school_name=@C02_School_Name,
        c02_sex=@C02_Sex, c02_type1=@C02_Type1, c02_type2=@C02_Type2, c02_type3=@C02_Type3,
        c03_age=@C03_Age, c03_job=@C03_Job, c03_live_with=@C03_Live_With, c03_married=@C03_Married,
        c03_name=@C03_Name, c03_school_code=@C03_School_Code, c03_school_name=@C03_School_Name,
        c03_sex=@C03_Sex, c03_type1=@C03_Type1, c03_type2=@C03_Type2, c03_type3=@C03_Type3
      WHERE appID=@EMFS_APPID;
    `;
    const InsertSql2 = `
      INSERT INTO [baroyeon_crm].[dbo].[APPMEMBERPROFILE1_FAMILY] (
        appID,
        -- 부
        f01_age, f01_Job_after, f01_job_before, f01_live_with, f01_etc, f01_local, f01_name, f01_school_code, f01_school_name,
        -- 모
        f02_age, f02_job_after, f02_job_before, f02_live_with, f02_etc, f02_local, f02_name, f02_school_code, f02_school_name,
        -- 형제
        f03_age, f03_job, f03_live_with, f03_local, f03_married, f03_name, f03_relation, f03_school_code, f03_school_name,
        f04_age, f04_job, f04_live_with, f04_local, f04_married, f04_name, f04_relation, f04_school_code, f04_school_name,
        f05_age, f05_job, f05_live_with, f05_local, f05_married, f05_name, f05_relation, f05_school_code, f05_school_name,
        -- 자녀
        c01_age, c01_job, c01_live_with, c01_married, c01_name, c01_school_code, c01_school_name, c01_sex, c01_type1, c01_type2, c01_type3,
        c02_age, c02_job, c02_live_with, c02_married, c02_name, c02_school_code, c02_school_name, c02_sex, c02_type1, c02_type2, c02_type3,
        c03_age, c03_job, c03_live_with, c03_married, c03_name, c03_school_code, c03_school_name, c03_sex, c03_type1, c03_type2, c03_type3
      ) VALUES (
        @EMFS_APPID,
        -- 부
        @F01_Age, @F01_Job_Aft, @F01_Job_Bef, @F01_Live_With, @F01_Etc, @F01_Local, @F01_Name, @F01_School_Code, @F01_School_Name,
        -- 모
        @F02_Age, @F02_Job_Aft, @F02_Job_Bef, @F02_Live_With, @F02_Etc, @F02_Local, @F02_Name, @F02_School_Code, @F02_School_Name,
        -- 형제
        @F03_Age, @F03_Job, @F03_Live_With, @F03_Local, @F03_Married, @F03_Name, @F03_Relation, @F03_School_Code, @F03_School_Name,
        @F04_Age, @F04_Job, @F04_Live_With, @F04_Local, @F04_Married, @F04_Name, @F04_Relation, @F04_School_Code, @F04_School_Name,
        @F05_Age, @F05_Job, @F05_Live_With, @F05_Local, @F05_Married, @F05_Name, @F05_Relation, @F05_School_Code, @F05_School_Name,
        -- 자녀
        @C01_Age, @C01_Job, @C01_Live_With, @C01_Married, @C01_Name, @C01_School_Code, @C01_School_Name, @C01_Sex, @C01_Type1, @C01_Type2, @C01_Type3,
        @C02_Age, @C02_Job, @C02_Live_With, @C02_Married, @C02_Name, @C02_School_Code, @C02_School_Name, @C02_Sex, @C02_Type1, @C02_Type2, @C02_Type3,
        @C03_Age, @C03_Job, @C03_Live_With, @C03_Married, @C03_Name, @C03_School_Code, @C03_School_Name, @C03_Sex, @C03_Type1, @C03_Type2, @C03_Type3
      );
    `;

    // Params2 (루프로 생성)
    const Params2 = [
      { name: 'EMFS_APPID', type: sql.VarChar, value: EMFS_APPID },

      // 부
      { name: 'F01_Age',         type: sql.VarChar, value: F01_Age ?? null },
      { name: 'F01_Job_Aft',     type: sql.VarChar, value: F01_Job_Aft ?? null },
      { name: 'F01_Job_Bef',     type: sql.VarChar, value: F01_Job_Bef ?? null },
      { name: 'F01_Live_With',   type: sql.VarChar, value: F01_Live_With ?? null },
      { name: 'F01_Etc',         type: sql.VarChar, value: F01_Etc ?? null },
      { name: 'F01_Local',       type: sql.VarChar, value: F01_Local ?? null },
      { name: 'F01_Name',        type: sql.VarChar, value: F01_Name ?? null },
      { name: 'F01_School_Code', type: sql.VarChar, value: F01_School_Code ?? null },
      { name: 'F01_School_Name', type: sql.VarChar, value: F01_School_Name ?? null },

      // 모
      { name: 'F02_Age',         type: sql.VarChar, value: F02_Age ?? null },
      { name: 'F02_Job_Aft',     type: sql.VarChar, value: F02_Job_Aft ?? null },
      { name: 'F02_Job_Bef',     type: sql.VarChar, value: F02_Job_Bef ?? null },
      { name: 'F02_Live_With',   type: sql.VarChar, value: F02_Live_With ?? null },
      { name: 'F02_Etc',         type: sql.VarChar, value: F02_Etc ?? null },
      { name: 'F02_Local',       type: sql.VarChar, value: F02_Local ?? null },
      { name: 'F02_Name',        type: sql.VarChar, value: F02_Name ?? null },
      { name: 'F02_School_Code', type: sql.VarChar, value: F02_School_Code ?? null },
      { name: 'F02_School_Name', type: sql.VarChar, value: F02_School_Name ?? null },
    ];


    const joinSchoolCode = (cRaw, gRaw) => {
      const c = String(cRaw ?? '').trim();
      const g = String(gRaw ?? '').trim();
    
      // 앞코드가 없거나 '0'이면 저장하지 않음
      if (!c || c === '0') return null;
    
      // 미취학(8), 기타(10): G가 '0'이어도 유효
      if (c === '8' || c === '10') {
        return Number(`${c}${g || '0'}`); // '8'+'0' → 80, '10'+'0' → 100
      }
    
      // 그 외: G도 반드시 유효
      if (!g || g === '0') return null;
      return Number(`${c}${g}`); // 예: '5'+'1' → 51, '10'+'5' → 105
    }

    // 형제/자매 f03~f05
    [['F03',0],['F04',1],['F05',2]].forEach(([prefix, i]) => {
      Params2.push(
        { name: `${prefix}_Age`,         type: sql.VarChar, value: S(i, 'F_Age') ?? null },
        { name: `${prefix}_Job`,         type: sql.VarChar, value: S(i, 'F_Job') ?? null },
        { name: `${prefix}_Live_With`,   type: sql.VarChar, value: S(i, 'F_Live_With') ?? null },
        { name: `${prefix}_Local`,       type: sql.VarChar, value: S(i, 'F_Local') ?? null },
        { name: `${prefix}_Married`,     type: sql.VarChar, value: S(i, 'F_Married') ?? null },
        { name: `${prefix}_Name`,        type: sql.VarChar, value: S(i, 'F_Name') ?? null },
        { name: `${prefix}_Relation`,    type: sql.Int, value: S(i, 'F_Relation') ?? null },
        { name: `${prefix}_School_Code`, type: sql.Int, value: (() => joinSchoolCode(S(i,'F_School_Code'), S(i,'F_School_CodeG')))() },
        { name: `${prefix}_School_Name`, type: sql.VarChar, value: S(i, 'F_School_Name') ?? null },
      );
    });

    // 자녀 c01~c03
    [['C01',0],['C02',1],['C03',2]].forEach(([prefix, i]) => {
      Params2.push(
        { name: `${prefix}_Age`,         type: sql.VarChar, value: C(i, 'C_Age') ?? null },
        { name: `${prefix}_Job`,         type: sql.VarChar, value: C(i, 'C_Job') ?? null },
        { name: `${prefix}_Live_With`,   type: sql.VarChar, value: C(i, 'C_Live_With') ?? null },
        { name: `${prefix}_Married`,     type: sql.VarChar, value: C(i, 'C_Married') ?? null },
        { name: `${prefix}_Name`,        type: sql.VarChar, value: C(i, 'C_Name') ?? C(i, 'C_Type') ?? null },
        { name: `${prefix}_School_Code`, type: sql.Int, value: (() => joinSchoolCode(C(i,'C_School_Code'), C(i,'C_School_CodeG')))() },
        { name: `${prefix}_School_Name`, type: sql.VarChar, value: C(i, 'C_School_Name') ?? null },
        { name: `${prefix}_Sex`,         type: sql.Int, value: C(i, 'C_Sex') ?? null },
        { name: `${prefix}_Type1`,       type: sql.VarChar, value: C(i, 'C_Type1') ?? null },
        { name: `${prefix}_Type2`,       type: sql.VarChar, value: C(i, 'C_Type2') ?? null },
        { name: `${prefix}_Type3`,       type: sql.VarChar, value: C(i, 'C_Type3') ?? null },
      );
    });

    await executeQuery(exists2 ? UpdateSql2 : InsertSql2, Params2);

    // ──────────────────────────────────────────────────────────────
    // 진행상태 플래그
    // ──────────────────────────────────────────────────────────────
    const MemUpdate = ` UPDATE [baroyeon_crm].[dbo].[APPMEMBER] SET TAPMENU4 = '1' WHERE appID = @EMFS_APPID; `;
    await executeQuery(MemUpdate, [{ name: 'EMFS_APPID', type: sql.VarChar, value: EMFS_APPID }]);

    return res.status(200).json({
      RET_STAT: 'success',
      RET_DESC: '✅ 등록 성공',
      RET_CODE: '0000',
    });

  } catch (err) {
    console.error('가족 등록 오류 [EMFS_APP4] Error:', err);
    return res.status(500).json({
      RET_STAT: 'error',
      RET_DESC: '❌ 서버 오류 발생',
      RET_CODE: '1000',
    });
  }
};
//#############################################################
//#####                    가족 등록 End                   #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

// ############################################################
// #####                가족 조회 Start                    #####
// ############################################################
const EMFS_APP4_SEL = async (req, res) => {
  try {
    const EMFS_APPID = req.body?.EMFS_APPID;
    if (!EMFS_APPID) {
      return res.status(400).json({
        RET_DESC: '❌ 잘못된 요청입니다. (EMFS_APPID 누락)',
        RET_CODE: '1001',
      });
    }
    
    const compact = (obj) =>
      Object.fromEntries(
        Object.entries(obj).filter(([_, v]) =>
          !(v === null || v === undefined || (typeof v === 'string' && v.trim() === ''))
        )
      );
    
    // const isEmpty = (obj) => Object.keys(obj).length === 0;
    function isEmpty(obj) {
      if (!obj) return true;
      if (Array.isArray(obj)) return obj.length === 0;
      if (typeof obj === 'object') return Object.keys(obj).length === 0;
      return false;
    }


    // 1) 요약(프로필1)
    const P1_QUERY = `
      SELECT
        brother_m, brother_w, brother_th, family_etc, marry_child_m, marry_child_w, marry_custody,
        marry_etc1, marry_etc2, marry_kind, marry_mon, marry_sau, marry_year1, marry_year2, marry_year3
      FROM [baroyeon_crm].[dbo].[APPMEMBERPROFILE1]
      WHERE appID = @EMFS_APPID;
    `;

    // 2) 가족/자녀(한 번에 읽고 아래에서 배열로 변환)
    const FAM_QUERY = `
      SELECT
        -- F01(부)
        f01_age,
        f01_job_after,
        f01_job_before,
        f01_live_with,
        f01_etc,
        f01_local,
        f01_name,
        f01_school_code,
        f01_school_name,

        -- F02(모)
        f02_age,
        f02_job_after,
        f02_job_before,
        f02_live_with,
        f02_etc,
        f02_local,
        f02_name,
        f02_school_code,
        f02_school_name,

        -- F03/F04/F05(형제)
        f03_age, f03_job, f03_live_with, f03_local, f03_married, f03_name, f03_relation, f03_school_code, f03_school_name,
        f04_age, f04_job, f04_live_with, f04_local, f04_married, f04_name, f04_relation, f04_school_code, f04_school_name,
        f05_age, f05_job, f05_live_with, f05_local, f05_married, f05_name, f05_relation, f05_school_code, f05_school_name,

        -- C01/C02/C03(자녀)
        c01_age, c01_job, c01_live_with, c01_married, c01_name, c01_school_code, c01_school_name, c01_sex, c01_type1, c01_type2, c01_type3,
        c02_age, c02_job, c02_live_with, c02_married, c02_name, c02_school_code, c02_school_name, c02_sex, c02_type1, c02_type2, c02_type3,
        c03_age, c03_job, c03_live_with, c03_married, c03_name, c03_school_code, c03_school_name, c03_sex, c03_type1, c03_type2, c03_type3
      FROM [baroyeon_crm].[dbo].[APPMEMBERPROFILE1_FAMILY]
      WHERE appID = @EMFS_APPID;
    `;

    const params = [{ name: 'EMFS_APPID', type: sql.VarChar, value: EMFS_APPID }];

    const [p1Res, famRes] = await Promise.all([
      executeQuery(P1_QUERY, params),
      executeQuery(FAM_QUERY, params),
    ]);

    // 안전 분리 유틸(공용)
    const splitSchoolCode = (raw) => {
      const s = String(raw ?? '').trim();
      if (!s) return { code: null, codeG: null };
      if (s.startsWith('10')) {
        return { code: '10', codeG: s.charAt(2) || null };
      }
      return { code: s.charAt(0) || null, codeG: s.charAt(1) || null };
    }

    const P1 = Array.isArray(p1Res?.recordset) ? p1Res.recordset[0] : (Array.isArray(p1Res) ? p1Res[0] : null);
    const famRow = Array.isArray(famRes?.recordset) ? famRes.recordset[0] : (Array.isArray(famRes) ? famRes[0] : null);

    // famRow가 없으면 빈 배열
    const Familycations = [];
    const Childcations = [];

    // famRow에서 부모 객체 만들기 (빈 값 제거)
    const f01 = famRow ? compact({
      f01_age:         famRow.f01_age,
      f01_job_after:   famRow.f01_job_after,  // ← SELECT에서 alias로 맞춘 컬럼
      f01_job_before:  famRow.f01_job_before,
      f01_live_with:   famRow.f01_live_with,
      f01_etc:         famRow.f01_etc,
      f01_local:       famRow.f01_local,
      f01_name:        famRow.f01_name,
      f01_school_code: famRow.f01_school_code,
      f01_school_name: famRow.f01_school_name,
    }) : null;

    const f02 = famRow ? compact({
      f02_age:         famRow.f02_age,
      f02_job_after:   famRow.f02_job_after,
      f02_job_before:  famRow.f02_job_before,
      f02_live_with:   famRow.f02_live_with,
      f02_etc:         famRow.f02_etc,
      f02_local:       famRow.f02_local,
      f02_name:        famRow.f02_name,
      f02_school_code: famRow.f02_school_code,
      f02_school_name: famRow.f02_school_name,
    }) : null;

    // P1에 주입(비어있으면 키 자체를 안 넣음)
    if (!isEmpty(f01)) P1.F01 = f01;
    if (!isEmpty(f02)) P1.F02 = f02;

    if (famRow) {
      // F03
      const { code: f03code, codeG: f03codeG } = splitSchoolCode(famRow?.f03_school_code);
      const f03 = compact({
        F_Age:          famRow.f03_age,
        F_Job:          famRow.f03_job,
        F_Live_With:    famRow.f03_live_with,
        F_Local:        famRow.f03_local,
        F_Married:      famRow.f03_married,
        F_Name:         famRow.f03_name,
        F_Relation:     famRow.f03_relation,
        F_School_Code:  f03code,
        F_School_CodeG:  f03codeG,
        F_School_Name:  famRow.f03_school_name,
      });
      if (!isEmpty(f03)) Familycations.push(f03);

      // F04
      const { code: f04code, codeG: f04codeG } = splitSchoolCode(famRow?.f04_school_code);
      const f04 = compact({
        F_Age:          famRow.f04_age,
        F_Job:          famRow.f04_job,
        F_Live_With:    famRow.f04_live_with,
        F_Local:        famRow.f04_local,
        F_Married:      famRow.f04_married,
        F_Name:         famRow.f04_name,
        F_Relation:     famRow.f04_relation,
        F_School_Code:  f04code,
        F_School_CodeG:  f04codeG,
        F_School_Name:  famRow.f04_school_name,
      });
      if (!isEmpty(f04)) Familycations.push(f04);

      // F05
      const { code: f05code, codeG: f05codeG } = splitSchoolCode(famRow?.f05_school_code);
      const f05 = compact({
        F_Age:          famRow.f05_age,
        F_Job:          famRow.f05_job,
        F_Live_With:    famRow.f05_live_with,
        F_Local:        famRow.f05_local,
        F_Married:      famRow.f05_married,
        F_Name:         famRow.f05_name,
        F_Relation:     famRow.f05_relation,
        F_School_Code:  f05code,
        F_School_CodeG:  f05codeG,
        F_School_Name:  famRow.f05_school_name,
      });
      if (!isEmpty(f05)) Familycations.push(f05);

      // C01
      const { code: code01, codeG: codeG01 } = splitSchoolCode(famRow?.c01_school_code);
      const c01 = compact({
        C_Age:          famRow.c01_age,
        C_Job:          famRow.c01_job,
        C_Live_With:    famRow.c01_live_with,
        C_Married:      famRow.c01_married,
        C_Name:         famRow.c01_name,
        C_School_Code:  code01,
        C_School_CodeG: codeG01,
        C_School_Name:  famRow.c01_school_name,
        C_Sex:          famRow.c01_sex,
        C_Type1:        famRow.c01_type1,
        C_Type2:        famRow.c01_type2,
        C_Type3:        famRow.c01_type3,
      });
      if (!isEmpty(c01)) Childcations.push(c01);

      // C02
      const { code: code02, codeG: codeG02 } = splitSchoolCode(famRow?.c02_school_code);
      const c02 = compact({
        C_Age:          famRow.c02_age,
        C_Job:          famRow.c02_job,
        C_Live_With:    famRow.c02_live_with,
        C_Married:      famRow.c02_married,
        C_Name:         famRow.c02_name,
        C_School_Code:  code02,
        C_School_CodeG: codeG02,
        C_School_Name:  famRow.c02_school_name,
        C_Sex:          famRow.c02_sex,
        C_Type1:        famRow.c02_type1,
        C_Type2:        famRow.c02_type2,
        C_Type3:        famRow.c02_type3,
      });
      if (!isEmpty(c02)) Childcations.push(c02);

      // C03
      const { code: code03, codeG: codeG03 } = splitSchoolCode(famRow?.c03_school_code);
      const c03 = compact({
        C_Age:          famRow.c03_age,
        C_Job:          famRow.c03_job,
        C_Live_With:    famRow.c03_live_with,
        C_Married:      famRow.c03_married,
        C_Name:         famRow.c03_name,
        C_School_Code:  code03,
        C_School_CodeG: codeG03,
        C_School_Name:  famRow.c03_school_name,
        C_Sex:          famRow.c03_sex,
        C_Type1:        famRow.c03_type1,
        C_Type2:        famRow.c03_type2,
        C_Type3:        famRow.c03_type3,
      });
      if (!isEmpty(c03)) Childcations.push(c03);
    }

    return res.status(200).json({
      RET_STAT: 'Success',
      RET_DESC: '✅ 조회 성공',
      RET_CODE: '0000',
      RET_DATA: P1 || null,          // 프로필1(요약)
      Familycations,                  // [ {f01_*}, {f02_*}, {f03_*}, {f04_*}, {f05_*} ]
      Childcations                    // [ {c01_*}, {c02_*}, {c03_*} ]
    });
  } catch (err) {
    console.error('가족 조회 중 오류 발생:', err);
    return res.status(500).json({
      RET_DATA: null,
      RET_DESC: '❌ 서버 오류가 발생했습니다.',
      RET_CODE: '1000',
    });
  }
};

// ############################################################
// #####                   가족 조회 End                   #####
// ############################################################

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//####                  희망상대 등록 Start                 ####
//#############################################################
const EMFS_APP5 = async (req, res) => {
  try {
    const { EMFS_APPID, EMFS_ITEMSCONTAINER } = req.body;

    if (!EMFS_APPID || !EMFS_ITEMSCONTAINER) {
      return res.status(400).json({
        RET_DESC: '❌ 잘못된 요청입니다. (EMFS_APPID 누락)',
        RET_CODE: '1001',
      });
    }

    const {
      Age, Child, Height, Jobs, Married, Religion, School, 
      Importorder1, Importorder2, Importorder3, Matchpoint1, Matchpoint2, Matchpoint3, 
    } = EMFS_ITEMSCONTAINER;

    // "value|hopematch" → { detcode, hopematch }
    const parsePipe = (v) => {
      if (typeof v !== 'string') return null;
      const [code, hm] = v.split('|');
      if (!code) return null;
      const hopematch = String(Number(hm || '0')); // '0' | '2' | '3' 등
      return { detcode: String(code), hopematch };
    };

    // divcode별 rows 생성 (+ 기본행 1건 포함)
    // ✅ 변경점: hopematch 값이 0이어도 모두 INSERT
    const buildRows = (divcode, mapObj) => {
      const rows = [
        { divcode, detcode: '00000000', hopematch: '0' }, // 기본행
      ];
      if (mapObj && typeof mapObj === 'object') {
        for (const k of Object.keys(mapObj)) {
          const p = parsePipe(mapObj[k]);
          if (!p) continue;
          rows.push({ divcode, detcode: p.detcode, hopematch: p.hopematch });
        }
      }
      return rows;
    };

    const rows = [
      ...buildRows('job',      Jobs),
      ...buildRows('religion', Religion),
      ...buildRows('school',   School),
      ...buildRows('age',      Age),
      ...buildRows('height',   Height),
      ...buildRows('married',  Married),
      ...buildRows('child',    Child),
    ];

    // 다중 VALUES 파라미터 구성
    const params = [
      { name: 'EMFS_APPID', type: sql.VarChar, value: EMFS_APPID },
      { name: 'COPYDIV',    type: sql.Char(1), value: '0' },
      { name: 'MATCHPOINT1',  type: sql.NVarChar, value: Matchpoint1 ?? null },
      { name: 'MATCHPOINT2',  type: sql.NVarChar, value: Matchpoint2 ?? null },
      { name: 'MATCHPOINT3',  type: sql.NVarChar, value: Matchpoint3 ?? null },
      { name: 'IMPORTORDER1', type: sql.Int,      value: Importorder1 != null ? Number(Importorder1) : null },
      { name: 'IMPORTORDER2', type: sql.Int,      value: Importorder2 != null ? Number(Importorder2) : null },
      { name: 'IMPORTORDER3', type: sql.Int,      value: Importorder3 != null ? Number(Importorder3) : null },
    ];

    const valuesSql = rows.map((r, i) => {
      params.push(
        { name: `DIVCODE_${i}`,   type: sql.VarChar, value: r.divcode },    // varchar(10)
        { name: `DETCODE_${i}`,   type: sql.VarChar, value: r.detcode },    // varchar(8)
        { name: `HOPEMATCH_${i}`, type: sql.Char(1), value: r.hopematch }   // char(1)
      );
      return `(@EMFS_APPID, @COPYDIV, @DIVCODE_${i}, @DETCODE_${i}, @HOPEMATCH_${i})`;
    }).join(',\n');

    const batch = `
      SET XACT_ABORT ON;
      SET NOCOUNT ON;

      BEGIN TRAN;

      DELETE FROM [baroyeon_crm].[dbo].[APPMEMBERPROFILE4] WHERE appID = @EMFS_APPID AND copydiv = @COPYDIV;

      INSERT INTO [baroyeon_crm].[dbo].[APPMEMBERPROFILE4] (appID, copydiv, divcode, detcode, hopematch) VALUES ${valuesSql};

      IF EXISTS (SELECT 1 FROM [baroyeon_crm].[dbo].[APPMEMBERPROFILE3] WHERE appID = @EMFS_APPID)
      BEGIN
          UPDATE [baroyeon_crm].[dbo].[APPMEMBERPROFILE3]
          SET 
            MATCHPOINT1  = @MATCHPOINT1,
            MATCHPOINT2  = @MATCHPOINT2,
            MATCHPOINT3  = @MATCHPOINT3,
            IMPORTORDER1 = @IMPORTORDER1,
            IMPORTORDER2 = @IMPORTORDER2,
            IMPORTORDER3 = @IMPORTORDER3
          WHERE appID = @EMFS_APPID;
      END
      ELSE
      BEGIN
          INSERT INTO [baroyeon_crm].[dbo].[APPMEMBERPROFILE3]
            (appID, MATCHPOINT1, MATCHPOINT2, MATCHPOINT3, IMPORTORDER1, IMPORTORDER2, IMPORTORDER3)
          VALUES
            (@EMFS_APPID, @MATCHPOINT1, @MATCHPOINT2, @MATCHPOINT3, @IMPORTORDER1, @IMPORTORDER2, @IMPORTORDER3);
      END

      UPDATE [baroyeon_crm].[dbo].[APPMEMBER] SET TAPMENU5 = '1' WHERE appID = @EMFS_APPID;

      COMMIT TRAN;
    `;

    await executeQuery(batch, params);

    return res.status(200).json({
      RET_STAT: 'success',
      RET_DESC: '✅ 등록 성공',
      RET_CODE: '0000',
    });

  } catch (err) {
    console.error('희망상대 등록 오류 [EMFS_APP5] Error:', err);
    return res.status(500).json({
      RET_STAT: 'error',
      RET_DESC: '❌ 서버 오류 발생',
      RET_CODE: '1000',
    });
  }
};
//#############################################################
//####                  희망상대 등록 End                   ####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//####                  희망상대 조회 Start                 ####
//#############################################################
const EMFS_APP5_SEL = async (req, res) => {
  try {
    const { EMFS_APPID } = req.body;
    if (!EMFS_APPID) {
      return res.status(400).json({
        RET_DESC: '❌ 잘못된 요청입니다. (EMFS_APPID 누락)',
        RET_CODE: '1001',
      });
    }

    // PROFILE4 조회
    const sqlProfile4 = `
      SELECT divcode, detcode, hopematch FROM [baroyeon_crm].[dbo].[APPMEMBERPROFILE4]
      WHERE appID = @EMFS_APPID ORDER BY divcode, detcode
    `;
    const rows4 = await executeQuery(sqlProfile4, [
      { name: 'EMFS_APPID', type: sql.VarChar, value: EMFS_APPID },
    ]);

    // PROFILE3 조회
    const sqlProfile3 = `
      SELECT Matchpoint1, Matchpoint2, Matchpoint3, Importorder1, Importorder2, Importorder3
      FROM [baroyeon_crm].[dbo].[APPMEMBERPROFILE3]
      WHERE appID = @EMFS_APPID
    `;
    const rows3 = await executeQuery(sqlProfile3, [
      { name: 'EMFS_APPID', type: sql.VarChar, value: EMFS_APPID },
    ]);

    // ------------------------------------------------------
    // 가공: divcode 별로 묶어서 프론트와 동일한 구조로 반환
    // ------------------------------------------------------
    const grouped = {
      Age: {}, Child: {}, Height: {}, Jobs: {}, Married: {}, Religion: {}, School: {}
    };

    const rs4 = rows4?.recordset ?? rows4; // executeQuery 구현 호환
    if (Array.isArray(rs4)) {
      rs4.forEach(({ divcode, detcode, hopematch }) => {
        const key = String(divcode || '').toLowerCase();   // ✅ 소문자 기준
        const val = `${detcode}|${hopematch}`;
        switch (key) {
          case 'age':      grouped.Age[detcode]      = val; break;
          case 'child':    grouped.Child[detcode]    = val; break;
          case 'height':   grouped.Height[detcode]   = val; break;
          case 'job':      grouped.Jobs[detcode]     = val; break;
          case 'married':  grouped.Married[detcode]  = val; break;
          case 'religion': grouped.Religion[detcode] = val; break;
          case 'school':   grouped.School[detcode]   = val; break;
          default: break;
        }
      });
    }

    const profile3 = (rows3?.recordset ?? rows3)?.[0] || {};

    return res.status(200).json({
      RET_STAT: 'success',
      RET_DESC: '✅ 조회 성공',
      RET_CODE: '0000',
      RET_DATA: {
        ...grouped,
        Importorder1: profile3.Importorder1 ?? null,
        Importorder2: profile3.Importorder2 ?? null,
        Importorder3: profile3.Importorder3 ?? null,
        Matchpoint1: profile3.Matchpoint1 ?? null,
        Matchpoint2: profile3.Matchpoint2 ?? null,
        Matchpoint3: profile3.Matchpoint3 ?? null,
      },
    });

  } catch (err) {
    console.error('[EMFS_APP5_SE] Error:', err);
    return res.status(500).json({
      RET_STAT: 'error',
      RET_DESC: '❌ 서버 오류 발생',
      RET_CODE: '1000',
    });
  }
};
//#############################################################
//####                  희망상대 조회 End                   ####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//####                    추가정보 등록 Start               ####
//#############################################################
const EMFS_APP6 = async (req, res) => {
  try{
    const { EMFS_APPID, EMFS_ITEMSCONTAINER } = req.body;
    
    if (!EMFS_APPID || !EMFS_ITEMSCONTAINER) {
      return res.status(400).json({
        RET_DESC: '❌ 잘못된 요청입니다. (필수값 누락)',
        RET_CODE: '1001',
      });
    }

    const {
      My_Str1, My_Str2, My_Str3, My_Str4, My_Str5,
      My_Interest1, My_Interest2, My_Interest4, My_Interest5,
      My_Interest5_Etc, My_Interest7_Etc, My_Interest8_Etc, My_Interest9_Etc
    } = EMFS_ITEMSCONTAINER;
    
    // ✅ 멀티셀렉트 → CSV 직렬화 (숫자/숫자문자만 허용, 공백/중복 제거, 길이 제한)
    const toCsv = (val, { maxLen = 200 } = {}) => {
      if (!val) return null;
      const arr = Array.isArray(val) ? val : [val];
      const cleaned = Array.from(
        new Set(
          arr
            .map(String)
            .map(s => s.trim())
            .filter(s => s.length > 0 && /^[0-9]+$/.test(s)) // 숫자 코드만 허용
        )
      );
      if (cleaned.length === 0) return null;
      const csv = cleaned.join(',');
      return csv.length > maxLen ? csv.slice(0, maxLen) : csv;
    };

    // 존재 여부 확인
    const QueryChk = ` SELECT 1 FROM [baroyeon_crm].[dbo].[APPMEMBERPROFILE3] WHERE appID = @EMFS_APPID `;
    const Params_Chk = { name: 'EMFS_APPID', type: sql.VarChar, value: EMFS_APPID };
    const Chk_Result = await executeQuery(QueryChk, [Params_Chk]);

    // recordset 기반 존재 여부 판단
    const exists = Array.isArray(Chk_Result?.recordset) 
    ? Chk_Result.recordset.length > 0
    : Array.isArray(Chk_Result)
      ? Chk_Result.length > 0
      : !!Chk_Result;

    // 쿼리 문자열 준비 (UPDATE/INSERT 재사용)
    const UpdateSql = `
      UPDATE [baroyeon_crm].[dbo].[APPMEMBERPROFILE3]
        SET
          my_Str1				    = @My_Str1,
          my_Str2				    = @My_Str2,
          my_Str3				    = @My_Str3,
          my_Str4				    = @My_Str4,			
          my_Str5				    = @My_Str5,
          my_interest1		  = @My_Interest1,
          my_interest2		  = @My_Interest2,
          my_interest4		  = @My_Interest4,
          my_interest5		  = @My_Interest5,
          my_interest5_etc	= @My_Interest5_Etc,
          my_interest7_etc	= @My_Interest7_Etc,
          my_interest8_etc	= @My_Interest8_Etc,
          my_interest9_etc	= @My_Interest9_Etc
      WHERE appID = @EMFS_APPID;
    `;

    const InsertSql = `
      INSERT INTO [baroyeon_crm].[dbo].[APPMEMBERPROFILE3] (
        appID
        my_Str1, my_Str2, my_Str3, my_Str4, my_Str5,
        my_interest1, my_interest2, my_interest4, my_interest5,
        my_interest5_etc, my_interest7_etc, my_interest8_etc, my_interest9_etc
      ) VALUES  (
        @EMFS_APPID,
        @My_Str1, @My_Str2, @My_Str3, @My_Str4, @My_Str5,
        @My_Interest1, @My_Interest2, @My_Interest4, @My_Interest5,
        @My_Interest5_Etc, @My_Interest7_Etc, @My_Interest8_Etc, @My_Interest9_Etc
      );
    `;

    // 분기된 쿼리 선택
    let QueryApp = exists ? UpdateSql : InsertSql;

    const params = [
      { name: 'EMFS_APPID',         type: sql.VarChar, value: EMFS_APPID },
      { name: 'My_Str1',            type: sql.VarChar, value: My_Str1 ?? null },
      { name: 'My_Str2',            type: sql.VarChar, value: My_Str2 ?? null },
      { name: 'My_Str3',            type: sql.VarChar, value: My_Str3 ?? null },
      { name: 'My_Str4',            type: sql.VarChar, value: My_Str4 ?? null },
      { name: 'My_Str5',            type: sql.VarChar, value: My_Str5 ?? null },
      { name: 'My_Interest1',       type: sql.Int, value: My_Interest1 ?? null },
      { name: 'My_Interest2',       type: sql.Int, value: My_Interest2 ?? null },
      { name: 'My_Interest4',       type: sql.Int, value: My_Interest4 ?? null },
      { name: 'My_Interest5',       type: sql.VarChar, value: toCsv(My_Interest5) ?? null },
      { name: 'My_Interest5_Etc',   type: sql.VarChar, value: My_Interest5_Etc ?? null },
      { name: 'My_Interest7_Etc',   type: sql.VarChar, value: My_Interest7_Etc ?? null },
      { name: 'My_Interest8_Etc',   type: sql.VarChar, value: My_Interest8_Etc ?? null },
      { name: 'My_Interest9_Etc',   type: sql.VarChar, value: My_Interest9_Etc ?? null },
    ];

    try {
      await executeQuery(QueryApp, params);
    } catch (e) {
      // 동시요청 등으로 INSERT 중 PK 충돌(2627) 시 UPDATE로 폴백
      if (e?.number === 2627) {
        await executeQuery(UpdateSql, params);
      } else {
        throw e;
      }
    }

    const MemUpdateChk = ` UPDATE [baroyeon_crm].[dbo].[APPMEMBER] SET TAPMENU6 = '1' WHERE appID = @EMFS_APPID; `;
    await executeQuery(MemUpdateChk, [{ name: 'EMFS_APPID', type: sql.VarChar, value: EMFS_APPID }]);
    
    // 모든 삭제 완료 후 응답
    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 등록 성공",
      RET_CODE: "0000",
      RET_DATA: ""
    });

  } catch (err) {
    console.error(`추가정보 등록 오류 [EMFS_APP6] Error:`, err);
    res.status(500).json({
      RET_STAT: "error",
      RET_DESC: "❌ 서버 오류 발생",
      RET_CODE: "1000",
    });
  }
};
//#############################################################
//####                    추가정보 등록 End                 ####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//####                  추가정보 조회 Start                 ####
//#############################################################
const EMFS_APP6_SEL = async (req, res) => {
  try {
    const { EMFS_APPID } = req.body;
    if (!EMFS_APPID) {
      return res.status(400).json({
        RET_DESC: '❌ 잘못된 요청입니다. (EMFS_APPID 누락)',
        RET_CODE: '1001',
      });
    }

    const sqlProfile = `
      SELECT 
        My_Str1, My_Str2, My_Str3, My_Str4, My_Str5,
        My_Interest1, My_Interest2, My_Interest3, My_Interest4, My_Interest5,
        My_Interest5_Etc, My_Interest6, My_Interest6_Etc, My_Interest7_Etc, My_Interest8_Etc, My_Interest9_Etc
      FROM [baroyeon_crm].[dbo].[APPMEMBERPROFILE3]
      WHERE appID = @EMFS_APPID
    `;
    const rows = await executeQuery(sqlProfile, [
      { name: 'EMFS_APPID', type: sql.VarChar, value: EMFS_APPID },
    ]);

    return res.status(200).json({
      RET_STAT: 'success',
      RET_DESC: '✅ 조회 성공',
      RET_CODE: '0000',
      RET_DATA: rows
    });

  } catch (err) {
    console.error('[EMFS_APP5_SE] Error:', err);
    return res.status(500).json({
      RET_STAT: 'error',
      RET_DESC: '❌ 서버 오류 발생',
      RET_CODE: '1000',
    });
  }
};
//#############################################################
//####                  추가정보 조회 End                   ####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//#############################################################
//####                  사진등록 등록 Start                 ####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
const EMFS_APP7 = async (req, res) => {
  try {
    let { EMFS_APPID, EMFS_FILE, EMFS_ITEMSCONTAINER } = req.body;

    if (!EMFS_APPID) {
      return res.status(400).json({ 
        RET_DESC: '❌ EMFS_APPID 누락', 
        RET_CODE: '1001' 
      });
    }

    const filesArr  = Array.isArray(EMFS_FILE) ? EMFS_FILE : (EMFS_FILE ? [EMFS_FILE] : []);
    const photosArr = Array.isArray(EMFS_ITEMSCONTAINER?.photos) ? EMFS_ITEMSCONTAINER.photos : (EMFS_ITEMSCONTAINER?.photos ? [EMFS_ITEMSCONTAINER.photos] : []);

    if (!filesArr.length || !photosArr.length) {
      return res.status(400).json({ 
        RET_DESC: '❌ 파일/사진 정보가 없습니다.', 
        RET_CODE: '1001' 
      });
    }

    // 삭제 쿼리
    const DeleteSql = ` DELETE FROM [baroyeon_crm].[dbo].[APPMEMBERPROFILE5_PHOTO] WHERE appID = @EMFS_APPID; `;

    // 등록 쿼리
    const InsertSql = `
      INSERT INTO [baroyeon_crm].[dbo].[APPMEMBERPROFILE5_PHOTO] (
        appID, no, p_type, p_main, p_file, fileDir, p_width, p_height, p_desc1, p_desc2, wDate, del_yn, cust_chk
      ) VALUES (
        @EMFS_APPID, @No, @P_Type, @P_Main, @P_File, @FileDir, @P_Width, @P_Height, @P_Desc1, @P_Desc2, @WDate, @Del_Yn, @Cust_Chk
      );
    `;

    try {
      await executeQuery(DeleteSql, [ 
        { name: 'EMFS_APPID', type: sql.VarChar, value: EMFS_APPID },
      ]);

      const n = Math.min(filesArr.length, photosArr.length);
      for (let i = 0; i < n; i++) {
        const f = filesArr[i] || {};
        const p = photosArr[i] || {};

        const saveFile = (f?.SAVE_FILE_NAME ?? '').trim();
        const yyyymm   = (f?.YYYYMM ?? '').trim();
        if (!saveFile || !yyyymm) {
          console.warn('[EMFS_APP7] skip: fileinfo missing', { idx: i, saveFile, yyyymm });
          continue;
        }

        // Typeidx(1-base 없으면 i+1로)
        const typeIdx  = Number.isFinite(+p?.Typeidx) ? parseInt(p.Typeidx, 10) : (i + 1);
        const isMain   = typeIdx === 1; // 필요 시 규칙 변경
        // width/height는 varchar(4)로 저장
        const widthStr  = (p?.width  ?? '').toString().slice(0, 4) || null;
        const heightStr = (p?.height ?? '').toString().slice(0, 4) || null;

        // fileDir은 현재 yyyymm만 저장(원하시면 `/xApp/photo/${yyyymm}`로 변경)
        const fileDir = `${yyyymm}`;

        const params = [
          { name: 'EMFS_APPID', type: sql.VarChar,     value: EMFS_APPID },
          { name: 'No',         type: sql.SmallInt,    value: typeIdx },
          { name: 'P_Type',     type: sql.TinyInt,     value: typeIdx },
          { name: 'P_Main',     type: sql.Char(1),     value: isMain ? 'Y' : 'N' },
          { name: 'P_File',     type: sql.VarChar(50), value: saveFile || null },
          { name: 'FileDir',    type: sql.VarChar(100),value: fileDir || null },
          { name: 'P_Width',    type: sql.VarChar(4),  value: widthStr },
          { name: 'P_Height',   type: sql.VarChar(4),  value: heightStr },
          { name: 'P_Desc1',    type: sql.VarChar(50), value: p?.year ?? null },
          { name: 'P_Desc2',    type: sql.VarChar(100),value: p?.desc ?? null },
          { name: 'WDate',      type: sql.SmallDateTime, value: new Date() },
          { name: 'Del_Yn',     type: sql.Char(1),     value: 'N' },
          { name: 'Cust_Chk',   type: sql.TinyInt,     value: 0 },
        ];

        const r = await executeQuery(InsertSql, params);
      }

    } catch (inner) {
      throw inner;
    }

    // 완료 플래그
    await executeQuery(
      `UPDATE [baroyeon_crm].[dbo].[APPMEMBER] SET TAPMENU7 = '1' WHERE appID = @EMFS_APPID;`,
      [{ name: 'EMFS_APPID', type: sql.VarChar, value: EMFS_APPID }]
    );

    return res.status(200).json({
      RET_STAT: 'success',
      RET_DESC: '✅ 등록 성공',
      RET_CODE: '0000',
      RET_DATA: ''
    });

  } catch (err) {
    console.error('사진등록 등록 오류 [EMFS_APP7] Error:', err);
    return res.status(500).json({
      RET_STAT: 'error',
      RET_DESC: '❌ 서버 오류 발생',
      RET_CODE: '1000'
    });
  }
};
//#############################################################
//####                  사진등록 등록 End                   ####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//#############################################################
//####                  사진등록 조회 Start                 ####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
const EMFS_APP7_SEL = async (req, res) => {
  try {
    let { EMFS_APPID } = req.body;
    if (!EMFS_APPID) {
      return res.status(400).json({ RET_DESC: '❌ EMFS_APPID 누락', RET_CODE: '1001' });
    }

    const Query = `SELECT P_Type, P_File, P_Main, P_Width, P_Height, P_Desc1, P_Desc2, WDate, Del_Yn, FileDir, Cust_chk FROM [baroyeon_crm].[dbo].[APPMEMBERPROFILE5_PHOTO]
                  WHERE appID = @EMFS_APPID ORDER BY P_Type; `;
    const Params = [{ name: 'EMFS_APPID', type: sql.VarChar, value: EMFS_APPID }];
    const Result = await executeQuery(Query, Params);
    return res.status(200).json({
      RET_STAT: 'success', 
      RET_DESC: '✅ 등록 성공', 
      RET_CODE: '0000', 
      RET_DATA: Result
    });
  } catch (err) {
      console.error(err);
      res.status(500).json({
      RET_STAT: "error",
      RET_DESC: "❌ 서버 오류 발생",
      RET_CODE: "1000",
      });
  }
};
//#############################################################
//####                  사진등록 조회 End                   ####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓


//#############################################################
//####                  작성완료 조회 Start                 ####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
const EMFS_APP8 = async (req, res) => {
  try {
    let { EMFS_APPID } = req.body;
    if (!EMFS_APPID) {
      return res.status(400).json({ RET_DESC: '❌ EMFS_APPID 누락', RET_CODE: '1001' });
    }

    const Query = `UPDATE [baroyeon_crm].[dbo].[APPMEMBER] SET STEP = @STEP, STEP1DATE = @STEP1DATE WHERE APPID = @EMFS_APPID; `;
    const Params = [
      { name: 'EMFS_APPID', type: sql.VarChar, value: EMFS_APPID },
      { name: 'STEP', type: sql.VarChar, value: '1' },
      { name: 'STEP1DATE', type: sql.SmallDateTime, value: new Date() }
    ];

    await executeQuery(Query, Params);
    return res.status(200).json({
      RET_STAT: 'success', 
      RET_DESC: '✅ 등록 성공', 
      RET_CODE: '0000', 
    });
  } catch (err) {
      console.error(err);
      res.status(500).json({
      RET_STAT: "error",
      RET_DESC: "❌ 서버 오류 발생",
      RET_CODE: "1000",
      });
  }
};
//#############################################################
//####                  작성완료 조회 End                   ####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

module.exports = { 
  EMFS_JOB, 
  EMFS_JOBDETAIL, EMFS_SCHOOL, EMFS_CHK, EMFS_CODES, EMFS_IMPORTANT, EMFS_FILEUPLOAD, EMFS_FILEDELETE,
  EMFS_LOGIN, 
  INTRA_LOGIN,
  EMFS_AGREE, EMFS_AGREE_SEL,
  EMFS_APP,
  EMFS_APP1, EMFS_APP1_SEL,
  EMFS_APP2, EMFS_APP2_SEL,
  EMFS_APP3, EMFS_APP3_SEL,
  EMFS_APP4, EMFS_APP4_SEL,
  EMFS_APP5, EMFS_APP5_SEL, 
  EMFS_APP6, EMFS_APP6_SEL,
  EMFS_APP7, EMFS_APP7_SEL, 
  EMFS_APP8
};

