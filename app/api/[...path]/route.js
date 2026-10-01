// PROXY: mọi /api/* (trừ /api/auth) đi qua đây → chuyển sang BACKEND (iz_manager_api).
// FE chỉ còn giữ cookie-auth (đăng nhập) + chặn CSRF; DB/logic nằm hết ở BE.
//  · Xác thực cookie tại đây rồi báo sang BE qua header `x-izp-authed` (BE tin vì có `x-izp-key`).
//  · Chặn CSRF cho POST/PATCH/DELETE (giống requireAuth cũ): request từ site khác mang cookie ngầm.
//  · Chuyển tiếp nguyên body (JSON / form-data / nhị phân) + query; trả lại nguyên response BE
//    (kể cả ảnh nhị phân của /api/thumb/img).
import { NextResponse } from "next/server";
import { isAuthed, rejectCrossSite } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BE = (process.env.BE_URL || "").replace(/\/$/, "");
const KEY = process.env.API_SECRET || "";

async function proxy(req, { params }) {
  const path = (params.path || []).join("/");
  const method = req.method;
  const mutating = method !== "GET" && method !== "HEAD";

  // CSRF: chặn mutation từ origin khác (browser luôn gửi Origin). Server-to-server (cron,
  // không Origin) được cho qua — giống hành vi rejectCrossSite cũ.
  if (mutating) {
    const csrf = rejectCrossSite(req);
    if (csrf) return csrf;
  }
  if (!BE || !KEY) {
    return NextResponse.json({ error: "BE_URL / API_SECRET chưa cấu hình ở FE" }, { status: 500 });
  }

  const url = new URL(req.url);
  const target = `${BE}/api/${path}${url.search}`;
  const headers = new Headers();
  const ct = req.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const auth = req.headers.get("authorization");
  if (auth) headers.set("authorization", auth); // pass-through cho cron (CRON_SECRET)
  headers.set("x-izp-key", KEY);
  headers.set("x-izp-authed", isAuthed(req) ? "1" : "0");

  const init = { method, headers, cache: "no-store" };
  if (mutating) init.body = await req.arrayBuffer();

  let res;
  try {
    res = await fetch(target, init);
  } catch (e) {
    return NextResponse.json({ error: `Không gọi được backend: ${e?.message || e}` }, { status: 502 });
  }

  const buf = await res.arrayBuffer();
  const out = new Headers();
  for (const h of ["content-type", "cache-control", "access-control-allow-origin"]) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(buf, { status: res.status, headers: out });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const PUT = proxy;
