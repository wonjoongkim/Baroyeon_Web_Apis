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
    const idx = parseInt(req.body.idx ?? req.idx ?? 1, 10) || 1;
    const appId = String(req.body.EMFS_APPID ?? "").trim().padStart(6, "0");

    const insertedFiles = [];

    if (!files || files.length === 0) {
      return res.status(400).json({
        RET_DATA: null,
        RET_DESC: "업로드할 파일이 없습니다.",
        RET_CODE: "1001",
      });
    }

    // 저장 루트 경로
    const basePath = process.env.FILEUPLOAD_PATH_MAPPINGAPP;
    if (!basePath) {
      return res.status(500).json({
        RET_DATA: null,
        RET_DESC: "서버 설정에 FILEUPLOAD_PATH_MAPPINGAPP 경로가 없습니다.",
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

    let fileCounter = 0;

    for (const file of files) {
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
      const newIdx = idx + fileCounter;
      const newFileName = `${appId}_${newIdx}.${File_Ext}`;
      const newFilePath = path.join(targetDir, newFileName);

      // 업로드된 파일을 새 위치/이름으로 이동
      fs.renameSync(file.path, newFilePath);

      insertedFiles.push({
        FILE_PATH: newFilePath,
        FULL_FILE_URL: `${targetDir}/${newFileName}`, // 절대 경로
        ORG_FILE_NAME: file.originalname,
        SAVE_FILE_NAME: newFileName,
        YYYYMM: yyyymm,
      });

      fileCounter++;
    }

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

const EMFS_JOBDETAIL = async (req, res) => {
  const { JOBCODE } = req.body;
  try {
    // 직업 상세
    const query = `SELECT CODEKEY, CODEVALUE, DEPTH FROM [baroyeon_crm].[dbo].XCODELIST WHERE DEPTH <> '1' AND CODEGROUP = 'jcd' AND LEFT(CODEKEY, 2) = LEFT(@JOBCODE, 2) AND LIVEDATE IS NULL`
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
    query = ` SELECT CODEKEY, CODEVALUE FROM [baroyeon_crm].[dbo].XCODELIST WHERE CODEGROUP = 'school' AND DEPTH = '1' AND LIVEDATE IS NULL `
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
    query = ` SELECT CODEKEY, CODEVALUE FROM [baroyeon_crm].[dbo].xCodeList WHERE CODEGROUP = 'important' AND DEPTH = '1' AND LIVEDATE IS NULL ORDER BY SORT `
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
      Emfs_HandPhone,   // 휴대폰 번호
      Emfs_Nationality  // 국가
    } = req.body;

    // 유효성 검사
    if (!Emfs_Name || !Emfs_IdNumberF || !Emfs_IdNumberB || !Emfs_HandPhone || !Emfs_Nationality) {
      return res.status(400).json({
        RET_DESC: "❌ 이름, 주민번호, 휴대폰번호, 국가선택은 필수입니다.",
        RET_CODE: "1001"
      });
    }

    // ✅ 국가명 → 코드 매핑
    const nationalityMap = {
      "대한민국": 0,
      "시민권자": 1,
      "영주권자": 2
    };
    const nationalityInt = nationalityMap[Emfs_Nationality];

    const [Phone1, Phone2, Phone3] = Emfs_HandPhone.split('-');
    if (!Phone1 || !Phone2 || !Phone3) {
      return res.status(400).json({
        RET_DESC: "❌ 유효하지 않은 전화번호 형식입니다.",
        RET_CODE: "1002"
      });
    }

    // 파라미터 준비
    const params = [
      { name: 'Phone1Input', type: sql.VarChar, value: Phone1 },
      { name: 'RawPhoneInput', type: sql.VarChar, value: Emfs_HandPhone },
      { name: 'Emfs_Name', type: sql.VarChar, value: Emfs_Name },
    ];

    // 메인 쿼리 (전화번호 기준 사용자 조회) 로그인 처리
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
      return res.status(404).json({
        RET_DATA: null,
        RET_DESC: "❌ 가입회원에 존재하지 않습니다.",
        RET_CODE: "2000"
      });
    }

    // 회원 검색 파라미터
    const juminParams = [
      { name: 'Emfs_Name', type: sql.VarChar, value: Emfs_Name },
      { name: 'Jumin1', type: sql.Int, value: Emfs_IdNumberF },
      { name: 'Jumin2', type: sql.Int, value: Emfs_IdNumberB },
    ];

    // 회원 검색
    const Query_S = `
      SELECT APPID, TAPMENU1, TAPMENU2, TAPMENU3, TAPMENU4, TAPMENU5, TAPMENU6, TAPMENU7,
      U_AGREE1, U_AGREE2, U_AGREE3, U_AGREE4,
      U_AGREE6, U_AGREE7, M_DATE_ADD, UNAMESIGN_ADD,
      U_AGREE5, U_AGREE5_DT, INSERT_IP, M_DATE, UNAMESIGN
      FROM [baroyeon_crm].[dbo].APPMEMBER
      WHERE UNAME = @Emfs_Name AND JUMIN1 = @Jumin1 AND JUMIN2 = @Jumin2
    `;
    const [user_chk] = await executeQuery(Query_S, juminParams);

    let APPID = '';
    let STEPS = '0';
  
    const isIncompleteForm = user_chk && Object.entries(user_chk)
    .filter(([key]) => key.startsWith('TAPMENU'))
    .some(([, value]) => value == 0);

    if (isIncompleteForm) {
      // TAPMENU1~7 항목 중 하나라도 0일 경우 (작성 중 상태)
      APPID = user_chk.APPID;
      const hasAgree1 = user_chk.U_AGREE1 == 1 || user_chk.U_AGREE2 == 1 || user_chk.U_AGREE3 == 1;
      const hasAgree2 = user_chk.U_AGREE6 == 1 || user_chk.U_AGREE7 == 1 || (user_chk.M_DATE_ADD || '').length > 0 || (user_chk.UNAMESIGN_ADD || '').length > 0;
      const hasAgree3 = user_chk.U_AGREE5 == 1 || (user_chk.U_AGREE5_DT || '').length > 0 || (user_chk.INSERT_IP || '').length > 0 || (user_chk.M_DATE || '').length > 0 || (user_chk.UNAMESIGN || '').length > 0;
      if (hasAgree1) {
        STEPS = 'a2';
        if (hasAgree2) {
          STEPS = 'a3';
          if (hasAgree3) {
            STEPS = 't1';
          }
        }
      }
      for (let i = 1; i <= 7; i++) {
        const menuValue = user_chk[`TAPMENU${i}`];
        if (menuValue == 0) {
          STEPS = `t${i}`;
          break;
        }
      }
    } else {
      // 모든 항목이 1 이상이면 신규 APPID 생성 및 저장
      // APPID 생성
      const Query_N = `
        SELECT APPID = RIGHT('000000' + CAST(ISNULL(MAX(APPID), 0) + 1 AS VARCHAR), 6)
        FROM [baroyeon_crm].[dbo].APPMEMBER
      `;
      const [user_n] = await executeQuery(Query_N);
      APPID = user_n.APPID;

      // 회원 등록
      const Query_I = `
        INSERT INTO [baroyeon_crm].[dbo].APPMEMBER
        (APPID, ASSO_IDX, FORMTYPE, UNAME, JUMIN1, JUMIN2, SEX, FOREIGN_TYPE, FOREIGN_COUNTRY, STEP, REGDATE, REGTIME)
        VALUES
        (@APPID, @ASSO_IDX, 'C', @UNAME, @JUMIN1, @JUMIN2, 
        CASE 
          WHEN LEFT(@JUMIN2, 1) IN ('1', '3', '5', '7') THEN '1'
          WHEN LEFT(@JUMIN2, 1) IN ('2', '4', '6', '8') THEN '2'
          ELSE NULL -- 기타(외국인 포함)
        END,
        @FOREIGN_TYPE, @FOREIGN_COUNTRY, '0',
        CONVERT(VARCHAR(8), GETDATE(), 112), REPLACE(CONVERT(VARCHAR(8), GETDATE(), 114), ':', ''))
      `;
      const insertParams = [
        { name: 'APPID', type: sql.VarChar, value: APPID },
        { name: 'ASSO_IDX', type: sql.Int, value: user.idx },
        { name: 'UNAME', type: sql.VarChar, value: user.uname },
        { name: 'JUMIN1', type: sql.Int, value: parseInt(Emfs_IdNumberF) },
        { name: 'JUMIN2', type: sql.Int, value: parseInt(Emfs_IdNumberB) },
        { name: 'FOREIGN_TYPE', type: sql.Int, value: nationalityInt },
        { name: 'FOREIGN_COUNTRY', type: sql.Int, value: Emfs_Nationality }        
      ];
      await executeQuery(Query_I, insertParams);
    }

    // JWT 토큰 발급
    const AccessToken = jwt.sign(
      { APPID: APPID },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    return res.status(200).json({
      RET_DATA: {
        AccessToken,
        LOGIN_IDX: user.idx,
        LOGIN_CUST_IDX: user.cust_idx,
        LOGIN_NAME: user.uname,
        LOGIN_JUMIN1: Emfs_IdNumberF + Emfs_IdNumberB.charAt(0),
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
//############################################################
//#####               동의서 등록 Start                   #####
//############################################################
const EMFS_AGREE = async (req, res) => {
  try {
    const { APPID, ERFS_NAME, AGREE_TYPE, M_DATE_ADD, M_DATE } = req.body;
    const USER_IP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    let Query = "";
    let params = [
      { name: "APPID", type: sql.VarChar, value: APPID }
    ];

    if (AGREE_TYPE === '1') {
      Query = `
        UPDATE [baroyeon_crm].[dbo].APPMEMBER 
        SET U_AGREE1 = '1', U_AGREE2 = '1', U_AGREE3 = '1', U_AGREE4 = '1' 
        WHERE APPID = @APPID
      `;
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
      Query = `
        UPDATE [baroyeon_crm].[dbo].APPMEMBER 
        SET U_AGREE5 = '1', M_DATE = @M_DATE, UNAMESIGN = @ERFS_NAME, INSERT_IP = @INSERT_IP, U_AGREE5_DT = getdate()
        WHERE APPID = @APPID
      `;
      params.push(
        { name: "M_DATE", type: sql.VarChar, value: M_DATE },
        { name: "ERFS_NAME", type: sql.VarChar, value: ERFS_NAME },
        { name: "INSERT_IP", type: sql.VarChar, value: USER_IP }
      );
    } else {
      return res.status(400).json({
        RET_DESC: "❌ AGREE_TYPE 값이 올바르지 않습니다.",
        RET_CODE: "4001",
        RET_DATA: null,
      });
    }

    await executeQuery(Query, params);

    console.log("🟡 SQL 실행 전:", Query);
    console.log("🟡 Params:", params);

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
//#####                동의서 조회 End                    #####
//############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//############################################################
//#####              본인소개 등록 Start                  #####
//############################################################
const EMFS_APP1 = async (req, res) => {
  try {
    const { EMFS_APPID, EMFS_UNAME, EMFS_ANCESTRAL, EMFS_GENDER, EMFS_MARRIED, EMFS_BIRTHDAY, EMFS_COUNTRY, EMFS_EMAIL, 
            EMFS_ADDR_DOMICILE_1, EMFS_ADDR_DOMICILE_2, EMFS_ADDR_DOMICILE_3, EMFS_ADDR_HOME_1, EMFS_ADDR_HOME_2, EMFS_ADDR_HOME_3, 
            EMFS_TEL_HAND, EMFS_TEL_ETC_A, EMFS_TEL_ETC_B, EMFS_TEL_ETC_C, 
            EMFS_PROBLEM_CHK, EMFS_GLASSES, EMFS_DRINKING, EMFS_SMOKING, EMFS_RELIGION, EMFS_RELIGION_STR, EMFS_BLOOD, EMFS_BLOOD_ETC, 
            EMFS_LIVE_TOGETHER, EMFS_HEIGHT_TXT, EMFS_WEIGHT_TXT, EMFS_ARMY, EMFS_ARMY_ETC
          } = req.body;

    if (!EMFS_APPID) {
      return res.status(400).json({
        RET_DESC: "❌ 잘못된 접속입니다.",
        RET_CODE: "1001",
      });
    }

    const HashedPassword = await hashPassword(ADM_PW);

    const Query = ` INSERT INTO ADM_MEM (ADM_ID, ADM_PW, ADM_NAME, ADM_MOBILE, ADM_LEVEL) 
                    VALUES (@ADM_ID, @ADM_PW, @ADM_NAME, @ADM_MOBILE, @ADM_LEVEL)`;
    const params = [
      { name: 'ADM_ID', type: sql.VarChar, value: ADM_ID },
      { name: 'ADM_PW', type: sql.VarChar, value: HashedPassword },
      { name: 'ADM_NAME', type: sql.VarChar, value: ADM_NAME },
      { name: 'ADM_MOBILE', type: sql.VarChar, value: ADM_MOBILE },
      { name: 'ADM_LEVEL', type: sql.Int, value: '5' }
    ];
    const result = await executeQuery(Query, params);

    res.status(200).json({
      RET_STAT: "Success",
      RET_DESC: "✅ Registration Success",
      RET_CODE: "0000"
    });

  } catch (err) {
    console.error("로그인 처리 중 오류 발생:", err);
    res.status(500).json({
      RET_DATA: null,
      RET_DESC: `❌ 서버 오류 발생`,
      RET_CODE: "1000",
    });
  }
};
//############################################################
//#####                 본인소개 등록 End                 #####
//############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#######    공지사항(Notice) & 뉴스(News) List Start    #######
//#############################################################
const EMFS_APP2 = async (req, res) => {
  try{
    const { N2N_Type, numPage, TotalPage, Search } = req.body;
    const startRow = (parseInt(numPage) - 1) * parseInt(TotalPage) + 1;
    const endRow = parseInt(numPage) * parseInt(TotalPage);
    const WHERE_SEARCH = ` AND TITLE LIKE '%${Search}%' `;
    const Query = `
      SELECT * FROM
        (SELECT ROW_NUMBER() OVER(ORDER BY IDX DESC)AS RowNum, IDX, TYPE_ID, TITLE, CREATE_AT FROM NOTICE_NEWS 
        WHERE TYPE_ID = @N2N_Type AND STATUS = '1' ${WHERE_SEARCH} )AS TB
      WHERE TB.ROWNUM  
        BETWEEN @startRow AND @endRow
      ORDER BY IDX DESC
    `;
    const Query_Total = ` SELECT COUNT(*) AS TOTAL_CNT FROM NOTICE_NEWS WHERE TYPE_ID = @N2N_Type AND STATUS = '1' `;

    const params = [
      { name: 'N2N_Type', type: sql.VarChar, value: String(N2N_Type) },
      { name: 'startRow', type: sql.Int, value: startRow },
      { name: 'endRow', type: sql.Int, value: endRow },
      { name: 'WHERE_SEARCH', type: sql.VarChar, value: String(WHERE_SEARCH) }
    ];

    const result = await executeQuery(Query, params);
    const result_total = await executeQuery(Query_Total, params);
    const totalCount = result_total[0]?.TOTAL_CNT || 0;

    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 조회 성공",
      RET_CODE: "0000",
      RET_DATA: result,
      TOTAL_COUNT: totalCount
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
//########    공지사항(Notice) & 뉴스(News) List End    ########
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//######    공지사항(Notice) & 뉴스(News) Detail Start    ######
//#############################################################
const EMFS_APP3 = async (req, res) => {
  try{
    const { N2N_Type, N2N_IDX } = req.body;
    const Query = ` SELECT IDX, TYPE_ID, TITLE, CONTENTS, TARGET_URL, FILE_KEY, STATUS, CREATE_AT FROM NOTICE_NEWS 
      WHERE TYPE_ID = @N2N_Type AND IDX = @N2N_Idx AND STATUS = '1'
    `;
    const params = [
      { name: 'N2N_Idx', type: sql.VarChar, value: String(N2N_IDX) },
      { name: 'N2N_Type', type: sql.VarChar, value: String(N2N_Type) },
    ];
    const result = await executeQuery(Query, params);

    if (!result || result.length === 0) {
      return res.status(404).json({
        RET_STAT: 'fail',
        RET_DESC: '❌ 조회된 게시물이 없습니다',
        RET_CODE: '4040',
      });
    }

    const noticeData = result[0];

    let file_result = [];

    if (noticeData.FILE_KEY) {
      const Query_F = ` SELECT FILE_KEY, ORIGINAL_FILENAME, SAVE_FILENAME, FILE_PATH, FILE_EXT, FILE_SIZE FROM FILE_ATTACH WHERE FILE_KEY = @FILE_KEY `;
      const result_f = await executeQuery(Query_F, [
        { name: 'FILE_KEY', type: sql.VarChar, value: noticeData.FILE_KEY },
      ]);
      file_result = result_f || [];
    }

    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 조회 성공",
      RET_CODE: "0000",
      RET_DATA: {
        ...noticeData,
        file_result,
      }
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
//#######    공지사항(Notice) & 뉴스(News) Detail End    #######
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//####     공지사항(Notice) & 뉴스(News) INSERT Start       ####
//####     토큰 체크                                        ####
//#############################################################
const EMFS_APP4 = async (req, res) => {
  try {
    const { N2N_Type, N2N_Title, N2N_Contents, N2N_File_Key, N2N_Target_Url, N2N_STATUS, N2N_Create_At } = req.body;

    const Query = `
      INSERT INTO NOTICE_NEWS (TYPE_ID, TITLE, CONTENTS, TARGET_URL, FILE_KEY, STATUS, CREATE_AT) VALUES
      (@N2N_TYPE, @N2N_Title, @N2N_Contents, @N2N_Target_Url, @N2N_File_Key, @N2N_STATUS, @N2N_Create_At)
    `;

    const params = [
      { name: 'N2N_Type', type: sql.VarChar, value: String(N2N_Type) },
      { name: 'N2N_Title', type: sql.VarChar, value: String(N2N_Title) },
      { name: 'N2N_Contents', type: sql.VarChar, value: String(N2N_Contents) },
      { name: 'N2N_Target_Url', type: sql.VarChar, value: String(N2N_Target_Url) },
      { name: 'N2N_File_Key', type: sql.VarChar, value: String(N2N_File_Key) },
      { name: 'N2N_STATUS', type: sql.Char, value: String(N2N_STATUS) },
      { name: 'N2N_Create_At', type: sql.DateTime, value: String(N2N_Create_At) }
    ];

    const result = await executeQuery(Query, params);
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
  }
}
//#############################################################
//####     공지사항(Notice) & 뉴스(News) INSERT End         ####
//####     토큰 체크                                        ####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//####     공지사항(Notice) & 뉴스(News) UPDATE Start       ####
//####     토큰 체크                                        ####
//#############################################################
const EMFS_APP5 = async (req, res) => {
  try {
    const { N2N_Type, N2N_Title, N2N_Target_Url, N2N_Contents, N2N_Status, N2N_Create_At, N2N_Idx } = req.body;
    const Query = ` UPDATE NOTICE_NEWS SET  
                    TITLE = @N2N_Title, TARGET_URL = @N2N_Target_Url, CONTENTS = @N2N_Contents, Status = @N2N_Status, 
                    Create_At = @N2N_Create_At WHERE IDX = @N2N_Idx `;
    const params = [
      { name: 'N2N_Type', type: sql.VarChar, value: String(N2N_Type) },
      { name: 'N2N_Idx', type: sql.Int, value: String(N2N_Idx) },
      { name: 'N2N_Title', type: sql.VarChar, value: String(N2N_Title) },
      { name: 'N2N_Target_Url', type: sql.VarChar, value: String(N2N_Target_Url) },
      { name: 'N2N_Contents', type: sql.VarChar, value: String(N2N_Contents) },
      { name: 'N2N_Status', type: sql.Char, value: String(N2N_Status) },
      { name: 'N2N_Create_At', type: sql.DateTime, value: String(N2N_Create_At) },
    ];
    const result = await executeQuery(Query, params);
    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 수정 성공",
      RET_CODE: "0000",
      RET_DATA: ""
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
//####     공지사항(Notice) & 뉴스(News) UPDATE End         ####
//####     토큰 체크                                        ####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//####     공지사항(Notice) & 뉴스(News) DELETE Start       ####
//####     토큰 체크                                        ####
//#############################################################
const EMFS_APP6 = async (req, res) => {
  try {
    const { N2N_Type, N2N_Idx, FileType } = req.body;

    for (const IDX of N2N_Idx) {
      // NOTICE_NEWS → FILE_KEY 조회
      const FILE_SCK = `SELECT FILE_KEY FROM NOTICE_NEWS WHERE IDX = @IDX`;
      const result_sck = await executeQuery(FILE_SCK, [{ name: "IDX", type: sql.Int, value: IDX }]);

      if (result_sck.length === 0) {
        console.log(`IDX: ${IDX} → 해당 데이터 없음`);
        continue;
      }

      const fileKey = result_sck[0].FILE_KEY;

      // FILE_ATTACH → 파일명 조회
      const FILE_SEL = `SELECT SAVE_FILENAME FROM FILE_ATTACH WHERE FILE_KEY = @fileKey`;
      const result_sel = await executeQuery(FILE_SEL, [{ name: "fileKey", type: sql.VarChar, value: fileKey }]);

      // 파일 삭제
      if (result_sel.length > 0) {
        const filename = result_sel[0].SAVE_FILENAME;

        filePath = path.join(process.env.FILEUPLOAD_SAVE_PATH, fileName);

        try {
          await fs.promises.unlink(filePath);
          console.log(`🗑 파일 삭제 완료: ${filePath}`);
        } catch (fileErr) {
          console.warn(`⚠ 파일 삭제 실패 (이미 없을 수 있음): ${filePath}`, fileErr.message);
        }

        // FILE_ATTACH 삭제
        const FILE_DEL = `DELETE FROM FILE_ATTACH WHERE FILE_KEY = @fileKey`;
        await executeQuery(FILE_DEL, [
          { name: "fileKey", type: sql.VarChar, value: fileKey }
        ]);
      }

      // NOTICE_NEWS 삭제
      const DATE_DEL = `DELETE FROM NOTICE_NEWS WHERE IDX = @IDX`;
      await executeQuery(DATE_DEL, [
        { name: "IDX", type: sql.Int, value: IDX }
      ]);
    }

    // 모든 삭제 완료 후 응답
    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 삭제 성공",
      RET_CODE: "0000",
      RET_DATA: ""
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
//####     공지사항(Notice) & 뉴스(News) DELETE End         ####
//####     토큰 체크                                        ####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

const EMFS_APP7 = async (req, res) => {
    try {

    } catch (err) {
        console.error(err);
        res.status(500).json({
        RET_STAT: "error",
        RET_DESC: "❌ 서버 오류 발생",
        RET_CODE: "1000",
        });
    }
};

module.exports = { 
  EMFS_JOB, 
  EMFS_JOBDETAIL, EMFS_SCHOOL, EMFS_CHK, EMFS_CODES, EMFS_IMPORTANT, EMFS_FILEUPLOAD,
  EMFS_LOGIN, EMFS_AGREE, 
  EMFS_APP1, EMFS_APP2, EMFS_APP3, EMFS_APP4, EMFS_APP5, EMFS_APP6, EMFS_APP7 };

