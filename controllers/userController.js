const { executeQuery } = require("../server/database");
const sql = require("mssql");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const axios = require('axios');
const crypto = require('crypto');
require("dotenv").config();

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//####              비밀번호 해싱 함수 Start                ####
//#############################################################
async function hashPassword(password) {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}
//#############################################################
//####              비밀번호 해싱 함수 End                  ####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####                 카카오 정보 Start                 #####
//#############################################################
const KAKAO_AUTH = async (req, res, next) => {
  try {
    const { code } = req.body; // 전달받은 code
    if (!code) {
      return res.status(400).json({ message: "code값이 없습니다." });
    }
    
    const tokenRes = await axios.post('https://kauth.kakao.com/oauth/token', null, {
      params: {
        grant_type: 'authorization_code',
        client_id: process.env.KAKAO_CLIENT_ID,
        redirect_uri: process.env.KAKAO_REDIRECT_URI,
        code: code,
      },
      headers: { 'Content-type': 'application/x-www-form-urlencoded;charset=utf-8', },
    });

    const { access_token } = tokenRes.data;

    // 사용자 정보
    const userRes = await axios.get('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${access_token}`, },
    });

    const kakaoAccount = userRes.data.kakao_account;

    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 조회 성공",
      RET_CODE: "0000",
      RET_DATA: {
        access_token: access_token,
        id: userRes.data.id,
        name: kakaoAccount.name,
        profile: kakaoAccount.profile,
        email: kakaoAccount.email,
        gender: kakaoAccount.gender,
        phone_number: kakaoAccount.phone_number,
        birthyear: kakaoAccount.birthyear,
        birthday: kakaoAccount.birthday
      }
    });
  } catch (error) {
    console.error('❌ 카카오 인증 오류:', error.response?.data || error.message);
    return res.status(500).json({ message: '카카오 인증 실패', error: error.response?.data || error.message });
  }
};
//#############################################################
//#####                 카카오 정보 End                   #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####                 네이버 로그인 Start                 #####
//#############################################################
const NAVER_AUTH = async (req, res, next) => {
  const data = Buffer.from(JSON.stringify({
    iat: Date.now(),
    nonce: crypto.randomBytes(8).toString('hex')
  })).toString('base64url');

  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET)
    .update(data)
    .digest('base64url');

  const state = `${data}.${sig}`;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.NAVER_CLIENT_ID,
    redirect_uri: process.env.NAVER_REDIRECT_URI,
    state,
  });
  
  const authUrl = `https://nid.naver.com/oauth2.0/authorize?${params.toString()}`;

  res.status(200)
    .set('Content-Type','text/html; charset=utf-8')
    .set('Cache-Control','no-store')
    .send(`<!doctype html><meta charset="utf-8">
      <script>location.replace(${JSON.stringify(authUrl)});</script>
      <noscript><meta http-equiv="refresh" content="0;url=${authUrl}"></noscript>`);
};
//#############################################################
//#####                 네이버 로그인 End                   #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####                 네이버 콜백 Start                 #####
//#############################################################
const NAVER_CALLBACK = async (req, res, next) => {
  const { code, state } = req.query;

  try {
    if (!state || !state.includes('.')) return res.status(400).send('Missing state');

    const [data, sig] = state.split('.');
    const expected = crypto.createHmac('sha256', process.env.JWT_SECRET).update(data).digest('base64url');
    if (sig !== expected) return res.status(400).send('Invalid state signature');

    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (Date.now() - payload.iat > 5 * 60 * 1000) return res.status(400).send('Expired state');

    const tokenRes = await axios.get('https://nid.naver.com/oauth2.0/token', {
      params: {
        grant_type: 'authorization_code',
        client_id: process.env.NAVER_CLIENT_ID,
        client_secret: process.env.NAVER_CLIENT_SECRET,
        redirect_uri: process.env.NAVER_REDIRECT_URI,
        code,
        state,
      },
    });

    const access_token = tokenRes.data?.access_token;
    if (!access_token) return res.status(401).send('No access token from Naver');

    const userRes = await axios.get('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const user = userRes.data?.response;
    if (!user) return res.status(404).send('Naver profile missing');

    let payAddress = null;
    try {
      const addrRes = await axios.get('https://openapi.naver.com/v1/nid/payaddress', {
        headers: {
          Authorization: `Bearer ${access_token}`
        },
      });

      if (addrRes.data?.result === 'success') {
        const baseAddress = addrRes.data.data?.baseAddress ?? "";
        const detailAddress = addrRes.data.data?.detailAddress ?? "";
        if (baseAddress) payAddress = `${baseAddress} ${detailAddress}`;
      }
    } catch (e) {
      console.warn('Naver Pay address fetch skipped: ', e.response?.status, e.response?.data);
    }

    const safeUser = {
      id: String(user.id),
      name: user.name ?? '미공개',
      email: user.email ?? '',
      gender: user.gender === 'M' ? 'male' : user.gender === 'F' ? 'female' : '',
      birthyear: user.birthyear ?? '',
      birthday: (user.birthday || '').replace('-', ''),
      phone_number: user.mobile_e164 ?? '',
      profile_image_url: user.profile_image ?? '',
      address: payAddress,
    }

    return res.send(`<!doctype html><meta charset="utf-8"><script>
      try {
        const payload = {
          type: 'NAVER_LOGIN_DONE',
          ok: true,
          user: ${JSON.stringify(safeUser)}
        };
    
        const origins = ['https://www.baroyeon.net', 'https://baroyeon.net'];
        origins.forEach(o => {
          try {
            window.opener && window.opener.postMessage(payload, o);
          } catch (e) {}
        });
      } catch (err) {}
      window.close();
    </script>`);
  } catch (error) {
    console.error('❌ 네이버 인증 오류:', error.response?.data || error.message);
    return res.status(500).json({ message: '네이버 인증 실패', error: error.response?.data || error.message });
  }
};
//#############################################################
//#####                 네이버 콜백 End                   #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####                회원가입 체크 Start                #####
//#############################################################
const MEM_CHK = async (req, res, next) => {
  try{
    const { SNS_ID } = req.body;

    // 필수값 검사
    if (!SNS_ID) {
      return res.status(400).json({
        RET_DESC: "❌ 필수값 누락 (SNS_ID)",
        RET_CODE: "1001",
      });
    }

    const Query = ` SELECT IDX FROM SNS_MEM WHERE SNS_ID = @SNS_ID  `
    const params = [
      { name: "SNS_ID", type: sql.VarChar, value: SNS_ID }
    ];

    const result = await executeQuery(Query, params);
    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 조회 성공",
      RET_CODE: "0000",
      RET_DATA: {MEM_CHK: !!result[0]?.IDX ? "Y" : "N"}
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
//#####                회원가입 체크 Start                #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####                  상담원 정보 Start                #####
//#############################################################
const ManagerList = async (req, res) => {
try {
  const { NETWORK } = req.body;
  const Query = `select seq, clss_cd, duty_cd, emp_nm, my_info, emp_auth, emp_tel, emp_email, photo_name, 
                    case when network = 1 and seq = 40 then 2 
                      when network = 1 and seq = 93 then 3 
                      when network = 1 and seq = 263 then 4 
                      when network = 1 and seq = 882 then 5 
                      when network = 1 and seq = 935 then 6 
                      when network = 1 and seq = 940 then 7 
                      when network = 1 then 1 
                      when network = 5 and seq = 1357 then 1 
                      when network = 2 and seq = 1303 then 1 
                      when network = 2 and seq = 1301 then 2 
                      when network = 2 and seq = 1324 then 3 
                      when network = 2 and seq = 1405 then 4 
                      when network = 2 and seq = 1403 then 5 
                      when network = 4 and seq = 1197 then 1 
                      when network = 4 and seq = 1371 then 2 
                      when network = 4 and seq = 1407 then 3 
                      when network = 4 and seq = 1366 then 4 
                    else 6 end sort
                from [baroyeon_intra].[dbo].EMP_BONSA where network = @NETWORK
                and (quit_chk = 'N') AND (dept_cd IN (11000, 12000, 13000)) AND (emp_photo = 'Y') AND
                (quit_chk = 'N') AND (dept_cd IN (11000, 12000, 13000)) AND (emp_photo = 'Y')
                order by rk_order asc, emp_level, sort asc, team_no, emp_home_order desc,  emp_home_auth desc, ins_day asc `
  const params = [
    {name: 'NETWORK', type:sql.Int, value: NETWORK}
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
//#####                  상담원 정보 End                  #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####             DB유입 등록 [토큰체크] Start           #####
//#############################################################
const DbInFlow = async (req, res) => {
  try {
    const {
      network, uname, jumin1, sex, married, addr_code, addr_desc, job_code, school_code, tel_number, kakaoid, email, mail_yn, etc, 
      course_ln, course_pg, course_code1, course_code2, course_ip, jumin2, tel_hope_chk, img_url_1, pg_num 
    } = req.body;
    const ip = String(course_ip ?? "").trim();

    // ✅ 블랙리스트 (추가하기 쉬움)
    const BLACKLIST_IPS = new Set([
      "43.255.29.71",
      // "1.2.3.4",
    ]);

    if (BLACKLIST_IPS.has(ip)) {
      return res.status(403).json({
        RET_DATA: null,
        RET_DESC: "❌ 블랙리스트에 등록된 사용자입니다.",
        RET_CODE: "2000",
      });
    }
      // 전화번호 가공
      const telHand1 = '010';
      const telParam = [{ name: 'rawTel', type: sql.VarChar, value: tel_number }];
      
      const telHand2Query = `SELECT [baroyeon_crm].[dbo].UFN_GetHopeMaxLicense('2', '2', @rawTel) AS val`;
      const telHand3Query = `SELECT [baroyeon_crm].[dbo].UFN_GetHopeMaxLicense('2', '3', @rawTel) AS val`;

      const [{ val: telHand2 }] = await executeQuery(telHand2Query, telParam);
      const [{ val: telHand3 }] = await executeQuery(telHand3Query, telParam);
      const fullPhone = `${telHand1}-${telHand2}-${telHand3}`;

      // ✅ 블랙리스트 확인
      const checkBlacklistQuery = ` SELECT CREATED_AT FROM [baroyeon_crm].[dbo].[asso_blacklist] WHERE HAND_TEL = @FullPhone `;
      const checkParams = [{ name: 'FullPhone', type: sql.VarChar, value: fullPhone }];
      const [blackUser] = await executeQuery(checkBlacklistQuery, checkParams);

      // 블랙리스트에 존재하면 등록 차단
      if (blackUser) {
        return res.status(403).json({
          RET_DATA: null,
          RET_DESC: "❌ 블랙리스트에 등록된 사용자입니다.",
          RET_CODE: "2000"
        });
      } else {
        const Query = `
          INSERT INTO [baroyeon_crm].[dbo].[asso_provide]
          ([network], [find_date], [input_date], [uname], [jumin1],
          [sex], [married], [addr_code], [addr_desc], [job_code],
          [school_code],
          [tel_hand1], [tel_hand2], [tel_hand3],
          [kakaoid], [email],
          [mail_yn], [etc], [course_ln], [course_pg],
          [course_code1], [course_code2], [course_ip],
          [jumin2], [tel_hope_chk], [img_url_1], pg_num)
          VALUES (
          @network, GETDATE(), GETDATE(), @uname, @jumin1,
          @sex, @married, @addr_code, @addr_desc, @job_code,
          @school_code,
          '010',
          [baroyeon_crm].[dbo].UFN_GetHopeMaxLicense('2', '2', @tel_number),
          [baroyeon_crm].[dbo].UFN_GetHopeMaxLicense('2', '3', @tel_number),
          @kakaoid,
          [baroyeon_crm].[dbo].UFN_GetHopeMaxCareer('1', @email),
          @mail_yn, @etc, @course_ln, @course_pg,
          @course_code1, @course_code2, @course_ip,
          @jumin2, @tel_hope_chk, @img_url_1, @pg_num
        );`;
        const params = [
          { name: "network", type: sql.Int, value: network },
          { name: "uname", type: sql.NVarChar, value: uname },
          { name: "jumin1", type: sql.Int, value: jumin1 },
          { name: "school_code", type: sql.Int, value: school_code },
          { name: "sex", type: sql.Int, value: sex },
          { name: "married", type: sql.Int, value: married },
          { name: "addr_code", type: sql.VarChar, value: addr_code },
          { name: "addr_desc", type: sql.NVarChar, value: addr_desc },
          { name: "job_code", type: sql.Int, value: job_code },
          { name: "tel_number", type: sql.NVarChar, value: tel_number },
          { name: "kakaoid", type: sql.NVarChar, value: kakaoid },
          { name: "email", type: sql.NVarChar, value: String(email) },
          { name: "mail_yn", type: sql.NVarChar, value: mail_yn },
          { name: "etc", type: sql.NVarChar, value: etc },
          { name: "course_ln", type: sql.VarChar, value: course_ln },
          { name: "course_pg", type: sql.Int, value: course_pg },
          { name: "course_code1", type: sql.Int, value: course_code1 },
          { name: "course_code2", type: sql.Int, value: course_code2 },
          { name: "course_ip", type: sql.NVarChar, value: course_ip },
          { name: "jumin2", type: sql.Int, value: jumin2 },
          { name: "tel_hope_chk", type: sql.Int, value: tel_hope_chk },
          { name: "img_url_1", type: sql.NVarChar, value: img_url_1 },
          { name: "pg_num", type: sql.NVarChar, value: pg_num }
        ];

        const result = await executeQuery(Query, params);
        res.status(200).json({
          RET_STAT: "success",
          RET_DESC: "✅ 등록 성공",
          RET_CODE: "0000",
          RET_DATA: result
        });
      }
    
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
//#####             DB유입 등록 [토큰체크] End             #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####             DB유입 등록 [토큰X] Start           #####
//#############################################################
const DbInFlowNoAuth = async (req, res) => {
  try {
    const {
      network, uname, addr_code, job_code, school_code, tel_number, mail_yn, etc,
      course_pg, course_code1, course_code2, course_ip, tel_hope_chk, pg_num,
      gender: genderRaw,
      married: marriedRaw
    } = req.body;

    const ip = String(course_ip ?? "").trim();

    // ✅ 블랙리스트 (추가하기 쉬움)
    const BLACKLIST_IPS = new Set([
      "43.255.29.71",
      // "1.2.3.4",
    ]);

    if (BLACKLIST_IPS.has(ip)) {
      return res.status(403).json({
        RET_DATA: null,
        RET_DESC: "❌ 블랙리스트에 등록된 사용자입니다.",
        RET_CODE: "2000",
      });
    }
      const sex = (Number(genderRaw) === 2 ? 2 : 1);
      const married = (Number(marriedRaw) === 2 ? 2 : 1);

      // 전화번호 가공
      const telHand1 = '010';
      const telParam = [{ name: 'rawTel', type: sql.VarChar, value: tel_number }];

      const telHand2Query = `SELECT [baroyeon_crm].[dbo].UFN_GetHopeMaxLicense('2', '2', @rawTel) AS val`;
      const telHand3Query = `SELECT [baroyeon_crm].[dbo].UFN_GetHopeMaxLicense('2', '3', @rawTel) AS val`;

      const [{ val: telHand2 }] = await executeQuery(telHand2Query, telParam);
      const [{ val: telHand3 }] = await executeQuery(telHand3Query, telParam);
      const fullPhone = `${telHand1}-${telHand2}-${telHand3}`;

      // ✅ 블랙리스트 확인
      const checkBlacklistQuery = ` SELECT CREATED_AT FROM [baroyeon_crm].[dbo].[asso_blacklist] WHERE HAND_TEL = @FullPhone `;
      const checkParams = [{ name: 'FullPhone', type: sql.VarChar, value: fullPhone }];
      const [blackUser] = await executeQuery(checkBlacklistQuery, checkParams);

      // 블랙리스트에 존재하면 등록 차단
      if (blackUser) {
        return res.status(403).json({
          RET_DATA: null,
          RET_DESC: "❌ 블랙리스트에 등록된 사용자입니다.",
          RET_CODE: "2000"
        });
      } else {
        const Query = `
          INSERT INTO [baroyeon_crm].[dbo].[asso_provide]
          ([network], [find_date], [input_date], [uname], [jumin1],
          [sex], [married], [addr_code], [addr_desc], [job_code],
          [school_code],
          [tel_hand1], [tel_hand2], [tel_hand3],
          [kakaoid], [email],
          [mail_yn], [etc], [course_ln], [course_pg],
          [course_code1], [course_code2], [course_ip],
          [jumin2], [tel_hope_chk], [img_url_1], pg_num)
          VALUES (
          @network, GETDATE(), GETDATE(), @uname, '',
          @sex, @married, @addr_code, '', @job_code,
          @school_code,
          '010',
          [baroyeon_crm].[dbo].UFN_GetHopeMaxLicense('2', '2', @tel_number),
          [baroyeon_crm].[dbo].UFN_GetHopeMaxLicense('2', '3', @tel_number),
          '',
          '',
          @mail_yn, @etc, 0, @course_pg,
          @course_code1, @course_code2, @course_ip,
          0, @tel_hope_chk, null, @pg_num
        );`;
        const params = [
          { name: "network", type: sql.Int, value: network },
          { name: "uname", type: sql.NVarChar, value: uname },
          { name: "sex", type: sql.TinyInt, value: sex },
          { name: "married", type: sql.TinyInt, value: married },
          { name: "addr_code", type: sql.VarChar, value: addr_code },

          { name: "job_code", type: sql.VarChar, value: job_code },
          { name: "school_code", type: sql.VarChar, value: school_code },

          { name: "tel_number", type: sql.NVarChar, value: tel_number },
          { name: "mail_yn", type: sql.NVarChar, value: mail_yn },
          { name: "etc", type: sql.NVarChar, value: etc },
          { name: "course_pg", type: sql.Int, value: course_pg },
          { name: "course_code1", type: sql.Int, value: course_code1 },
          { name: "course_code2", type: sql.Int, value: course_code2 },
          { name: "course_ip", type: sql.NVarChar, value: course_ip },
          { name: "tel_hope_chk", type: sql.Int, value: tel_hope_chk },
          { name: "pg_num", type: sql.NVarChar, value: pg_num },
        ];

        const result = await executeQuery(Query, params);
        res.status(200).json({
          RET_STAT: "success",
          RET_DESC: "✅ 등록 성공",
          RET_CODE: "0000",
          RET_DATA: result
        });
      }
   
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
//#####             DB유입 등록 [토큰X] End             #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####                성혼회원 후기 LIST Start            #####
//#############################################################
const HOLYREVIEW = async (req, res) => {
  try {
    const { numPage, TotalPage } = req.body;
    const startRow = (parseInt(numPage) - 1) * parseInt(TotalPage) + 1;
    const endRow = parseInt(numPage) * parseInt(TotalPage);

    // 필수값 검사
    if (!numPage || !TotalPage) {
      return res.status(400).json({
        RET_DESC: "❌ 필수값 누락 (numPage, TotalPage)",
        RET_CODE: "1001",
      });
    }

    const Query = `
      SELECT * FROM
        (SELECT ROW_NUMBER() OVER(ORDER BY IDX DESC)AS RowNum, IDX AS HOLY_IDX, TITLE, SUBJECT, CONTENTS, FILE_KEY, STATUS, CREATE_AT FROM HOLY_REVIEW 
        WHERE STATUS = '1')AS HR
        LEFT JOIN FILE_ATTACH FA ON FA.FILE_KEY = HR.FILE_KEY
      WHERE HR.ROWNUM  
        BETWEEN @startRow AND @endRow
      ORDER BY ROWNUM ASC, IDX DESC
    `;
    const params = [
      { name: 'startRow', type: sql.Int, value: startRow },
      { name: 'endRow', type: sql.Int, value: endRow }
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
};
//#############################################################
//#####                성혼회원 후기 LIST End              #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####             성혼회원 후기 상세정보 Start            #####
//#############################################################
const HOLYREVIEW_DETAIL = async (req, res) => {
  try {
    const { HOLY_IDX } = req.body;

    // 필수값 검사
    if (!HOLY_IDX) {
      return res.status(400).json({
        RET_DESC: "❌ 필수값 누락 (HOLY_IDX)",
        RET_CODE: "1001",
      });
    }
      
    const Query = ` SELECT HR.IDX, HR.TITLE, HR.SUBJECT, HR.CONTENTS, HR.FILE_KEY, HR.STATUS, HR.CREATE_AT, 
                      Prev.IDX AS Prev_IDX, Prev.TITLE AS Prev_TITLE, Next.IDX AS Next_IDX, Next.TITLE AS Next_TITLE,
                        FA.ORIGINAL_FILENAME, FA.SAVE_FILENAME, FA.FILE_PATH 
                    FROM HOLY_REVIEW HR
                    LEFT JOIN FILE_ATTACH FA ON FA.FILE_KEY = HR.FILE_KEY
                    LEFT JOIN ( SELECT TOP 1 IDX, TITLE FROM HOLY_REVIEW WHERE IDX < @HOLY_IDX AND STATUS = '1' ORDER BY IDX DESC ) AS Prev ON 1=1
                    LEFT JOIN ( SELECT TOP 1 IDX, TITLE FROM HOLY_REVIEW WHERE IDX > @HOLY_IDX AND STATUS = '1' ORDER BY IDX ASC ) AS Next ON 1=1
                    WHERE HR.IDX = @HOLY_IDX `;
    const params = [
      { name: 'HOLY_IDX', type: sql.Int, value: HOLY_IDX }
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
};
//#############################################################
//#####             성혼회원 후기 상세정보 End              #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#######    공지사항(Notice) & 뉴스(News) List Start    #######
//#############################################################
const N2N = async (req, res) => {
  try{
    const { N2N_Type, numPage, TotalPage } = req.body;
    const startRow = (parseInt(numPage) - 1) * parseInt(TotalPage) + 1;
    const endRow = parseInt(numPage) * parseInt(TotalPage);

  // 필수값 검사
  if (!N2N_Type || !numPage || !TotalPage) {
    return res.status(400).json({
      RET_DESC: "❌ 필수값 누락 (N2N_Type, numPage, TotalPage)",
      RET_CODE: "1001",
    });
  }
      
    const Query = `
      SELECT * FROM
        (SELECT ROW_NUMBER() OVER(ORDER BY IDX DESC)AS RowNum, IDX, TYPE_ID, TITLE, CREATE_AT FROM NOTICE_NEWS 
        WHERE TYPE_ID = @N2N_Type AND STATUS = '1')AS TB
      WHERE TB.ROWNUM  
        BETWEEN @startRow AND @endRow
      ORDER BY IDX DESC
    `;
    const Query_Total = ` SELECT COUNT(*) AS TOTAL_CNT FROM NOTICE_NEWS WHERE TYPE_ID = @N2N_Type AND STATUS = '1' `;

    const params = [
      { name: 'N2N_Type', type: sql.VarChar, value: String(N2N_Type) },
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

    // 필수값 검사
    if (!N2N_Type || !N2N_IDX) {
      return res.status(400).json({
        RET_DESC: "❌ 필수값 누락 (N2N_Type, N2N_IDX)",
        RET_CODE: "1001",
      });
    }     
  
    const Query = ` SELECT IDX, TYPE_ID, TITLE, CONTENTS, TARGET_URL, FILE_KEY, CREATE_AT FROM NOTICE_NEWS 
      WHERE TYPE_ID = @N2N_Type AND IDX = @N2N_Idx AND STATUS = '1'
    `;
    const params = [
      { name: 'N2N_Idx', type: sql.VarChar, value: String(N2N_IDX) },
      { name: 'N2N_Type', type: sql.VarChar, value: String(N2N_Type) },
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
//#######    공지사항(Notice) & 뉴스(News) Detail End    #######
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####              미팅, 이벤트 LIST  Start             ######
//#############################################################
const E2E = async (req, res) => {
  try {
    const { E2E_Type, numPage, TotalPage } = req.body;
    const startRow = (parseInt(numPage) - 1) * parseInt(TotalPage) + 1;
    const endRow = parseInt(numPage) * parseInt(TotalPage);

    // 필수값 검사
    if (!E2E_Type || !numPage || !TotalPage) {
      return res.status(400).json({
        RET_DESC: "❌ 필수값 누락 (E2E_Type, numPage, TotalPage)",
        RET_CODE: "1001",
      });
    }

    const Query = `
      SELECT TB.IDX, TB.TYPE_ID, TB.TITLE, TB.TITLE_SUB, TB.EVENT_START, TB.EVENT_END, TB.EVENT_DAY, TB.EVENT_PLACE, TB.EVENT_PEOPLE, 
      TB.CREATE_AT, FA.SAVE_FILENAME, FA.FILE_PATH FROM
        (SELECT ROW_NUMBER() OVER(ORDER BY IDX DESC)AS RowNum, IDX, TYPE_ID, TITLE, TITLE_SUB, FILE_KEY, EVENT_START, EVENT_END, 
        EVENT_DAY, EVENT_PLACE, EVENT_PEOPLE, CREATE_AT FROM MEETING_EVENT 
        WHERE TYPE_ID = @E2E_Type AND STATUS = '1')AS TB LEFT JOIN FILE_ATTACH FA ON FA.FILE_KEY = TB.FILE_KEY
      WHERE TB.ROWNUM BETWEEN @startRow AND @endRow ORDER BY TB.EVENT_START DESC
    `;
    const Query_Total = ` SELECT COUNT(*) AS TOTAL_CNT FROM MEETING_EVENT WHERE TYPE_ID = @E2E_Type AND STATUS = '1' `;

    const params = [
      { name: 'E2E_Type', type: sql.VarChar, value: String(E2E_Type) },
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
//#####               미팅, 이벤트 LIST End               ######
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//######              미팅, 이벤트 Detail Start           ######
//#############################################################
const E2E_DETAIL = async (req, res) => {
  try{
    const { E2E_Type, E2E_IDX } = req.body;

    // 필수값 검사
    if (!E2E_Type || !E2E_IDX) {
      return res.status(400).json({
        RET_DESC: "❌ 필수값 누락 (E2E_Type, E2E_IDX)",
        RET_CODE: "1001",
      });
    }

    const Query = `
      SELECT IDX, TYPE_ID, TITLE, TITLE_SUB, EVENT_START, EVENT_END, EVENT_DAY, EVENT_PLACE, EVENT_PEOPLE, CONTENTS, FILE_KEY, CREATE_AT,
      (SELECT TOP 1 IDX FROM MEETING_EVENT WHERE TYPE_ID = @E2E_Type AND IDX < @E2E_Idx AND STATUS = '1' ORDER BY IDX DESC ) AS Prev_IDX,
      (SELECT TOP 1 TITLE FROM MEETING_EVENT WHERE TYPE_ID = @E2E_Type AND IDX < @E2E_Idx AND STATUS = '1' ORDER BY IDX DESC ) AS Prev_TITLE,
      (SELECT TOP 1 IDX FROM MEETING_EVENT WHERE TYPE_ID = @E2E_Type AND IDX > @E2E_Idx AND STATUS = '1' ORDER BY IDX DESC ) AS Next_IDX,
      (SELECT TOP 1 TITLE FROM MEETING_EVENT WHERE TYPE_ID = @E2E_Type AND IDX > @E2E_Idx AND STATUS = '1' ORDER BY IDX DESC ) AS Next_TITLE
      FROM MEETING_EVENT 
      WHERE TYPE_ID = @E2E_Type AND IDX = @E2E_Idx AND STATUS = '1'
    `;
    const params = [
      { name: 'E2E_Idx', type: sql.VarChar, value: String(E2E_IDX) },
      { name: 'E2E_Type', type: sql.VarChar, value: String(E2E_Type) },
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
//#######             미팅, 이벤트 Detail End            #######
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####             미팅_파티 후기 LIST Start            ######
//#############################################################
const M2R = async (req, res) => {
  try {
    const { numPage, TotalPage } = req.body;
    const startRow = (parseInt(numPage) - 1) * parseInt(TotalPage) + 1;
    const endRow = parseInt(numPage) * parseInt(TotalPage);

    // 필수값 검사
    if (!numPage || !TotalPage ) {
      return res.status(400).json({
        RET_DESC: "❌ 필수값 누락 (numPage, TotalPage )",
        RET_CODE: "1001",
      });
    }
    const Query = ` SELECT * FROM (
                      SELECT ROW_NUMBER() OVER (ORDER BY MPR.CARETE_AT DESC) AS ROWNUM,
                          MPR.IDX, MPR.MEETING_IDX, MPR.CARETE_AT, ME.TITLE, ME.TITLE_SUB, ME.EVENT_START, ME.EVENT_END, ME.EVENT_ING,
                          ME.EVENT_DAY, ME.EVENT_PLACE, ME.EVENT_PEOPLE,
                          ( SELECT TOP 1 FA.SAVE_FILENAME FROM FILE_ATTACH FA WHERE FA.FILE_KEY = ME.FILE_KEY ORDER BY FA.IDX ASC ) AS SAVE_FILENAME,
                          ( SELECT TOP 1 FA.FILE_PATH FROM FILE_ATTACH FA WHERE FA.FILE_KEY = ME.FILE_KEY ORDER BY FA.IDX ASC ) AS FILE_PATH
                      FROM MEETING_PARTY_REVIEW MPR
                      INNER JOIN MEETING_EVENT ME ON MPR.MEETING_IDX = ME.IDX
                      WHERE MPR.STATUS = '1'
                  ) AS A
                  WHERE A.ROWNUM BETWEEN @startRow AND @endRow
                  ORDER BY A.EVENT_START DESC `;
    const Query_Total = ` SELECT COUNT(*) AS TOTAL_CNT FROM MEETING_PARTY_REVIEW AS MPR LEFT JOIN MEETING_EVENT AS ME 
                            ON MPR.MEETING_IDX = ME.IDX WHERE MPR.STATUS = '1' `;
    const params = [
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
//#####               미팅_파티 후기 LIST End            ######
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####            미팅_파티 후기 DETAIL Start            ######
//#############################################################
const M2R_DETAIL = async (req, res) => {
  try{
    const { M2R_IDX } = req.body;

    // 필수값 검사
    if (!M2R_IDX) {
      return res.status(400).json({
        RET_DESC: "❌ 필수값 누락 (M2R_IDX)",
        RET_CODE: "1001",
      });
    }
    
    const Query = ` SELECT MPR.IDX, MPR.MEETING_IDX, MPR.CONTENTS, MPR.CARETE_AT, ME.TITLE, 
                      Prev.IDX AS Prev_IDX, PrevEvent.TITLE AS Prev_TITLE,
                      Next.IDX AS Next_IDX, NextEvent.TITLE AS Next_TITLE
                  FROM MEETING_PARTY_REVIEW MPR
                  INNER JOIN MEETING_EVENT ME ON MPR.MEETING_IDX = ME.IDX
                  LEFT JOIN ( SELECT TOP 1 IDX, MEETING_IDX FROM MEETING_PARTY_REVIEW WHERE IDX < 3 AND STATUS = '1' ORDER BY IDX DESC ) AS Prev ON 1 = 1
                  LEFT JOIN MEETING_EVENT PrevEvent ON PrevEvent.IDX = Prev.MEETING_IDX
                  LEFT JOIN ( SELECT TOP 1 IDX, MEETING_IDX FROM MEETING_PARTY_REVIEW WHERE IDX > 3 AND STATUS = '1' ORDER BY IDX ASC ) AS Next ON 1 = 1
                  LEFT JOIN MEETING_EVENT NextEvent ON NextEvent.IDX = Next.MEETING_IDX
                  WHERE MPR.STATUS = '1' AND MPR.IDX = @M2R_IDX `;
    const params = [
      { name: 'M2R_IDX', type: sql.VarChar, value: String(M2R_IDX) }
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
//#####            미팅_파티 후기 DETAIL End             ######
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#######     광고 카테고리 - 대,중,소 [토큰체크] Start     #####
//#######     소분류에 속한 대분류, 중분류 출력             #####
//#############################################################

const AdCategory = async (req, res) => {
  try {
    //const { numPage, TotalPage } = req.body
    const { numPage, TotalPage } = req.body;
    const startRow = (parseInt(numPage) - 1) * parseInt(TotalPage) + 1;
    const endRow = parseInt(numPage) * parseInt(TotalPage);

    const Query = `
      SELECT * FROM ( 
        SELECT 
          ROW_NUMBER() OVER(ORDER BY L1.IDX DESC) AS ROWNUM,
          L1.IDX AS L1_IDX, L1.NAME AS L_TYPE, L2.IDX AS L2_IDX, L2.NAME AS M_TYPE, L3.IDX AS L3_IDX, L3.NAME AS S_TYPE, L3.sort_order
        FROM ad_category L3
        INNER JOIN ad_category L2 ON L3.parent_id = L2.IDX AND L2.status = 1
        INNER JOIN ad_category L1 ON L2.parent_id = L1.IDX AND L1.status = 1
        WHERE L3.LEVELS = 3 AND L3.status = 1
      )AS A
      WHERE A.ROWNUM BETWEEN @startRow AND @endRow
      ORDER BY A.sort_order;
    `;
      const params = [
        { name: 'startRow', type: sql.Int, value: startRow },
        { name: 'endRow', type: sql.Int, value: endRow }
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
  };
  
//#############################################################
//#######     광고 카테고리 - 대,중,소 [토큰체크] End       #####
//#######     소분류에 속한 대분류, 중분류 출력             #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#######     광고 캠페인 - 대,중,소 [토큰체크] Start       #####
//#############################################################
const AdCampaign = async (req, res) => {
  try {
    //const { numPage, TotalPage } = req.body
    const { numPage, TotalPage } = req.body;
    const startRow = (parseInt(numPage) - 1) * parseInt(TotalPage) + 1;
    const endRow = parseInt(numPage) * parseInt(TotalPage);

    // 필수값 검사
    if (!numPage || !TotalPage) {
      return res.status(400).json({
        RET_DESC: "❌ 필수값 누락 (numPage, TotalPage)",
        RET_CODE: "1001",
      });
    }

    const Query = `
      SELECT * FROM ( 
        SELECT 
          ROW_NUMBER() OVER(ORDER BY A.PG_CODE DESC) AS ROWNUM,
          A.PG_CODE, A.CAMPAIGN_NAME, A.CREATE_AT,
          C1.NAME AS L_TYPE, 
          C2.NAME AS M_TYPE, 
          C3.NAME AS S_TYPE
              FROM AD_CAMPAIGN A
              JOIN AD_CATEGORY C3 ON A.AD_CATEGORY_IDX = C3.IDX
              LEFT JOIN AD_CATEGORY C2 ON C3.PARENT_ID = C2.IDX
              LEFT JOIN AD_CATEGORY C1 ON C2.PARENT_ID = C1.IDX
      )AS A
      WHERE A.ROWNUM BETWEEN @startRow AND @endRow
      ORDER BY A.CREATE_AT DESC;
    `;
    const params = [
      { name: 'startRow', type: sql.Int, value: startRow },
      { name: 'endRow', type: sql.Int, value: endRow }
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
};
//#############################################################
//#######     광고 캠페인 - 대,중,소 [토큰체크] End         #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####              사용자 등록 Start                    ######
//#############################################################
const MEM_APPLY = async (req, res) => {
  try {
    const { 
      SNS_ID, 
      NAME, 
      HAND_TEL, 
      EMAIL, 
      GENDER, 
      BIRTH_DATE, 
      ADDRESS, 
      PROFILE_PICTURE,
      MARRY,
      SCHOOL,
      JOB_CODE,
      EMAIL_CHK, 
      SMS_CHK, 
      PROMISE1, 
      PROMISE2, 
      PROMISE3,
      PROVIDE
    } = req.body;

    // 필수값 검사
    if (!SNS_ID || !NAME || !HAND_TEL) {
      return res.status(400).json({
        RET_DESC: "❌ 필수값 누락 (SNS_ID, NAME, HAND_TEL)",
        RET_CODE: "1001",
      });
    }

    const Query = `
      INSERT INTO SNS_MEM 
      (SNS_ID, NAME, HAND_TEL, EMAIL, GENDER, BIRTH_DATE, ADDRESS, PROFILE_PICTURE
      , MARRY, SCHOOL, JOB_CODE, EMAIL_CHK, SMS_CHK , PROMISE1, PROMISE2, PROMISE3, SNS_TYPE)
      VALUES
      (@SNS_ID, @NAME, [baroyeon_crm].[dbo].UFN_GetHopeMaxLicense('2','0',@HAND_TEL), [baroyeon_crm].[dbo].UFN_GetHopeMaxCareer('2',@EMAIL)
      , @GENDER, @BIRTH_DATE, @ADDRESS, @PROFILE_PICTURE, @MARRY, @SCHOOL, @JOB_CODE, @EMAIL_CHK, @SMS_CHK , @PROMISE1, @PROMISE2, @PROMISE3, @PROVIDE)
    `;
    const params = [
      { name: 'SNS_ID', type: sql.VarChar, value: SNS_ID },
      { name: 'NAME', type: sql.VarChar, value: NAME },
      { name: 'HAND_TEL', type: sql.VarChar, value: HAND_TEL },
      { name: 'EMAIL', type: sql.VarChar, value: EMAIL },
      { name: 'GENDER', type: sql.Int, value: GENDER },
      { name: 'BIRTH_DATE', type: sql.VarChar, value: BIRTH_DATE },
      { name: 'ADDRESS', type: sql.VarChar, value: ADDRESS },
      { name: 'PROFILE_PICTURE', type: sql.VarChar, value: PROFILE_PICTURE },
      { name: 'MARRY', type: sql.Int, value: MARRY },
      { name: 'SCHOOL', type: sql.Int, value: SCHOOL },
      { name: 'JOB_CODE', type: sql.Int, value: JOB_CODE },
      { name: 'EMAIL_CHK', type: sql.VarChar, value: EMAIL_CHK },
      { name: 'SMS_CHK', type: sql.VarChar, value: SMS_CHK },
      { name: 'PROMISE1', type: sql.VarChar, value: PROMISE1 },
      { name: 'PROMISE2', type: sql.VarChar, value: PROMISE2 },
      { name: 'PROMISE3', type: sql.VarChar, value: PROMISE3 },
      { name: 'PROVIDE', type: sql.VarChar, value: PROVIDE }
    ];

    const result = await executeQuery(Query, params);

    const AccessToken = jwt.sign(
      { kakao_id: SNS_ID },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );
    
    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 등록 성공",
      RET_CODE: "0000",
      RET_DATA: AccessToken
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
//#####              사용자 등록 End                      ######
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####              사용자 로그인 Start                  ######
//#############################################################
const MEM_LOGIN = async (req, res) => {
  try {
    const { SNS_ID } = req.body;
    
    if (!SNS_ID) {
      return res.status(400).json({
        RET_DESC: "❌ SNS_ID는 필수입니다.",
        RET_CODE: "1001",
      });
    }
    
    const Query = ` SELECT SNS_ID FROM SNS_MEM WHERE SNS_ID = @SNS_ID `;
    const params = [
      { name: 'SNS_ID', type: sql.VarChar, value: SNS_ID }      
    ];
    const result = await executeQuery(Query, params);
    if (result?.length > 0) {
      const accessToken = jwt.sign(
        { kakao_id: SNS_ID },
        process.env.JWT_SECRET,
        { expiresIn: "8h" }
      );      
      res.json({
        RET_DATA: accessToken,
        RET_DESC: "✅ 토큰 발급 성공",
        RET_CODE: "0000",
      });
    } else {
      res.json({
        RET_DATA: "No Member Data",
        RET_DESC: "❌ 등록된 회원이 아닙니다.",
        RET_CODE: "0100",
      })
    }
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
//#####              사용자 로그인 End                    ######
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####          사용자 목록 조회 (토큰체크) Start         ######
//#############################################################
const CODE_SELECT = async (req, res) => {
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
//#############################################################
//#####          사용자 목록 조회 (토큰체크) End           ######
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####                랜딩 DB입력 Start                  ######
//#############################################################
const LANDING_APPLY = async (req, res) => {
  try {
    const { mem_id, marry_day, service, budget, pg, pg_code } = req.body;
    const Query = ` INSERT INTO [baroyeon_crm].[dbo].[LANDING_Provide]
        ( mem_id, marry_day, service, budget, pg, pg_code )
      VALUES ( @mem_id, @marry_day, @service, @budget, @pg, @pg_code );
    `;
    const params = [
      { name: "mem_id", type: sql.VarChar, value: mem_id },
      { name: "marry_day", type: sql.VarChar, value: marry_day },
      { name: "service", type: sql.VarChar, value: service },
      { name: "budget", type: sql.VarChar, value: budget },
      { name: "pg", type: sql.Int, value: pg },
      { name: "pg_code", type: sql.Int, value: pg_code }
    ];

    executeQuery(Query, params);
    res.status(200).json({
      RET_STAT: "success",
      RET_DESC: "✅ 신청 성공",
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
//#####                랜딩 DB입력 End                    ######
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####                랜딩 리스트 Start                  ######
//#############################################################
const LANDING_LIST = async (req, res) => {
  try {
    const { numPage, TotalPage } = req.body;
    const startRow = (parseInt(numPage) - 1) * parseInt(TotalPage) + 1;
    const endRow = parseInt(numPage) * parseInt(TotalPage);
    
    // 필수값 검사
    if (!numPage || !TotalPage) {
      return res.status(400).json({
        RET_DESC: "❌ 필수값 누락 (numPage, TotalPage)",
        RET_CODE: "1001",
      });
    }

    const Query = ` SELECT * FROM (
                        SELECT 
                            ROW_NUMBER() OVER (ORDER BY A.CREATE_AT DESC) AS ROWNUM,
                            A.IDX, A.MEM_ID, A.MEMO, A.MARRY_DAY, A.SERVICE, A.BUDGET, A.PG, A.PG_CODE, A.CREATE_AT, A.STATUS,
                            B.UID, B.UNAME, B.JUMIN, 
                        [baroyeon_crm].[dbo].UFN_GetHopeMinLicense('2','0',C.cust_tel_hand)  as tel_hand, 
                        [baroyeon_crm].[dbo].UFN_GetHopeMinLicense('2','0',C.cust_tel_home)  as tel_home, 
                        [baroyeon_crm].[dbo].UFN_GetHopeMinLicense('2','0',C.cust_tel_etc_a) as tel_etc_a,  
                        [baroyeon_crm].[dbo].UFN_GetHopeMinLicense('2','0',C.cust_tel_etc_b) as tel_etc_b,  
                        [baroyeon_crm].[dbo].UFN_GetHopeMinLicense('2','0',C.cust_tel_etc_c) as tel_etc_c
                        FROM [baroyeon_crm].[dbo].[LANDING_Provide] A
                        LEFT JOIN [baroyeon_crm].[dbo].[cust_mem] B ON B.UID = A.MEM_ID
                      LEFT JOIN [baroyeon_crm].[dbo].[baro_a001] C ON C.UID = A.MEM_ID
                        WHERE A.STATUS = '0'
                    ) AS Result
                    WHERE ROWNUM BETWEEN @startRow AND @endRow
                    ORDER BY ROWNUM; `;
    const params = [
      { name: 'startRow', type: sql.Int, value: startRow },
      { name: 'endRow', type: sql.Int, value: endRow }
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
};
//#############################################################
//#####                랜딩 리스트 End                    ######
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####                랜딩 메모 Start                   ######
//#############################################################
const LANDING_MEMO = async (req, res) => {
  try {
    const { LANDING_IDX, MEMO } = req.body;
    if (!LANDING_IDX) {
      return res.status(400).json({
        RET_DESC: "❌ LANDING_IDX는 필수입니다.",
        RET_CODE: "1001",
      });
    }

    if (!MEMO) {
      return res.status(400).json({
        RET_DESC: "❌ MEMO는 필수입니다.",
        RET_CODE: "1002",
      });
    }

    const Query = ` UPDATE [baroyeon_crm].[dbo].[LANDING_Provide] SET MEMO = @MEMO WHERE IDX = @LANDING_IDX; `;
    const params = [
      { name: "LANDING_IDX", type: sql.Int, value: LANDING_IDX },
      { name: "MEMO", type: sql.VarChar, value: MEMO },
    ];
    executeQuery(Query, params);
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
};
//#############################################################
//#####                 랜딩 메모 End                     ######
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####                팝업 상세정보 Start                 #####
//#############################################################
const POPUP = async (req, res) => {
  try {

    const Query = ` SELECT PA.TITLE, PA.TARGET_URL, PA.POPUP_AREA, PA.SHOW_DAY, PA.POPUP_CLOSE_CL, FA.SAVE_FILENAME, FA.FILE_PATH
                    FROM POPUP_ACTIVE PA
                    LEFT JOIN FILE_ATTACH FA ON FA.FILE_KEY = PA.FILE_KEY
                    WHERE PA.IS_ACTIVE = 'Y'
                    AND CONVERT(DATE, PA.START_DATE) <= CONVERT(DATE, GETDATE())
                    AND CONVERT(DATE, PA.END_DATE) >= CONVERT(DATE, GETDATE()) `;

    const result = await executeQuery(Query);
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
//#####                 팝업 상세정보 End                  #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####                 SEO POST LIST Start              #####
//#############################################################
const POST = async (req, res) => {
  try {
    const { numPage, TotalPage } = req.body;
    const startRow = (parseInt(numPage) - 1) * parseInt(TotalPage) + 1;
    const endRow = parseInt(numPage) * parseInt(TotalPage);

    // 필수값 검사
    if (!numPage || !TotalPage) {
      return res.status(400).json({
        RET_DESC: "❌ 필수값 누락 (numPage, TotalPage)",
        RET_CODE: "1001",
      });
    }

    const Query = `
      SELECT * FROM
        (SELECT ROW_NUMBER() OVER(ORDER BY IDX DESC)AS RowNum, IDX AS POST_IDX, TITLE, SUBJECT, CONTENTS, FILE_KEY, STATUS, CREATE_AT FROM SEO_POST 
        WHERE STATUS = '1')AS SP
        LEFT JOIN FILE_ATTACH FA ON FA.FILE_KEY = SP.FILE_KEY
      WHERE SP.ROWNUM  
        BETWEEN @startRow AND @endRow
      ORDER BY ROWNUM ASC, IDX DESC
    `;
    const params = [
      { name: 'startRow', type: sql.Int, value: startRow },
      { name: 'endRow', type: sql.Int, value: endRow }
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
};
//#############################################################
//#####                 SEO POST LIST End                #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓
//#############################################################
//#####                SEO POST 상세정보 Start             #####
//#############################################################
const POST_DETAIL = async (req, res) => {
  try {
    const { POST_IDX } = req.body;

    // 필수값 검사
    if (!POST_IDX) {
      return res.status(400).json({
        RET_DESC: "❌ 필수값 누락 (POST_IDX)",
        RET_CODE: "1001",
      });
    }

    const Query = ` SELECT SP.IDX, SP.TITLE, SP.SUBJECT, SP.CONTENTS, SP.FILE_KEY, SP.STATUS, SP.CREATE_AT, 
                      Prev.IDX AS Prev_IDX, Prev.TITLE AS Prev_TITLE, Next.IDX AS Next_IDX, Next.TITLE AS Next_TITLE,
                        FA.ORIGINAL_FILENAME, FA.SAVE_FILENAME, FA.FILE_PATH 
                    FROM SEO_POST SP
                    LEFT JOIN FILE_ATTACH FA ON FA.FILE_KEY = SP.FILE_KEY
                    LEFT JOIN ( SELECT TOP 1 IDX, TITLE FROM SEO_POST WHERE IDX < @POST_IDX AND STATUS = '1' ORDER BY IDX DESC ) AS Prev ON 1=1
                    LEFT JOIN ( SELECT TOP 1 IDX, TITLE FROM SEO_POST WHERE IDX > @POST_IDX AND STATUS = '1' ORDER BY IDX ASC ) AS Next ON 1=1
                    WHERE SP.IDX = @POST_IDX `;
    const params = [
      { name: 'POST_IDX', type: sql.Int, value: POST_IDX }
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
};
//#############################################################
//#####               SEO POST 상세정보 End                #####
//#############################################################
//〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓〓

module.exports = {
  KAKAO_AUTH,
  NAVER_AUTH,
  NAVER_CALLBACK,
  MEM_CHK,
  ManagerList,
  DbInFlow, 
  DbInFlowNoAuth,
  HOLYREVIEW, 
  HOLYREVIEW_DETAIL, 
  M2R,
  M2R_DETAIL,
  N2N, 
  N2N_DETAIL,
  E2E, 
  E2E_DETAIL, 
  AdCategory, 
  AdCampaign,
  MEM_APPLY,
  MEM_LOGIN,
  CODE_SELECT,
  LANDING_APPLY,
  LANDING_LIST,
  LANDING_MEMO,
  POPUP,
  POST,
  POST_DETAIL,
};
