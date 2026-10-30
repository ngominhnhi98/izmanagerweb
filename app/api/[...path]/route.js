// PROXY: mọi /api/* (trừ /api/auth) đi qua đây → chuyển sang BACKEND (iz_manager_api).
// FE chỉ còn giữ cookie-auth (đăng nhập) + chặn CSRF; DB/logic nằm hết ở BE.
//  · Xác thực cookie tại đây rồi báo sang BE qua header `x-izp-authed` (BE tin vì có `x-izp-key`).
//  · Chặn CSRF cho POST/PATCH/DELETE (giống requireAuth cũ): request từ site khác mang cookie ngầm.
//  · Chuyển tiếp nguyên body (JSON / form-data / nhị phân) + query; trả lại nguyên response BE
//    (kể cả ảnh nhị phân của /api/thumb/img).
import { NextResponse } from "next/server";
import { gzipSync } from "zlib";
import { isAuthed, rejectCrossSite } from "../../../lib/auth";
import { backendUrl } from "../../../lib/backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = process.env.API_SECRET || "";

async function proxy(req, { params }) {
  const path = (params.path || []).join("/");
  const method = req.method;
  const mutating = method !== "GET" && method !== "HEAD";
  const BE = backendUrl(req);   // env BE_URL, hoặc endpoint ghi đè từ ⚙ Endpoint

  // CSRF: chặn mutation từ origin khác (browser luôn gửi Origin). Server-to-server (cron,
  // không Origin) được cho qua — giống hành vi rejectCrossSite cũ.
  if (mutating) {
    const csrf = rejectCrossSite(req);
    if (csrf) return csrf;
  }
  if (!BE || !KEY) {
    return NextResponse.json({ error: "BE_URL / API_SECRET chưa cấu hình ở FE (đặt endpoint ở ⚙ Endpoint)" }, { status: 500 });
  }

  const url = new URL(req.url);
  const target = `${BE}/api/${path}${url.search}`;
  const headers = new Headers();
  const ct = req.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  // ETag: trình duyệt hỏi "còn y nguyên không?" → BE trả 304 rỗng, chuyển thẳng về.
  const inm = req.headers.get("if-none-match");
  if (inm) headers.set("if-none-match", inm);
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

  const out = new Headers();
  for (const h of ["content-type", "cache-control", "access-control-allow-origin", "etag"]) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  if (res.status === 304) return new Response(null, { status: 304, headers: out });
  // fetch (undici) đã tự giải nén gzip từ BE → nén lại JSON lớn trước khi trả trình duyệt
  // (Vercel tính Fast Origin Transfer theo byte function trả ra, chưa nén).
  let buf = Buffer.from(await res.arrayBuffer());
  if (buf.length >= 1024 && /json/.test(out.get("content-type") || "")
      && /\bgzip\b/.test(req.headers.get("accept-encoding") || "")) {
    buf = gzipSync(buf, { level: 4 });
    out.set("content-encoding", "gzip");
    out.set("vary", "accept-encoding");
  }
  return new Response(buf, { status: res.status, headers: out });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const PUT = proxy;
