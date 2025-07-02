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
};

// 커넥션 풀
const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log("✅ MSSQL 연결 성공");
    return pool;
  })
  .catch(err => {
    console.error("❌ MSSQL 연결 실패:", err);
    process.exit(1);
  });

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
