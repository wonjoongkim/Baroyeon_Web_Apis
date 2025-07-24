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
const FileUpload = async (req, res) => {
  try {
    const { FileKey, FileType } = req.body;
    const files = req.files;
    const insertedFiles = [];

    for (const file of files) {
      const Original_FileName = Buffer.from(file.originalname, 'latin1').toString('utf8'); // 수정
      const Save_FileName = file.filename;
      const File_Ext = file.originalname.split(".").pop().toLowerCase();
      const File_Size = file.size;

      const allowedExt = ['jpg', 'jpeg', 'png', 'pdf', 'docx', 'gif'];
      if (!allowedExt.includes(File_Ext)) {
        return res.status(400).json({
          RET_DATA: null,
          RET_DESC: `허용되지 않은 파일 형식입니다: .${File_Ext}`,
          RET_CODE: "1002",
        });
      }

      File_Path = `${process.env.FILEUPLOAD_PATH}/`;
      // let File_Path = "";
      // if (FileType === "BOARD")
      //   File_Path = `${process.env.FILEUPLOAD_PATH_BOARD}/`;
      // else if (FileType === "MEETING")
      //   File_Path = `${process.env.FILEUPLOAD_PATH_MEETING}/`;
      // else if (FileType === "EVENT")
      //   File_Path = `${process.env.FILEUPLOAD_PATH_EVENT}/`;
      // else if (FileType === "MARRIAGE")
      //   File_Path = `${process.env.FILEUPLOAD_PATH_MARRIAGE}/`;

      const Query = ` INSERT INTO FILE_ATTACH ( FILE_KEY, ORIGINAL_FILENAME, SAVE_FILENAME, FILE_PATH, FILE_EXT, FILE_SIZE )
        OUTPUT INSERTED.IDX AS FileIdx
        VALUES ( @File_Key, @Original_FileName, @Save_FileName, @File_Path, @File_Ext, @File_Size )`;

      const params = [
        { name: 'File_Key', type: sql.VarChar, value: FileKey },
        { name: 'Original_FileName', type: sql.VarChar, value: Original_FileName },
        { name: 'Save_FileName', type: sql.VarChar, value: Save_FileName },
        { name: 'File_Path', type: sql.VarChar, value: File_Path },
        { name: 'File_Ext', type: sql.VarChar, value: File_Ext },
        { name: 'File_Size', type: sql.Int, value: File_Size }
      ];

      const result = await executeQuery(Query, params);

      insertedFiles.push({
        FileIdx: result?.recordset?.[0]?.FileIdx || null,
        SAVE_FILENAME: Save_FileName,
        ORIGINAL_FILENAME: Original_FileName,
        FILE_PATH: File_Path,
        FILE_SIZE: File_Size,
        FILE_EXT: File_Ext
      });
    }

    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 파일 업로드 성공",
      RET_CODE: "0000",
      RET_DATA: insertedFiles
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
// Editer 파일 업로드
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
const EditorUpload = async (req, res) => {
  try {
    const files = req.files;
    const insertedFiles = [];

    for (const file of files) {
      const Save_FileName = file.filename;
      const File_Ext = file.originalname.split(".").pop().toLowerCase();

      const allowedExt = ['jpg', 'jpeg', 'png', 'pdf', 'docx', 'gif'];
      if (!allowedExt.includes(File_Ext)) {
        return res.status(400).json({
          RET_DATA: null,
          RET_DESC: `허용되지 않은 파일 형식입니다: .${File_Ext}`,
          RET_CODE: "1002",
        });
      }

      File_Path = `${process.env.FILEUPLOAD_PATH_EDITOR}/`;

      insertedFiles.push({
        FILE_PATH: `${File_Path}${Save_FileName}`,
        FULL_FILE_URL: `${File_Path}${Save_FileName}` // ✅ 절대 경로 추가
      });
    }

    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 파일 업로드 성공",
      RET_CODE: "0000",
      RET_DATA: insertedFiles
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
// 파일 삭제
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
const FileDelete = async (req, res) => {
  try {
    const { File_Key, Save_FileName, FileType } = req.body;

    if (!File_Key || !Save_FileName) {
      return res.status(400).json({
        RET_DATA: null,
        RET_DESC: "필수 값이 누락되었습니다.",
        RET_CODE: "1001",
      });
    }

    // 실제 파일 삭제
    filePath = path.join(process.env.FILEUPLOAD_SAVE_PATH, Save_FileName);

    // let filePath = "";
    // if (FileType === "BOARD")
    //   filePath = path.join(process.env.FILEUPLOAD_SAVE_PATH_BOARD, Save_FileName);
    // else if (FileType === "MEETING")
    //   filePath = path.join(process.env.FILEUPLOAD_SAVE_PATH_MEETING, Save_FileName);
    // else if (FileType === "EVENT")
    //   filePath = path.join(process.env.FILEUPLOAD_SAVE_PATH_EVENT, Save_FileName);
    // else if (FileType === "MARRIAGE")
    //   filePath = path.join(process.env.FILEUPLOAD_SAVE_PATH_MARRIAGE, Save_FileName);


    try {
      await fs.promises.unlink(filePath);
      console.log(`✅ 파일 삭제 성공: ${filePath}`);
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.warn(`⚠️ 파일이 존재하지 않아 삭제되지 않았습니다: ${filePath}`);
      } else {
        console.error("❌ 파일 삭제 중 오류:", err);
        return res.status(500).json({
          RET_DATA: null,
          RET_DESC: "❌ 파일 삭제 중 오류가 발생했습니다.",
          RET_CODE: "1002",
        });
      }
    }

    // DB에서 파일 정보 삭제
    const deleteQuery = ` DELETE FROM FILE_ATTACH WHERE SAVE_FILENAME = @Save_FileName AND FILE_KEY = @File_Key `;
    const deleteParams = [
      { name: 'Save_FileName', type: sql.VarChar, value: Save_FileName },
      { name: 'File_Key', type: sql.VarChar, value: File_Key },
    ];
    await executeQuery(deleteQuery, deleteParams);

    // 남은 파일 리스트 조회
    const selectQuery = ` SELECT FILE_KEY, ORIGINAL_FILENAME, SAVE_FILENAME, FILE_PATH, FILE_EXT, FILE_SIZE FROM FILE_ATTACH WHERE FILE_KEY = @File_Key `;
    const selectParams = [
      { name: 'File_Key', type: sql.VarChar, value: File_Key },
    ];
    const result = await executeQuery(selectQuery, selectParams);

    return res.status(200).json({
      RET_DATA: result.recordset || [],
      RET_DESC: "✅ 파일 삭제 완료",
      RET_CODE: "0000",
      RET_DATA: result
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
// 미리보기 API
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
const FilePreView = async (req, res) => {
  const { filePath } = req.body;

  if (!filePath) {
    return res.status(400).json({
      RET_CODE: "1001",
      RET_DESC: "파일 경로가 제공되지 않았습니다.",
      RET_DATA: null
    });
  }

  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    return res.status(404).json({
      RET_CODE: "1002",
      RET_DESC: "파일을 찾을 수 없습니다.",
      RET_DATA: null
    });
  }

  // 파일을 브라우저에서 미리보기로 열도록 전송
  res.sendFile(resolvedPath);
};
//#############################################################
//#############           Common End            ###############
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####           E-매칭폼 준회원 체크 Start              ######
//#############################################################
const EMFS_LOGIN = async (req, res) => {
  try {
    const { Emfs_Name, Emfs_IdNumberF, Emfs_IdNumberB, Emfs_HandPhone, Emfs_Nationality } = req.body;

    // 유효성 검사
    if (!Emfs_Name || !Emfs_IdNumberF || !Emfs_IdNumberB || !Emfs_HandPhone || !Emfs_Nationality) {
      return res.status(400).json({
        RET_DESC: "❌ 이름, 주민번호, 휴대폰번호, 국가선택은 필수입니다.",
        RET_CODE: "1001"
      });
    }

    // 전화번호 분할
    const [Phone1, Phone2, Phone3] = Emfs_HandPhone.split('-');
    if (!Phone1 || !Phone2 || !Phone3) {
      return res.status(400).json({
        RET_DESC: "❌ 유효하지 않은 전화번호 형식입니다.",
        RET_CODE: "1002"
      });
    }

    const Query = `
        DECLARE @Phone1 VARCHAR(10) = @Phone1Input;
        DECLARE @RawPhone VARCHAR(20) = @RawPhoneInput;
        DECLARE @Phone2 VARCHAR(10), @Phone3 VARCHAR(10), @FullPhone VARCHAR(20);

        SET @Phone2 = baroyeon_crm.dbo.UFN_GetHopeMaxLicense('2', '2', @RawPhone);
        SET @Phone3 = baroyeon_crm.dbo.UFN_GetHopeMaxLicense('2', '3', @RawPhone);
        SET @FullPhone = @Phone1 + '-' + @Phone2 + '-' + @Phone3;

        SELECT TOP 1 a.idx, b.aid, a.last_counsel, a.state, a.c_manager AS counselor, a.network, a.cust_idx, a.uname, a.jumin1, a.sex, a.married
        FROM baroyeon_crm.dbo.Asso_mem a
        INNER JOIN [baroyeon_crm].[dbo].baro_a001 b WITH (NOLOCK) ON a.idx = b.aid
        WHERE LEN(@FullPhone) > 8 AND (
            b.tel_hand = @FullPhone OR
            b.tel_home = @FullPhone OR
            b.tel_etc_a = @FullPhone OR
            b.tel_etc_b = @FullPhone OR
            b.tel_etc_c = @FullPhone OR
            b.cust_tel_hand = @FullPhone OR
            b.cust_tel_home = @FullPhone OR
            b.cust_tel_etc_a = @FullPhone OR
            b.cust_tel_etc_b = @FullPhone OR
            b.cust_tel_etc_c = @FullPhone
        ) AND A.UNAME = @Emfs_Name;
    `;
    //  쿼리 파라미터 설정
    const params = [
      { name: 'Phone1Input', type: sql.VarChar, value: Phone1 },
      { name: 'RawPhoneInput', type: sql.VarChar, value: Emfs_HandPhone },
      { name: 'Emfs_Name', type: sql.VarChar, value: Emfs_Name }
      
    ];

    const [user] = await executeQuery(Query, params);

    // 사용자 없음
    if (!user) {
      return res.status(404).json({
        RET_DATA: null,
        RET_DESC: "❌ 가입회원에 존재하지 않습니다.",
        RET_CODE: "2000"
      });
    }

    // 토큰 생성 및 응답
    const AccessToken = jwt.sign(
      { aid: user.aid },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    return res.status(200).json({
      RET_DATA: {
        AccessToken,
        LOGIN_AID: user.aid,
        LOGIN_CUST_IDX: user.cust_idx,
        LOGIN_NAME: user.uname,
        LOGIN_JUMIN1: Emfs_IdNumberF
      },
      RET_DESC: "✅ Login Success",
      RET_CODE: "0000"
    });

  } catch (err) {
    console.error("❌ 로그인 처리 중 오류 발생:", err);
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
//#####              ADMIN 정보 조회 Start                #####
//############################################################

const EMFS_APPMEM = async (req, res) => {
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

    const ADM_ID = decoded.ADM_ID;

    if (!ADM_ID) {
      return res.status(400).json({
        RET_DESC: "❌ ADM_ID 정보가 없습니다.",
        RET_CODE: "4002",
        RET_DATA: null,
      });
    }

    const query = `SELECT ADM_ID, ADM_NAME, ADM_LEVEL, ADM_MOBILE FROM ADM_MEM WHERE ADM_ID = @ADM_ID`;
    const params = [{ name: "ADM_ID", type: sql.VarChar, value: ADM_ID }];
    const [userInfo] = await executeQuery(query, params);

    if (!userInfo) {
      return res.status(404).json({
        RET_DESC: "❌ 사용자 정보를 찾을 수 없습니다.",
        RET_CODE: "4003",
        RET_DATA: null,
      });
    }

    return res.status(200).json({
      RET_DESC: "✅ 로그인 정보 조회 성공",
      RET_CODE: "0000",
      RET_DATA: userInfo,
    });
  } catch (err) {
    // 프로덕션에서는 로그를 제한하는 것도 고려
    if (process.env.NODE_ENV !== 'production') {
      console.error("로그인 처리 중 오류 발생:", err);
    }

    res.status(500).json({
      RET_DATA: null,
      RET_DESC: "❌ 서버 오류 발생",
      RET_CODE: "1000",
    });
  }
};

//############################################################
//#####              ADMIN 정보 조회 End                  #####
//############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//############################################################
//#####              ADMIN 등록 Start                  #####
//############################################################
const EMFS_APP1 = async (req, res) => {
  try {
    const { ADM_ID, ADM_PW, ADM_NAME, ADM_MOBILE } = req.body;

    if (!ADM_ID || !ADM_PW) {
      return res.status(400).json({
        RET_DESC: "❌ 아이디와 비밀번호는 필수입니다.",
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
//#####                 ADMIN 등록 End                   #####
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

module.exports = { EMFS_LOGIN, EMFS_APPMEM, EMFS_APP1, EMFS_APP2, EMFS_APP3, EMFS_APP4, EMFS_APP5, EMFS_APP6, EMFS_APP7 };

