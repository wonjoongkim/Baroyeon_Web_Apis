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

async function getEmployeeByAdmId(admId) {
  const normalizedAdmId = String(admId ?? "").trim();
  if (!normalizedAdmId) {
    return null;
  }

  const query = `
    SELECT TOP 1
      seq,
      emp_id,
      emp_nm,
      dept_cd,
      clss_cd,
      duty_cd,
      team_no,
      network,
      quit_chk
    FROM [baroyeon_intra].[dbo].[view_EmpLIst]
    WHERE emp_id = @emp_id
    ORDER BY
      CASE WHEN ISNULL(quit_chk, 'N') = 'N' THEN 0 ELSE 1 END,
      seq DESC
  `;

  const [employee] = await executeQuery(query, [
    { name: "emp_id", type: sql.VarChar, value: normalizedAdmId }
  ]);

  return employee || null;
}

const getScalarValue = (...values) => {
  for (const value of values) {
    if (Array.isArray(value)) {
      if (value.length > 0 && value[0] !== undefined && value[0] !== null) {
        return String(value[0]).trim();
      }
      continue;
    }

    if (value !== undefined && value !== null) {
      return String(value).trim();
    }
  }

  return "";
};

const toBoardAuthLevel = (value) => {
  if (value === undefined || value === null) {
    return 0;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return 0;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildBoardAuthorization = (boardInfo, isBoardAdmin, dutyCd) => {
  if (isBoardAdmin) {
    return {
      au_entry: "Y",
      au_read: "Y",
      au_write: "Y",
      au_reple: "Y",
      au_memo: "Y",
      au_admin: "Y",
      comm_admin: "Y",
    };
  }

  const dutyLevel = toBoardAuthLevel(dutyCd);
  const hasPermission = (authValue) => (
    toBoardAuthLevel(authValue) <= dutyLevel ? "Y" : "N"
  );

  return {
    au_entry: hasPermission(boardInfo?.auth_entry),
    au_read: hasPermission(boardInfo?.auth_read),
    au_write: hasPermission(boardInfo?.auth_write),
    au_reple: hasPermission(boardInfo?.auth_reple),
    au_memo: hasPermission(boardInfo?.auth_memo),
    au_admin: "N",
    comm_admin: "N",
  };
};

let commAdministratorKeyColumnPromise = null;

const getCommAdministratorKeyColumn = async () => {
  if (!commAdministratorKeyColumnPromise) {
    commAdministratorKeyColumnPromise = executeQuery(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo'
        AND TABLE_NAME = 'Comm_Administrator'
        AND COLUMN_NAME IN ('emp_seq', 'seq', 'emp_id', 'emp_no')
    `).then((rows) => {
      const columns = rows.map((row) => String(row.COLUMN_NAME || "").trim().toLowerCase());
      const preferredOrder = ["emp_seq", "seq", "emp_id", "emp_no"];
      return preferredOrder.find((column) => columns.includes(column)) || null;
    }).catch((error) => {
      commAdministratorKeyColumnPromise = null;
      throw error;
    });
  }

  return commAdministratorKeyColumnPromise;
};

const getBoardInfoWithAuthorization = async (adCode, user) => {
  const normalizedAdCode = String(adCode ?? "").trim();
  if (!normalizedAdCode) {
    return null;
  }

  const [boardInfo, employee] = await Promise.all([
    executeQuery(`
      SELECT TOP 1 *
      FROM [baroyeon_intra].[dbo].[Comm_Admin]
      WHERE ad_code = @ad_code
    `, [{ name: "ad_code", type: sql.VarChar, value: normalizedAdCode }]).then((rows) => rows[0] || null),
    getEmployeeByAdmId(user?.ADM_ID ?? user?.emp_id ?? "")
  ]);

  if (!boardInfo) {
    return null;
  }

  let isBoardAdmin = false;
  const adminKeyColumn = await getCommAdministratorKeyColumn();

  if (adminKeyColumn === "emp_seq" || adminKeyColumn === "seq") {
    const empSeq = parseInt(employee?.seq ?? user?.emp_seq, 10);
    if (Number.isInteger(empSeq)) {
      const [boardAdmin] = await executeQuery(`
        SELECT TOP 1 1 AS is_admin
        FROM [baroyeon_intra].[dbo].[Comm_Administrator]
        WHERE ad_code = @ad_code
          AND ${adminKeyColumn} = @admin_key_value
      `, [
        { name: "ad_code", type: sql.VarChar, value: normalizedAdCode },
        { name: "admin_key_value", type: sql.Int, value: empSeq }
      ]);

      isBoardAdmin = Boolean(boardAdmin?.is_admin);
    }
  } else if (adminKeyColumn === "emp_id") {
    const empId = String(employee?.emp_id ?? user?.emp_id ?? user?.ADM_ID ?? "").trim();
    if (empId) {
      const [boardAdmin] = await executeQuery(`
        SELECT TOP 1 1 AS is_admin
        FROM [baroyeon_intra].[dbo].[Comm_Administrator]
        WHERE ad_code = @ad_code
          AND emp_id = @admin_key_value
      `, [
        { name: "ad_code", type: sql.VarChar, value: normalizedAdCode },
        { name: "admin_key_value", type: sql.VarChar, value: empId }
      ]);

      isBoardAdmin = Boolean(boardAdmin?.is_admin);
    }
  } else if (adminKeyColumn === "emp_no") {
    const empNo = String(employee?.emp_no ?? user?.emp_no ?? "").trim();
    if (empNo) {
      const [boardAdmin] = await executeQuery(`
        SELECT TOP 1 1 AS is_admin
        FROM [baroyeon_intra].[dbo].[Comm_Administrator]
        WHERE ad_code = @ad_code
          AND emp_no = @admin_key_value
      `, [
        { name: "ad_code", type: sql.VarChar, value: normalizedAdCode },
        { name: "admin_key_value", type: sql.VarChar, value: empNo }
      ]);

      isBoardAdmin = Boolean(boardAdmin?.is_admin);
    }
  }

  if (!adminKeyColumn) {
    isBoardAdmin = false;
  }

  return {
    ...boardInfo,
    ...buildBoardAuthorization(boardInfo, isBoardAdmin, employee?.duty_cd)
  };
};
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
const BOARD_ADMIN_EXCEPTION_UIDS = new Set([953, 1489, 643, 30]);

const EMPLOYEE_PHOTO_BASE_PATH = process.env.FILEUPLOAD_SAVE_PATH_EMPLOYEE
  || path.join("D:", "ROOT", "Baroyeon_file", "Intranet", "Manager");
const EMPLOYEE_PHOTO_ORIGINAL_PATH = path.join(EMPLOYEE_PHOTO_BASE_PATH, "original");

const ensureDirectory = async (targetPath) => {
  const normalizedTargetPath = path.resolve(String(targetPath || ""));
  const rootPath = path.parse(normalizedTargetPath).root;

  if (!rootPath || !fs.existsSync(rootPath)) {
    throw new Error(`Employee photo base path is not available on this machine: ${normalizedTargetPath}. Set FILEUPLOAD_SAVE_PATH_EMPLOYEE to a valid path.`);
  }

  await fs.promises.mkdir(targetPath, { recursive: true });
};

const decodeEmployeeUploadedOriginalName = (value) => {
  if (!value) {
    return "";
  }

  return Buffer.from(String(value), "latin1").toString("utf8");
};

const sanitizeEmployeePhotoFileName = (value) => (
  String(value || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
);

const getEmployeePhotoLargeFileName = (fileName) => {
  const parsed = path.parse(String(fileName || ""));
  return parsed.name ? `${parsed.name}_L${parsed.ext}` : "";
};

const getEmployeePhotoDirectory = (networkValue) => {
  const normalizedNetwork = String(networkValue ?? "").trim();
  return normalizedNetwork && normalizedNetwork !== "1"
    ? path.join(EMPLOYEE_PHOTO_BASE_PATH, `branch${normalizedNetwork}`)
    : EMPLOYEE_PHOTO_BASE_PATH;
};

const buildBoardDetailAuthorization = (boardInfo, boardDetail, employee, user) => {
  if (!boardInfo) {
    return boardInfo;
  }

  const currentEmpId = String(employee?.emp_id ?? user?.emp_id ?? user?.ADM_ID ?? "").trim().toLowerCase();
  const writerEmpNo = String(boardDetail?.emp_no ?? "").trim().toLowerCase();
  const isCommAdmin = String(boardInfo.comm_admin ?? "N").trim().toUpperCase() === "Y";
  const isWriter = Boolean(currentEmpId) && Boolean(writerEmpNo) && currentEmpId === writerEmpNo;
  const empSeq = parseInt(employee?.seq ?? user?.emp_seq, 10);
  const isExceptionAccount = BOARD_ADMIN_EXCEPTION_UIDS.has(empSeq);

  return {
    ...boardInfo,
    au_admin: isCommAdmin || isWriter || isExceptionAccount
      ? "Y"
      : String(boardInfo.au_admin ?? "N").trim().toUpperCase()
  };
};

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
// SunEditer 파일 업로드
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
const SunEditorUpload = async (req, res) => {
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

      File_Path = `${process.env.FILEUPLOAD_PATH_SUNEDITOR}/`;

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
    const employee = await getEmployeeByAdmId(user.ADM_ID);

    const AccessToken = jwt.sign(
      {
        ADM_ID: user.ADM_ID,
        emp_seq: employee?.seq ?? null,
        emp_id: employee?.emp_id ?? user.ADM_ID
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );
    return res.json({
      RET_DATA: {
        AccessToken,
        ADM_ID: user.ADM_ID,
        ADM_NAME: user.ADM_NAME,
        ADM_LEVEL: user.ADM_LEVEL,
        emp_seq: employee?.seq ?? null,
        emp_id: employee?.emp_id ?? user.ADM_ID,
        emp_nm: employee?.emp_nm ?? null,
        dept_cd: employee?.dept_cd ?? null,
        clss_cd: employee?.clss_cd ?? null,
        duty_cd: employee?.duty_cd ?? null,
        team_no: employee?.team_no ?? null,
        network: employee?.network ?? null,
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

    const employee = await getEmployeeByAdmId(ADM_ID);

    return res.status(200).json({
      RET_DESC: "✅ 로그인 정보 조회 성공",
      RET_CODE: "0000",
      RET_DATA: {
        ...userInfo,
        emp_seq: employee?.seq ?? decoded?.emp_seq ?? null,
        emp_id: employee?.emp_id ?? decoded?.emp_id ?? ADM_ID,
        emp_nm: employee?.emp_nm ?? null,
        dept_cd: employee?.dept_cd ?? null,
        clss_cd: employee?.clss_cd ?? null,
        duty_cd: employee?.duty_cd ?? null,
        team_no: employee?.team_no ?? null,
        network: employee?.network ?? null,
      },
    });
  } catch (err) {
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

      // { name: "ADM_ID", type: sql.VarChar, value: ADM_ID },
      // { name: "ADM_PW", type: sql.VarChar, value: HashedPassword },
      // { name: "ADM_NAME", type: sql.VarChar, value: ADM_NAME },
      // { name: "ADM_MOBILE", type: sql.VarChar, value: ADM_MOBILE },
      // { name: "ADM_LEVEL", type: sql.Int, value: 1 }
    ];

    await executeQuery(Query, params);
    return res.status(200).json({
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
  try {
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
  try {
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
  try {
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
  try {
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
  try {
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
  try {
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
  try {
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
  try {
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
  try {
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
    const { IDX, TITLE, STATUS } = req.body;
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
      { name: 'IDX', type: sql.Int, value: IDX }
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
    const { PARENTID } = req.body;
    const Query = ` SELECT IDX, PARENT_ID, TITLE FROM AD_CATEGORY WHERE PARENT_ID = @PARENTID`;
    const params = [{ name: "PARENTID", type: sql.Int, value: PARENTID }]
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
      { name: 'PG_CODE', type: sql.VarChar, value: PG_CODE },
      { name: 'PG_CODE_URL', type: sql.VarChar, value: `&PgCode=${PG_CODE}` },
      { name: 'AD_CATEGORY_IDX', type: sql.VarChar, value: AD_CATEGORY_IDX },
      { name: 'CAMPAIGN_NAME', type: sql.VarChar, value: CAMPAIGN_NAME },
      { name: 'STATUS', type: sql.Int, value: STATUS }
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
      { name: 'AD_CATEGORY_IDX', type: sql.VarChar, value: AD_CATEGORY_IDX },
      { name: 'CAMPAIGN_NAME', type: sql.VarChar, value: CAMPAIGN_NAME },
      { name: 'STATUS', type: sql.Int, value: STATUS },
      { name: 'CAMPAIGN_IDX', type: sql.Int, value: CAMPAIGN_IDX }
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
      { name: 'SelectList', type: sql.Int, value: SelectList }
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

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####             설문조사 통계 Start               ######
//#############################################################
const SURVEY_DETAIL = async (req, res) => {
  try {
    const surveyQuestions = [
      { question: 'Q1_A', useSplit: false },
      { question: 'Q2_A', useSplit: false },
      { question: 'Q3_A', useSplit: true },
      { question: 'Q4_A', useSplit: false },
      { question: 'Q5_A', useSplit: false },
      { question: 'Q6_A', useSplit: true },
      { question: 'Q7_A', useSplit: false },
      { question: 'Q8_A', useSplit: false },
    ];

    const results = [];

    for (const q of surveyQuestions) {
      const sql = q.useSplit
        ? `SELECT '${q.question}' AS question, value AS answer, COUNT(*) as result, CAST(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () AS DECIMAL(5, 2)) AS percentage FROM [baroyeon_crm].[dbo].asso_survey CROSS APPLY dbo.SplitSurveyReasons(${q.question}) GROUP BY value ORDER BY 4 DESC`
        : `SELECT '${q.question}' AS question, ${q.question} AS answer, COUNT(*) as result, CAST(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () AS DECIMAL(5, 2)) AS percentage FROM [baroyeon_crm].[dbo].asso_survey WHERE ${q.question} IS NOT NULL GROUP BY ${q.question} ORDER BY 4 DESC`;

      const res = await executeQuery(sql);
      results.push(...res);
    }

    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 조회 성공",
      RET_CODE: "0000",
      RET_DATA: results
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
//#####              설문조사 통계 End                ######
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####              팝업 (POPUP) List Start              #####
//#############################################################
const POPUP_SELECT = async (req, res) => {
  try {
    const { numPage, TotalPage, Search } = req.body;

    const startRow = (parseInt(numPage) - 1) * parseInt(TotalPage) + 1;
    const endRow = parseInt(numPage) * parseInt(TotalPage);

    const baseQuery = `
      SELECT RowNum, PA.IDX, PA.TITLE, PA.TARGET_URL, PA.FILE_KEY, PA.START_DATE, PA.END_DATE, PA.IS_ACTIVE, PA.CREATE_AT, 
            FA.ORIGINAL_FILENAME, FA.SAVE_FILENAME, FA.FILE_PATH
      FROM (
        SELECT ROW_NUMBER() OVER (ORDER BY IDX DESC) AS RowNum, IDX, TITLE, TARGET_URL, FILE_KEY, START_DATE, END_DATE, IS_ACTIVE, CREATE_AT
        FROM POPUP_ACTIVE
        WHERE TITLE LIKE @Search
      ) AS PA
      LEFT JOIN FILE_ATTACH FA ON FA.FILE_KEY = PA.FILE_KEY
      WHERE PA.RowNum BETWEEN @startRow AND @endRow
      ORDER BY RowNum ASC, PA.IDX DESC
    `;

    const countQuery = `
      SELECT COUNT(*) AS TOTAL_CNT FROM POPUP_ACTIVE WHERE TITLE LIKE @Search
    `;

    const params = [
      { name: 'Search', type: sql.VarChar, value: `%${Search}%` },
      { name: 'startRow', type: sql.Int, value: startRow },
      { name: 'endRow', type: sql.Int, value: endRow }
    ];

    const result = await executeQuery(baseQuery, params);
    const result_total = await executeQuery(countQuery, [{ name: 'Search', type: sql.VarChar, value: `%${Search}%` }]);
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
//#####               팝업 (POPUP) List End               #####
//#############################################################

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####             팝업 (POPUP) Detail Start             #####
//#############################################################
const POPUP_DETAIL = async (req, res) => {
  try {
    const { popup_idx } = req.body;
    const Query = ` SELECT PA.IDX, PA.TITLE, PA.TARGET_URL, PA.FILE_KEY, PA.START_DATE, PA.END_DATE,
                          PA.POPUP_AREA, PA.SHOW_DAY, PA.IS_ACTIVE, PA.POPUP_CLOSE_CL, PA.CREATE_AT,
                          FA.ORIGINAL_FILENAME, FA.SAVE_FILENAME, FA.FILE_PATH 
                    FROM POPUP_ACTIVE PA
                    LEFT JOIN FILE_ATTACH FA ON FA.FILE_KEY = PA.FILE_KEY
                    WHERE PA.IDX = @popup_idx
                  `;
    const params = [
      { name: 'popup_idx', type: sql.Int, value: popup_idx }
    ];
    const result = await executeQuery(Query, params);



    if (!result || result.length === 0) {
      return res.status(404).json({
        RET_STAT: 'fail',
        RET_DESC: '❌ 조회된 게시물이 없습니다',
        RET_CODE: '4040',
      });
    }

    const popupData = result[0];

    let file_result = [];

    if (popupData.FILE_KEY) {
      const Query_F = ` SELECT FILE_KEY, ORIGINAL_FILENAME, SAVE_FILENAME, FILE_PATH, FILE_EXT, FILE_SIZE FROM FILE_ATTACH WHERE FILE_KEY = @FILE_KEY `;
      const result_f = await executeQuery(Query_F, [
        { name: 'FILE_KEY', type: sql.VarChar, value: popupData.FILE_KEY },
      ]);
      file_result = result_f || [];
    }

    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 조회 성공",
      RET_CODE: "0000",
      RET_DATA: {
        ...popupData,
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
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####              팝업 (POPUP) Detail End              #####
//#############################################################

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####             팝업(POPUP) INSERT Start              #####
//#############################################################
const POPUP_REGIST = async (req, res) => {
  try {
    const {
      POPUP_TITLE, POPUP_TARGET_URL, POPUP_FILE_KEY, POPUP_START, POPUP_END, POPUP_AREA, POPUP_SHOW_DAY,
      POPUP_ACTIVE, POPUP_CLOSE_CL, POPUP_CREATE_AT } = req.body;
    const Query = ` INSERT INTO POPUP_ACTIVE (TITLE, TARGET_URL, FILE_KEY, START_DATE, END_DATE, POPUP_AREA, SHOW_DAY, IS_ACTIVE, POPUP_CLOSE_CL, CREATE_AT) 
                    VALUES (@POPUP_TITLE, @POPUP_TARGET_URL, @POPUP_FILE_KEY, @POPUP_START, @POPUP_END, @POPUP_AREA, @POPUP_SHOW_DAY, @POPUP_ACTIVE, @POPUP_CLOSE_CL, @POPUP_CREATE_AT) `;

    const params = [
      { name: 'POPUP_TITLE', type: sql.VarChar, value: POPUP_TITLE },
      { name: 'POPUP_TARGET_URL', type: sql.VarChar, value: POPUP_TARGET_URL },
      { name: 'POPUP_FILE_KEY', type: sql.VarChar, value: POPUP_FILE_KEY },
      { name: 'POPUP_START', type: sql.VarChar, value: POPUP_START },
      { name: 'POPUP_END', type: sql.VarChar, value: POPUP_END },
      { name: 'POPUP_AREA', type: sql.Char, value: POPUP_AREA },
      { name: 'POPUP_SHOW_DAY', type: sql.Char, value: POPUP_SHOW_DAY },
      { name: 'POPUP_ACTIVE', type: sql.Char, value: POPUP_ACTIVE },
      { name: 'POPUP_CLOSE_CL', type: sql.VarChar, value: POPUP_CLOSE_CL },
      { name: 'POPUP_CREATE_AT', type: sql.DateTime, value: POPUP_CREATE_AT }
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
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####              팝업(POPUP) INSERT End               #####
//#############################################################

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####            팝업 (POPUP) UPDATE Start              #####
//#############################################################
const POPUP_UPDATE = async (req, res) => {
  try {
    const { POPUP_TITLE, POPUP_TARGET_URL, POPUP_START, POPUP_END, POPUP_AREA, POPUP_SHOW_DAY, POPUP_ACTIVE, POPUP_CLOSE_CL, POPUP_Idx } = req.body;
    const Query = ` UPDATE POPUP_ACTIVE SET 
                      TITLE = @POPUP_TITLE, TARGET_URL = @POPUP_TARGET_URL, START_DATE = @POPUP_START, END_DATE = @POPUP_END, 
                      POPUP_AREA = @POPUP_AREA, SHOW_DAY = @POPUP_SHOW_DAY, IS_ACTIVE = @POPUP_ACTIVE, POPUP_CLOSE_CL = @POPUP_CLOSE_CL                      
                    WHERE IDX = @POPUP_Idx `;
    const params = [
      { name: 'POPUP_TITLE', type: sql.VarChar, value: POPUP_TITLE },
      { name: 'POPUP_TARGET_URL', type: sql.VarChar, value: POPUP_TARGET_URL },
      { name: 'POPUP_START', type: sql.VarChar, value: POPUP_START },
      { name: 'POPUP_END', type: sql.VarChar, value: POPUP_END },
      { name: 'POPUP_AREA', type: sql.Char, value: POPUP_AREA },
      { name: 'POPUP_SHOW_DAY', type: sql.Char, value: POPUP_SHOW_DAY },
      { name: 'POPUP_ACTIVE', type: sql.Char, value: POPUP_ACTIVE },
      { name: 'POPUP_CLOSE_CL', type: sql.VarChar, value: POPUP_CLOSE_CL },
      { name: 'POPUP_Idx', type: sql.Int, value: POPUP_Idx }
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
//#####             팝업 (POPUP) UPDATE End               #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####             팝업 (POPUP) DELETE Start              #####
//#############################################################
const POPUP_DELETE = async (req, res) => {
  try {
    const { POPUP_IDX } = req.body;

    for (const IDX of POPUP_IDX) {
      // POPUP_ACTIVE → FILE_KEY 조회
      const FILE_SCK = `SELECT FILE_KEY FROM POPUP_ACTIVE WHERE IDX = @IDX`;
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
      const DATE_DEL = `DELETE FROM POPUP_ACTIVE WHERE IDX = @IDX`;
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
//#####              팝업 (POPUP) DELETE End               #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####               SEO (SEO) List Start               #####
//#############################################################
const SEO_SELECT = async (req, res) => {
  try {
    const { numPage, TotalPage, Search } = req.body;
    const startRow = (parseInt(numPage) - 1) * parseInt(TotalPage) + 1;
    const endRow = parseInt(numPage) * parseInt(TotalPage);
    const WHERE_SEARCH = ` WHERE TITLE LIKE '%${Search}%' `;
    const Query = `SELECT RowNum, SP.IDX, SP.TITLE, SP.SUBJECT, SP.CONTENTS, SP.FILE_KEY, SP.STATUS, SP.CREATE_AT, FA.ORIGINAL_FILENAME, FA.SAVE_FILENAME, FA.FILE_PATH 
                      FROM
                      (SELECT ROW_NUMBER() OVER(ORDER BY IDX DESC)AS RowNum, IDX, TITLE, SUBJECT, CONTENTS, FILE_KEY, STATUS, CREATE_AT FROM SEO_POST 
                      ${WHERE_SEARCH}  )AS SP
                      LEFT JOIN FILE_ATTACH FA ON FA.FILE_KEY = SP.FILE_KEY
                    WHERE SP.ROWNUM  
                      BETWEEN @startRow AND @endRow
                    ORDER BY ROWNUM ASC, IDX DESC `;
    const Query_Total = ` SELECT COUNT(*) AS TOTAL_CNT FROM SEO_POST `;

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
//#####               SEO (SEO) List End                 #####
//#############################################################

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####               SEO (SEO) Detail Start              #####
//#############################################################
const SEO_DETAIL = async (req, res) => {
  try {
    const { Seo_Idx } = req.body;
    const Query = ` SELECT SP.IDX, SP.TITLE, SP.SUBJECT, SP.CONTENTS, SP.FILE_KEY, SP.STATUS, SP.CREATE_AT,
                          FA.ORIGINAL_FILENAME, FA.SAVE_FILENAME, FA.FILE_PATH 
                    FROM SEO_POST SP
                    LEFT JOIN FILE_ATTACH FA ON FA.FILE_KEY = SP.FILE_KEY
                    WHERE SP.IDX = @Seo_Idx
                  `;
    const params = [
      { name: 'Seo_Idx', type: sql.Int, value: Seo_Idx }
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
//#####                SEO (SEO) Detail End               #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####               SEO (SEO) INSERT Start             #####
//#############################################################
const SEO_REGIST = async (req, res) => {
  try {
    const { SEO_TITLE, SEO_SUBJECT, SEO_CONTENTS, SEO_FILE_KEY, SEO_STATUS, SEO_CREATE_AT } = req.body;
    const Query = ` INSERT INTO SEO_POST (TITLE, SUBJECT, CONTENTS, FILE_KEY, STATUS, CREATE_AT) 
                      VALUES
                      (@SEO_TITLE, @SEO_SUBJECT, @SEO_CONTENTS, @SEO_FILE_KEY, @SEO_STATUS, @SEO_CREATE_AT) `;

    const params = [
      { name: 'SEO_TITLE', type: sql.VarChar, value: SEO_TITLE },
      { name: 'SEO_SUBJECT', type: sql.VarChar, value: SEO_SUBJECT },
      { name: 'SEO_CONTENTS', type: sql.VarChar, value: SEO_CONTENTS },
      { name: 'SEO_FILE_KEY', type: sql.VarChar, value: SEO_FILE_KEY },
      { name: 'SEO_STATUS', type: sql.Int, value: SEO_STATUS },
      { name: 'SEO_CREATE_AT', type: sql.VarChar, value: SEO_CREATE_AT }
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
//#####               SEO (SEO) INSERT End               #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####              SEO (SEO) UPDATE Start               #####
//#############################################################
const SEO_UPDATE = async (req, res) => {
  try {
    const { SEO_TITLE, SEO_SUBJECT, SEO_CONTENTS, SEO_STATUS, Seo_Idx } = req.body;
    const Query = ` UPDATE SEO_POST SET 
                      TITLE = @SEO_TITLE, SUBJECT = @SEO_SUBJECT, CONTENTS = @SEO_CONTENTS, STATUS = @SEO_STATUS 
                    WHERE IDX = @Seo_Idx `;
    const params = [
      { name: 'SEO_TITLE', type: sql.VarChar, value: SEO_TITLE },
      { name: 'SEO_SUBJECT', type: sql.VarChar, value: SEO_SUBJECT },
      { name: 'SEO_CONTENTS', type: sql.VarChar, value: SEO_CONTENTS },
      { name: 'SEO_STATUS', type: sql.Int, value: SEO_STATUS },
      { name: 'Seo_Idx', type: sql.Int, value: Seo_Idx }
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
//#####              SEO (SEO) UPDATE End                 #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####              SEO (SEO) DELETE Start               #####
//#############################################################
const SEO_DELETE = async (req, res) => {
  try {
    const { Seo_Idx, FileType } = req.body;

    for (const IDX of Seo_Idx) {
      // MEETING_EVENT → FILE_KEY 조회
      const FILE_SCK = `SELECT FILE_KEY FROM SEO_POST WHERE IDX = @IDX`;
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

      // SEO Post 삭제
      const DATE_DEL = `DELETE FROM SEO_POST WHERE IDX = @IDX`;
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
//#####               SEO (SEO) DELETE End                #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####           직원 리스트 (Employee) List Start         #####
//#############################################################
const EMPLOYEE_SELECT = async (req, res) => {
  try {
    const {
      numPage = 1,
      TotalPage = 20,
      sel_sch_col = '',
      txt_sch_word = '',
      sch_quit_chk = 'N',
      sch_dept = '',
      sch_inY = '',
      sch_inM = '',
      sch_jisa = '1'
    } = req.body || {};

    const pageSize = parseInt(TotalPage, 10) || 20;
    const page = parseInt(numPage, 10) || 1;
    const startRow = (page - 1) * pageSize + 1;
    const endRow = page * pageSize;

    const whereParts = [
      "emp_group <> 9",
      "seq > 7",
      "seq NOT IN (1001, 1002, 1003, 1004)",
      "network = @network"
    ];

    const params = [
      { name: 'network', type: sql.VarChar, value: sch_jisa }
    ];

    if (sel_sch_col && txt_sch_word) {
      const cleaned = String(txt_sch_word).replace(/'/g, '');
      if (sel_sch_col === 'emp_nm') {
        whereParts.push("emp_nm LIKE '%' + @search + '%'");
      } else if (sel_sch_col === 'emp_id') {
        whereParts.push("emp_id LIKE '%' + @search + '%'");
      }

      params.push({ name: 'search', type: sql.NVarChar, value: cleaned });
    }

    if (sch_quit_chk && sch_quit_chk !== 'A') {
      whereParts.push("quit_chk = @quit_chk");
      params.push({ name: 'quit_chk', type: sql.VarChar, value: sch_quit_chk });
    }

    if (sch_dept) {
      whereParts.push("dept_cd = @dept_cd");
      params.push({ name: 'dept_cd', type: sql.VarChar, value: sch_dept });
    }

    if (sch_inY || sch_inM) {
      if (sch_quit_chk !== 'Y') {
        whereParts.push("ISNULL(ins_day, '') <> ''");
        if (sch_inY) {
          whereParts.push("SUBSTRING(ins_day, 1, 4) = @iy");
          params.push({ name: 'iy', type: sql.VarChar, value: String(sch_inY) });
        }
        if (sch_inM) {
          whereParts.push("SUBSTRING(ins_day, 6, 2) = @im");
          params.push({ name: 'im', type: sql.VarChar, value: String(sch_inM).padStart(2, '0') });
        }
      } else { // 퇴사자
        whereParts.push("quit_day IS NOT NULL");
        if (sch_inY) {
          whereParts.push("SUBSTRING(CONVERT(VARCHAR(20), quit_day, 21), 1, 4) = @qy");
          params.push({ name: 'qy', type: sql.VarChar, value: String(sch_inY) });
        }
        if (sch_inM) {
          whereParts.push("SUBSTRING(CONVERT(VARCHAR(20), quit_day, 21), 6, 2) = @qm");
          params.push({ name: 'qm', type: sql.VarChar, value: String(sch_inM).padStart(2, '0') });
        }
      }
    }

    const whereClause = `WHERE ${whereParts.join(' AND ')}`;

    const Query_Total = `
      SELECT COUNT(*) AS TOTAL_CNT
      FROM [baroyeon_intra].[dbo].view_EmpLIst
      ${whereClause}
    `;

    const Query = `
      WITH EMP AS (
        SELECT
          ROW_NUMBER() OVER (ORDER BY ins_day DESC, seq DESC)AS RowNum,
          seq, emp_id, emp_nm, dept_cd, clss_cd, duty_cd,
          emp_tel, emp_hp, emp_email, ins_day, quit_chk, quit_day,
          emp_photo, photo_Name, emp_tel2, network, emp_nm_real
        FROM [baroyeon_intra].[dbo].view_EmpLIst
        ${whereClause}
      )
      SELECT *
      FROM EMP
      WHERE RowNum BETWEEN @startRow AND @endRow
      ORDER BY RowNum ASC
    `;

    const pageParams = [
      ...params,
      { name: 'startRow', type: sql.Int, value: startRow },
      { name: 'endRow', type: sql.Int, value: endRow }
    ];

    const [rows, totalRes] = await Promise.all([
      executeQuery(Query, pageParams),
      executeQuery(Query_Total, params)
    ]);

    const totalCount = totalRes[0]?.TOTAL_CNT ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    // ---- 사번(지사코드 + zero-padding) 계산 ----
    const codeMap = { "1": "B", "2": "P", "3": "D", "4": "C", "5": "H", "6": "S", "7": "" };
    const data = rows.map(r => {
      const letter = codeMap[String(r.network)] ?? '';
      const seqStr = String(r.seq ?? '').padStart(5, '0');
      const empno = `${letter}${seqStr}`;
      return { ...r, empno };
    });

    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 조회 성공",
      RET_CODE: "0000",
      RET_DATA: data,
      PAGE_INFO: {
        page,
        pageSize,
        startRow,
        endRow,
        totalCount,
        totalPages
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
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####          직원 리스트 (Employee) List End           #####
//#############################################################

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####       직원 상세 정보 (Employee Detail) Start      #####
//#############################################################
const EMPLOYEE_DETAIL = async (req, res) => {
  try {
    const { emp_seq, hd_emp_seq, seq } = req.body || {};
    const targetSeq = parseInt(emp_seq ?? hd_emp_seq ?? seq, 10);

    if (!Number.isInteger(targetSeq)) {
      return res.status(400).json({
        RET_STAT: "fail",
        RET_DESC: "Invalid employee sequence.",
        RET_CODE: "1001",
      });
    }

    const [employee] = await executeQuery(`
      SELECT TOP 1
        seq,
        network,
        emp_id,
        emp_pw,
        emp_nm_real,
        emp_nm,
        emp_jm1,
        emp_jm2,
        emp_email,
        emp_tel,
        emp_tel2,
        emp_hp,
        emp_ip,
        emp_photo,
        photo_Name,
        emp_home,
        emp_home_auth,
        emp_home_order,
        rk_order,
        team_no,
        emp_group,
        ins_day,
        quit_chk,
        quit_day,
        dept_cd,
        clss_cd,
        duty_cd,
        team_auth,
        emp_level,
        emp_auth,
        emp_auth2,
        emp_goal,
        emp_desc,
        my_info,
        emp_career,
        emp_app,
        cManager_chk,
        mManager_chk,
        au_asso_ad_chk,
        au_asso_db_chk,
        au_asso_mg_chk,
        au_asso_pay_chk,
        au_asso_reg_chk,
        au_cust_cert_chk,
        au_cust_reg_chk,
        au_cust_sch_chk,
        au_cust_vip_chk,
        au_asso_access_chk,
        au_cust_access_chk,
        au_home_chk,
        au_ad_chk,
        au_emp_chk,
        au_crm_chk,
        reg_date,
        emp_order,
        rk_team,
        wb_order,
        pw_update,
        web_id,
        au_cust_adm_level,
        au_asso_adm_level
      FROM [baroyeon_intra].[dbo].[EMP_BONSA]
      WHERE seq = @seq
    `, [{ name: "seq", type: sql.Int, value: targetSeq }]);

    if (!employee) {
      return res.status(404).json({
        RET_STAT: "fail",
        RET_DESC: "Employee not found.",
        RET_CODE: "1004",
      });
    }

    const empTel = getScalarValue(employee.emp_tel);
    const empTel2 = getScalarValue(employee.emp_tel2, employee.emp_hp);
    const telParts = empTel.split("-");
    const responseEmployee = {
      hd_emp_seq: targetSeq,
      emp_seq: targetSeq,
      seq: targetSeq,
      txt_emp_id: getScalarValue(employee.emp_id),
      emp_id: getScalarValue(employee.emp_id),
      emp_nm: getScalarValue(employee.emp_nm),
      emp_nm_real: getScalarValue(employee.emp_nm_real, employee.emp_nm),
      dept_cd: getScalarValue(employee.dept_cd),
      clss_cd: getScalarValue(employee.clss_cd),
      duty_cd: getScalarValue(employee.duty_cd),
      team_no: employee.team_no ?? 0,
      network: employee.network ?? 0,
      txt_Tel1: telParts[0] || "",
      txt_Tel2: telParts[1] || "",
      txt_Tel3: telParts[2] || "",
      emp_tel: empTel,
      emp_tel2: empTel2,
      emp_hp: empTel2,
      txt_emp_email_id: getScalarValue(employee.emp_email),
      emp_email: getScalarValue(employee.emp_email),
      txt_my_info: getScalarValue(employee.my_info),
      my_info: getScalarValue(employee.my_info),
      pwd_pw: "",
      emp_pw: "",
      txt_emp_Tel: empTel,
      txt_emp_Tel2: getScalarValue(employee.emp_tel2),
      txt_emp_Hp: getScalarValue(employee.emp_hp),
      txt_emp_pw: "",
      txt_name: getScalarValue(employee.emp_nm),
      txt_name_real: getScalarValue(employee.emp_nm_real, employee.emp_nm),
      txt_team_no: getScalarValue(employee.team_no),
      txt_emp_career: getScalarValue(employee.emp_career),
      txt_emp_app: getScalarValue(employee.emp_app),
      txt_emp_desc: getScalarValue(employee.emp_desc),
      emp_photo: getScalarValue(employee.emp_photo),
      emp_home: getScalarValue(employee.emp_home),
      photo_name: getScalarValue(employee.photo_Name),
      photo_Name: getScalarValue(employee.photo_Name),
      ins_day: employee.ins_day ?? "",
      quit_chk: getScalarValue(employee.quit_chk),
      quit_day: employee.quit_day ?? null,
      team_auth: employee.team_auth ?? 0,
      emp_level: employee.emp_level ?? 0,
      emp_auth: employee.emp_auth ?? 0,
      emp_auth2: employee.emp_auth2 ?? 0,
      cManager_chk: getScalarValue(employee.cManager_chk),
      mManager_chk: getScalarValue(employee.mManager_chk),
      au_asso_ad_chk: getScalarValue(employee.au_asso_ad_chk),
      au_asso_db_chk: getScalarValue(employee.au_asso_db_chk),
      au_asso_mg_chk: getScalarValue(employee.au_asso_mg_chk),
      au_asso_pay_chk: getScalarValue(employee.au_asso_pay_chk),
      au_asso_reg_chk: getScalarValue(employee.au_asso_reg_chk),
      au_cust_cert_chk: getScalarValue(employee.au_cust_cert_chk),
      au_cust_reg_chk: getScalarValue(employee.au_cust_reg_chk),
      au_cust_sch_chk: getScalarValue(employee.au_cust_sch_chk),
      au_cust_vip_chk: getScalarValue(employee.au_cust_vip_chk),
      au_asso_access_chk: getScalarValue(employee.au_asso_access_chk),
      au_cust_access_chk: getScalarValue(employee.au_cust_access_chk),
      au_home_chk: getScalarValue(employee.au_home_chk),
      au_ad_chk: getScalarValue(employee.au_ad_chk),
      au_emp_chk: getScalarValue(employee.au_emp_chk),
      au_crm_chk: getScalarValue(employee.au_crm_chk),
      web_id: getScalarValue(employee.web_id),
      emp_desc: getScalarValue(employee.emp_desc),
      emp_career: getScalarValue(employee.emp_career),
      emp_app: getScalarValue(employee.emp_app),
      reg_date: employee.reg_date ?? null,
      pw_update: employee.pw_update ?? null
    };

    return res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "Employee detail loaded.",
      RET_CODE: "0000",
      RET_DATA: responseEmployee
    });
  } catch (err) {
    console.error("[EMPLOYEE_DETAIL] error", err);
    return res.status(500).json({
      RET_STAT: "error",
      RET_DESC: err?.message || "Server error",
      RET_CODE: "1000",
    });
  }
};
//#############################################################
//#####       직원 상세 정보 (Employee Detail) Start      #####
//#############################################################


//#############################################################
//#####       직원 정보 수정 (Employee Update) Start      #####
//#############################################################
const EMPLOYEE_UPDATE = async (req, res) => {
  try {
    const {
      hd_emp_seq,
      emp_seq,
      seq,
      txt_emp_id = "",
      txt_Tel1 = "",
      txt_Tel2 = "",
      txt_Tel3 = "",
      txt_emp_email_id = "",
      txt_my_info = "",
      txt_emp_career = "",
      txt_emp_app = "",
      txt_emp_desc = "",
      txt_emp_Tel = "",
      txt_emp_pw = "",
      cb_photo_chk = "",
      pwd_pw = "",
      emp_id = "",
      emp_tel = "",
      emp_email = "",
      my_info = "",
      emp_career = "",
      emp_app = "",
      emp_desc = "",
      emp_pw = ""
    } = req.body || {};

    const hasOwn = (key) => Object.prototype.hasOwnProperty.call(req.body || {}, key);

    const targetSeq = parseInt(hd_emp_seq ?? emp_seq ?? seq, 10);
    if (!Number.isInteger(targetSeq)) {
      return res.status(400).json({
        RET_STAT: "fail",
        RET_DESC: "Invalid employee sequence.",
        RET_CODE: "1001",
      });
    }

    const [currentEmployee] = await executeQuery(`
      SELECT TOP 1 seq, emp_id, emp_tel, emp_email, my_info, emp_career, emp_app, emp_desc, photo_name, emp_photo, network
      FROM [baroyeon_intra].[dbo].[view_EmpLIst]
      WHERE seq = @seq
    `, [{ name: "seq", type: sql.Int, value: targetSeq }]);

    if (!currentEmployee) {
      return res.status(404).json({
        RET_STAT: "fail",
        RET_DESC: "Employee not found.",
        RET_CODE: "1004",
      });
    }

    const nextEmpId = hasOwn("txt_emp_id")
      ? String(txt_emp_id ?? "").trim()
      : hasOwn("emp_id")
        ? String(emp_id ?? "").trim()
        : String(currentEmployee.emp_id || "").trim();
    const telParts = [txt_Tel1, txt_Tel2, txt_Tel3].map((value) => String(value || "").trim()).filter(Boolean);
    const nextEmpTel = telParts.length > 0
      ? telParts.join("-")
      : hasOwn("txt_emp_Tel")
        ? String(txt_emp_Tel ?? "").trim()
        : String(emp_tel || currentEmployee.emp_tel || "").trim();
    const nextEmpEmail = hasOwn("txt_emp_email_id")
      ? String(txt_emp_email_id ?? "").trim()
      : hasOwn("emp_email")
        ? String(emp_email ?? "").trim()
        : String(currentEmployee.emp_email || "").trim();
    const nextMyInfo = hasOwn("txt_my_info")
      ? String(txt_my_info ?? "")
      : hasOwn("my_info")
        ? String(my_info ?? "")
        : String(currentEmployee.my_info || "");
    const nextEmpCareer = hasOwn("txt_emp_career")
      ? String(txt_emp_career ?? "")
      : hasOwn("emp_career")
        ? String(emp_career ?? "")
        : String(currentEmployee.emp_career || "");
    const nextEmpApp = hasOwn("txt_emp_app")
      ? String(txt_emp_app ?? "")
      : hasOwn("emp_app")
        ? String(emp_app ?? "")
        : String(currentEmployee.emp_app || "");
    const nextEmpDesc = hasOwn("txt_emp_desc")
      ? String(txt_emp_desc ?? "")
      : hasOwn("emp_desc")
        ? String(emp_desc ?? "")
        : String(currentEmployee.emp_desc || "");
    const nextEmpPhoto = hasOwn("cb_photo_chk")
      ? String(cb_photo_chk || "").trim().toUpperCase() === "Y"
        ? "Y"
        : "N"
      : String(currentEmployee.emp_photo || "").trim().toUpperCase() === "Y"
        ? "Y"
        : "N";
    const nextPassword = hasOwn("pwd_pw")
      ? String(pwd_pw ?? "").trim()
      : hasOwn("txt_emp_pw")
        ? String(txt_emp_pw ?? "").trim()
      : hasOwn("emp_pw")
        ? String(emp_pw ?? "").trim()
        : "";

    const params = [
      { name: "seq", type: sql.Int, value: targetSeq },
      { name: "emp_id", type: sql.VarChar, value: nextEmpId },
      { name: "emp_tel", type: sql.VarChar, value: nextEmpTel },
      { name: "emp_email", type: sql.NVarChar, value: nextEmpEmail },
      { name: "my_info", type: sql.NVarChar(sql.MAX), value: nextMyInfo },
      { name: "emp_career", type: sql.NVarChar(sql.MAX), value: nextEmpCareer },
      { name: "emp_app", type: sql.NVarChar(sql.MAX), value: nextEmpApp },
      { name: "emp_desc", type: sql.NVarChar(sql.MAX), value: nextEmpDesc },
      { name: "emp_photo", type: sql.Char(1), value: nextEmpPhoto }
    ];

    const setParts = [
      "emp_tel = @emp_tel",
      "emp_email = @emp_email",
      "my_info = @my_info",
      "emp_career = @emp_career",
      "emp_app = @emp_app",
      "emp_desc = @emp_desc",
      "emp_photo = @emp_photo"
    ];

    if (nextPassword) {
      setParts.push("emp_pw = CONVERT(VARBINARY(50), @emp_pw)");
      setParts.push("pw_update = GETDATE()");
      params.push({ name: "emp_pw", type: sql.VarChar, value: nextPassword });
    }

    const updateResult = await executeQuery(`
      UPDATE [baroyeon_intra].[dbo].[EMP_BONSA]
      SET ${setParts.join(", ")}
      WHERE seq = @seq AND emp_id = @emp_id;
      SELECT @@ROWCOUNT AS affected;
    `, params);

    if ((updateResult?.[0]?.affected ?? 0) === 0) {
      return res.status(404).json({
        RET_STAT: "fail",
        RET_DESC: "Employee not found.",
        RET_CODE: "1004",
      });
    }

    if (nextPassword) {
      const hashedPassword = await hashPassword(nextPassword);
      await executeQuery(`
        UPDATE ADM_MEM
        SET ADM_PW = @adm_pw
        WHERE ADM_ID = @adm_id
      `, [
        { name: "adm_pw", type: sql.VarChar, value: hashedPassword },
        { name: "adm_id", type: sql.VarChar, value: String(currentEmployee.emp_id || nextEmpId).trim() }
      ]);
    }

    const [employee] = await executeQuery(`
      SELECT TOP 1
        seq, emp_id, emp_nm, emp_nm_real, dept_cd, clss_cd, duty_cd,
        emp_tel, emp_tel2, emp_hp, emp_email, my_info,
        emp_photo, photo_name, ins_day, quit_chk, quit_day, network
      FROM [baroyeon_intra].[dbo].[view_EmpLIst]
      WHERE seq = @seq
    `, [{ name: "seq", type: sql.Int, value: targetSeq }]);

    return res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "Employee updated.",
      RET_CODE: "0000",
      RET_DATA: employee || {
        seq: targetSeq,
        emp_id: nextEmpId,
        emp_tel: nextEmpTel,
        emp_email: nextEmpEmail,
        my_info: nextMyInfo,
        emp_career: nextEmpCareer,
        emp_app: nextEmpApp,
        emp_desc: nextEmpDesc
      }
    });
  } catch (err) {
    console.error("[EMPLOYEE_UPDATE] error", err);
    return res.status(500).json({
      RET_STAT: "error",
      RET_DESC: err?.message || "Server error",
      RET_CODE: "1000",
    });
  }
};
//#############################################################
//#####       직원 정보 수정 (Employee Update) End        #####
//#############################################################


//#############################################################
//#####       직원 사진 업로드 (Employee Photo Upload) Start #####
//#############################################################
const EMPLOYEE_PHOTO_UPLOAD = async (req, res) => {
  try {
    const files = req.files || [];
    const targetSeq = parseInt(req.body?.emp_seq ?? req.body?.hd_emp_seq ?? req.body?.seq, 10);

    if (!Number.isInteger(targetSeq)) {
      return res.status(400).json({
        RET_STAT: "fail",
        RET_DESC: "Invalid employee sequence.",
        RET_CODE: "1001",
      });
    }

    if (!files.length) {
      return res.status(400).json({
        RET_STAT: "fail",
        RET_DESC: "No files uploaded.",
        RET_CODE: "1001",
      });
    }

    const [employee] = await executeQuery(`
      SELECT TOP 1 seq, emp_id, network, photo_name
      FROM [baroyeon_intra].[dbo].[view_EmpLIst]
      WHERE seq = @seq
    `, [{ name: "seq", type: sql.Int, value: targetSeq }]);

    if (!employee) {
      return res.status(404).json({
        RET_STAT: "fail",
        RET_DESC: "Employee not found.",
        RET_CODE: "1004",
      });
    }

    const file = files[0];
    const originalName = decodeEmployeeUploadedOriginalName(file.originalname);
    const ext = path.extname(originalName || file.originalname || "").toLowerCase();
    const allowedExt = new Set([".jpg", ".jpeg", ".png", ".gif"]);

    if (!allowedExt.has(ext)) {
      return res.status(400).json({
        RET_STAT: "fail",
        RET_DESC: "Only jpg, jpeg, png, gif files are allowed.",
        RET_CODE: "1002",
      });
    }

    const safeEmpName = sanitizeEmployeePhotoFileName(String(employee.emp_id || employee.emp_nm || `emp_${targetSeq}`));
    const saveFileName = `${safeEmpName}_${Date.now()}${ext}`;
    const largeFileName = getEmployeePhotoLargeFileName(saveFileName);
    const targetDir = getEmployeePhotoDirectory(employee.network);
    const targetPath = path.join(targetDir, saveFileName);
    const largeTargetPath = path.join(targetDir, largeFileName);
    const originalTargetPath = path.join(EMPLOYEE_PHOTO_ORIGINAL_PATH, saveFileName);

    await ensureDirectory(targetDir);
    await ensureDirectory(EMPLOYEE_PHOTO_ORIGINAL_PATH);
    await fs.promises.rename(file.path, targetPath);
    await fs.promises.copyFile(targetPath, largeTargetPath);
    await fs.promises.copyFile(targetPath, originalTargetPath);

    await executeQuery(`
      UPDATE [baroyeon_intra].[dbo].[EMP_BONSA]
      SET photo_name = @photo_name,
          emp_photo = 'Y'
      WHERE seq = @seq
    `, [
      { name: "photo_name", type: sql.VarChar, value: saveFileName },
      { name: "seq", type: sql.Int, value: targetSeq }
    ]);

    if (employee.photo_name && String(employee.photo_name).trim() && String(employee.photo_name).trim() !== saveFileName) {
      const previousFileName = String(employee.photo_name).trim();
      const previousLargeFileName = getEmployeePhotoLargeFileName(previousFileName);
      const previousPhotoPath = path.join(targetDir, previousFileName);
      const previousLargePhotoPath = path.join(targetDir, previousLargeFileName);

      await fs.promises.unlink(previousPhotoPath).catch(() => {});
      await fs.promises.unlink(previousLargePhotoPath).catch(() => {});
    }

    return res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "Employee photo uploaded.",
      RET_CODE: "0000",
      RET_DATA: {
        seq: targetSeq,
        photo_name: saveFileName,
        photo_Name: saveFileName,
        emp_photo: "Y",
        network: employee.network ?? ""
      }
    });
  } catch (err) {
    console.error("[EMPLOYEE_PHOTO_UPLOAD] error", err);
    return res.status(500).json({
      RET_STAT: "error",
      RET_DESC: err?.message || "Server error",
      RET_CODE: "1000",
    });
  }
};
//#############################################################
//#####       직원 사진 업로드 (Employee Photo Upload) End   #####
//#############################################################


//#############################################################
//#####       마이페이지 상세 (My Page Detail) Start      #####
//#############################################################
const MYPAGE_DETAIL = async (req, res) => {
  try {
    const { emp_seq, hd_emp_seq, seq } = req.body || {};
    const fallbackEmpSeq = req.user?.emp_seq ?? (await getEmployeeByAdmId(req.user?.ADM_ID))?.seq;
    const targetSeq = parseInt(emp_seq ?? hd_emp_seq ?? seq ?? fallbackEmpSeq, 10);

    if (!Number.isInteger(targetSeq)) {
      return res.status(400).json({
        RET_STAT: "fail",
        RET_DESC: "Invalid employee sequence.",
        RET_CODE: "1001",
      });
    }

    req.body = { ...(req.body || {}), emp_seq: targetSeq };
    return EMPLOYEE_DETAIL(req, res);
  } catch (err) {
    console.error("[MYPAGE_DETAIL] error", err);
    return res.status(500).json({
      RET_STAT: "error",
      RET_DESC: err?.message || "Server error",
      RET_CODE: "1000",
    });
  }
};
//#############################################################
//#####       마이페이지 상세 (My Page Detail) End        #####
//#############################################################


//#############################################################
//#####       마이페이지 정보 수정 (My Page Update) Start      #####
//#############################################################
const MYPAGE_UPDATE = async (req, res) => {
  try {
    const fallbackEmpSeq = req.user?.emp_seq ?? (await getEmployeeByAdmId(req.user?.ADM_ID))?.seq;
    req.body = {
      ...(req.body || {}),
      hd_emp_seq: req.body?.hd_emp_seq ?? fallbackEmpSeq,
      emp_seq: req.body?.emp_seq ?? fallbackEmpSeq,
      seq: req.body?.seq ?? fallbackEmpSeq,
    };

    return EMPLOYEE_UPDATE(req, res);
  } catch (err) {
    console.error("[MYPAGE_UPDATE] error", err);
    return res.status(500).json({
      RET_STAT: "error",
      RET_DESC: err?.message || "Server error",
      RET_CODE: "1000",
    });
  }
};

const pad2 = (value) => String(value).padStart(2, "0");

const parseDbDateParts = (value) => {
  if (!value) {
    return null;
  }

  const source = String(value).trim();
  const match = source.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/
  );

  if (!match) {
    return null;
  }

  return {
    year: match[1],
    month: match[2],
    day: match[3],
    hour: match[4] ?? "00",
    minute: match[5] ?? "00",
    second: match[6] ?? "00"
  };
};

const formatIntranetListDate = (value) => {
  if (!value) return "";
  const parsed = parseDbDateParts(value);
  if (parsed) {
    return `${parsed.year}-${parsed.month}-${parsed.day}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const formatIntranetDetailDateTime = (value) => {
  if (!value) return "";
  const parsed = parseDbDateParts(value);
  if (parsed) {
    const hour24 = parseInt(parsed.hour, 10) || 0;
    const meridiem = hour24 < 12 ? "오전" : "오후";
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return `${parsed.year}-${parsed.month}-${parsed.day} ${meridiem} ${hour12}:${parsed.minute}:${parsed.second}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour24 = date.getHours();
  const minute = pad2(date.getMinutes());
  const second = pad2(date.getSeconds());
  const meridiem = hour24 < 12 ? "오전" : "오후";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${year}-${month}-${day} ${meridiem} ${hour12}:${minute}:${second}`;
};
//#############################################################
//#####       마이페이지 정보 수정 (My Page Update) End      #####
//#############################################################


//#############################################################
//#####       게시판-공지사항 리스트 (Board List) Start      #####
//#############################################################
const INTRANET_BOARD_LIST = async (req, res) => {
  try {
    const {
      ad_code,
      numPage = 1,
      TotalPage = 20,
      col = "",
      search = "",
      network = "1"
    } = req.body || {};

    if (!ad_code) {
      return res.status(400).json({
        RET_STAT: "fail",
        RET_DESC: "ad_code is required.",
        RET_CODE: "1001"
      });
    }

    const pageSize = Math.max(parseInt(TotalPage, 10) || 20, 1);
    const page = Math.max(parseInt(numPage, 10) || 1, 1);
    const skipCount = (page - 1) * pageSize;
    const searchText = String(search ?? "").trim();
    const searchCol = String(col ?? "").trim();

    const boardInfo = await getBoardInfoWithAuthorization(ad_code, req.user);

    const params = [
      { name: "ad_code", type: sql.VarChar, value: String(ad_code) }
    ];

    let whereClause = "WHERE a.ad_code = @ad_code AND ISNULL(a.b_del, 0) = 0";
    if (String(network) !== "1" && String(ad_code) === "A0001") {
      whereClause += " AND ISNULL(a.jisa_open, 'N') = 'Y'";
    }

    if (searchText && ["b_title", "b_content", "emp_nm"].includes(searchCol)) {
      whereClause += ` AND a.${searchCol} LIKE '%' + @search + '%'`;
      params.push({ name: "search", type: sql.NVarChar, value: searchText });
    }

    const countRows = await executeQuery(`
      SELECT COUNT(*) AS TOTAL_CNT
      FROM [baroyeon_intra].[dbo].[Comm_Board] a
      ${whereClause}
    `, params);
    const totalCount = countRows?.[0]?.TOTAL_CNT ?? 0;

    const listRows = await executeQuery(`
      SELECT *
      FROM (
        SELECT
          ROW_NUMBER() OVER (ORDER BY a.b_notice DESC, a.b_idx DESC, a.Ref DESC, a.Re_step ASC) AS RowNum,
          a.b_idx,
          a.ad_code,
          a.emp_no,
          a.emp_nm,
          a.emp_dept,
          a.b_notice,
          a.b_title,
          a.b_content,
          a.b_date,
          a.Ref,
          a.Re_step,
          a.Re_level,
          a.b_del,
          a.b_ow,
          a.b_ow1,
          a.b_ow2,
          a.cnt_hit,
          a.cnt_comt,
          a.cnt_reco,
          a.ck_admin,
          ISNULL((
            SELECT COUNT(*)
            FROM [baroyeon_intra].[dbo].[Comm_Board_file] bf
            WHERE bf.b_idx = a.b_idx
          ), 0) AS cnt_file
        FROM [baroyeon_intra].[dbo].[Comm_Board] a
        ${whereClause}
      ) q
      WHERE q.RowNum BETWEEN @startRow AND @endRow
      ORDER BY q.RowNum ASC
    `, [
      ...params,
      { name: "startRow", type: sql.Int, value: skipCount + 1 },
      { name: "endRow", type: sql.Int, value: skipCount + pageSize }
    ]);

    const data = listRows.map((row, index) => {
      const isNotice = Number(row.b_notice ?? 0) === 1;
      const displayNo = isNotice ? "怨듭?" : String(totalCount - skipCount - index);

      return {
        ...row,
        no: displayNo,
        n: displayNo,
        number: displayNo,
        display_no: displayNo,
        list_no: isNotice ? "" : displayNo,
        is_notice: isNotice ? "Y" : "N",
        title: row.b_title,
        writer_name: row.emp_nm,
        writer_dept_code: row.emp_dept,
        created_at: row.b_date,
        created_date_display: formatIntranetListDate(row.b_date),
        b_date_display: formatIntranetListDate(row.b_date),
        hit_count: Number(row.cnt_hit ?? 0),
        comment_count: Number(row.cnt_comt ?? 0),
        file_count: Number(row.cnt_file ?? 0),
        has_file: Number(row.cnt_file ?? 0) > 0 ? "Y" : "N"
      };
    });

    return res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "Board list loaded.",
      RET_CODE: "0000",
      RET_DATA: data,
      BOARD_INFO: boardInfo,
      PAGE_INFO: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / pageSize))
      }
    });
  } catch (err) {
    console.error("[INTRANET_BOARD_LIST] error", err);
    return res.status(500).json({
      RET_STAT: "error",
      RET_DESC: err?.message || "Server error",
      RET_CODE: "1000"
    });
  }
};
//#############################################################
//#####       게시판-공지사항 리스트 (Board List) End        #####
//#############################################################


//#############################################################
//#####       게시판-공지사항 상세 (Board Detail) Start      #####
//#############################################################
const INTRANET_BOARD_DETAIL = async (req, res) => {
  try {
    const { ad_code, b_idx } = req.body || {};

    if (!ad_code || !b_idx) {
      return res.status(400).json({
        RET_STAT: "fail",
        RET_DESC: "ad_code and b_idx are required.",
        RET_CODE: "1001"
      });
    }

    const params = [
      { name: "ad_code", type: sql.VarChar, value: String(ad_code) },
      { name: "b_idx", type: sql.Int, value: parseInt(b_idx, 10) }
    ];

    const [boardInfo, boardDetail, employee] = await Promise.all([
      getBoardInfoWithAuthorization(ad_code, req.user),
      executeQuery(`
        SELECT TOP 1
          a.*,
          ISNULL((
            SELECT COUNT(*)
            FROM [baroyeon_intra].[dbo].[Comm_Board_file] bf
            WHERE bf.b_idx = a.b_idx
          ), 0) AS cnt_file
        FROM [baroyeon_intra].[dbo].[Comm_Board] a
        WHERE a.ad_code = @ad_code
          AND a.b_idx = @b_idx
          AND ISNULL(a.b_del, 0) = 0
      `, params).then((rows) => rows[0] || null),
      getEmployeeByAdmId(req.user?.ADM_ID ?? req.user?.emp_id ?? "")
    ]);

    if (!boardDetail) {
      return res.status(404).json({
        RET_STAT: "fail",
        RET_DESC: "Post not found.",
        RET_CODE: "1004"
      });
    }

    const detailBoardInfo = buildBoardDetailAuthorization(boardInfo, boardDetail, employee, req.user);

    const [files, comments, prevPost, nextPost] = await Promise.all([
      executeQuery(`
        SELECT *
        FROM [baroyeon_intra].[dbo].[Comm_Board_file]
        WHERE b_idx = @b_idx
        ORDER BY f_idx ASC
      `, [{ name: "b_idx", type: sql.Int, value: parseInt(b_idx, 10) }]),
      getBoardComments(ad_code, b_idx),
      executeQuery(`
        SELECT TOP 1
          b_idx, b_title, emp_nm, b_date, b_notice
        FROM [baroyeon_intra].[dbo].[Comm_Board]
        WHERE ad_code = @ad_code
          AND b_idx < @b_idx
          AND ISNULL(b_del, 0) = 0
        ORDER BY b_idx DESC
      `, params).then((rows) => rows[0] || null),
      executeQuery(`
        SELECT TOP 1
          b_idx, b_title, emp_nm, b_date, b_notice
        FROM [baroyeon_intra].[dbo].[Comm_Board]
        WHERE ad_code = @ad_code
          AND b_idx > @b_idx
          AND ISNULL(b_del, 0) = 0
        ORDER BY b_idx ASC
      `, params).then((rows) => rows[0] || null)
    ]);

    const attachmentList = files.map((file) => ({
      ...file,
      file_name: file.f_name ?? file.ORIGINAL_FILENAME ?? "",
      file_size: file.f_size ?? file.FILE_SIZE ?? 0,
      file_date: file.f_date ?? "",
      file_ext: String(file.f_name ?? file.ORIGINAL_FILENAME ?? "").includes(".")
        ? String(file.f_name ?? file.ORIGINAL_FILENAME).split(".").pop().toLowerCase()
        : ""
    }));

    const mapAdjacentPost = (row) => row ? ({
      b_idx: row.b_idx,
      title: row.b_title,
      writer_name: row.emp_nm,
      created_date_display: formatIntranetListDate(row.b_date),
      is_notice: Number(row.b_notice ?? 0) === 1 ? "Y" : "N"
    }) : null;

    return res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "Board detail loaded.",
      RET_CODE: "0000",
      RET_DATA: {
        ...boardDetail,
        title: boardDetail.b_title,
        writer_name: boardDetail.emp_nm,
        writer_dept_code: boardDetail.emp_dept,
        created_at: boardDetail.b_date,
        created_date_display: formatIntranetListDate(boardDetail.b_date),
        created_datetime_display: formatIntranetDetailDateTime(boardDetail.b_date),
        b_date_display: formatIntranetDetailDateTime(boardDetail.b_date),
        hit_count: Number(boardDetail.cnt_hit ?? 0),
        comment_count: Number(boardDetail.cnt_comt ?? 0),
        file_count: Number(boardDetail.cnt_file ?? 0),
        is_notice: Number(boardDetail.b_notice ?? 0) === 1 ? "Y" : "N",
        files: attachmentList,
        comments: comments.map(mapBoardComment),
        has_attachments: attachmentList.length > 0 ? "Y" : "N",
        attachment_count: attachmentList.length,
        prev_post: mapAdjacentPost(prevPost),
        next_post: mapAdjacentPost(nextPost)
      },
      BOARD_INFO: detailBoardInfo
    });
  } catch (err) {
    console.error("[INTRANET_BOARD_DETAIL] error", err);
    return res.status(500).json({
      RET_STAT: "error",
      RET_DESC: err?.message || "Server error",
      RET_CODE: "1000"
    });
  }
};
//#############################################################
//#####       게시판-공지사항 상세 (Board Detail) End        #####
//#############################################################


// 게시판 관련 공통 함수 (Board Common Functions)
const getCurrentEmployeeForBoard = async (user) => (
  getEmployeeByAdmId(user?.ADM_ID ?? user?.emp_id ?? "")
);

const getIntranetBoardWriteContext = async (adCode, user) => {
  const [boardInfo, employee] = await Promise.all([
    getBoardInfoWithAuthorization(adCode, user),
    getCurrentEmployeeForBoard(user)
  ]);

  if (!boardInfo) {
    return { status: 404, message: "Board not found." };
  }

  if (String(boardInfo.au_write ?? "N").trim().toUpperCase() !== "Y") {
    return { status: 403, message: "You do not have permission to write to this board." };
  }

  if (!employee?.emp_id) {
    return { status: 404, message: "Employee information not found." };
  }

  return { boardInfo, employee };
};

const getIntranetBoardAdminContext = async (adCode, bIdx, user) => {
  const params = [
    { name: "ad_code", type: sql.VarChar, value: String(adCode) },
    { name: "b_idx", type: sql.Int, value: parseInt(bIdx, 10) }
  ];

  const [boardInfo, boardDetail, employee] = await Promise.all([
    getBoardInfoWithAuthorization(adCode, user),
    executeQuery(`
      SELECT TOP 1 *
      FROM [baroyeon_intra].[dbo].[Comm_Board]
      WHERE ad_code = @ad_code
        AND b_idx = @b_idx
        AND ISNULL(b_del, 0) = 0
    `, params).then((rows) => rows[0] || null),
    getCurrentEmployeeForBoard(user)
  ]);

  if (!boardInfo) {
    return { status: 404, message: "Board not found." };
  }

  if (!boardDetail) {
    return { status: 404, message: "Post not found." };
  }

  const detailBoardInfo = buildBoardDetailAuthorization(boardInfo, boardDetail, employee, user);
  if (String(detailBoardInfo.au_admin ?? "N").trim().toUpperCase() !== "Y") {
    return { status: 403, message: "You do not have permission to modify this post." };
  }

  return { boardInfo: detailBoardInfo, boardDetail, employee };
};

const canManageBoardNotice = (boardInfo, employee, boardDetail = null) => {
  const isBoardAdmin = String(boardInfo?.comm_admin ?? boardInfo?.au_admin ?? "N").trim().toUpperCase() === "Y";
  const dutyLevel = parseInt(employee?.duty_cd, 10);
  const isHighDuty = Number.isFinite(dutyLevel) && dutyLevel <= 300;

  if (!boardDetail) {
    return isBoardAdmin || isHighDuty;
  }

  return String(boardInfo?.au_admin ?? "N").trim().toUpperCase() === "Y" || isHighDuty;
};

const getBoardOwSourceAdCode = (adCode) => (
  String(adCode).trim() === "A0012" ? "A0006" : String(adCode).trim()
);

const getBoardOptionPayload = async (adCode) => {
  const normalizedAdCode = String(adCode).trim();
  const primarySourceAdCode = getBoardOwSourceAdCode(normalizedAdCode);

  const [primaryRows, secondaryRows] = await Promise.all([
    executeQuery(`
      SELECT ow_type, idx, ow1_name, ow2_name
      FROM [baroyeon_intra].[dbo].[Comm_Admin_ow]
      WHERE ow_type = 1
        AND ad_code = @ad_code
      ORDER BY ow_type ASC, ow1_idx ASC, idx ASC
    `, [{ name: "ad_code", type: sql.VarChar, value: primarySourceAdCode }]),
    executeQuery(`
      SELECT idx, ow1_idx, ow2_name
      FROM [baroyeon_intra].[dbo].[Comm_Admin_ow]
      WHERE ow_type = 2
        AND ad_code = @ad_code
      ORDER BY ow_type ASC, ow1_idx ASC, idx ASC
    `, [{ name: "ad_code", type: sql.VarChar, value: normalizedAdCode }])
  ]);

  const secondaryByParent = secondaryRows.reduce((acc, row) => {
    const parentKey = String(row.ow1_idx ?? "");
    if (!acc[parentKey]) {
      acc[parentKey] = [];
    }

    acc[parentKey].push({
      value: Number(row.idx),
      label: String(row.ow2_name ?? "").trim()
    });

    return acc;
  }, {});

  return {
    primary: primaryRows.map((row) => ({
      value: Number(row.idx),
      label: String(row.ow1_name ?? row.ow2_name ?? "").trim()
    })),
    secondaryByParent
  };
};

const getBoardFiles = async (adCode, bIdx) => (
  executeQuery(`
    SELECT *
    FROM [baroyeon_intra].[dbo].[Comm_Board_file]
    WHERE ad_code = @ad_code
      AND b_idx = @b_idx
    ORDER BY f_idx ASC
  `, [
    { name: "ad_code", type: sql.VarChar, value: String(adCode).trim() },
    { name: "b_idx", type: sql.Int, value: parseInt(bIdx, 10) }
  ])
);

const getBoardComments = async (adCode, bIdx) => (
  executeQuery(`
    SELECT *
    FROM [baroyeon_intra].[dbo].[Comm_Board_comment]
    WHERE ad_code = @ad_code
      AND b_idx = @b_idx
    ORDER BY c_idx DESC
  `, [
    { name: "ad_code", type: sql.VarChar, value: String(adCode).trim() },
    { name: "b_idx", type: sql.Int, value: parseInt(bIdx, 10) }
  ])
);

const mapBoardComment = (comment) => ({
  ...comment,
  comment_id: comment.c_idx,
  writer_name: comment.emp_nm,
  comment: comment.c_comment,
  icon: Number(comment.c_icon ?? 1),
  created_datetime_display: formatIntranetDetailDateTime(comment.c_date)
});

const syncBoardCommentCount = async (adCode, bIdx) => {
  await executeQuery(`
    UPDATE [baroyeon_intra].[dbo].[Comm_Board]
    SET cnt_comt = (
      SELECT COUNT(*)
      FROM [baroyeon_intra].[dbo].[Comm_Board_comment]
      WHERE ad_code = @ad_code
        AND b_idx = @b_idx
    )
    WHERE ad_code = @ad_code
      AND b_idx = @b_idx
  `, [
    { name: "ad_code", type: sql.VarChar, value: String(adCode).trim() },
    { name: "b_idx", type: sql.Int, value: parseInt(bIdx, 10) }
  ]);
};

const BOARD_FILE_SAVE_PATH = process.env.FILEUPLOAD_SAVE_PATH || "";

const removeBoardFileFromDisk = async (fileName) => {
  const normalizedFileName = String(fileName || "").trim();
  if (!BOARD_FILE_SAVE_PATH || !normalizedFileName) {
    return;
  }

  const targetPath = path.join(BOARD_FILE_SAVE_PATH, normalizedFileName);
  if (!fs.existsSync(targetPath)) {
    return;
  }

  await fs.promises.unlink(targetPath);
};

const decodeUploadedOriginalName = (value) => {
  try {
    return Buffer.from(String(value || ""), "latin1").toString("utf8");
  } catch (error) {
    return String(value || "");
  }
};

const sanitizeBoardUploadName = (value) => (
  String(value || "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
);

//#############################################################
//#####       게시판-공지사항 옵션 (Board Options) Start      #####
//#############################################################
const INTRANET_BOARD_OPTIONS = async (req, res) => {
  try {
    const { ad_code } = req.body || {};

    if (!ad_code) {
      return res.status(400).json({
        RET_STAT: "fail",
        RET_DESC: "ad_code is required.",
        RET_CODE: "1001"
      });
    }

    const payload = await getBoardOptionPayload(ad_code);

    return res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "Board options loaded.",
      RET_CODE: "0000",
      RET_DATA: payload
    });
  } catch (err) {
    console.error("[INTRANET_BOARD_OPTIONS] error", err);
    return res.status(500).json({
      RET_STAT: "error",
      RET_DESC: err?.message || "Server error",
      RET_CODE: "1000"
    });
  }
};
//#############################################################
//#####       게시판-공지사항 옵션 (Board Options) End        #####
//#############################################################

//#############################################################
//#####       게시판-공지사항 글쓰기 (Board Options) Start      #####
//#############################################################
const INTRANET_BOARD_CREATE = async (req, res) => {
  try {
    const {
      ad_code,
      mode = "write",
      b_title,
      b_content,
      b_notice = "0",
      jisa_open = "N",
      b_html = "1",
      b_ow1 = "",
      b_ow2 = "",
      Ref = 0,
      Re_step = 0,
      Re_level = 0,
      ck_editor = "N"
    } = req.body || {};

    if (!ad_code || !String(b_title || "").trim() || !String(b_content || "").trim()) {
      return res.status(400).json({
        RET_STAT: "fail",
        RET_DESC: "ad_code, b_title, and b_content are required.",
        RET_CODE: "1001"
      });
    }

    const context = await getIntranetBoardWriteContext(ad_code, req.user);
    if (context?.status) {
      return res.status(context.status).json({
        RET_STAT: "fail",
        RET_DESC: context.message,
        RET_CODE: context.status === 403 ? "1003" : "1004"
      });
    }

    const { boardInfo, employee } = context;
    const isReply = String(mode).trim().toLowerCase() === "reply";
    const canNotice = canManageBoardNotice(boardInfo, employee);
    const nextNotice = canNotice && Number(String(b_notice).trim()) === 1 ? 1 : 0;
    const nextOw1 = String(b_ow1 || "").trim();
    const nextOw2 = String(b_ow2 || "").trim();
    const nextHtml = String(b_html || "").trim() || "0";
    const nextCkEditor = String(ck_editor || "").trim().toUpperCase() === "Y" ? "Y" : "N";
    let nextRef = 0;
    let nextReStep = 0;
    let nextReLevel = 0;

    if (isReply) {
      nextRef = parseInt(Ref, 10) || 0;
      nextReStep = (parseInt(Re_step, 10) || 0) + 1;
      nextReLevel = (parseInt(Re_level, 10) || 0) + 1;

      await executeQuery(`
        UPDATE [baroyeon_intra].[dbo].[Comm_Board]
        SET Re_step = Re_step + 1
        WHERE ad_code = @ad_code
          AND Ref = @ref
          AND Re_step >= @re_step
      `, [
        { name: "ad_code", type: sql.VarChar, value: String(ad_code).trim() },
        { name: "ref", type: sql.Int, value: nextRef },
        { name: "re_step", type: sql.Int, value: nextReStep }
      ]);
    }

    const [inserted] = await executeQuery(`
      INSERT INTO [baroyeon_intra].[dbo].[Comm_Board] (
        ad_code,
        emp_no,
        emp_nm,
        emp_dept,
        b_notice,
        b_title,
        b_content,
        b_date,
        b_html,
        Ref,
        Re_step,
        Re_level,
        b_del,
        b_ow1,
        b_ow2,
        cnt_hit,
        cnt_comt,
        cnt_reco,
        ck_admin,
        ck_editor,
        jisa_open
      )
      OUTPUT INSERTED.b_idx AS b_idx
      VALUES (
        @ad_code,
        @emp_no,
        @emp_nm,
        @emp_dept,
        @b_notice,
        @b_title,
        @b_content,
        GETDATE(),
        @b_html,
        @ref,
        @re_step,
        @re_level,
        0,
        @b_ow1,
        @b_ow2,
        0,
        0,
        0,
        'N',
        @ck_editor,
        @jisa_open
      )
    `, [
      { name: "ad_code", type: sql.VarChar, value: String(ad_code).trim() },
      { name: "emp_no", type: sql.VarChar, value: String(employee.emp_id).trim() },
      { name: "emp_nm", type: sql.NVarChar, value: String(employee.emp_nm || req.user?.ADM_ID || "").trim() },
      { name: "emp_dept", type: sql.VarChar, value: String(employee.dept_cd || "").trim() },
      { name: "b_notice", type: sql.Int, value: nextNotice },
      { name: "b_title", type: sql.NVarChar, value: String(b_title).trim() },
      { name: "b_content", type: sql.NVarChar(sql.MAX), value: String(b_content) },
      { name: "b_html", type: sql.VarChar, value: nextHtml },
      { name: "ref", type: sql.Int, value: nextRef },
      { name: "re_step", type: sql.Int, value: nextReStep },
      { name: "re_level", type: sql.Int, value: nextReLevel },
      { name: "b_ow1", type: sql.VarChar, value: nextOw1 },
      { name: "b_ow2", type: sql.VarChar, value: nextOw2 },
      { name: "ck_editor", type: sql.Char, value: nextCkEditor },
      { name: "jisa_open", type: sql.Char, value: String(jisa_open).trim().toUpperCase() === "Y" ? "Y" : "N" },
    ]);

    const createdIdx = inserted?.b_idx;
    if (!createdIdx) {
      throw new Error("Failed to create post.");
    }

    if (!isReply) {
      await executeQuery(`
        UPDATE [baroyeon_intra].[dbo].[Comm_Board]
        SET Ref = @b_idx
        WHERE b_idx = @b_idx
      `, [{ name: "b_idx", type: sql.Int, value: createdIdx }]);
    }

    return res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "Board post created.",
      RET_CODE: "0000",
      RET_DATA: {
        b_idx: createdIdx
      }
    });
  } catch (err) {
    console.error("[INTRANET_BOARD_CREATE] error", err);
    return res.status(500).json({
      RET_STAT: "error",
      RET_DESC: err?.message || "Server error",
      RET_CODE: "1000"
    });
  }
};
//#############################################################
//#####       게시판-공지사항 글쓰기 (Board Create) End        #####
//#############################################################

//#############################################################
//#####       게시판-공지사항 수정 (Board Update) Start      #####
//#############################################################
const INTRANET_BOARD_UPDATE = async (req, res) => {
  try {
    const {
      ad_code,
      b_idx,
      b_title,
      b_content,
      b_notice = "0",
      jisa_open = "N",
      b_html = "1",
      b_ow1 = "",
      b_ow2 = "",
      ck_editor = "N"
    } = req.body || {};

    if (!ad_code || !b_idx || !String(b_title || "").trim() || !String(b_content || "").trim()) {
      return res.status(400).json({
        RET_STAT: "fail",
        RET_DESC: "ad_code, b_idx, b_title, and b_content are required.",
        RET_CODE: "1001"
      });
    }

    const context = await getIntranetBoardAdminContext(ad_code, b_idx, req.user);
    if (context?.status) {
      return res.status(context.status).json({
        RET_STAT: "fail",
        RET_DESC: context.message,
        RET_CODE: context.status === 403 ? "1003" : "1004"
      });
    }

    const canNotice = canManageBoardNotice(context.boardInfo, context.employee, context.boardDetail);
    const nextNotice = canNotice && Number(String(b_notice).trim()) === 1 ? 1 : 0;
    const nextOw1 = String(b_ow1 || "").trim();
    const nextOw2 = String(b_ow2 || "").trim();
    const nextHtml = String(b_html || "").trim() || "0";
    const nextCkEditor = String(ck_editor || "").trim().toUpperCase() === "Y" ? "Y" : "N";

    await executeQuery(`
      UPDATE [baroyeon_intra].[dbo].[Comm_Board]
      SET
        b_title = @b_title,
        b_content = @b_content,
        b_notice = @b_notice,
        b_ow1 = @b_ow1,
        b_ow2 = @b_ow2,
        jisa_open = @jisa_open,
        b_html = @b_html,
        ck_editor = @ck_editor
      WHERE ad_code = @ad_code
        AND b_idx = @b_idx
        AND ISNULL(b_del, 0) = 0
    `, [
      { name: "ad_code", type: sql.VarChar, value: String(ad_code).trim() },
      { name: "b_idx", type: sql.Int, value: parseInt(b_idx, 10) },
      { name: "b_title", type: sql.NVarChar, value: String(b_title).trim() },
      { name: "b_content", type: sql.NVarChar(sql.MAX), value: String(b_content) },
      { name: "b_notice", type: sql.Int, value: nextNotice },
      { name: "b_ow1", type: sql.VarChar, value: nextOw1 },
      { name: "b_ow2", type: sql.VarChar, value: nextOw2 },
      { name: "jisa_open", type: sql.Char, value: String(jisa_open).trim().toUpperCase() === "Y" ? "Y" : "N" },
      { name: "b_html", type: sql.VarChar, value: nextHtml },
      { name: "ck_editor", type: sql.Char, value: nextCkEditor }
    ]);

    return res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "Board post updated.",
      RET_CODE: "0000",
      RET_DATA: {
        b_idx: parseInt(b_idx, 10)
      }
    });
  } catch (err) {
    console.error("[INTRANET_BOARD_UPDATE] error", err);
    return res.status(500).json({
      RET_STAT: "error",
      RET_DESC: err?.message || "Server error",
      RET_CODE: "1000"
    });
  }
};
//#############################################################
//#####       게시판-공지사항 수정 (Board Update) End        #####
//#############################################################

//#############################################################
//#####       게시판-공지사항 삭제 (Board Delete) Start      #####
//#############################################################
const INTRANET_BOARD_DELETE = async (req, res) => {
  try {
    const { ad_code, b_idx } = req.body || {};

    if (!ad_code || !b_idx) {
      return res.status(400).json({
        RET_STAT: "fail",
        RET_DESC: "ad_code and b_idx are required.",
        RET_CODE: "1001"
      });
    }

    const context = await getIntranetBoardAdminContext(ad_code, b_idx, req.user);
    if (context?.status) {
      return res.status(context.status).json({
        RET_STAT: "fail",
        RET_DESC: context.message,
        RET_CODE: context.status === 403 ? "1003" : "1004"
      });
    }

    await executeQuery(`
      UPDATE [baroyeon_intra].[dbo].[Comm_Board]
      SET b_del = 1
      WHERE ad_code = @ad_code
        AND b_idx = @b_idx
        AND ISNULL(b_del, 0) = 0
    `, [
      { name: "ad_code", type: sql.VarChar, value: String(ad_code).trim() },
      { name: "b_idx", type: sql.Int, value: parseInt(b_idx, 10) }
    ]);

    return res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "Board post deleted.",
      RET_CODE: "0000",
      RET_DATA: {
        b_idx: parseInt(b_idx, 10)
      }
    });
  } catch (err) {
    console.error("[INTRANET_BOARD_DELETE] error", err);
    return res.status(500).json({
      RET_STAT: "error",
      RET_DESC: err?.message || "Server error",
      RET_CODE: "1000"
    });
  }
};
//#############################################################
//#####       게시판-공지사항 삭제 (Board Delete) End        #####
//#############################################################

//#############################################################
//#####       게시판-공지사항 파일업로드 (Board File Upload) Start      #####
//#############################################################
const INTRANET_BOARD_FILE_UPLOAD = async (req, res) => {
  try {
    const { ad_code, b_idx } = req.body || {};

    if (!ad_code || !b_idx) {
      return res.status(400).json({
        RET_STAT: "fail",
        RET_DESC: "ad_code and b_idx are required.",
        RET_CODE: "1001"
      });
    }

    const context = await getIntranetBoardAdminContext(ad_code, b_idx, req.user);
    if (context?.status) {
      return res.status(context.status).json({
        RET_STAT: "fail",
        RET_DESC: context.message,
        RET_CODE: context.status === 403 ? "1003" : "1004"
      });
    }

    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      return res.status(400).json({
        RET_STAT: "fail",
        RET_DESC: "No files uploaded.",
        RET_CODE: "1001"
      });
    }

    for (const file of files) {
      const currentSavedName = String(file.filename || "").trim();
      const decodedOriginalName = sanitizeBoardUploadName(decodeUploadedOriginalName(file.originalname));
      const savedFileName = decodedOriginalName
        ? `${path.parse(currentSavedName).name}__${decodedOriginalName}`
        : currentSavedName;

      if (savedFileName !== currentSavedName) {
        const currentPath = path.join(BOARD_FILE_SAVE_PATH, currentSavedName);
        const nextPath = path.join(BOARD_FILE_SAVE_PATH, savedFileName);
        if (fs.existsSync(currentPath) && !fs.existsSync(nextPath)) {
          await fs.promises.rename(currentPath, nextPath);
        }
      }

      await executeQuery(`
        INSERT INTO [baroyeon_intra].[dbo].[Comm_Board_file] (
          ad_code,
          b_idx,
          f_name,
          f_date
        )
        VALUES (
          @ad_code,
          @b_idx,
          @f_name,
          GETDATE()
        )
      `, [
        { name: "ad_code", type: sql.VarChar, value: String(ad_code).trim() },
        { name: "b_idx", type: sql.Int, value: parseInt(b_idx, 10) },
        { name: "f_name", type: sql.NVarChar, value: savedFileName }
      ]);
    }

    const uploadedFiles = await getBoardFiles(ad_code, b_idx);

    return res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "Board files uploaded.",
      RET_CODE: "0000",
      RET_DATA: uploadedFiles
    });
  } catch (err) {
    console.error("[INTRANET_BOARD_FILE_UPLOAD] error", err);
    return res.status(500).json({
      RET_STAT: "error",
      RET_DESC: err?.message || "Server error",
      RET_CODE: "1000"
    });
  }
};
//#############################################################
//#####       게시판-공지사항 파일업로드 (Board File Upload) End        #####
//#############################################################

//#############################################################
//#####       게시판-공지사항 파일삭제 (Board File Delete) Start      #####
//#############################################################
const INTRANET_BOARD_FILE_DELETE = async (req, res) => {
  try {
    const { ad_code, b_idx, f_idx } = req.body || {};

    if (!ad_code || !b_idx || !f_idx) {
      return res.status(400).json({
        RET_STAT: "fail",
        RET_DESC: "ad_code, b_idx, and f_idx are required.",
        RET_CODE: "1001"
      });
    }

    const context = await getIntranetBoardAdminContext(ad_code, b_idx, req.user);
    if (context?.status) {
      return res.status(context.status).json({
        RET_STAT: "fail",
        RET_DESC: context.message,
        RET_CODE: context.status === 403 ? "1003" : "1004"
      });
    }

    const [targetFile] = await executeQuery(`
      SELECT TOP 1 f_name
      FROM [baroyeon_intra].[dbo].[Comm_Board_file]
      WHERE ad_code = @ad_code
        AND b_idx = @b_idx
        AND f_idx = @f_idx
    `, [
      { name: "ad_code", type: sql.VarChar, value: String(ad_code).trim() },
      { name: "b_idx", type: sql.Int, value: parseInt(b_idx, 10) },
      { name: "f_idx", type: sql.Int, value: parseInt(f_idx, 10) }
    ]);

    await executeQuery(`
      DELETE FROM [baroyeon_intra].[dbo].[Comm_Board_file]
      WHERE ad_code = @ad_code
        AND b_idx = @b_idx
        AND f_idx = @f_idx
    `, [
      { name: "ad_code", type: sql.VarChar, value: String(ad_code).trim() },
      { name: "b_idx", type: sql.Int, value: parseInt(b_idx, 10) },
      { name: "f_idx", type: sql.Int, value: parseInt(f_idx, 10) }
    ]);

    await removeBoardFileFromDisk(targetFile?.f_name);

    const files = await getBoardFiles(ad_code, b_idx);

    return res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "Board file deleted.",
      RET_CODE: "0000",
      RET_DATA: files
    });
  } catch (err) {
    console.error("[INTRANET_BOARD_FILE_DELETE] error", err);
    return res.status(500).json({
      RET_STAT: "error",
      RET_DESC: err?.message || "Server error",
      RET_CODE: "1000"
    });
  }
};
//#############################################################
//#####       게시판-공지사항 파일삭제 (Board File Delete) End        #####
//#############################################################

//#############################################################
//#####       게시판-공지사항 댓글 (Board Comment) Start      #####
//#############################################################
const INTRANET_BOARD_COMMENT_CREATE = async (req, res) => {
  try {
    const { ad_code, b_idx, c_comment, c_icon = 1 } = req.body || {};

    if (!ad_code || !b_idx || !String(c_comment || "").trim()) {
      return res.status(400).json({
        RET_STAT: "fail",
        RET_DESC: "ad_code, b_idx, and c_comment are required.",
        RET_CODE: "1001"
      });
    }

    const context = await getIntranetBoardWriteContext(ad_code, req.user);
    if (context?.status) {
      return res.status(context.status).json({
        RET_STAT: "fail",
        RET_DESC: context.message,
        RET_CODE: context.status === 403 ? "1003" : "1004"
      });
    }

    const boardRows = await executeQuery(`
      SELECT TOP 1 b_idx
      FROM [baroyeon_intra].[dbo].[Comm_Board]
      WHERE ad_code = @ad_code
        AND b_idx = @b_idx
        AND ISNULL(b_del, 0) = 0
    `, [
      { name: "ad_code", type: sql.VarChar, value: String(ad_code).trim() },
      { name: "b_idx", type: sql.Int, value: parseInt(b_idx, 10) }
    ]);

    if (!boardRows[0]) {
      return res.status(404).json({
        RET_STAT: "fail",
        RET_DESC: "Post not found.",
        RET_CODE: "1004"
      });
    }

    const { employee } = context;
    await executeQuery(`
      INSERT INTO [baroyeon_intra].[dbo].[Comm_Board_comment] (
        ad_code, b_idx, emp_no, emp_nm, emp_dept, c_icon, c_comment, c_date
      )
      VALUES (
        @ad_code, @b_idx, @emp_no, @emp_nm, @emp_dept, @c_icon, @c_comment, GETDATE()
      )
    `, [
      { name: "ad_code", type: sql.Char(5), value: String(ad_code).trim() },
      { name: "b_idx", type: sql.Int, value: parseInt(b_idx, 10) },
      { name: "emp_no", type: sql.VarChar(50), value: String(employee.emp_id).trim() },
      { name: "emp_nm", type: sql.VarChar(20), value: String(employee.emp_nm || req.user?.ADM_ID || "").trim() },
      { name: "emp_dept", type: sql.Char(10), value: String(employee.dept_cd || "").trim() },
      { name: "c_icon", type: sql.TinyInt, value: Math.max(1, Math.min(parseInt(c_icon, 10) || 1, 9)) },
      { name: "c_comment", type: sql.VarChar(2000), value: String(c_comment).trim() }
    ]);

    await syncBoardCommentCount(ad_code, b_idx);
    const comments = await getBoardComments(ad_code, b_idx);

    return res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "Board comment created.",
      RET_CODE: "0000",
      RET_DATA: comments.map(mapBoardComment)
    });
  } catch (err) {
    console.error("[INTRANET_BOARD_COMMENT_CREATE] error", err);
    return res.status(500).json({
      RET_STAT: "error",
      RET_DESC: err?.message || "Server error",
      RET_CODE: "1000"
    });
  }
};
//#############################################################
//#####       게시판-공지사항 댓글 (Board Comment) End        #####
//#############################################################

//#############################################################
//#####       게시판-공지사항 댓글삭제 (Board Comment Delete) Start      #####
//#############################################################
const INTRANET_BOARD_COMMENT_DELETE = async (req, res) => {
  try {
    const { ad_code, b_idx, c_idx } = req.body || {};

    if (!ad_code || !b_idx || !c_idx) {
      return res.status(400).json({
        RET_STAT: "fail",
        RET_DESC: "ad_code, b_idx, and c_idx are required.",
        RET_CODE: "1001"
      });
    }

    const [boardInfo, comment, employee] = await Promise.all([
      getBoardInfoWithAuthorization(ad_code, req.user),
      executeQuery(`
        SELECT TOP 1 *
        FROM [baroyeon_intra].[dbo].[Comm_Board_comment]
        WHERE ad_code = @ad_code
          AND b_idx = @b_idx
          AND c_idx = @c_idx
      `, [
        { name: "ad_code", type: sql.VarChar, value: String(ad_code).trim() },
        { name: "b_idx", type: sql.Int, value: parseInt(b_idx, 10) },
        { name: "c_idx", type: sql.Int, value: parseInt(c_idx, 10) }
      ]).then((rows) => rows[0] || null),
      getCurrentEmployeeForBoard(req.user)
    ]);

    if (!boardInfo) {
      return res.status(404).json({
        RET_STAT: "fail",
        RET_DESC: "Board not found.",
        RET_CODE: "1004"
      });
    }

    if (!comment) {
      return res.status(404).json({
        RET_STAT: "fail",
        RET_DESC: "Comment not found.",
        RET_CODE: "1004"
      });
    }

    const boardAdminContext = await getIntranetBoardAdminContext(ad_code, b_idx, req.user);
    const isAdmin = !boardAdminContext?.status;
    const isWriter = String(comment.emp_no || "").trim().toLowerCase() === String(employee?.emp_id || "").trim().toLowerCase();

    if (!isAdmin && !isWriter) {
      return res.status(403).json({
        RET_STAT: "fail",
        RET_DESC: "You do not have permission to delete this comment.",
        RET_CODE: "1003"
      });
    }

    await executeQuery(`
      DELETE FROM [baroyeon_intra].[dbo].[Comm_Board_comment]
      WHERE ad_code = @ad_code
        AND b_idx = @b_idx
        AND c_idx = @c_idx
    `, [
      { name: "ad_code", type: sql.VarChar, value: String(ad_code).trim() },
      { name: "b_idx", type: sql.Int, value: parseInt(b_idx, 10) },
      { name: "c_idx", type: sql.Int, value: parseInt(c_idx, 10) }
    ]);

    await syncBoardCommentCount(ad_code, b_idx);
    const comments = await getBoardComments(ad_code, b_idx);

    return res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "Board comment deleted.",
      RET_CODE: "0000",
      RET_DATA: comments.map(mapBoardComment)
    });
  } catch (err) {
    console.error("[INTRANET_BOARD_COMMENT_DELETE] error", err);
    return res.status(500).json({
      RET_STAT: "error",
      RET_DESC: err?.message || "Server error",
      RET_CODE: "1000"
    });
  }
};
//#############################################################
//#####       게시판-공지사항 댓글삭제 (Board Comment Delete) End        #####
//#############################################################


const ATTENDANCE_DAILY_SELECT = async (req, res) => {
  try {
    const {
      schDate,
      emp_name = '',
      sch_dept = '',
      sch_jisa = '1',
      emp_seq = ''
    } = req.body || {};

    const baseDate = (schDate && String(schDate).slice(0, 10)) || new Date().toISOString().slice(0, 10);

    const whereParts = [
      "((a.Quit_chk = 'N' AND a.ins_day <= @schDate) OR (a.Quit_chk = 'Y' AND a.Quit_day >= @schDate))",
      "(a.dept_cd <> '19000' OR a.emp_nm = N'김영훈')",
      "a.emp_nm NOT IN (N'김희성', N'세븐', N'자동분배', N'테스트', N'하이애드', N'BARO', N'BI외주', N'KIFR', N'TEST', N'더피플', N'라미체', N'블리비', N'icmo', N'master')",
      "a.network = @network"
    ];

    const params = [
      { name: 'schDate', type: sql.VarChar, value: baseDate },
      { name: 'network', type: sql.VarChar, value: String(sch_jisa) }
    ];

    if (String(sch_jisa) !== '1') {
      whereParts.push("a.seq NOT IN (1001, 1002, 1003, 1004, 1005)");
    }

    if (String(emp_seq) === '309') {
      whereParts.push("a.dept_cd IN ('13000')");
    } else {
      if (String(sch_dept) === '1') {
        whereParts.push("a.dept_cd IN ('11000', '12000')");
      } else if (String(sch_dept) === '2') {
        whereParts.push("a.dept_cd IN ('13000')");
      } else if (String(sch_dept) === '3') {
        whereParts.push("a.dept_cd NOT IN ('11000', '12000', '13000')");
      }
    }

    if (emp_name) {
      whereParts.push("a.emp_nm = @emp_nm");
      params.push({ name: 'emp_nm', type: sql.NVarChar, value: String(emp_name).replace(/'/g, '') });
    }

    const whereClause = `WHERE ${whereParts.join(' AND ')}`;

    const Query = `
      WITH subAbs AS (
        SELECT user_id, Ab_date,
          MIN(tbl_Code) AS tbl_Code,
          MIN(register_Date) AS register_Date,
          MIN(Ab_Item) AS Ab_Item
        FROM [baroyeon_intra].[dbo].Tm_Absence
        GROUP BY user_id, Ab_date
      )
      SELECT
        a.seq, a.network, a.emp_id, a.emp_nm, a.dept_cd, b.user_depart,
        ISNULL(CONVERT(VARCHAR(5), b.User_InputDate, 108), '') AS user_InputDate,
        ISNULL(CONVERT(VARCHAR(5), b.user_outdate, 108), '') AS user_outdate,
        ISNULL(b.User_Note, '') AS User_Note,
        ISNULL(CONVERT(VARCHAR(10), b.Ab_date, 23), @schDate) AS Ab_date,
        ISNULL(b.Ab_item, 100) AS Ab_item,
        ISNULL(b.user_Reason, '') AS user_Reason,
        ISNULL(b.Ab_Code, CASE WHEN ISNULL(b.Ab_Code,'') = '' THEN c.tbl_Code ELSE '' END) AS Ab_Code,
        CASE WHEN ISNULL(b.Ab_Code,'') = '' THEN c.register_Date ELSE NULL END AS register_Date,
        CASE WHEN ISNULL(b.Ab_Code,'') = '' THEN c.Ab_Item       ELSE NULL END AS register_Ab_Item
      FROM [baroyeon_intra].[dbo].view_EmpLIst a
      LEFT JOIN [baroyeon_intra].[dbo].TM_Inwork b 
        ON b.User_id = a.emp_id
        AND b.AB_Date = @schDate
      LEFT JOIN subAbs c
        ON c.user_id = a.emp_id
        AND c.Ab_date = @schDate
        AND ISNULL(b.Ab_Code, '') = ''
      ${whereClause}
      ORDER BY      
        ISNULL(CONVERT(VARCHAR(10), b.Ab_date, 23), @schDate) ASC,
        CASE WHEN ISNULL(b.Ab_item, 100) IN (0) THEN 0 ELSE 1 END ASC,  
        CASE WHEN ISNULL(b.Ab_item, 100) <> 0 AND b.User_InputDate IS NULL THEN 1 ELSE 0 END, 
        b.User_InputDate ASC,
        a.emp_nm ASC
    `;

    const rows = await executeQuery(Query, params);

    const regLabel = (code) => {
      switch (Number(code)) {
        case 40: return '오전반차';
        case 41: return '오후반차';
        case 20: return '월차';
        case 10: return '연차';
        default: return '-';
      }
    };

    const data = rows.map(r => ({
      ...r,
      Ab_item: r.Ab_item == null ? 100 : Number(r.Ab_item),
      register_Ab_Item_Label: regLabel(r.register_Ab_Item)
    }));

    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 조회 성공",
      RET_CODE: "0000",
      RET_DATA: data
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
//#####        출/퇴근 - 일별 리스트 (Attendance) End        #####
//#############################################################

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####       출/퇴근 - 월별 리스트 (Attendance) Start      #####
//#############################################################
const ATTENDANCE_MONTHLY_SELECT = async (req, res) => {
  try {
    const {
      user_id = '',
      s_year,
      s_mon
    } = req.body || {};

    const y = parseInt(String(s_year), 10);
    const m = parseInt(String(s_mon), 10);

    const params = [
      { name: 'user_id', type: sql.VarChar, value: String(user_id) },
      { name: 'yy', type: sql.Int, value: y },
      { name: 'mm', type: sql.Int, value: m },
    ];

    const Query = `
      DECLARE @START DATE = CAST(CAST(@yy AS CHAR(4)) + '-' + RIGHT('0' + CAST(@mm AS VARCHAR(2)),2) + '-01' AS DATE);
      DECLARE @END   DATE = DATEADD(DAY, -1, DATEADD(MONTH, 1, @START));

      WITH Dates AS (
        SELECT @START AS d
        UNION ALL
        SELECT DATEADD(DAY, 1, d) FROM Dates WHERE d < @END
      ),
      subAbs AS (
        SELECT
          a.user_id, CONVERT(date, a.Ab_date) AS Ab_date, MIN(a.tbl_Code) AS tbl_Code,
          MIN(a.register_Date) AS register_Date, MIN(a.Ab_Item) AS Ab_Item
        FROM [baroyeon_intra].[dbo].Tm_Absence a
        WHERE a.user_id = @user_id
          AND CONVERT(date, a.Ab_date) BETWEEN @START AND @END
        GROUP BY a.user_id, CONVERT(date, a.Ab_date)
      ),
      inw AS (
        SELECT
          b.user_id, CONVERT(date, b.Ab_date) AS Ab_date, b.Ab_code, b.Ab_item,
          b.User_inputDate, b.User_outdate, b.User_Note, b.User_Reason, b.User_depart
        FROM [baroyeon_intra].[dbo].TM_Inwork b
        WHERE b.user_id = @user_id
          AND CONVERT(date, b.Ab_date) BETWEEN @START AND @END
      )
      SELECT
        d.d AS Ab_date, ISNULL(i.User_depart, e.dept_cd) AS Ab_dept, e.emp_nm AS user_name, ISNULL(CONVERT(VARCHAR(5), i.User_inputDate, 108), '') AS in_time,
        ISNULL(CONVERT(VARCHAR(5), i.User_outdate , 108), '') AS out_time, ISNULL(i.Ab_item, sa.Ab_Item) AS Ab_item_raw,
        ISNULL(i.Ab_code, sa.tbl_Code) AS Ab_code, CASE WHEN ISNULL(i.Ab_code, sa.tbl_Code) IS NULL THEN 'N' ELSE 'Y' END AS reqYN,
        ISNULL(i.User_Note, '') AS user_note, ISNULL(i.User_Reason, '') AS user_reason
      FROM Dates d
      LEFT JOIN inw i ON i.Ab_date = d.d
      LEFT JOIN subAbs sa ON i.Ab_code IS NULL AND sa.user_id = @user_id AND sa.Ab_date = d.d
      LEFT JOIN [baroyeon_intra].[dbo].view_EmpList e ON e.emp_id = @user_id
      ORDER BY d.d
      OPTION (MAXRECURSION 200);
    `;

    const rows = await executeQuery(Query, params);

    const regLabel = (code) => {
      switch (Number(code)) {
        case 40: return '오전반차';
        case 41: return '오후반차';
        case 20: return '월차';
        case 10: return '연차';
        default: return '-';
      }
    };

    const data = rows.map(r => {
      const ab = r.Ab_item_raw == null ? 100 : Number(r.Ab_item_raw);
      return {
        Ab_date: r.Ab_date,
        Ab_dept: r.Ab_dept,
        user_name: r.user_name,
        in_time: r.in_time,
        out_time: r.out_time,
        Ab_item: ab,
        Ab_code: r.Ab_code || '',
        reqYN: r.reqYN,
        user_note: r.user_note,
        user_reason: r.user_reason,
        register_Ab_Item_Label: regLabel(r.Ab_item_raw)
      };
    });

    const totals = data.reduce((acc, r) => {
      const code = Number(r.Ab_item);
      if ([0, 50, 70, 40, 41].includes(code)) acc.present += 1;
      if (code === 50) acc.c50 += 1;
      if (code === 70) acc.c70 += 1;
      if (code === 40) acc.c40 += 1;
      if (code === 41) acc.c41 += 1;
      if (code === 20) acc.c20 += 1;
      if (code === 30) acc.c30 += 1;
      return acc;
    }, { present: 0, c50: 0, c70: 0, c40: 0, c41: 0, c20: 0, c30: 0 });

    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 조회 성공",
      RET_CODE: "0000",
      RET_DATA: data,
      RET_TOTALS: {
        출근: totals.present,
        지각_50: totals.c50,
        토일근무_70: totals.c70,
        오전휴무_40: totals.c40,
        오후휴무_41: totals.c41,
        휴무연차_20: totals.c20,
        결근_30: totals.c30
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
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####        출/퇴근 - 월별 리스트 (Attendance) End        #####
//#############################################################

module.exports = {
  ADM_LOGIN, GET_LOGIN_INFO, ADM_REGIST,
  N2N, N2N_DETAIL, N2N_REGIST, N2N_UPDATE, N2N_DELETE,
  M2E_SELECT, M2E_DETAIL, M2E_REGIST, M2E_UPDATE, M2E_DELETE,
  M2RV_SELECT, M2RV_DETAIL, M2RV_REGIST, M2RV_UPDATE, M2RV_DELETE,
  MARRIAGE_SELECT, MARRIAGE_DETAIL, MARRIAGE_REGIST, MARRIAGE_UPDATE, MARRIAGE_DELETE,
  FileUpload, FileDelete, FileDownLoad, FilePreView,
  EditorUpload, SunEditorUpload,
  CATEGORY_SELECT, CATEGORY_DETAIL, CATEGORY_REGIST, CATEGORY_UPDATE, CATEGORY_DELETE,
  CAMPAIGN_SELECT, CAMPAIGN_DETAIL, CAMPAIGN_INIT_DATA, CAMPAIGN_INIT_PARENT, CAMPAIGN_REGIST, CAMPAIGN_UPDATE, CAMPAIGN_DELETE,
  SURVEY_DETAIL,
  POPUP_SELECT, POPUP_DETAIL, POPUP_REGIST, POPUP_UPDATE, POPUP_DELETE,
  SEO_SELECT, SEO_DETAIL, SEO_REGIST, SEO_UPDATE, SEO_DELETE,
  EMPLOYEE_SELECT, 
  EMPLOYEE_DETAIL, EMPLOYEE_UPDATE, EMPLOYEE_PHOTO_UPLOAD,
  MYPAGE_DETAIL, MYPAGE_UPDATE,
  ATTENDANCE_DAILY_SELECT, ATTENDANCE_MONTHLY_SELECT,
  INTRANET_BOARD_LIST, INTRANET_BOARD_DETAIL, INTRANET_BOARD_OPTIONS,
  INTRANET_BOARD_CREATE, INTRANET_BOARD_UPDATE, INTRANET_BOARD_DELETE,
  INTRANET_BOARD_FILE_UPLOAD, INTRANET_BOARD_FILE_DELETE,
  INTRANET_BOARD_COMMENT_CREATE, INTRANET_BOARD_COMMENT_DELETE
};




