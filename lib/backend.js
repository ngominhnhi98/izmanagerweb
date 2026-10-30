import { verifySigned } from "./auth";

// Endpoint backend (iz_manager_api). Mặc định lấy env BE_URL; có thể ghi đè từ UI
// (⚙ Endpoint) → lưu trong cookie httpOnly KÝ HMAC, nên đổi domain API không cần build lại.
// Phải ký vì proxy gửi kèm API_SECRET tới URL này — không cho ai tự đặt cookie trỏ về
// server của họ để hứng key.
export const BE_COOKIE = "izp_be";

export const defaultBackend = () => (process.env.BE_URL || "").replace(/\/+$/, "");

/** Chuẩn hoá URL người dùng nhập: chỉ http(s), bỏ "/" và "/api" ở cuối. Sai → null. */
export function normalizeBackend(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.search || u.hash || u.username || u.password) return null;
  return `${u.origin}${u.pathname}`.replace(/\/+$/, "").replace(/\/api$/, "");
}

export function customBackend(req) {
  const v = verifySigned(req.cookies.get(BE_COOKIE)?.value);
  return v ? normalizeBackend(v) : null;
}

export function backendUrl(req) {
  return customBackend(req) || defaultBackend();
}
