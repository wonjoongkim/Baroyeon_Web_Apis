// middleware/loginLock.js
//
// 회원(이름+전화번호) 단위 로그인 실패 잠금.
//
// IP 기준 레이트 리밋(rateLimit.js)만으로는 IP를 바꿔가며 특정 회원을 노리는
// 대입 공격을 막지 못한다. 같은 이름+전화번호 조합으로 연속 실패하면 잠시 잠근다.
//
//  - LOGIN_LOCK_MAX_FAILS   (기본 5)   : 잠금까지 허용하는 연속 실패 횟수
//  - LOGIN_LOCK_WINDOW_MIN  (기본 15)  : 실패를 세는 시간 / 잠금 유지 시간(분)
//
// 메모리 저장이라 프로세스를 재시작하면 초기화된다. 키는 해시만 보관한다(개인정보 미보관).
// [참고] 타인이 일부러 실패를 쌓아 해당 회원을 잠시 잠글 수는 있으나, 잠금은 짧고
//        정상 로그인 성공 시 즉시 풀린다. 계정 탈취보다 위험이 훨씬 낮은 쪽을 택했다.

const crypto = require("crypto");

const MAX_FAILS = Number(process.env.LOGIN_LOCK_MAX_FAILS || 5);
const WINDOW_MS = Number(process.env.LOGIN_LOCK_WINDOW_MIN || 15) * 60 * 1000;
const MAX_KEYS = 20000; // 메모리 상한

const store = new Map(); // key -> { fails, first, lockedUntil }

const keyOf = (name, phone) =>
  crypto
    .createHash("sha256")
    .update(String(name).replace(/\s+/g, "") + "|" + String(phone).replace(/\D/g, ""))
    .digest("hex")
    .slice(0, 32);

function prune(now) {
  for (const [k, v] of store) {
    if ((v.lockedUntil || 0) < now && now - v.first > WINDOW_MS) store.delete(k);
  }
}

// 잠겨 있으면 남은 ms, 아니면 0
function lockedFor(name, phone) {
  const v = store.get(keyOf(name, phone));
  if (!v) return 0;
  const left = (v.lockedUntil || 0) - Date.now();
  return left > 0 ? left : 0;
}

function recordFail(name, phone) {
  const now = Date.now();
  if (store.size >= MAX_KEYS) prune(now);
  if (store.size >= MAX_KEYS) return; // 그래도 가득 차면 기록 생략(메모리 보호)
  const k = keyOf(name, phone);
  let v = store.get(k);
  if (!v || now - v.first > WINDOW_MS) v = { fails: 0, first: now, lockedUntil: 0 };
  v.fails += 1;
  if (v.fails >= MAX_FAILS) v.lockedUntil = now + WINDOW_MS;
  store.set(k, v);
  return v.fails;
}

function clear(name, phone) {
  store.delete(keyOf(name, phone));
}

module.exports = { lockedFor, recordFail, clear };
