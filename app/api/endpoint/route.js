// Cấu hình endpoint backend từ UI (không cần build lại khi đổi domain API).
//  GET    → endpoint đang dùng / mặc định (env BE_URL)
//  POST   {url, test?} → test=true: chỉ thử gọi; không thì lưu vào cookie (cần đăng nhập)
//  DELETE → bỏ ghi đè, quay về BE_URL
import { NextResponse } from "next/server";
import { isAuthed, requireAuth, signValue, useSecureCookie } from "../../../lib/auth";
import { BE_COOKIE, customBackend, defaultBackend, normalizeBackend } from "../../../lib/backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONE_YEAR = 365 * 24 * 60 * 60;

export async function GET(req) {
  const custom = customBackend(req);
  return NextResponse.json(
    { current: custom || defaultBackend(), default: defaultBackend(), custom: !!custom, authed: isAuthed(req) },
    { headers: { "cache-control": "no-store" } });
}

/** Thử gọi /api/machines của BE với API_SECRET — báo HTTP status + thời gian. */
async function probe(be) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${be}/api/machines`, {
      headers: { "x-izp-key": process.env.API_SECRET || "", "x-izp-authed": "0" },
      cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    return { ok: r.ok, status: r.status, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, error: String(e?.message || e) };
  }
}

export async function POST(req) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body = {};
  try { body = await req.json(); } catch { /* rơi vào nhánh URL sai */ }
  const be = normalizeBackend(body.url);
  if (!be) return NextResponse.json({ error: "URL không hợp lệ (cần http:// hoặc https://)" }, { status: 400 });

  if (body.test) return NextResponse.json({ url: be, probe: await probe(be) });

  const res = NextResponse.json({ ok: true, current: be, custom: true });
  res.cookies.set(BE_COOKIE, signValue(be), {
    httpOnly: true, sameSite: "lax", secure: useSecureCookie(req), path: "/", maxAge: ONE_YEAR,
  });
  return res;
}

export async function DELETE(req) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const res = NextResponse.json({ ok: true, current: defaultBackend(), custom: false });
  res.cookies.set(BE_COOKIE, "", {
    httpOnly: true, sameSite: "lax", secure: useSecureCookie(req), path: "/", maxAge: 0,
  });
  return res;
}
