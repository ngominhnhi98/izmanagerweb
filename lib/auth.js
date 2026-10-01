import crypto from "crypto";
import { NextResponse } from "next/server";

// Cơ chế giống HealthCheck: đổi mật khẩu lấy 1 session token KÝ HMAC đặt trong cookie
// httpOnly. KHÔNG lưu mật khẩu (kể cả dạng hash) trong cookie → lộ cookie cũng không
// suy ngược ra mật khẩu, và token có hạn nên không dùng mãi được.
export const AUTH_COOKIE = "izp_auth";
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Mật khẩu quản trị. Đặt cứng theo yêu cầu, vẫn cho phép đổi qua env khi cần. */
export function adminPassword() {
  return process.env.ADMIN_PASSWORD || "123321123";
}

/** Khoá ký session: tách khỏi mật khẩu nếu có SESSION_SECRET; không thì suy từ mật
 *  khẩu (đổi mật khẩu ⇒ mọi phiên cũ hết hiệu lực — đúng cái ta muốn). */
function sessionKey() {
  const explicit = process.env.SESSION_SECRET;
  if (explicit) return Buffer.from(explicit, "utf8");
  return crypto.createHash("sha256").update(`izp-session|${adminPassword()}`).digest();
}

function sign(payload) {
  return crypto.createHmac("sha256", sessionKey()).update(payload).digest("hex");
}

/** So sánh thời-gian-hằng: băm cả 2 vế trước nên độ dài cố định, không lộ độ dài. */
export function passwordMatches(password) {
  const a = crypto.createHash("sha256").update(String(password ?? "")).digest();
  const b = crypto.createHash("sha256").update(adminPassword()).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Token: `v1.<lúc cấp>.<nonce>.<hmac>` — có hạn, mỗi phiên một khác. */
export function issueSessionToken(now = Date.now()) {
  const payload = `v1.${now}.${crypto.randomBytes(12).toString("hex")}`;
  return `${payload}.${sign(payload)}`;
}

export function isValidToken(token, now = Date.now()) {
  if (!token) return false;
  const cut = token.lastIndexOf(".");
  if (cut <= 0) return false;
  const payload = token.slice(0, cut);
  const tag = Buffer.from(token.slice(cut + 1), "hex");
  const expected = Buffer.from(sign(payload), "hex");
  if (tag.length !== expected.length || !crypto.timingSafeEqual(tag, expected)) return false;
  const [version, issuedAtRaw] = payload.split(".");
  if (version !== "v1") return false;
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return false;
  if (issuedAt > now + 60_000) return false;          // lệch đồng hồ cho phép 1 phút
  return now - issuedAt < SESSION_MAX_AGE_MS;
}

export function isAuthed(req) {
  return isValidToken(req.cookies.get(AUTH_COOKIE)?.value);
}

/** Chặn CSRF: trình duyệt luôn gửi Origin khi POST/PATCH/DELETE, khác host nghĩa là
 *  lệnh phát đi từ site khác. Không có header (curl, script) thì không mang cookie
 *  ngầm nên bỏ qua. */
export function rejectCrossSite(req) {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const host = req.headers.get("host") ?? req.nextUrl.host;
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return NextResponse.json({ error: "Origin không hợp lệ" }, { status: 403 });
  }
  if (originHost !== host) {
    return NextResponse.json({ error: "Chặn request từ site khác" }, { status: 403 });
  }
  return null;
}

/** Cổng cho mọi route ĐỔI DỮ LIỆU. Trả response khi phải chặn, null khi cho qua. */
export function requireAuth(req) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  if (isAuthed(req)) return null;
  return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
}

export function useSecureCookie(req) {
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return proto === "https";
}

// ── Khoá tạm khi nhập sai nhiều lần (chống dò mật khẩu) ──
const FAILS = new Map();          // ip → {n, until}
const MAX_FAILS = 8;
const LOCK_MS = 10 * 60 * 1000;

export function clientIp(req) {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}

export function lockState(ip) {
  const f = FAILS.get(ip);
  if (!f || !f.until || f.until < Date.now()) return { locked: false, retryAfterSec: 0 };
  return { locked: true, retryAfterSec: Math.ceil((f.until - Date.now()) / 1000) };
}

export function recordFailure(ip) {
  const f = FAILS.get(ip) || { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= MAX_FAILS) {
    f.until = Date.now() + LOCK_MS;
    f.n = 0;
  }
  FAILS.set(ip, f);
  return lockState(ip);
}

export function clearFailures(ip) {
  FAILS.delete(ip);
}
