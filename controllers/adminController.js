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
// 다운로드 API
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
const FileDownLoad = async (req, res) => {
     const { fileName, FileType } = req.body;

     filePath = path.join(process.env.FILEUPLOAD_SAVE_PATH, fileName);
    //  let filePath = "";
    //  if (FileType === "BOARD")
    //    filePath = path.join(process.env.FILEUPLOAD_SAVE_PATH_BOARD, fileName);
    //  else if (FileType === "MEETING")
    //    filePath = path.join(process.env.FILEUPLOAD_SAVE_PATH_MEETING, fileName);
    //  else if (FileType === "EVENT")
    //    filePath = path.join(process.env.FILEUPLOAD_SAVE_PATH_EVENT, fileName);
    //  else if (FileType === "MARRIAGE")
    //    filePath = path.join(process.env.FILEUPLOAD_SAVE_PATH_MARRIAGE, fileName);
 
      if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "파일 없음" });
    }
  
    res.download(filePath); // Content-Disposition 헤더 포함
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
//#####              ADMIN 로그인 Start                  ######
//#############################################################
const ADM_LOGIN = async (req, res) => {
  try {
    const { ADM_ID, ADM_PW } = req.body;
    if (!ADM_ID || !ADM_PW) {
      return res.status(400).json({
        RET_DESC: "❌ 아이디와 비밀번호는 필수입니다.",
        RET_CODE: "1001",
      });
    }
   
    const Query = ` SELECT ADM_ID, ADM_PW, ADM_NAME, ADM_LEVEL FROM ADM_MEM WHERE ADM_ID = @ADM_ID `;
    const params = [{ name: 'ADM_ID', type: sql.VarChar, value: ADM_ID }];
    const [user] = await executeQuery(Query, params);

    if (!user) {
      return res.json({
        RET_DATA: null,
        RET_DESC: "❌ 해당 아이디가 존재하지 않습니다.",
        RET_CODE: "2000",
      });
    }

    const passwordMatch = await bcrypt.compare(ADM_PW, user.ADM_PW);
    if (!passwordMatch) {
      return res.json({
        RET_DATA: null,
        RET_DESC: "❌ 회원정보가 올바르지 않습니다.",
        RET_CODE: "2000",
      });
    }

    const AccessToken = jwt.sign(
      { ADM_ID: user.ADM_ID },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );
    return res.json({
      RET_DATA: {
        AccessToken,
        ADM_ID: user.ADM_ID,
        ADM_NAME: user.ADM_NAME,
        ADM_LEVEL: user.ADM_LEVEL,
      },
      RET_DESC: "✅ Login Success",
      RET_CODE: "0000",
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
//#####              ADMIN 로그인 End                    #####
//############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//############################################################
//#####              ADMIN 정보 조회 Start                #####
//############################################################

const GET_LOGIN_INFO = async (req, res) => {
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
const ADM_REGIST = async (req, res) => {
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
const N2N = async (req, res) => {
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
const N2N_DETAIL = async (req, res) => {
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
const N2N_REGIST = async (req, res) => {
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
const N2N_UPDATE = async (req, res) => {
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
const N2N_DELETE = async (req, res) => {
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

        // let filePath = "";
        // if (FileType === "BOARD")
        //   filePath = path.join(process.env.FILEUPLOAD_SAVE_PATH_BOARD, fileName);
        // else if (FileType === "MEETING")
        //   filePath = path.join(process.env.FILEUPLOAD_SAVE_PATH_MEETING, fileName);
        // else if (FileType === "EVENT")
        //   filePath = path.join(process.env.FILEUPLOAD_SAVE_PATH_EVENT, fileName);
        // else if (FileType === "MARRIAGE")
        //   filePath = path.join(process.env.FILEUPLOAD_SAVE_PATH_MARRIAGE, fileName);

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

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####        미팅/이벤트(MEETING/EVENT) List Start       #####
//#############################################################
const M2E_SELECT = async (req, res) => {
  try{
    const { M2E_Type, numPage, TotalPage, Search } = req.body;
    const startRow = (parseInt(numPage) - 1) * parseInt(TotalPage) + 1;
    const endRow = parseInt(numPage) * parseInt(TotalPage);
    const WHERE_SEARCH = ` AND TITLE LIKE '%${Search}%' `;
    const Query = `
      SELECT TB.RowNum, TB.IDX, TB.TYPE_ID, TB.TITLE, TB.TITLE_SUB, TB.EVENT_START, TB.EVENT_END, TB.EVENT_DAY, 
        TB.CREATE_AT, TB.FILE_KEY, FA.ORIGINAL_FILENAME, FA.SAVE_FILENAME, FA.FILE_PATH, 
        MPR.MEETING_IDX, MPR.CONTENTS, MPR.CARETE_AT AS MEETING_DATE FROM
        (SELECT ROW_NUMBER() OVER(ORDER BY IDX DESC)AS RowNum, IDX, TYPE_ID, TITLE, TITLE_SUB, EVENT_START, EVENT_END, EVENT_DAY, 
        CREATE_AT, FILE_KEY FROM MEETING_EVENT WHERE TYPE_ID = @M2E_Type ${WHERE_SEARCH} )AS TB
        LEFT JOIN FILE_ATTACH FA ON FA.FILE_KEY = TB.FILE_KEY
        LEFT JOIN MEETING_PARTY_REVIEW MPR ON MPR.MEETING_IDX = TB.IDX
      WHERE TB.ROWNUM  
        BETWEEN @startRow AND @endRow
      ORDER BY IDX DESC
    `;
    const Query_Total = ` SELECT COUNT(*) AS TOTAL_CNT FROM NOTICE_NEWS WHERE TYPE_ID = @M2E_Type `;

    const params = [
      { name: 'M2E_Type', type: sql.VarChar, value: String(M2E_Type) },
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
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####        미팅/이벤트(MEETING/EVENT) List End         #####
//#############################################################


//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####        미팅/이벤트(MEETING/EVENT) Detail Start     #####
//#############################################################
const M2E_DETAIL = async (req, res) => {
  try{
    const { M2E_Type, M2E_IDX } = req.body;
    const Query = ` SELECT TB.RowNum, TB.IDX, TB.TYPE_ID, TB.TITLE, TB.TITLE_SUB, TB.CONTENTS, TB.MONTENTS, TB.EVENT_START, TB.EVENT_END, TB.EVENT_DAY, 
                      TB.EVENT_PLACE, TB.EVENT_PEOPLE, TB.TARGET_URL, TB.CREATE_AT, TB.STATUS, TB.EVENT_ING, TB.FILE_KEY, MPR.MEETING_IDX, MPR.CONTENTS AS REVIEW_CONTENTS, MPR.CARETE_AT AS MEETING_DATE FROM
                        (SELECT ROW_NUMBER() OVER(ORDER BY IDX DESC)AS RowNum, IDX, TYPE_ID, TITLE, TITLE_SUB, CONTENTS, MONTENTS, EVENT_START, EVENT_END, EVENT_DAY, 
                         EVENT_PLACE, EVENT_PEOPLE, TARGET_URL, CREATE_AT, STATUS, EVENT_ING, FILE_KEY FROM MEETING_EVENT WHERE TYPE_ID = @M2E_Type AND IDX = @M2E_IDX )AS TB
                      LEFT JOIN MEETING_PARTY_REVIEW MPR ON MPR.MEETING_IDX = TB.IDX
                  `;
    const params = [
      { name: 'M2E_IDX', type: sql.VarChar, value: String(M2E_IDX) },
      { name: 'M2E_Type', type: sql.VarChar, value: String(M2E_Type) },
    ];
    const result = await executeQuery(Query, params);

    if (!result || result.length === 0) {
      return res.status(404).json({
        RET_STAT: 'fail',
        RET_DESC: '❌ 조회된 게시물이 없습니다',
        RET_CODE: '4040',
      });
    }
    
    const eventData = result[0];
    
    let file_result = [];

    if (eventData.FILE_KEY) {
      const Query_F = ` SELECT FILE_KEY, ORIGINAL_FILENAME, SAVE_FILENAME, FILE_PATH, FILE_EXT, FILE_SIZE FROM FILE_ATTACH WHERE FILE_KEY = @FILE_KEY `;
      const result_f = await executeQuery(Query_F, [
        { name: 'FILE_KEY', type: sql.VarChar, value: eventData.FILE_KEY },
      ]);
      file_result = result_f || [];
    }
    
    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 조회 성공",
      RET_CODE: "0000",
      RET_DATA: {
        ...eventData,
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
//#####        미팅/이벤트(MEETING/EVENT) Detail End       #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####       미팅/이벤트(MEETING/EVENT) INSERT Start      #####
//#############################################################
const M2E_REGIST = async (req, res) => {
  try {
    const { 
      M2E_Type, M2E_TITLE, M2E_TITLE_SUB, M2E_TARGET_URL, M2E_CONTENTS, M2E_MONTENTS, M2E_EVENT_START, 
      M2E_EVENT_END, M2E_EVENT_ING, M2E_EVENT_DAY, M2E_EVENT_PLACE, M2E_EVENT_PEOPLE, 
      M2E_FILE_KEY, M2E_STATUS, M2E_CREATE_AT } = req.body;
      const Query = ` INSERT INTO MEETING_EVENT (TYPE_ID, TITLE, TITLE_SUB, TARGET_URL, CONTENTS, MONTENTS, EVENT_START, EVENT_END, 
                      EVENT_ING, EVENT_DAY, EVENT_PLACE, EVENT_PEOPLE, FILE_KEY, STATUS, CREATE_AT) 
                      VALUES
                      (@M2E_Type, @M2E_TITLE, @M2E_TITLE_SUB, @M2E_TARGET_URL, @M2E_CONTENTS, @M2E_MONTENTS, @M2E_EVENT_START, 
                      @M2E_EVENT_END, @M2E_EVENT_ING, @M2E_EVENT_DAY, @M2E_EVENT_PLACE, @M2E_EVENT_PEOPLE, 
                      @M2E_FILE_KEY, @M2E_STATUS, @M2E_CREATE_AT) `;
    
      const params = [
      { name: 'M2E_Type', type: sql.VarChar, value: M2E_Type },
      { name: 'M2E_TITLE', type: sql.VarChar, value: M2E_TITLE },
      { name: 'M2E_TITLE_SUB', type: sql.VarChar, value: M2E_TITLE_SUB },
      { name: 'M2E_TARGET_URL', type: sql.VarChar, value: M2E_TARGET_URL },      
      { name: 'M2E_CONTENTS', type: sql.VarChar, value: M2E_CONTENTS },
      { name: 'M2E_MONTENTS', type: sql.VarChar, value: M2E_MONTENTS },
      { name: 'M2E_EVENT_START', type: sql.VarChar, value: M2E_EVENT_START },
      { name: 'M2E_EVENT_END', type: sql.VarChar, value: M2E_EVENT_END },
      { name: 'M2E_EVENT_ING', type: sql.Char, value: M2E_EVENT_ING },
      { name: 'M2E_EVENT_DAY', type: sql.VarChar, value: M2E_EVENT_DAY },
      { name: 'M2E_EVENT_PLACE', type: sql.VarChar, value: M2E_EVENT_PLACE },
      { name: 'M2E_EVENT_PEOPLE', type: sql.VarChar, value: M2E_EVENT_PEOPLE },
      { name: 'M2E_FILE_KEY', type: sql.VarChar, value: M2E_FILE_KEY },
      { name: 'M2E_STATUS', type: sql.Int, value: M2E_STATUS },
      { name: 'M2E_CREATE_AT', type: sql.DateTime, value: M2E_CREATE_AT }
    ];

    const result = await executeQuery(Query, params);
    res.status(200).json({
    RET_STAT: "success",
    RET_DESC: "✅ 등록 성공",
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
//#####       미팅/이벤트(MEETING/EVENT) INSERT End        #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####      미팅/이벤트(MEETING/EVENT) UPDATE Start       #####
//#############################################################
const M2E_UPDATE = async (req, res) => {
  try {
    const { M2E_TITLE, M2E_TITLE_SUB, M2E_TARGET_URL, M2E_CONTENTS, M2E_MONTENTS, M2E_EVENT_START, 
      M2E_EVENT_END, M2E_EVENT_ING, M2E_EVENT_DAY, M2E_EVENT_PLACE, M2E_EVENT_PEOPLE, 
      M2E_STATUS, M2E_IDX } = req.body;
    const Query = ` UPDATE MEETING_EVENT SET  
                    TITLE = @M2E_TITLE, TITLE_SUB = @M2E_TITLE_SUB, TARGET_URL = @M2E_TARGET_URL, CONTENTS = @M2E_CONTENTS, MONTENTS = @M2E_MONTENTS, EVENT_START = @M2E_EVENT_START, EVENT_END = @M2E_EVENT_END,
                    EVENT_ING = @M2E_EVENT_ING, EVENT_DAY = @M2E_EVENT_DAY, EVENT_PLACE = @M2E_EVENT_PLACE, EVENT_PEOPLE = @M2E_EVENT_PEOPLE,
                    STATUS = @M2E_STATUS WHERE IDX = @M2E_IDX `;
    const params = [
      { name: 'M2E_TITLE', type: sql.VarChar, value: M2E_TITLE },
      { name: 'M2E_TITLE_SUB', type: sql.VarChar, value: M2E_TITLE_SUB },
      { name: 'M2E_TARGET_URL', type: sql.VarChar, value: M2E_TARGET_URL },
      { name: 'M2E_CONTENTS', type: sql.VarChar, value: M2E_CONTENTS },
      { name: 'M2E_MONTENTS', type: sql.VarChar, value: M2E_MONTENTS },
      { name: 'M2E_EVENT_START', type: sql.VarChar, value: M2E_EVENT_START },
      { name: 'M2E_EVENT_END', type: sql.VarChar, value: M2E_EVENT_END },
      { name: 'M2E_EVENT_ING', type: sql.Char, value: M2E_EVENT_ING },
      { name: 'M2E_EVENT_DAY', type: sql.VarChar, value: M2E_EVENT_DAY },
      { name: 'M2E_EVENT_PLACE', type: sql.VarChar, value: M2E_EVENT_PLACE },
      { name: 'M2E_EVENT_PEOPLE', type: sql.VarChar, value: M2E_EVENT_PEOPLE },
      { name: 'M2E_STATUS', type: sql.Int, value: M2E_STATUS },
      { name: 'M2E_IDX', type: sql.Int, value: M2E_IDX }      
    ];
    await executeQuery(Query, params);
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
//#####      미팅/이벤트(MEETING/EVENT) UPDATE End         #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####      미팅/이벤트(MEETING/EVENT) DELETE Start       #####
//#############################################################
const M2E_DELETE = async (req, res) => {
  try {
    const { M2E_IDX } = req.body;

    for (const IDX of M2E_IDX) {
      // MEETING_EVENT → FILE_KEY 조회
      const FILE_SCK = `SELECT FILE_KEY FROM MEETING_EVENT WHERE IDX = @IDX`;
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

        filePath = path.join(process.env.FILEUPLOAD_SAVE_PATH, filename);
       
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

      // MEETING_EVENT 삭제
      const DATE_DEL = `DELETE FROM MEETING_EVENT WHERE IDX = @IDX`;
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
//#####       미팅/이벤트(MEETING/EVENT) DELETE End        #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####     미팅/파티 후기(MEETING REVIEW) List Start      #####
//#############################################################
const M2RV_SELECT = async (req, res) => {
  try{
    const { M2E_Type, numPage, TotalPage, Search } = req.body;
    const startRow = (parseInt(numPage) - 1) * parseInt(TotalPage) + 1;
    const endRow = parseInt(numPage) * parseInt(TotalPage);
    const WHERE_SEARCH = ` AND TITLE LIKE '%${Search}%' `;
    const Query = `
      SELECT * FROM
        (SELECT ROW_NUMBER() OVER(ORDER BY IDX DESC)AS RowNum, IDX, TYPE_ID, TITLE, TITLE_SUB, EVENT_START, EVENT_END, CREATE_AT FROM MEETING_EVENT 
        WHERE TYPE_ID = @M2E_Type AND STATUS = '1' AND REVIEW_CHK = '1' ${WHERE_SEARCH} )AS TB
      WHERE TB.ROWNUM  
        BETWEEN @startRow AND @endRow
      ORDER BY IDX DESC
    `;
    const Query_Total = ` SELECT COUNT(*) AS TOTAL_CNT FROM NOTICE_NEWS WHERE TYPE_ID = @M2E_Type AND STATUS = '1' `;

    const params = [
      { name: 'M2E_Type', type: sql.VarChar, value: String(M2E_Type) },
      { name: 'startRow', type: sql.Int, value: startRow },
      { name: 'endRow', type: sql.Int, value: endRow },
      { name: 'WHERE_SEARCH', type: sql.VarChar, value: String(WHERE_SEARCH) }
    ];

    const result = await executeQuery(Query, params);
    const result_total = await executeQuery(Query_Total, params);
    const totalCount = result_total[0]?.TOTAL_CNT || 0;

    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 리뷰 조회 성공",
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
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####     미팅/파티 후기(MEETING REVIEW) List End        #####
//#############################################################

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####     미팅/파티 후기(MEETING REVIEW) Insert Start    #####
//#############################################################
const M2RV_REGIST = async (req, res) => {
  try{
    const { M2E_IDX, M2E_REVIEW_CONTENTS, M2E_REVIEW_STATUS } = req.body;
    const Query = ` INSERT INTO MEETING_PARTY_REVIEW (MEETING_IDX, CONTENTS, STATUS) VALUES (@M2E_IDX, @M2E_REVIEW_CONTENTS, @M2E_REVIEW_STATUS ) `;
    const params = [
      { name: 'M2E_IDX', type: sql.Int, value: String(M2E_IDX) },
      { name: 'M2E_REVIEW_CONTENTS', type: sql.VarChar, value: String(M2E_REVIEW_CONTENTS) },
      { name: 'M2E_REVIEW_STATUS', type: sql.Int, value: String(M2E_REVIEW_STATUS) }
    ];
    const result = await executeQuery(Query, params);

    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 리뷰 조회 성공",
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
//#####     미팅/파티 후기(MEETING REVIEW) Insert End      #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####     미팅/파티 후기(MEETING REVIEW) Detail Start    #####
//#############################################################
const M2RV_DETAIL = async (req, res) => {
  try{
    const { M2E_IDX } = req.body;
    const Query = ` SELECT TB.IDX, TB.TYPE_ID, TB.TITLE, TB.TITLE_SUB, TARGET_URL, TB.EVENT_START, TB.EVENT_END, 
                          TB.EVENT_ING, TB.EVENT_DAY, TB.EVENT_PLACE, TB.EVENT_PEOPLE, TB.FILE_KEY,
                          MR.CONTENTS AS REVIEW_CONTENTS, MR.STATUS AS REVIEW_STATUS FROM 
                    MEETING_EVENT TB LEFT JOIN MEETING_PARTY_REVIEW MR ON MR.MEETING_IDX = TB.IDX
                  WHERE TB.IDX = @M2E_IDX AND TB.STATUS = '1' `;
    const params = [
      { name: 'M2E_IDX', type: sql.VarChar, value: String(M2E_IDX) },
    ];
    const result = await executeQuery(Query, params);

    if (!result || result.length === 0) {
      return res.status(404).json({
        RET_STAT: 'fail',
        RET_DESC: '❌ 조회된 게시물이 없습니다',
        RET_CODE: '4040',
      });
    }
    
    const eventData = result[0];
    
    let file_result = [];

    if (eventData.FILE_KEY) {
      const Query_F = ` SELECT FILE_KEY, ORIGINAL_FILENAME, SAVE_FILENAME, FILE_PATH, FILE_EXT, FILE_SIZE FROM FILE_ATTACH WHERE FILE_KEY = @FILE_KEY `;
      const result_f = await executeQuery(Query_F, [
        { name: 'FILE_KEY', type: sql.VarChar, value: eventData.FILE_KEY },
      ]);
      file_result = result_f || [];
    }
    
    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 리뷰 조회 성공",
      RET_CODE: "0000",
      RET_DATA: {
        ...eventData,
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
//#####     미팅/파티 후기(MEETING REVIEW) Detail End      #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####     미팅/파티 후기(MEETING REVIEW) UPDATE Start    #####
//#############################################################
const M2RV_UPDATE = async (req, res) => {
  try {
    const { M2E_REVIEW_CONTENTS, M2E_REVIEW_STATUS, M2E_IDX } = req.body;
    const Query = ` UPDATE MEETING_PARTY_REVIEW SET  
                    CONTENTS = @M2E_REVIEW_CONTENTS, STATUS = @M2E_REVIEW_STATUS WHERE MEETING_IDX = @M2E_IDX `;
    const params = [
      { name: 'M2E_REVIEW_CONTENTS', type: sql.VarChar, value: M2E_REVIEW_CONTENTS },
      { name: 'M2E_REVIEW_STATUS', type: sql.Int, value: M2E_REVIEW_STATUS },
      { name: 'M2E_IDX', type: sql.Int, value: M2E_IDX }      
    ];
    await executeQuery(Query, params);

    res.status(200).json({
    RET_STAT: "success",
    RET_DESC: "✅ 리뷰 수정 성공",
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
//#####     미팅/파티 후기(MEETING REVIEW) UPDATE End      #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####     미팅/파티 후기(MEETING REVIEW) DELETE Start    #####
//#############################################################
const M2RV_DELETE = async (req, res) => {
  try {
    const { M2E_IDX } = req.body;
    const Query = ` DELETE MEETING_PARTY_REVIEW WHERE MEETING_IDX = @M2E_IDX `;
    const params = [
      { name: 'M2E_IDX', type: sql.VarChar, value: String(M2E_IDX) }      
    ];
    await executeQuery(Query, params);
    // 모든 삭제 완료 후 응답
    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 리뷰 삭제 성공",
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
//#####     미팅/파티 후기(MEETING REVIEW) DELETE End      #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####           성혼후기 (MARRIAGE) List Start          #####
//#############################################################
const MARRIAGE_SELECT = async (req, res) => {
  try{
    const { numPage, TotalPage, Search } = req.body;
    const startRow = (parseInt(numPage) - 1) * parseInt(TotalPage) + 1;
    const endRow = parseInt(numPage) * parseInt(TotalPage);
    const WHERE_SEARCH = ` AND TITLE LIKE '%${Search}%' `;
    const Query = `SELECT RowNum, HR.IDX, HR.TITLE, HR.SUBJECT, HR.CONTENTS, HR.FILE_KEY, HR.STATUS, HR.CREATE_AT, FA.ORIGINAL_FILENAME, FA.SAVE_FILENAME, FA.FILE_PATH 
                      FROM
                      (SELECT ROW_NUMBER() OVER(ORDER BY IDX DESC)AS RowNum, IDX, TITLE, SUBJECT, CONTENTS, FILE_KEY, STATUS, CREATE_AT FROM HOLY_REVIEW 
                  WHERE STATUS = '1' ${WHERE_SEARCH}  )AS HR
                      LEFT JOIN FILE_ATTACH FA ON FA.FILE_KEY = HR.FILE_KEY
                    WHERE HR.ROWNUM  
                      BETWEEN @startRow AND @endRow
                    ORDER BY ROWNUM ASC, IDX DESC `;
    const Query_Total = ` SELECT COUNT(*) AS TOTAL_CNT FROM HOLY_REVIEW WHERE STATUS = '1' `;

    const params = [
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
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####           성혼후기 (MARRIAGE) List End            #####
//#############################################################

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####          성혼후기 (MARRIAGE) Detail Start         #####
//#############################################################
const MARRIAGE_DETAIL = async (req, res) => {
  try{
    const { Holy_Idx } = req.body;
    const Query = ` SELECT HR.IDX, HR.TITLE, HR.SUBJECT, HR.CONTENTS, HR.FILE_KEY, HR.STATUS, HR.CREATE_AT,
                          FA.ORIGINAL_FILENAME, FA.SAVE_FILENAME, FA.FILE_PATH 
                    FROM HOLY_REVIEW HR
                    LEFT JOIN FILE_ATTACH FA ON FA.FILE_KEY = HR.FILE_KEY
                    WHERE HR.IDX = @Holy_Idx
                  `;
    const params = [
      { name: 'Holy_Idx', type: sql.Int, value: Holy_Idx }
    ];
    const result = await executeQuery(Query, params);



    if (!result || result.length === 0) {
      return res.status(404).json({
        RET_STAT: 'fail',
        RET_DESC: '❌ 조회된 게시물이 없습니다',
        RET_CODE: '4040',
      });
    }
    
    const eventData = result[0];
    
    let file_result = [];

    if (eventData.FILE_KEY) {
      const Query_F = ` SELECT FILE_KEY, ORIGINAL_FILENAME, SAVE_FILENAME, FILE_PATH, FILE_EXT, FILE_SIZE FROM FILE_ATTACH WHERE FILE_KEY = @FILE_KEY `;
      const result_f = await executeQuery(Query_F, [
        { name: 'FILE_KEY', type: sql.VarChar, value: eventData.FILE_KEY },
      ]);
      file_result = result_f || [];
    }
    
    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 조회 성공",
      RET_CODE: "0000",
      RET_DATA: {
        ...eventData,
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
//#####           성혼후기 (MARRIAGE) Detail End          #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####          성혼후기 (MARRIAGE) INSERT Start         #####
//#############################################################
const MARRIAGE_REGIST = async (req, res) => {
  try {
    const { MARRIAGE_TITLE, MARRIAGE_SUBJECT, MARRIAGE_CONTENTS, MARRIAGE_FILE_KEY, MARRIAGE_STATUS, MARRIAGE_CREATE_AT } = req.body;
      const Query = ` INSERT INTO HOLY_REVIEW (TITLE, SUBJECT, CONTENTS, FILE_KEY, STATUS, CREATE_AT) 
                      VALUES
                      (@MARRIAGE_TITLE, @MARRIAGE_SUBJECT, @MARRIAGE_CONTENTS, @MARRIAGE_FILE_KEY, @MARRIAGE_STATUS, @MARRIAGE_CREATE_AT) `;
    
      const params = [
      { name: 'MARRIAGE_TITLE', type: sql.VarChar, value: MARRIAGE_TITLE },
      { name: 'MARRIAGE_SUBJECT', type: sql.VarChar, value: MARRIAGE_SUBJECT },       
      { name: 'MARRIAGE_CONTENTS', type: sql.VarChar, value: MARRIAGE_CONTENTS },
      { name: 'MARRIAGE_FILE_KEY', type: sql.VarChar, value: MARRIAGE_FILE_KEY },
      { name: 'MARRIAGE_STATUS', type: sql.Int, value: MARRIAGE_STATUS },
      { name: 'MARRIAGE_CREATE_AT', type: sql.VarChar, value: MARRIAGE_CREATE_AT }
    ];

    const result = await executeQuery(Query, params);
    res.status(200).json({
    RET_STAT: "success",
    RET_DESC: "✅ 등록 성공",
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
//#####          성혼후기 (MARRIAGE) INSERT End           #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####         성혼후기 (MARRIAGE) UPDATE Start          #####
//#############################################################
const MARRIAGE_UPDATE = async (req, res) => {
  try {
    const { MARRIAGE_TITLE, MARRIAGE_SUBJECT, MARRIAGE_CONTENTS, MARRIAGE_STATUS, Holy_Idx } = req.body;
    const Query = ` UPDATE HOLY_REVIEW SET 
                      TITLE = @MARRIAGE_TITLE, SUBJECT = @MARRIAGE_SUBJECT, CONTENTS = @MARRIAGE_CONTENTS, STATUS = @MARRIAGE_STATUS 
                    WHERE IDX = @Holy_Idx `;
    const params = [
      { name: 'MARRIAGE_TITLE', type: sql.VarChar, value: MARRIAGE_TITLE },
      { name: 'MARRIAGE_SUBJECT', type: sql.VarChar, value: MARRIAGE_SUBJECT },
      { name: 'MARRIAGE_CONTENTS', type: sql.VarChar, value: MARRIAGE_CONTENTS },
      { name: 'MARRIAGE_STATUS', type: sql.Int, value: MARRIAGE_STATUS },
      { name: 'Holy_Idx', type: sql.Int, value: Holy_Idx }      
    ];
    await executeQuery(Query, params);
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
//#####         성혼후기 (MARRIAGE) UPDATE End            #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####         성혼후기 (MARRIAGE) DELETE Start          #####
//#############################################################
const MARRIAGE_DELETE = async (req, res) => {
  try {
    const { Holy_Idx, FileType } = req.body;

    for (const IDX of Holy_Idx) {
      // MEETING_EVENT → FILE_KEY 조회
      const FILE_SCK = `SELECT FILE_KEY FROM HOLY_REVIEW WHERE IDX = @IDX`;
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

        filePath = path.join(process.env.FILEUPLOAD_SAVE_PATH, filename);
        // let filePath = "";
        // if (FileType === "BOARD")
        //   filePath = path.join(process.env.FILEUPLOAD_SAVE_PATH_BOARD, fileName);
        // else if (FileType === "MEETING")
        //   filePath = path.join(process.env.FILEUPLOAD_SAVE_PATH_MEETING, fileName);
        // else if (FileType === "EVENT")
        //   filePath = path.join(process.env.FILEUPLOAD_SAVE_PATH_EVENT, fileName);
        // else if (FileType === "MARRIAGE")
        //   filePath = path.join(process.env.FILEUPLOAD_SAVE_PATH_MARRIAGE, fileName);

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

      // MARRIAGE 삭제
      const DATE_DEL = `DELETE FROM HOLY_REVIEW WHERE IDX = @IDX`;
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
//#####          성혼후기 (MARRIAGE) DELETE End           #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//####     광고 카테고리 리스트 Start                       ####
//####     토큰 체크                                        ####
//#############################################################
const CATEGORY_SELECT = async (req, res) => {
  try {
    const { PARENTID, LEVELS, numPage, TotalPage, Search } = req.body;
    const startRow = (parseInt(numPage) - 1) * parseInt(TotalPage) + 1;
    const endRow = parseInt(numPage) * parseInt(TotalPage);
    const WHERE_SEARCH = ` AND TITLE LIKE '%${Search}%' `;
    let WHERE_LEVELS = '';
    if (LEVELS === 3) {
        WHERE_LEVELS = `, (SELECT COUNT(PG_CODE) FROM AD_CAMPAIGN WHERE AD_CATEGORY_IDX = TB.IDX) AS CATEGORY_INC`;
    } else {
        WHERE_LEVELS = `, (SELECT COUNT(IDX) FROM AD_CATEGORY WHERE PARENT_ID = TB.IDX) AS CATEGORY_INC`;
    }
    const Query = ` SELECT *${WHERE_LEVELS} FROM
        (SELECT ROW_NUMBER() OVER(ORDER BY IDX DESC)AS RowNum, IDX, TITLE, PARENT_ID, LEVELS, SORT_ORDER, STATUS, CREATE_AT FROM AD_CATEGORY
        WHERE PARENT_ID = @PARENTID AND LEVELS = @LEVELS ${WHERE_SEARCH} )AS TB
      WHERE TB.ROWNUM  
        BETWEEN @startRow AND @endRow
      ORDER BY SORT_ORDER ASC`

    const Query_Total = ` SELECT COUNT(*) AS TOTAL_CNT FROM AD_CATEGORY WHERE PARENT_ID = @PARENTID AND LEVELS = @LEVELS ${WHERE_SEARCH} `;
    
    const params = [
      { name: 'PARENTID', type: sql.Int, value: PARENTID },
      { name: 'LEVELS', type: sql.Int, value: LEVELS },
      { name: 'startRow', type: sql.Int, value: startRow },
      { name: 'endRow', type: sql.Int, value: endRow }      
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
//####     광고 카테고리 리스트 End                         ####
//####     토큰 체크                                        ####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//####     광고 카테고리 상세 Start                         ####
//####     토큰 체크                                        ####
//#############################################################
const CATEGORY_DETAIL = async (req, res) => {
  try {
    const { IDX } = req.body;
    const Query = ` SELECT IDX, TITLE, PARENT_ID, LEVELS, STATUS FROM AD_CATEGORY WHERE IDX = @IDX `;

    const params = [
      { name: "IDX", type: sql.Int, value: IDX }
    ];

    const result = await executeQuery(Query, params);

    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 조회 성공",
      RET_CODE: "0000",
      RET_DATA: result
    })
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
//####     광고 카테고리 상세 End                           ####
//####     토큰 체크                                        ####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//####     광고 카테고리 등록 Start                         ####
//####     토큰 체크                                        ####
//#############################################################
const CATEGORY_REGIST = async (req, res) => {
  try {
    const { PARENTID, LEVELS, TITLE, STATUS } = req.body;
    const Query = ` INSERT INTO AD_CATEGORY (TITLE, PARENT_ID, LEVELS, SORT_ORDER, STATUS ) 
                    VALUES
                    ( @TITLE, @PARENTID, @LEVELS,
                    ISNULL((
                      SELECT MAX(SORT_ORDER) + 1 
                      FROM AD_CATEGORY 
                      WHERE PARENT_ID = @PARENTID AND LEVELS = @LEVELS
                    ), 1)
                    , @STATUS ) `
    const params = [
      { name: "TITLE", type: sql.VarChar, value: TITLE },
      { name: "PARENTID", type: sql.Int, value: PARENTID },
      { name: "LEVELS", type: sql.Int, value: LEVELS },
      { name: "STATUS", type: sql.Int, value: STATUS },
    ]
    await executeQuery(Query, params);

    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 등록 성공",
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
//####     광고 카테고리 등록 End                           ####
//####     토큰 체크                                        ####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//####     광고 카테고리 수정 Start                         ####
//####     토큰 체크                                        ####
//#############################################################
const CATEGORY_UPDATE = async (req, res) => {
  try {
    const {IDX, TITLE, STATUS} = req.body;
    const Query = ` UPDATE AD_CATEGORY SET TITLE = @TITLE, STATUS = @STATUS WHERE IDX = @IDX `
    const params = [
      { name: "IDX", type: sql.Int, value: IDX },
      { name: "TITLE", type: sql.VarChar, value: TITLE },
      { name: "STATUS", type: sql.Int, value: STATUS }
    ]
    
    await executeQuery(Query, params);

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
//####     광고 카테고리 수정 End                           ####
//####     토큰 체크                                        ####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//####     광고 카테고리 삭제 Start                         ####
//####     토큰 체크                                        ####
//#############################################################
const CATEGORY_DELETE = async (req, res) => {
  try {
    const { SelectList } = req.body;

    if (!Array.isArray(SelectList) || SelectList.length === 0) {
      return res.status(400).json({
        RET_STAT: "fail",
        RET_DESC: "❌ 삭제할 항목이 없습니다.",
        RET_CODE: "1001",
      });
    }

    // 파라미터 이름과 바인딩 배열 구성
    const placeholders = SelectList.map((_, i) => `@ID${i}`).join(', ');
    const Query = `DELETE FROM AD_CATEGORY WHERE IDX IN (${placeholders})`;
    const params = SelectList.map((id, i) => ({
      name: `ID${i}`,
      type: sql.Int,
      value: id,
    }));

    await executeQuery(Query, params);

    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 삭제 완료",
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
//####     광고 카테고리 삭제 End                           ####
//####     토큰 체크                                        ####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓


//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####            광고 캠페인 리스트 Start              ######
//#############################################################
const CAMPAIGN_SELECT = async (req, res) => {
  try {
    const { numPage, TotalPage, Search = "" } = req.body;

    const startRow = (parseInt(numPage) - 1) * parseInt(TotalPage) + 1;
    const endRow = parseInt(numPage) * parseInt(TotalPage);

    const params = [
      { name: 'Search', type: sql.VarChar, value: `%${Search}%` },
      { name: 'startRow', type: sql.Int, value: startRow },
      { name: 'endRow', type: sql.Int, value: endRow }
    ];

    const Query = ` WITH Filtered AS (
                      SELECT A.IDX, ROW_NUMBER() OVER (ORDER BY A.PG_CODE DESC) AS RowNum
                      FROM AD_CAMPAIGN A
                      LEFT JOIN AD_CATEGORY C3 ON C3.IDX = A.AD_CATEGORY_IDX
                      WHERE A.PG_CODE LIKE @Search 
                         OR A.CAMPAIGN_NAME LIKE @Search
                         OR C3.TITLE LIKE @Search
                  ),
                  Paged AS ( SELECT IDX FROM Filtered WHERE RowNum BETWEEN @startRow AND @endRow )
                  SELECT A.IDX, A.PG_CODE, A.PG_CODE_URL, A.CAMPAIGN_NAME, A.STATUS, A.CREATE_AT,
                      C1.TITLE AS CATEGORY_L1_TITLE, C2.TITLE AS CATEGORY_L2_TITLE, C3.TITLE AS CATEGORY_L3_TITLE
                  FROM Paged P
                  JOIN AD_CAMPAIGN A ON A.IDX = P.IDX
                  LEFT JOIN AD_CATEGORY C3 ON C3.IDX = A.AD_CATEGORY_IDX
                  LEFT JOIN AD_CATEGORY C2 ON C2.IDX = C3.PARENT_ID
                  LEFT JOIN AD_CATEGORY C1 ON C1.IDX = C2.PARENT_ID
                  ORDER BY A.PG_CODE DESC `;

    const Query_Total = `
      SELECT COUNT(*) AS TOTAL_CNT FROM AD_CAMPAIGN A
      LEFT JOIN AD_CATEGORY C3 ON C3.IDX = A.AD_CATEGORY_IDX
      LEFT JOIN AD_CATEGORY C2 ON C2.IDX = C3.PARENT_ID
      LEFT JOIN AD_CATEGORY C1 ON C1.IDX = C2.PARENT_ID
      WHERE A.PG_CODE LIKE @Search 
         OR A.CAMPAIGN_NAME LIKE @Search 
         OR C3.TITLE LIKE @Search `;

    const result = await executeQuery(Query, params);
    const result_total = await executeQuery(Query_Total, [params[0]]); // Search만 사용
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
};
//#############################################################
//#####            광고 캠페인 리스트 End                ######
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####             광고 캠페인 상세 Start               ######
//#############################################################
const CAMPAIGN_DETAIL = async (req, res) => {
  try {
    const { IDX } = req.body;
    const Query = ` SELECT A.IDX, A.PG_CODE, A.PG_CODE_URL, A.AD_CATEGORY_IDX, A.CAMPAIGN_NAME, A.STATUS, A.CREATE_AT, 
                    C1.IDX AS CATEGORY_L1_IDX, C2.IDX AS CATEGORY_L2_IDX
                    FROM AD_CAMPAIGN A
                    LEFT JOIN AD_CATEGORY C3 ON C3.IDX = A.AD_CATEGORY_IDX
                    LEFT JOIN AD_CATEGORY C2 ON C2.IDX = C3.PARENT_ID
                    LEFT JOIN AD_CATEGORY C1 ON C1.IDX = C2.PARENT_ID
                    WHERE A.IDX = @IDX `
    const params = [
      {name: 'IDX', type: sql.Int, value: IDX}
    ]
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
};
//#############################################################
//#####              광고 캠페인 상세 End                ######
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#### 광고 캠페인 PG_CODE 자동생성, 카테고리 대분류 Start #####
//#############################################################
const CAMPAIGN_INIT_DATA = async (req, res) => {
  try {
    const QUERY_PGCODE = `SELECT ISNULL(MAX(PG_CODE) + 1, 100000) AS PG_CODE FROM AD_CAMPAIGN`;
    const QUERY_L = `SELECT IDX, TITLE FROM AD_CATEGORY WHERE LEVELS = 1`;

    const [pgcodeResult, result_l] = await Promise.all([
      executeQuery(QUERY_PGCODE),
      executeQuery(QUERY_L)
    ]);

    const nextPgCode = pgcodeResult?.[0]?.PG_CODE ?? 100000;

    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 조회 성공",
      RET_CODE: "0000",
      RET_DATA: {
        PG_CODE: nextPgCode,
        LARGE: result_l
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
};
//#############################################################
//##### 광고 캠페인 PG_CODE 자동생성, 카테고리 대분류 End ######
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####         광고 캠페인 중분류, 소분류 조회 Start     ######
//#############################################################
const CAMPAIGN_INIT_PARENT = async (req, res) => {
  try {
    const {PARENTID} = req.body;
    const Query = ` SELECT IDX, PARENT_ID, TITLE FROM AD_CATEGORY WHERE PARENT_ID = @PARENTID`;
    const params = [{name: "PARENTID", type: sql.Int, value: PARENTID}]
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
};

//#############################################################
//#####         광고 캠페인 중분류, 소분류 조회 End       ######
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####             광고 캠페인 등록 Start               ######
//#############################################################
const CAMPAIGN_REGIST = async (req, res) => {
  try {
    const { PG_CODE, AD_CATEGORY_IDX, CAMPAIGN_NAME, STATUS } = req.body;
    const Query = ` INSERT INTO AD_CAMPAIGN (PG_CODE, PG_CODE_URL, AD_CATEGORY_IDX, CAMPAIGN_NAME, STATUS) VALUES
                    (@PG_CODE, @PG_CODE_URL, @AD_CATEGORY_IDX, @CAMPAIGN_NAME, @STATUS) `
    const params = [
      {name: 'PG_CODE', type: sql.VarChar, value: PG_CODE},
      {name: 'PG_CODE_URL', type: sql.VarChar, value: `&PgCode=${PG_CODE}`},
      {name: 'AD_CATEGORY_IDX', type: sql.VarChar, value: AD_CATEGORY_IDX},
      {name: 'CAMPAIGN_NAME', type: sql.VarChar, value: CAMPAIGN_NAME},
      {name: 'STATUS', type: sql.Int, value: STATUS}
    ]
    const result = await executeQuery(Query, params);
    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 등록 성공",
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
};
//#############################################################
//#####              광고 캠페인 등록 End                ######
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####             광고 캠페인 수정 Start               ######
//#############################################################
const CAMPAIGN_UPDATE = async (req, res) => {
  try {
    const { CAMPAIGN_IDX, AD_CATEGORY_IDX, CAMPAIGN_NAME, STATUS } = req.body;
    const Query = ` UPDATE AD_CAMPAIGN SET AD_CATEGORY_IDX =  @AD_CATEGORY_IDX, CAMPAIGN_NAME = @CAMPAIGN_NAME, STATUS = @STATUS
                    WHERE IDX = @CAMPAIGN_IDX `
    const params = [
      {name: 'AD_CATEGORY_IDX', type:sql.VarChar, value: AD_CATEGORY_IDX},
      {name: 'CAMPAIGN_NAME', type:sql.VarChar, value: CAMPAIGN_NAME},
      {name: 'STATUS', type:sql.Int, value: STATUS},
      {name: 'CAMPAIGN_IDX', type:sql.Int, value: CAMPAIGN_IDX}
    ]
    const result = await executeQuery(Query, params);
    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 수정 성공",
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
};
//#############################################################
//#####              광고 캠페인 수정 End                ######
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####             광고 캠페인 삭제 Start               ######
//#############################################################
const CAMPAIGN_DELETE = async (req, res) => {
  try {
    const { SelectList } = req.body;
    const Query = ` DELETE AD_CAMPAIGN WHERE IDX IN ( @SelectList ) `
    const params = [
      {name: 'SelectList', type:sql.Int, value: SelectList}
    ]
    const result = await executeQuery(Query, params);
    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 삭제 성공",
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
};
//#############################################################
//#####              광고 캠페인 삭제 End                ######
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

module.exports = { 
  ADM_LOGIN, GET_LOGIN_INFO, ADM_REGIST,
  N2N, N2N_DETAIL, N2N_REGIST, N2N_UPDATE, N2N_DELETE, 
  M2E_SELECT, M2E_DETAIL, M2E_REGIST, M2E_UPDATE, M2E_DELETE,
  M2RV_SELECT, M2RV_DETAIL, M2RV_REGIST, M2RV_UPDATE, M2RV_DELETE,
  MARRIAGE_SELECT, MARRIAGE_DETAIL, MARRIAGE_REGIST, MARRIAGE_UPDATE, MARRIAGE_DELETE,
  FileUpload, FileDelete, FileDownLoad, FilePreView,
  EditorUpload,
  CATEGORY_SELECT, CATEGORY_DETAIL, CATEGORY_REGIST, CATEGORY_UPDATE, CATEGORY_DELETE,
  CAMPAIGN_SELECT, CAMPAIGN_DETAIL, CAMPAIGN_INIT_DATA, CAMPAIGN_INIT_PARENT, CAMPAIGN_REGIST, CAMPAIGN_UPDATE, CAMPAIGN_DELETE
};

