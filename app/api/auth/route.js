import { NextResponse } from "next/server";
import {
  AUTH_COOKIE, isAuthed, issueSessionToken, passwordMatches, rejectCrossSite,
  useSecureCookie, clientIp, lockState, recordFailure, clearFailures,
} from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — client hỏi "đã mở khoá chưa" để quyết định hiện form hay hiện bảng
export async function GET(req) {
  return NextResponse.json({ authed: isAuthed(req) }, {
    headers: { "cache-control": "no-store" },
  });
}

// POST — đổi mật khẩu lấy session cookie
export async function POST(req) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;

  const ip = clientIp(req);
  const before = lockState(ip);
  if (before.locked) {
    return NextResponse.json(
      { error: `Sai quá nhiều lần. Thử lại sau ${Math.ceil(before.retryAfterSec / 60)} phút.` },
      { status: 429, headers: { "Retry-After": String(before.retryAfterSec) } });
  }

  let body = {};
  try { body = await req.json(); } catch { /* để rơi vào nhánh sai mật khẩu */ }

  if (!passwordMatches(body.password ?? "")) {
    const after = recordFailure(ip);
    if (after.locked) {
      return NextResponse.json(
        { error: `Sai quá nhiều lần. Thử lại sau ${Math.ceil(after.retryAfterSec / 60)} phút.` },
        { status: 429 });
    }
    return NextResponse.json({ error: "Sai mật khẩu" }, { status: 401 });
  }
  clearFailures(ip);

  const res = NextResponse.json({ ok: true, authed: true });
  res.cookies.set(AUTH_COOKIE, issueSessionToken(), {
    httpOnly: true, sameSite: "lax", secure: useSecureCookie(req), path: "/",
  });
  return res;
}

// DELETE — khoá lại
export async function DELETE(req) {
  const res = NextResponse.json({ ok: true, authed: false });
  res.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true, sameSite: "lax", secure: useSecureCookie(req), path: "/", maxAge: 0,
  });
  return res;
}
