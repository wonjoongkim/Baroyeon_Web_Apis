const sql = require("mssql");
require("dotenv").config();

// MSSQL 연결 설정
const config = {
  user: process.env.BAROYEON_USER,
  password: process.env.BAROYEON_PASSWORD,
  server: process.env.BAROYEON_SERVER,
  port: parseInt(process.env.BAROYEON_PORT, 10),
  database: process.env.BAROYEON_DATABASE_WV2,
  options: {
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate: process.env.DB_TRUST_CERTIFICATE === "true",
  },
  // 풀 설정이 없으면 mssql 기본값(max 10)으로 돌면서, 느린 쿼리가 하나라도 끼면
  // 뒤따르는 요청이 전부 큐에 쌓인다. 큐에 걸린 요청 객체(본문 포함)가 그대로
  // 메모리에 남기 때문에 "메모리가 찬다"의 주요 원인이 된다.
  pool: {
    max: Number(process.env.DB_POOL_MAX || 20),
    min: 0,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: Number(process.env.DB_ACQUIRE_TIMEOUT_MS || 15000),
  },
  // 쿼리가 무한정 매달려 있지 않도록 상한을 둔다.
  requestTimeout: Number(process.env.DB_REQUEST_TIMEOUT_MS || 30000),
  connectionTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 15000),
};

// 커넥션 풀
// 예전엔 연결 실패 시 process.exit(1)로 프로세스를 죽였는데, IIS/서비스가 이를
// 즉시 재시작하면서 DB가 잠깐 흔들릴 때마다 재시작 루프에 빠졌다. 프로세스는
// 살려두고 개별 요청만 500으로 실패시키는 편이 회복이 빠르다.
const pool = new sql.ConnectionPool(config);

pool.on("error", err => {
  console.error("❌ MSSQL 풀 오류:", err);
});

const poolPromise = pool
  .connect()
  .then(p => {
    console.log("✅ MSSQL 연결 성공");
    return p;
  })
  .catch(err => {
    console.error("❌ MSSQL 연결 실패:", err);
    throw err;
  });

// 부팅 시점에 아무도 await 하지 않으면 unhandledRejection으로 잡히므로 미리 흡수한다.
poolPromise.catch(() => {});

/**
 * 단일 쿼리 실행
 */
async function executeQuery(query, params = []) {
  try {
    const pool = await poolPromise;
    const request = pool.request();

    params.forEach(p => {
      request.input(p.name, p.type, p.value);
    });

    const result = await request.query(query);
    return result.recordset;
    // return {
    //   rowsAffected: result.rowsAffected,
    //   recordset: result.recordset,
    //   output: result.output,
    // };
  } catch (error) {
    console.error("❌ DB Query Error:", error);
    throw error;
  }
}

/**
 * 트랜잭션 처리 (복수 쿼리 실행)
 * actions: [{ query: "...", params: [...] }, ...]
 */
async function executeTransaction(actions = []) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    for (const action of actions) {
      const request = new sql.Request(transaction);
      if (action.params) {
        action.params.forEach(p => {
          request.input(p.name, p.type, p.value);
        });
      }
      await request.query(action.query);
    }

    await transaction.commit();
    return { success: true };
  } catch (error) {
    await transaction.rollback();
    console.error("❌ Transaction Failed:", error);
    throw error;
  }
}

/**
 * 저장 프로시저 실행
 */
async function executeProcedure(procName, inputs = [], outputs = []) {
  try {
    const pool = await poolPromise;
    const request = pool.request();

    inputs.forEach(p => {
      request.input(p.name, p.type, p.value);
    });

    outputs.forEach(p => {
      request.output(p.name, p.type);
    });

    const result = await request.execute(procName);

    return {
      output: result.output,
      recordset: result.recordset,
      rowsAffected: result.rowsAffected,
    };
  } catch (error) {
    console.error("❌ Procedure Execution Error:", error);
    throw error;
  }
}

module.exports = {
  sql,
  poolPromise,
  executeQuery,
  executeTransaction,
  executeProcedure,
};
