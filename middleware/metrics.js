// middleware/metrics.js
//
// API별 트래픽/응답시간/에러를 집계하는 경량 계측 미들웨어.
//
// 목적
//  - "어느 API가 트래픽을 많이 먹는지"를 추측이 아니라 실측으로 확인한다.
//  - 프로세스 메모리(rss/heap) 추이를 같이 남겨서 메모리가 차오르는 시점을 잡는다.
//
// 사용
//  const { metricsMiddleware, metricsRouter } = require("./middleware/metrics");
//  app.use(metricsMiddleware);              // 라우트보다 먼저
//  app.use("/api/_metrics", metricsRouter); // 조회용
//
// 조회
//  GET /api/_metrics            -> JSON 전체 스냅샷
//  GET /api/_metrics/top        -> 바이트/호출수 상위 20건만
//  POST /api/_metrics/reset     -> 카운터 초기화
//  (localhost 호출이거나 x-metrics-token 헤더가 .env METRICS_TOKEN과 같아야 허용)

const express = require("express");

// 경로 키가 무한정 늘어나 이 미들웨어 자체가 메모리를 먹는 걸 막는다.
const MAX_KEYS = 2000;
const SLOW_MS = Number(process.env.METRICS_SLOW_MS || 1000);
const REPORT_MIN = Number(process.env.METRICS_REPORT_MIN || 10); // 0 이면 주기 로그 끔

const stats = new Map();
const startedAt = Date.now();
let droppedKeys = 0;

function keyOf(req) {
  // 라우터 매칭 결과(req.route.path)가 있으면 그걸 쓰고(=파라미터 정규화),
  // 없으면 원본 경로에서 쿼리스트링만 떼어낸다.
  const base = req.baseUrl || "";
  const routePath = req.route && req.route.path ? req.route.path : null;
  const path = routePath ? base + routePath : (req.originalUrl || req.url || "").split("?")[0];
  return `${req.method} ${path}`;
}

function bucket(key) {
  let b = stats.get(key);
  if (b) return b;
  if (stats.size >= MAX_KEYS) {
    droppedKeys++;
    return null;
  }
  b = {
    count: 0,
    bytesOut: 0,
    bytesIn: 0,
    totalMs: 0,
    maxMs: 0,
    slow: 0,
    errors: 0,
    lastAt: null,
  };
  stats.set(key, b);
  return b;
}

const metricsMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();

  // 응답 바이트를 정확히 세기 위해 write/end를 감싼다. (Content-Length가 없는
  // 스트리밍/파일 응답도 잡힌다)
  let bytesOut = 0;
  const origWrite = res.write;
  const origEnd = res.end;

  res.write = function (chunk, ...rest) {
    if (chunk) bytesOut += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
    return origWrite.call(this, chunk, ...rest);
  };
  res.end = function (chunk, ...rest) {
    if (chunk && typeof chunk !== "function") {
      bytesOut += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
    }
    return origEnd.call(this, chunk, ...rest);
  };

  res.on("finish", () => {
    const b = bucket(keyOf(req));
    if (!b) return;

    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const reqLen = Number(req.headers["content-length"] || 0);

    b.count++;
    b.bytesOut += bytesOut;
    b.bytesIn += Number.isFinite(reqLen) ? reqLen : 0;
    b.totalMs += ms;
    if (ms > b.maxMs) b.maxMs = ms;
    if (ms >= SLOW_MS) b.slow++;
    if (res.statusCode >= 400) b.errors++;
    b.lastAt = new Date().toISOString();
  });

  next();
};

function memorySnapshot() {
  const m = process.memoryUsage();
  const mb = (v) => Number((v / 1048576).toFixed(1));
  return {
    rssMB: mb(m.rss),
    heapUsedMB: mb(m.heapUsed),
    heapTotalMB: mb(m.heapTotal),
    externalMB: mb(m.external),
    arrayBuffersMB: mb(m.arrayBuffers || 0),
    uptimeMin: Number((process.uptime() / 60).toFixed(1)),
  };
}

function snapshot() {
  const rows = [];
  for (const [key, b] of stats) {
    rows.push({
      api: key,
      count: b.count,
      bytesOutMB: Number((b.bytesOut / 1048576).toFixed(3)),
      bytesInMB: Number((b.bytesIn / 1048576).toFixed(3)),
      avgMs: Number((b.totalMs / b.count).toFixed(1)),
      maxMs: Number(b.maxMs.toFixed(1)),
      slow: b.slow,
      errors: b.errors,
      lastAt: b.lastAt,
    });
  }
  return {
    collectedSince: new Date(startedAt).toISOString(),
    memory: memorySnapshot(),
    trackedApis: rows.length,
    droppedKeys,
    totals: {
      count: rows.reduce((s, r) => s + r.count, 0),
      bytesOutMB: Number(rows.reduce((s, r) => s + r.bytesOutMB, 0).toFixed(3)),
      errors: rows.reduce((s, r) => s + r.errors, 0),
    },
    apis: rows,
  };
}

function top(n = 20) {
  const snap = snapshot();
  return {
    collectedSince: snap.collectedSince,
    memory: snap.memory,
    totals: snap.totals,
    byBytes: [...snap.apis].sort((a, b) => b.bytesOutMB - a.bytesOutMB).slice(0, n),
    byCount: [...snap.apis].sort((a, b) => b.count - a.count).slice(0, n),
    bySlow: [...snap.apis].sort((a, b) => b.slow - a.slow || b.avgMs - a.avgMs).slice(0, n),
  };
}

function reset() {
  stats.clear();
  droppedKeys = 0;
}

// 주기 요약 로그 - 사고가 난 뒤에 로그만 보고도 원인을 좁힐 수 있게 남긴다.
if (REPORT_MIN > 0) {
  const timer = setInterval(() => {
    const t = top(5);
    console.log(
      `📊 [metrics] mem rss=${t.memory.rssMB}MB heap=${t.memory.heapUsedMB}/${t.memory.heapTotalMB}MB ` +
        `req=${t.totals.count} out=${t.totals.bytesOutMB}MB err=${t.totals.errors}`
    );
    t.byBytes.forEach((r, i) =>
      console.log(`   ${i + 1}. [BYTES] ${r.api} ${r.bytesOutMB}MB / ${r.count}회 / avg ${r.avgMs}ms`)
    );
    t.byCount.slice(0, 3).forEach((r, i) =>
      console.log(`   ${i + 1}. [CALLS] ${r.api} ${r.count}회 / ${r.bytesOutMB}MB / avg ${r.avgMs}ms`)
    );
  }, REPORT_MIN * 60 * 1000);
  timer.unref(); // 이 타이머가 프로세스 종료를 막지 않게 한다
}

/* ---------------- 조회용 라우터 ---------------- */

const metricsRouter = express.Router();

metricsRouter.use((req, res, next) => {
  const token = process.env.METRICS_TOKEN;
  const ip = req.ip || "";
  const isLocal = ip.includes("127.0.0.1") || ip === "::1" || ip.includes("::ffff:127.0.0.1");
  if (isLocal) return next();
  if (token && req.headers["x-metrics-token"] === token) return next();
  return res.status(403).json({ error: "metrics 접근 불가" });
});

/*
 * IIS(ARR) 뒤에서 클라이언트 IP가 제대로 전달되는지 확인하는 진단용 엔드포인트.
 *
 * 반드시 "외부에서 IIS를 거쳐" 호출해야 의미가 있다. localhost로 직접 부르면
 * 프록시를 안 타므로 항상 정상으로 보인다.
 *   curl -H "x-metrics-token: <METRICS_TOKEN>" https://도메인/api/_metrics/whoami
 */
metricsRouter.get("/whoami", (req, res) => {
  const xff = req.headers["x-forwarded-for"] || null;
  const viaArr = Boolean(req.headers["x-arr-log-id"] || req.headers["x-arr-ssl"]);

  let verdict;
  if (!viaArr && !xff) {
    verdict = "프록시를 거치지 않은 직접 호출로 보입니다. 외부 도메인으로 다시 호출해 주세요.";
  } else if (!xff) {
    verdict =
      "❌ ARR은 거쳤는데 X-Forwarded-For가 없습니다. 모든 사용자가 같은 IP로 보이므로 " +
      "IP 기준 제한이 사무실/사이트 전체를 한 바구니로 묶습니다. ARR의 " +
      "'Preserve client IP in the following header'를 켜 주세요.";
  } else if (req.ip && req.ip !== "127.0.0.1" && req.ip !== "::1" && !req.ip.endsWith("::ffff:127.0.0.1")) {
    verdict = "✅ 클라이언트 IP가 정상적으로 전달되고 있습니다.";
  } else {
    verdict =
      "❌ X-Forwarded-For는 있는데 req.ip가 여전히 루프백입니다. " +
      "TRUST_PROXY 홉 수를 확인해 주세요.";
  }

  res.json({
    verdict,
    // 레이트 리밋과 로깅이 실제로 사용하는 값
    reqIp: req.ip,
    // trust proxy 적용 후 신뢰된 체인 (왼쪽이 최초 클라이언트)
    reqIps: req.ips,
    trustProxySetting: req.app.get("trust proxy fn") ? req.app.get("trust proxy") : null,
    // 프록시가 실제로 붙여 보낸 원본 헤더
    headers: {
      "x-forwarded-for": xff,
      "x-forwarded-proto": req.headers["x-forwarded-proto"] || null,
      "x-forwarded-host": req.headers["x-forwarded-host"] || null,
      "x-arr-log-id": req.headers["x-arr-log-id"] || null,
      host: req.headers.host || null,
    },
    // 프록시를 무시한 실제 TCP 상대방 (ARR과 같은 장비면 루프백이 정상)
    socketRemoteAddress: req.socket && req.socket.remoteAddress,
    viaArr,
  });
});

metricsRouter.get("/", (req, res) => res.json(snapshot()));
metricsRouter.get("/top", (req, res) => res.json(top(Number(req.query.n) || 20)));
metricsRouter.post("/reset", (req, res) => {
  reset();
  res.json({ ok: true });
});

module.exports = { metricsMiddleware, metricsRouter, snapshot, top, reset, memorySnapshot };
