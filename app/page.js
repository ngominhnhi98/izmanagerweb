"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import ThumbEditor from "./ThumbEditor";

const LANES = ["download", "rewrite", "review", "tts", "cut", "metadata", "capcut", "convert", "publish"];
const LANE_VN = {
  download: "Tải video", rewrite: "Viết lại srt", review: "Duyệt srt", tts: "TTS (MiniMax)",
  cut: "Cắt clip", metadata: "Tiêu đề/mô tả", capcut: "Ghép CapCut", convert: "Convert webm", publish: "Đăng video",
};
const SUCCESS = {
  download: "done", rewrite: "done", review: "approved", tts: "audio_ready", cut: "done",
  metadata: "done", capcut: "done", convert: "done", publish: "link_ready",
};

/** Rút tải của 1 listener thành 1 tín hiệu quyết định — GIỮ KHỚP với
 *  iz_pipeline/desktop/operator_app.py :: listener_state(). */
function listenerState(m) {
  const t = m.tts || {};
  if (t.wait_click > 0) return ["🔴", "CHỜ BẤM CHẠY", "var(--red)"];
  if (t.running > 0)
    return m.minimax === "idle" ? ["🟡", "SẮP XONG", "var(--amber)"]
      : ["🟠", "ĐANG CHẠY", "var(--amber)"];
  if (t.incoming > 0) return ["🔵", "ĐANG NHẬN SRT", "var(--blue)"];
  return ["🟢", "TRỐNG", "var(--green)"];
}

function machineTip(m) {
  const base = `${m.machine_id} · ${m.hostname || ""} · ${m.online ? "online" : "offline"}`;
  if (!m.tts) return base;
  const t = m.tts;
  const mm = { busy: "đang tạo audio", idle: "đã ngừng tạo (rảnh)",
    waiting: "đã đánh dấu, chờ MiniMax bắt đầu", none: "không có job nào chạy" }[m.minimax];
  return [base,
    `▶ đang chạy       : ${t.running}  (MiniMax đang đọc)`,
    `⏳ chờ bấm chạy   : ${t.wait_click}  (srt đã ở ready/, CHỜ NGƯỜI bấm)`,
    `↓ đang về máy     : ${t.incoming}  (đang tải srt, chưa vào hàng đợi)`,
    `↑ đang trả kết quả: ${t.returning}  (audio xong, đang upload)`,
    `── tổng đang bay  : ${t.total}`,
    mm ? `MiniMax: ${mm}` : null,
    t.unassigned_pool ? `(pool chung chưa gán máy: ${t.unassigned_pool} job)` : null,
  ].filter(Boolean).join("\n");
}

function ListenerLoad({ m }) {
  const [dot, label, col] = listenerState(m);
  const t = m.tts;
  return (
    <small style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ color: col, fontWeight: 700 }}>{dot} {label}</span>
      <span style={{ color: "var(--muted2)" }}>
        ▶{t.running} · ⏳{t.wait_click} · ↓{t.incoming} · ↑{t.returning}
      </span>
    </small>
  );
}

function fmtStart(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit" });
}

/** Badge 'đã Start listen chưa' cho máy listener. */
function ListenBadge({ m }) {
  const on = m.listening === true;
  return (
    <span style={{ fontWeight: 700, fontSize: 12,
      color: on ? "var(--green)" : "var(--amber)" }}
      title={on ? "Đã bấm Start — loop nền đang tự nhận srt + phát hiện TTS xong"
                : "CHƯA bấm Start — máy mở nhưng chưa nghe (job sẽ không tự nhận/đẩy về)"}>
      {on ? "🎧 đang nghe" : "⏸ chưa Start"}
    </span>
  );
}

function progressPct(stages = {}) {
  let n = 0;
  for (const l of LANES) if (stages[l] === SUCCESS[l]) n++;
  return Math.round((n / LANES.length) * 100);
}
function stageKind(lane, status) {
  if (status === SUCCESS[lane]) return "ok";
  if (status === "failed") return "fail";
  if (["waiting_human", "waiting_human_tts", "ready"].includes(status)) return "wait";
  if (["not_ready", "blocked", "pending"].includes(status)) return "idle";
  return "run";
}
const TF_LABEL = {
  requested: "⇄ chờ máy nguồn đóng gói", packing: "⇄ máy nguồn đang nén",
  uploading: "⇄ đang đẩy gói lên Drive", ready: "⇄ chờ máy đích tải về",
  downloading: "⇄ máy đích đang tải + giải nén", done: "✓ đã chuyển xong",
  failed: "✗ chuyển lỗi", cancelled: "đã huỷ lệnh chuyển",
};
const TF_INFLIGHT = ["requested", "packing", "uploading", "ready", "downloading"];
// nhãn NGẮN cho việc tạo thumbnail trên bảng danh sách
const THUMB_SHORT = { queued: "🖼 chờ tạo", generating: "🖼 đang tạo", ready: "🖼 chờ chọn" };
// nhãn NGẮN cho ô trạng thái trong bảng (bản dài dùng ở khung chi tiết)
const TF_SHORT = {
  requested: "⇄ chờ đóng gói", packing: "⇄ đang nén", uploading: "⇄ đang đẩy lên Drive",
  ready: "⇄ chờ máy đích tải", downloading: "⇄ đang tải về",
};

function phaseBadge(j) {
  // Đang chuyển máy thì đè lên mọi thứ: task đứng im, trạng thái làn bên dưới là chuyện
  // của lượt chạy trước — hiện chúng ra chỉ làm người xem tưởng nó đang chạy.
  if (TF_INFLIGHT.includes(j.transfer))
    return ["b-wait", TF_SHORT[j.transfer] || "⇄ đang chuyển máy"];
  if (j.phase === "completed") return ["b-done", "✅ Hoàn tất"];
  if (j.phase === "failed") return ["b-fail", "❌ Lỗi"];
  if ((j.waiting_on || "").startsWith("human")) {
    const m = { "human:review": "📝 Chờ duyệt srt", "human:tts_click": "🎙 Chờ bấm TTS",
      "human:capcut": "🎬 Chờ CapCut", "human:fix": "🔧 Chờ sửa" };
    return ["b-wait", m[j.waiting_on] || "⏸ Chờ người"];
  }
  return ["b-run", "⚙ Đang xử lý"];
}

const PAGE = 150;   // mỗi lần kéo 150 job mới nhất (xem thêm thì bấm "tải thêm")

export default function Page() {
  const [jobs, setJobs] = useState([]);
  const [machines, setMachines] = useState([]);
  const [machineFilter, setMachineFilter] = useState("");
  const [toolFilter, setToolFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  // "đã xoá (còn link)": task không còn trên máy nhưng file Drive được giữ lại — đây là
  // chỗ DUY NHẤT tra lại link video/short/srt của chúng.
  const [showDeleted, setShowDeleted] = useState(false);
  const [search, setSearch] = useState("");
  const [qServer, setQServer] = useState("");   // bản trễ 400ms, gửi LÊN SERVER
  const [limit, setLimit] = useState(PAGE);     // trần số job kéo về 1 lần
  const [total, setTotal] = useState(0);        // tổng job khớp bộ lọc (ở DB)
  const [srvStats, setSrvStats] = useState(null); // 4 ô đếm do Atlas trả (toàn bộ)
  const [sel, setSel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState("");

  // Nạp danh sách theo kiểu SERIALIZED (không huỷ request → Network không còn "canceled").
  // Tham số (trần/khoá/scope) đọc qua REF nên `load` STABLE — poll effect không re-subscribe
  // (chính việc `load` đổi theo [limit,qServer] + 2 effect cùng gọi load rồi abort nhau là
  // nguồn gốc các request bị canceled). Đang tải mà tham số đổi → đánh dấu `dirty`, tải xong
  // thì tải LẠI ngay với tham số mới (do/while). Chỉ còn 1 AbortController làm CHỐT AN TOÀN
  // 20s cho request treo (hiếm) — không dùng để huỷ khi đổi tham số.
  const limitRef = useRef(limit);
  const qRef = useRef(qServer);
  const deletedRef = useRef(showDeleted);
  useEffect(() => { limitRef.current = limit; qRef.current = qServer; deletedRef.current = showDeleted; });

  const busyRef = useRef(false);
  const dirtyRef = useRef(false);
  const load = useCallback(async () => {
    if (busyRef.current) { dirtyRef.current = true; return; }   // đang tải → hẹn tải lại sau
    busyRef.current = true;
    try {
      do {
        dirtyRef.current = false;
        const ctrl = new AbortController();
        const safety = setTimeout(() => ctrl.abort(), 20000);   // chốt an toàn cho request treo
        const qs = new URLSearchParams({ limit: String(limitRef.current) });
        if (deletedRef.current) qs.set("scope", "deleted");
        if (qRef.current) qs.set("q", qRef.current);
        try {
          const [dj, dm] = await Promise.all([
            fetch(`/api/jobs?${qs}`, { cache: "no-store", signal: ctrl.signal }).then((r) => r.json()).catch(() => null),
            fetch("/api/machines", { cache: "no-store", signal: ctrl.signal }).then((r) => r.json()).catch(() => null),
          ]);
          if (dj) { setJobs(dj.items || []); setTotal(dj.total ?? (dj.items || []).length); setSrvStats(dj.stats || null); }
          if (Array.isArray(dm)) setMachines(dm);
        } finally { clearTimeout(safety); }
      } while (dirtyRef.current);   // tham số đổi giữa lúc tải → chạy lại với tham số mới nhất
    } finally {
      busyRef.current = false;
    }
  }, []);   // STABLE — KHÔNG phụ thuộc tham số

  // Gõ tới đâu tìm tới đó nhưng ĐỢI 400ms mới bắn — tìm chạy trên Atlas nên với được
  // cả job cũ nằm ngoài trần 300 dòng, không chỉ lọc trong đám đã tải.
  useEffect(() => {
    const t = setTimeout(() => setQServer(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setLimit(PAGE); }, [qServer, showDeleted]);   // đổi lọc → về trang đầu
  useEffect(() => { setJobs([]); }, [showDeleted]);               // đổi scope → xoá bảng cũ
  // Nạp lại khi ĐỔI THAM SỐ (từ khoá / scope / trần). load serialized → không chồng, không huỷ.
  useEffect(() => { load(); }, [qServer, showDeleted, limit, load]);
  // Poll NỐI TIẾP mỗi 8s (load serialized nên nhịp không bao giờ chồng chéo).
  useEffect(() => {
    let stop = false, t;
    const tick = async () => { await load(); if (!stop) t = setTimeout(tick, 8000); };
    t = setTimeout(tick, 8000);
    return () => { stop = true; clearTimeout(t); };
  }, [load]);

  // Chi tiết: CHỈ tải 1 lần khi mở (tránh nhấp nháy / video reload liên tục)
  // push=true → ghi ?task=<id> vào URL để copy/chia sẻ/F5 vẫn ra đúng task này.
  const openDetail = useCallback(async (id, push = true) => {
    setSel(id); setDetail(null);
    if (push && typeof window !== "undefined"
        && new URLSearchParams(window.location.search).get("task") !== String(id)) {
      window.history.pushState({ task: id }, "", `?task=${encodeURIComponent(id)}`);
    }
    try { const r = await fetch(`/api/jobs/${id}`, { cache: "no-store" }); setDetail(await r.json()); }
    catch { setDetail({ error: "không tải được" }); }
  }, []);

  const closeDetail = useCallback(() => {
    setSel(null); setDetail(null);
    if (typeof window !== "undefined"
        && new URLSearchParams(window.location.search).get("task")) {
      window.history.pushState({}, "", window.location.pathname);
    }
  }, []);

  // DEEP LINK: mở `?task=33` (hoặc `/task/33` → redirect sang dạng query) là bung sẵn
  // chi tiết. Nút Back/Forward của trình duyệt cũng đóng/mở đúng task.
  // Đọc trực tiếp location thay vì useSearchParams() → không cần bọc <Suspense>.
  useEffect(() => {
    const fromUrl = () => new URLSearchParams(window.location.search).get("task");
    const first = fromUrl();
    if (first) openDetail(first, false);
    const onPop = () => {
      const id = fromUrl();
      if (id) openDetail(id, false);
      else { setSel(null); setDetail(null); }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [openDetail]);

  // Lưu ghi chú (gõ là lưu, không có nút Lưu) → cập nhật cả bảng cho khớp ngay
  const saveNote = useCallback(async (id, note) => {
    const r = await fetch(`/api/jobs/${id}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ note }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, note: note.trim() } : j)));
  }, []);

  function flash(m) { setToast(m); setTimeout(() => setToast(""), 1600); }
  function copy(text, label = "Đã copy") { navigator.clipboard?.writeText(text); flash(label); }

  // ── lọc (chỉ để xem) ──
  const toolIds = new Set(machines.filter((m) => !toolFilter || m.tool === toolFilter).map((m) => m.machine_id));
  const shown = jobs.filter((j) => {
    if (machineFilter && j.pipeline_id !== machineFilter && j.vps_id !== machineFilter) return false;
    if (toolFilter && !(toolIds.has(j.pipeline_id) || toolIds.has(j.vps_id))) return false;
    if (statusFilter) {
      const [cls] = phaseBadge(j);
      const want = { done: "b-done", wait: "b-wait", run: "b-run", fail: "b-fail" }[statusFilter];
      if (cls !== want) return false;
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      // tìm theo link · tiêu đề · ghi chú · #id
      const hay = `${j.url || ""} ${j.source_title || ""} ${j.note || ""} #${j.id}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // 4 ô thống kê: khi KHÔNG lọc phía client thì lấy số Atlas đếm trên TOÀN BỘ job
  // (đúng cả với job nằm ngoài trang đang tải); có lọc thì đếm trên phần đang xem.
  const clientFiltered = !!(machineFilter || toolFilter || statusFilter);
  const k = { run: 0, wait: 0, done: 0, fail: 0 };
  if (!clientFiltered && srvStats) Object.assign(k, srvStats);
  else for (const j of shown) {
    const [cls] = phaseBadge(j);
    if (cls === "b-done") k.done++; else if (cls === "b-fail") k.fail++;
    else if (cls === "b-wait") k.wait++; else k.run++;
  }
  const online = machines.filter((m) => m.online).length;
  // Fleet: CHỈ máy đang mở (online), tách 2 loại. pipeline = không có làn tts; listener = có tts.
  const onlinePipelines = machines.filter((m) => m.online && !m.tts);
  const onlineListeners = machines.filter((m) => m.online && m.tts);
  // VPS đang có srt nằm chờ NGƯỜI bấm chạy MiniMax / VPS hoàn toàn trống
  const vps = onlineListeners;
  const needClick = vps.filter((m) => m.tts.wait_click > 0);
  const freeVps = vps.filter((m) => listenerState(m)[1] === "TRỐNG");
  const stats = [
    ["Đang chạy", k.run, "⚙", "var(--blue)", "run"],
    ["Chờ người", k.wait, "⏸", "var(--amber)", "wait"],
    ["Hoàn tất", k.done, "✅", "var(--green)", "done"],
    ["Lỗi", k.fail, "❌", "var(--red)", "fail"],
  ];

  return (
    <div className="wrap">
      <div className="hd">
        <div className="logo">🎬</div>
        <div className="brand">
          <h1>IzPipeline — Manager</h1>
          <p>Theo dõi &amp; xem kết quả pipeline · {jobs.length} job · {online}/{machines.length} máy online</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <a className="btn ghost" href="/keys">🔑 API key</a>
          <div className="live"><span className="dot pulse" /> live · làm mới 5s</div>
        </div>
      </div>

      {/* stats (bấm để lọc theo trạng thái) */}
      <div className="stats">
        {stats.map(([l, v, ic, col, key]) => (
          <div key={l} className="card stat" onClick={() => setStatusFilter(statusFilter === key ? "" : key)}
            style={{ cursor: "pointer", outline: statusFilter === key ? "2px solid var(--accent)" : "none" }}>
            <div className="accent" style={{ background: col }} />
            <div className="ic">{ic}</div>
            <div className="n" style={{ color: col }}>{v}</div>
            <div className="l">{l}</div>
          </div>
        ))}
      </div>

      {/* fleet — CHỈ máy đang mở (online), tách pipeline / listener */}
      <div className="sec-t">Fleet — máy ĐANG MỞ ({onlinePipelines.length + onlineListeners.length})</div>
      {onlinePipelines.length + onlineListeners.length === 0 && (
        <div className="chips"><span style={{ color: "var(--muted)" }}>Không có máy nào đang mở.</span></div>
      )}
      {onlinePipelines.length > 0 && (
        <>
          <div style={{ color: "var(--muted)", fontSize: 12, margin: "6px 0 2px" }}>
            🖥 Máy pipeline (operator) — {onlinePipelines.length}
          </div>
          <div className="chips">
            {onlinePipelines.map((m) => (
              <div key={m.machine_id} className={"chip" + (machineFilter === m.machine_id ? " on" : "")}
                onClick={() => setMachineFilter(machineFilter === m.machine_id ? "" : m.machine_id)}
                title={machineTip(m)}>
                <span className="mdot" style={{ background: "var(--green)" }} />
                <span>🖥</span><b>{m.name}</b>
                <small>{m.jobs_active} job</small>
              </div>
            ))}
          </div>
        </>
      )}
      {onlineListeners.length > 0 && (
        <>
          <div style={{ color: "var(--muted)", fontSize: 12, margin: "8px 0 2px" }}>
            🔊 Máy listener (VPS) — {onlineListeners.length}
          </div>
          <div className="chips">
            {onlineListeners.map((m) => (
              <div key={m.machine_id} className={"chip" + (machineFilter === m.machine_id ? " on" : "")}
                onClick={() => setMachineFilter(machineFilter === m.machine_id ? "" : m.machine_id)}
                title={machineTip(m)}>
                <span className="mdot" style={{ background: "var(--green)" }} />
                <span>🔊</span><b>{m.name}</b>
                <ListenBadge m={m} />
                <ListenerLoad m={m} />
              </div>
            ))}
          </div>
        </>
      )}
      {/* nhắc việc NGƯỜI phải làm: srt đã nằm trong ready/ mà chưa ai bấm chạy MiniMax */}
      {needClick.length > 0 && (
        <div className="callout">
          ⏳ <b>Cần vào bấm chạy MiniMax</b> —{" "}
          {needClick.map((m) => `${m.name}: ${m.tts.wait_click} srt`).join(" · ")}
        </div>
      )}
      {freeVps.length > 0 && (
        <div className="callout ok">
          🟢 <b>Máy TRỐNG, đẩy job vào được ngay</b> — {freeVps.map((m) => m.name).join(" · ")}
        </div>
      )}

      {/* filters */}
      <div className="filters">
        <span style={{ color: "var(--muted)", fontSize: 13 }}>Lọc:</span>
        <select value={toolFilter} onChange={(e) => setToolFilter(e.target.value)}>
          <option value="">mọi tool</option>
          <option value="pipeline">🖥 pipeline (operator)</option>
          <option value="vps_listener">🔊 vps listener</option>
        </select>
        <select value={machineFilter} onChange={(e) => setMachineFilter(e.target.value)}>
          <option value="">mọi máy</option>
          {machines.map((m) => <option key={m.machine_id} value={m.machine_id}>{m.name} [{m.tool}]</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">mọi trạng thái</option>
          <option value="done">✅ Đã thành công</option>
          <option value="run">⚙ Đang xử lý</option>
          <option value="wait">⏸ Chờ người</option>
          <option value="fail">❌ Lỗi</option>
        </select>
        <button className={`btn sm${showDeleted ? "" : " ghost"}`}
          title="Task đã xoá nhưng GIỮ file trên Drive — vẫn copy được link video / short / srt"
          onClick={() => setShowDeleted((v) => !v)}>
          🗑 Đã xoá (còn link)
        </button>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="🔎 Tìm link · tiêu đề · ghi chú · #id"
          style={{ minWidth: 240, flex: "1 1 240px" }} />
        {(machineFilter || toolFilter || statusFilter || search.trim()) &&
          <button className="btn sm ghost" onClick={() => { setMachineFilter(""); setToolFilter(""); setStatusFilter(""); setSearch(""); }}>✕ xoá lọc</button>}
        <span style={{ color: "var(--muted2)", marginLeft: "auto", fontSize: 12 }}>
          {shown.length}/{jobs.length} job{total > jobs.length ? ` · tổng ${total}` : ""}
        </span>
        {total > jobs.length &&
          <button className="btn sm ghost" onClick={() => setLimit((n) => n + PAGE)}
            title={`Đang xem ${jobs.length} job mới nhất trong tổng ${total}`}>
            ↓ tải thêm {PAGE}
          </button>}
      </div>

      {/* table (desktop) */}
      <div className="card desk" style={{ padding: "4px 6px", overflowX: "auto" }}>
        <table>
          <thead><tr>
            {["#", "Video", "Trạng thái", "Tiến độ", "Bắt đầu", "Máy (pipeline → vps)", "Pha", "Kết quả", "📝 Ghi chú"].map((h) =>
              <th key={h}>{h}</th>)}
          </tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={9}><div className="empty">Không có job nào khớp bộ lọc.</div></td></tr>}
            {shown.map((j) => {
              const [cls, label] = phaseBadge(j);
              const pct = progressPct(j.stages);
              return (
                <tr key={j.id} onClick={() => openDetail(j.id)}>
                  <td style={{ fontWeight: 700, color: "var(--muted)" }}>{j.id}</td>
                  <td>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      {j.thumbnail ? <img className="thumb" src={j.thumbnail} alt="" /> : <div className="thumb ph">🎞</div>}
                      <div style={{ minWidth: 0 }}>
                        <div className="jtitle">{j.source_title || "(chưa có tiêu đề gốc)"}
                          {THUMB_SHORT[j.thumb] && <span className="badge b-wait" style={{ marginLeft: 6, fontSize: 11 }}>{THUMB_SHORT[j.thumb]}</span>}</div>
                        <div className="jsub">{j.url || ""}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className={"badge " + cls}>{label}</span></td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="bar"><i style={{ width: pct + "%" }} /></div>
                      <span style={{ color: "var(--muted)", fontSize: 12, minWidth: 32 }}>{pct}%</span>
                    </div>
                  </td>
                  <td style={{ color: "var(--muted)", fontSize: 12, whiteSpace: "nowrap" }}
                    title={j.created_exact ? "Thời gian tạo task" : "Xấp xỉ (job cũ chưa có mốc tạo — lấy lần cập nhật gần nhất)"}>
                    {j.created_at ? (j.created_exact ? "" : "~") + fmtStart(j.created_at) : "—"}</td>
                  <td className="machine-cell">🖥 <b>{j.pipeline_name}</b> → 🔊 <b>{j.vps_name}</b></td>
                  <td style={{ color: "var(--muted)", fontSize: 12 }}>{j.phase}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {j.has_link
                      ? <a className="btn sm" href={j.link} target="_blank" rel="noreferrer">▶ Xem</a>
                      : <span style={{ color: "var(--muted2)", fontSize: 12 }}>—</span>}
                  </td>
                  <td>
                    {j.note
                      ? <span className="notecell" title={j.note}>{j.note}</span>
                      : <span style={{ color: "var(--muted2)", fontSize: 12 }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* cards (mobile) */}
      <div className="mob">
        {shown.length === 0 && <div className="card"><div className="empty">Không có job nào khớp bộ lọc.</div></div>}
        {shown.map((j) => {
          const [cls, label] = phaseBadge(j);
          const pct = progressPct(j.stages);
          return (
            <div className="card jcard" key={j.id} onClick={() => openDetail(j.id)}>
              <div className="top">
                {j.thumbnail ? <img className="thumb" src={j.thumbnail} alt="" /> : <div className="thumb ph">🎞</div>}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="jtitle" style={{ maxWidth: "100%" }}>#{j.id} · {j.source_title || "(chưa có tiêu đề)"}
                    {THUMB_SHORT[j.thumb] && <span className="badge b-wait" style={{ marginLeft: 6, fontSize: 11 }}>{THUMB_SHORT[j.thumb]}</span>}</div>
                  <div style={{ marginTop: 4 }}><span className={"badge " + cls}>{label}</span></div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                <div className="bar" style={{ flex: 1, width: "auto" }}><i style={{ width: pct + "%" }} /></div>
                <span style={{ color: "var(--muted)", fontSize: 12 }}>{pct}%</span>
              </div>
              <div className="meta">🖥 <b style={{ color: "var(--text)" }}>{j.pipeline_name}</b> → 🔊 <b style={{ color: "var(--text)" }}>{j.vps_name}</b></div>
              <div className="meta" title={j.created_exact ? "" : "Xấp xỉ (job cũ)"}>🕒 Bắt đầu: {j.created_at ? (j.created_exact ? "" : "~") + fmtStart(j.created_at) : "—"}</div>
              {j.note && <div className="notecard">📝 {j.note}</div>}
              {j.has_link && <div className="acts" onClick={(e) => e.stopPropagation()}>
                <a className="btn sm" href={j.link} target="_blank" rel="noreferrer">▶ Xem video</a>
              </div>}
            </div>
          );
        })}
      </div>

      {sel && <Drawer id={sel} d={detail} onClose={closeDetail}
        onReload={() => openDetail(sel, false)} copy={copy} onSaveNote={saveNote} />}
      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}

// ── Chuyển task sang máy local khác ──────────────────────────────────────────
// Web chỉ ĐẶT LỆNH. Máy đang giữ task tự zip folder + đẩy lên Drive, máy đích tự tải về,
// giải nén, nhận quyền sở hữu rồi xoá gói trên Drive (iz_pipeline/worker/transfer_runner.py).
// Hai máy không cần online cùng lúc.


function TransferBox({ id, d, onReload }) {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const tf = d.transfer;
  const live = tf && TF_INFLIGHT.includes(tf.state);
  const others = (d.locals || []).filter((m) => m.id !== d.owner_id);

  async function post(body, okMsg) {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/jobs/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `lỗi ${r.status}`);
      onReload();
    } catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(false); }
  }

  if (!d.authed) return null;          // chưa đăng nhập ở /keys thì không hiện

  return (
    <>
      <div className="k">⇄ Chuyển task sang máy khác</div>
      <div className="videolink">
        {live ? (
          <>
            <div style={{ fontWeight: 600 }}>{TF_LABEL[tf.state] || tf.state}</div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
              {tf.from_name} → <b>{tf.to_name}</b>
              {tf.size ? ` · gói ${(tf.size / 1048576).toFixed(0)} MB` : ""}
            </div>
            {tf.error && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 4 }}>
              {tf.error}{tf.attempts ? ` (đã thử ${tf.attempts} lần)` : ""}</div>}
            <div style={{ color: "var(--muted2)", fontSize: 11, marginTop: 4 }}>
              Bản gốc ở máy cũ chỉ bị xoá SAU khi máy đích nhận xong — huỷ giữa chừng thì
              file vẫn còn nguyên chỗ cũ.
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button className="btn sm ghost" onClick={onReload}>↻ Cập nhật</button>
              <button className="btn sm ghost" disabled={busy}
                onClick={() => post({ transfer_cancel: true })}
                title="Huỷ được ở mọi bước — hai máy tự dọn phần dở của mình">
                ✕ Huỷ lệnh</button>
            </div>
            <div style={{ color: "var(--muted2)", fontSize: 11, marginTop: 8 }}>
              Máy nguồn chờ bước đang chạy xong mới đóng gói. Hai máy không cần mở cùng lúc.
              Huỷ được ở bất kỳ bước nào; task ở nguyên máy cũ.
            </div>
          </>
        ) : others.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Chưa có máy local nào khác để chuyển sang.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select value={to} onChange={(e) => setTo(e.target.value)} style={{ flex: "1 1 200px" }}>
                <option value="">— chọn máy đích —</option>
                {others.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.online ? "🟢" : "⚪"} {m.name}{m.online ? "" : " (offline)"}
                  </option>
                ))}
              </select>
              <button className="btn primary" disabled={!to || busy}
                onClick={() => post({ transfer_to: to })}>
                {busy ? "Đang gửi…" : "⇄ Chuyển"}
              </button>
            </div>
            {tf && !live && <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
              Lần trước: {TF_LABEL[tf.state] || tf.state}
              {tf.error ? ` — ${tf.error}` : ""}</div>}
            {err && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 6 }}>{err}</div>}
            <div style={{ color: "var(--muted2)", fontSize: 11, marginTop: 8 }}>
              Máy đang giữ task sẽ nén cả folder rồi đẩy lên Drive; máy đích tải về, giải nén
              đúng chỗ rồi xoá gói trên Drive. Nhận xong, máy cũ <b>tự xoá bản gốc</b> (kèm
              draft CapCut cũ) — chuyển là chuyển hẳn, không nhân đôi dữ liệu. Đang chạy TTS
              vẫn chuyển được: audio sẽ trả về đúng máy mới. Draft CapCut không đi theo được,
              dựng lại ở máy mới.
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ── Tạo thumbnail ────────────────────────────────────────────────────────────
// Web chỉ GHI YÊU CẦU vào DB. Extension IzThumb (trên máy đang mở tool pipeline) nhận việc,
// tạo ảnh trên Google Flow; tool upload bằng tài khoản Drive TRUNG TÂM → admin chọn ở đây →
// web xoá các ảnh không chọn (web là chủ file nên xoá được — Drive chỉ cho chủ file xoá).
const THUMB_LABEL = {
  queued: "⏳ Chờ extension nhận việc", generating: "🎨 Extension đang tạo ảnh",
  ready: "🖼 Chờ bạn chọn ảnh", done: "✅ Đã chọn thumbnail", failed: "✗ Tạo lỗi", cancelled: "Đã huỷ",
};
const hookUpper = (s) => String(s || "").normalize("NFC").replace(/\s+/g, " ").trim().toUpperCase();

function ThumbBox({ id, d }) {
  const allHooks = d.hooks || [];
  const [thumb, setThumb] = useState(d.thumb);
  const [n, setN] = useState(d.thumb?.n || 4);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [editIdx, setEditIdx] = useState(null);
  const [previewIdx, setPreviewIdx] = useState(null);
  // Chữ sẽ in lên ảnh: mặc định = hook theo tiêu đề đã chọn, nhưng CHỌN hook khác hoặc GÕ TAY được.
  // Editor tự điền chữ này; extension KHÔNG cần hook nữa (chỉ tạo ảnh nền).
  const [hookText, setHookText] = useState(() =>
    hookUpper((Number.isInteger(d.chosen_title_idx) && allHooks[d.chosen_title_idx]) || d.thumb?.hook || ""));

  // Tự làm mới RIÊNG khối này — không gọi onReload của Drawer (nó xoá trắng chi tiết rồi tải
  // lại, form đang điền sẽ mất và cả khung nhấp nháy mỗi lần).
  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
      const j = await r.json();
      if (r.ok) setThumb(j.thumb);
    } catch { /* giữ nguyên */ }
  }, [id]);
  const active = !!thumb && ["queued", "generating"].includes(thumb.state);
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [active, refresh]);

  if (!d.authed) return null;          // chọn / xoá ảnh là quyết định nội dung → phải mở khoá /keys
  const cands = thumb?.candidates || [];
  const copyText = (t) => navigator.clipboard?.writeText(t).then(() => setInfo("✓ Đã copy chữ")).catch(() => {});
  // Thumbnail GỐC của video nguồn (để so sánh với ảnh gen). Ưu tiên maxres, lỗi thì về hqdefault.
  const vid = d.source?.video_id || (d.source?.url?.match(/(?:v=|youtu\.be\/|\/vi\/|\/shorts\/)([\w-]{11})/)?.[1]) || "";
  const origThumb = vid ? `https://img.youtube.com/vi/${vid}/maxresdefault.jpg` : (d.source?.thumbnail || "");

  async function post(body, tag) {
    setBusy(tag); setErr(""); setInfo("");
    try {
      const r = await fetch(`/api/jobs/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      await refresh();
      return j;
    } catch (e) { setErr(String(e.message || e)); return null; }
    finally { setBusy(""); }
  }
  async function submit() {
    // Extension chỉ tạo ẢNH NỀN → chỉ cần số ảnh. Vẫn lưu hook đang chọn vào task để tiện tham chiếu.
    const j = await post({ thumb_submit: { hook: hookText, n } }, "submit");
    if (j) setInfo("Đã xếp hàng — extension trên máy đang mở tool pipeline sẽ nhận trong vài giây.");
  }
  async function choose(c) {
    const others = cands.length - 1;
    if (!window.confirm(`Chọn ảnh #${c.idx} làm thumbnail?`
      + (others > 0 ? `\n\n${others} ảnh còn lại sẽ bị XOÁ khỏi Drive.` : ""))) return;
    const j = await post({ thumb_choose: { drive_id: c.drive_id } }, "choose:" + c.drive_id);
    if (j) setInfo(`✓ Đã chọn · xoá ${j.deleted} ảnh`
      + (j.failed ? ` · ${j.failed} ảnh chưa xoá được (xem /keys → ☁ Google Drive)` : ""));
  }
  async function cancel() {
    if (!window.confirm("Huỷ lượt tạo và XOÁ mọi ảnh đã tạo của task này?")) return;
    const j = await post({ thumb_cancel: true }, "cancel");
    if (j) setInfo(`Đã huỷ · xoá ${j.deleted} ảnh` + (j.failed ? ` · ${j.failed} ảnh chưa xoá được` : ""));
  }

  return (
    <>
      <div className="k">🖼 Thumbnail (tạo trên Google Flow)</div>
      <div className="videolink">
        {thumb && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 600 }}>{THUMB_LABEL[thumb.state] || thumb.state}
              {thumb.progress?.total ? <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                {" "}· {thumb.progress.done}/{thumb.progress.total}{thumb.progress.note ? ` · ${thumb.progress.note}` : ""}</span> : null}
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>
              Hook: <b style={{ color: "var(--amber)" }}>{hookUpper(thumb.hook)}</b>
              {thumb.claimed_by ? ` · máy ${thumb.claimed_by}` : ""}{thumb.batch > 1 ? ` · lượt ${thumb.batch}` : ""}
            </div>
            {thumb.error && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 4 }}>{thumb.error}</div>}
            {(active || thumb.state === "ready") && (
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button className="btn sm ghost" onClick={refresh}>↻ Cập nhật</button>
                <button className="btn sm ghost" disabled={!!busy} onClick={cancel}>✕ Huỷ & xoá ảnh</button>
              </div>
            )}
          </div>
        )}

        {origThumb && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>🖼 Ảnh gốc YouTube (để so sánh)</div>
            <a href={origThumb} target="_blank" rel="noreferrer">
              <img src={origThumb} alt="thumbnail gốc"
                onError={(e) => { const hq = d.source?.thumbnail; if (hq && e.currentTarget.src !== hq) e.currentTarget.src = hq; }}
                style={{ display: "block", width: "100%", maxWidth: 340, aspectRatio: "16/9", objectFit: "cover", borderRadius: 10, border: "1px solid var(--line)", background: "#101830" }} />
            </a>
          </div>
        )}

        {cands.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8, marginBottom: 12 }}>
            {cands.map((c, ci) => {
              const chosen = thumb.state === "done" && thumb.chosen_drive_id === c.drive_id;
              return (
                <div key={c.drive_id} style={{ border: `2px solid ${chosen ? "var(--green)" : "var(--line)"}`,
                  borderRadius: 10, overflow: "hidden", background: "var(--panel2)" }}>
                  <img src={c.img} alt="" onClick={() => setPreviewIdx(ci)}
                    style={{ display: "block", width: "100%", aspectRatio: "16/9", objectFit: "cover", cursor: "zoom-in" }} />
                  <div style={{ padding: "6px 8px", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>#{c.idx}</span>
                    {c.ocr_ok === false && <span className="badge b-fail" title={`Gemini đọc được: ${c.ocr_text}`}>⚠ chữ có thể sai</span>}
                    {c.ocr_ok === true && <span className="badge b-done">✓ chữ khớp</span>}
                    <button className="btn sm" style={{ marginLeft: "auto" }} onClick={() => setEditIdx(ci)}>✏️ Sửa chữ</button>
                    {thumb.state === "ready" && (
                      <button className="btn sm primary" disabled={!!busy} onClick={() => choose(c)}>
                        {busy === "choose:" + c.drive_id ? "…" : "★ Chọn"}</button>)}
                    {chosen && <span className="badge b-done">★ đang dùng</span>}
                  </div>
                </div>);
            })}
          </div>
        )}

        {!active && (
          <div style={{ display: "grid", gap: 10 }}>
            {/* Chữ in lên ảnh — chọn hook có sẵn hoặc gõ tay; editor tự điền chữ này */}
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Chữ in lên ảnh (editor tự điền · chọn hook hoặc gõ tay)</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <select value="" onChange={(e) => { if (e.target.value) setHookText(hookUpper(e.target.value)); e.target.value = ""; }}
                  style={{ maxWidth: 200 }} title="Chọn 1 hook có sẵn">
                  <option value="">▾ Chọn hook ({allHooks.filter(Boolean).length})</option>
                  {allHooks.map((h, i) => (h ? <option key={i} value={h}>{h}{i === d.chosen_title_idx ? " ★" : ""}</option> : null))}
                </select>
                <input value={hookText} maxLength={80} placeholder="…hoặc gõ chữ in lên ảnh"
                  style={{ flex: 1, minWidth: 160, fontWeight: 700, color: "var(--amber)" }}
                  onChange={(e) => setHookText(e.target.value)} />
                <button className="btn sm" disabled={!hookText} onClick={() => copyText(hookText)}>Copy</button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{thumb?.state === "ready" ? "Số ảnh gen thêm" : "Số ảnh nền"}</span>
              <input type="number" min={1} max={40} value={n} style={{ width: 70 }}
                onChange={(e) => setN(Math.max(1, Math.min(40, Number(e.target.value) || 1)))} />
              <button className="btn primary" disabled={!!busy} onClick={submit}>
                {busy === "submit" ? "Đang gửi…" : thumb?.state === "ready" ? `＋ Tạo thêm ${n} ảnh` : `🖼 Tạo ${n} ảnh nền`}</button>
            </div>
            <div style={{ color: "var(--muted2)", fontSize: 11 }}>
              Extension chỉ tạo <b>ẢNH NỀN</b> (không gắn chữ). Chữ bạn tự thêm bằng nút <b>✏️ Sửa chữ</b> ở mỗi ảnh. Tối đa 40 ảnh/lượt.
              {thumb?.state === "ready" ? " Gen thêm GIỮ NGUYÊN các ảnh đang có, chỉ THÊM ảnh mới." : ""}
            </div>
          </div>
        )}
        {err && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>{err}</div>}
        {info && <div style={{ color: "var(--green)", fontSize: 12, marginTop: 8 }}>{info}</div>}
      </div>
      {previewIdx !== null && cands[previewIdx] && (
        <ThumbPreview cands={cands} idx={previewIdx} setIdx={setPreviewIdx}
          onEdit={() => { const i = previewIdx; setPreviewIdx(null); setEditIdx(i); }}
          onClose={() => setPreviewIdx(null)} />
      )}
      {editIdx !== null && cands[editIdx] && (
        <ThumbEditor cands={cands} startIdx={editIdx} jid={id} hook={hookText}
          onSaved={() => { setInfo("✓ Đã lưu ảnh có chữ lên Drive & vào task"); refresh(); }}
          onClose={() => setEditIdx(null)} />
      )}
    </>
  );
}

// Xem ảnh dạng slide (mũi tên trái/phải, phím ← →) — chỉ xem, không sửa.
const thumbProxy = (id) => `/api/thumb/img?id=${encodeURIComponent(id)}`;
function ThumbPreview({ cands, idx, setIdx, onEdit, onClose }) {
  const go = (d) => setIdx((i) => (i + d + cands.length) % cands.length);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); else if (e.key === "ArrowLeft") go(-1); else if (e.key === "ArrowRight") go(1); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });
  // Nạp ảnh đang mở trước, xong PREFETCH các ảnh còn lại (nền) → chuyển ảnh không delay.
  // Dùng chung URL proxy với editor nên cache dùng lại cho cả 2.
  const preloaded = useRef(new Set());
  useEffect(() => {
    const order = [idx, ...cands.map((_, i) => i).filter((i) => i !== idx)];
    let stop = false;
    (async () => {
      for (const i of order) {
        if (stop) return;
        const id = cands[i].drive_id;
        if (preloaded.current.has(id)) continue;
        await new Promise((res) => { const im = new Image(); im.onload = res; im.onerror = res; im.src = thumbProxy(id); preloaded.current.add(id); if (i !== order[0]) res(); });
      }
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const c = cands[idx];
  useEffect(() => { setLoading(true); }, [idx]);
  const arrow = (side) => ({ position: "absolute", top: "50%", [side]: 12, transform: "translateY(-50%)", width: 46, height: 46, borderRadius: "50%", fontSize: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)" });
  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ position: "relative", maxWidth: "94vw", maxHeight: "90vh" }}>
        <img key={c.drive_id} src={thumbProxy(c.drive_id)} alt="" onLoad={() => setLoading(false)}
          style={{ maxWidth: "94vw", maxHeight: "82vh", borderRadius: 10, display: "block", minWidth: 320, minHeight: 180, background: "#111" }} />
        {loading && <div style={{ position: "absolute", top: 12, left: 12, background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 12, padding: "4px 8px", borderRadius: 6 }}>Đang tải…</div>}
        <button className="btn ghost" onClick={() => go(-1)} style={arrow("left")}>‹</button>
        <button className="btn ghost" onClick={() => go(1)} style={arrow("right")}>›</button>
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", marginTop: 10 }}>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>Ảnh #{c.idx} · {idx + 1}/{cands.length}</span>
          <button className="btn sm primary" onClick={onEdit}>✏️ Sửa chữ ảnh này</button>
          <button className="btn sm ghost" onClick={onClose}>✕ Đóng</button>
        </div>
      </div>
    </div>
  );
}

function Drawer({ id, d, onClose, onReload, copy, onSaveNote }) {
  const [metaOpen, setMetaOpen] = useState(false);
  // Esc để đóng (đi qua onClose → URL cũng được dọn về trang danh sách)
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !metaOpen) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, metaOpen]);

  return (
    <>
      {metaOpen && d && <MetaModal d={d} id={id} copy={copy} onReload={onReload}
        onClose={() => setMetaOpen(false)} />}
      <div className="scrim" onClick={onClose} />
      <div className="drawer">
        <div className="dhd">
          <div className="logo" style={{ width: 34, height: 34, fontSize: 17 }}>🎬</div>
          <div>
            <div style={{ fontWeight: 700 }}>Task [{id}]</div>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>{d?.phase || "…"}</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button className="btn sm ghost" title="Copy link mở thẳng task này"
              onClick={() => copy(`${window.location.origin}/task/${id}`, "Đã copy link task")}>🔗</button>
            <button className="btn sm ghost" onClick={onReload} title="Tải lại chi tiết">↻</button>
            <button className="btn sm ghost" onClick={onClose}>✕ Đóng</button>
          </div>
        </div>
        <div className="body">
          {!d && <div className="empty">Đang tải chi tiết…</div>}
          {d?.error && <div className="empty">Lỗi: {d.error}</div>}
          {d && !d.error && (
            <div className="drawer-cols">
              <div className="col">
              {/* Preview video (nếu đã xong) */}
              {d.final?.embed ? (
                <div className="videobox">
                  <iframe src={d.final.embed} allow="autoplay" allowFullScreen
                    title={`video-${id}`} />
                </div>
              ) : d.source?.thumbnail ? (
                <img className="hero" src={d.source.thumbnail} alt=""
                  onError={(e) => { e.currentTarget.style.display = "none"; }} />
              ) : (
                <div className="hero ph">🎞 chưa có video</div>
              )}

              {d.source?.title_original && <h3 style={{ margin: "14px 0 4px", fontSize: 16 }}>{d.source.title_original}</h3>}
              <div className="machine-cell" style={{ marginTop: 6 }}>🖥 <b>{d.pipeline_name}</b> → 🔊 <b>{d.vps_name}</b></div>

              {/* video cuối */}
              {d.final?.has_link && (
                <>
                  <div className="k">🎥 Video cuối (Drive)</div>
                  <div className="videolink">
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <a className="btn primary" href={d.final.link} target="_blank" rel="noreferrer">▶ Mở tab mới</a>
                      <button className="btn" onClick={() => copy(d.final.link, "Đã copy link video")}>📋 Copy link</button>
                    </div>
                    <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 8, wordBreak: "break-all" }}>{d.final.link}</div>
                  </div>
                </>
              )}

              {/* thumbnail (ảnh bìa user upload) */}
              {d.final?.thumbnail && <>
                <div className="k">🖼 Thumbnail (ảnh bìa đăng YouTube)</div>
                {d.final.thumbnail_img &&
                  <img className="hero" src={d.final.thumbnail_img} alt="" style={{ marginBottom: 8 }}
                    onError={(e) => { e.currentTarget.style.display = "none"; }} />}
                <div className="copybox">
                  <div className="t"><a href={d.final.thumbnail} target="_blank" rel="noreferrer">{d.final.thumbnail}</a></div>
                  <button className="btn sm" onClick={() => copy(d.final.thumbnail, "Đã copy link thumbnail")}>Copy</button>
                </div>
              </>}

              {/* nguồn */}
              {d.source?.url && <>
                <div className="k">🔗 Nguồn</div>
                <div className="copybox">
                  <div className="t"><a href={d.source.url} target="_blank" rel="noreferrer">{d.source.url}</a></div>
                  <button className="btn sm" onClick={() => copy(d.source.url, "Đã copy link nguồn")}>Copy</button>
                </div>
              </>}

              {/* metadata — gọn: 1 nút mở modal bảng */}
              <div className="k">📋 Tiêu đề / Hook / Mô tả</div>
              {(d.titles?.length || d.descriptions?.length) ? (
                <button className="btn" style={{ width: "100%", justifyContent: "center" }}
                  onClick={() => setMetaOpen(true)}>
                  📋 Xem &amp; copy — {d.titles?.length || 0} tiêu đề · {d.hooks?.length || 0} hook · {d.descriptions?.length || 0} mô tả
                  {Number.isInteger(d.chosen_title_idx)
                    ? <span style={{ color: "var(--green)", marginLeft: 6 }}>· ★ đã chọn #{d.chosen_title_idx + 1}</span>
                    : <span style={{ color: "var(--amber)", marginLeft: 6 }}>· chưa chọn</span>}
                </button>
              ) : <div className="muted-note">Chưa có (chạy xong bước metadata).</div>}

              {/* các bước */}
              <div className="k">⚙ Tiến trình các bước</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {LANES.map((l) => {
                  const s = d.stages?.[l] || "";
                  const kind = stageKind(l, s);
                  const col = { ok: "var(--green)", run: "var(--blue)", wait: "var(--amber)", fail: "var(--red)", idle: "var(--muted2)" }[kind];
                  return (
                    <div key={l} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13 }}>
                      <span className={"sdot " + kind} style={{ background: col }} />
                      <b style={{ minWidth: 130 }}>{LANE_VN[l]}</b>
                      <span style={{ color: "var(--muted)" }}>{s}</span>
                    </div>
                  );
                })}
              </div>

              {d.counts && (
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 14 }}>
                  srt={d.counts.srt_segments ?? "–"} · clip={d.counts.clips ?? "–"} · audio={d.counts.audio ?? "–"}
                </div>
              )}
              </div>{/* /col trái: media + thông tin */}

              <div className="col">
                <TransferBox id={id} d={d} onReload={onReload} />
                <ThumbBox id={id} d={d} />
                {/* ghi chú — gõ là lưu, không có nút Lưu (chung field với Operator) */}
                <NoteBox id={id} initial={d.note || ""} onSave={onSaveNote} />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** Ô ghi chú — gõ là lưu (debounce 800ms + lưu ngay khi rời ô / đóng drawer).
 *  Cùng field job.note với Operator, nên sửa bên nào cũng thấy ở bên kia. */
function NoteBox({ id, initial, onSave }) {
  const [val, setVal] = useState(initial || "");
  const [state, setState] = useState("");        // "" | saving | saved | err:<msg>
  const savedRef = useRef(initial || "");        // giá trị đã nằm trên server
  const valRef = useRef(initial || "");          // giá trị đang gõ (đọc được trong cleanup)
  const timerRef = useRef(null);

  // đổi sang task khác → nạp ghi chú của task đó (KHÔNG nạp lại khi bấm ↻ để
  // không nuốt chữ đang gõ dở)
  useEffect(() => {
    const v = initial || "";
    setVal(v); valRef.current = v; savedRef.current = v; setState("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const flush = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const v = valRef.current;
    if (v.trim() === savedRef.current.trim()) return;   // không đổi → khỏi gọi API
    setState("saving");
    try { await onSave(id, v); savedRef.current = v; setState("saved"); }
    catch (e) { setState("err:" + (e?.message || "không lưu được")); }
  }, [id, onSave]);

  // đóng drawer/đổi task khi còn chữ chưa lưu → lưu nốt, không mất
  useEffect(() => () => { flush(); }, [flush]);

  const onChange = (e) => {
    const v = e.target.value;
    setVal(v); valRef.current = v; setState("");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 800);
  };

  const hint = state === "saving" ? ["💾 đang lưu…", "var(--muted)"]
    : state === "saved" ? ["✓ đã lưu", "var(--green)"]
      : state.startsWith("err:") ? ["⚠ " + state.slice(4), "var(--red)"]
        : ["gõ xong là tự lưu — không cần bấm nút", "var(--muted2)"];

  return (
    <>
      <div className="k" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        📝 Ghi chú
        <span style={{ marginLeft: "auto", color: hint[1], fontSize: 11,
          textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>{hint[0]}</span>
      </div>
      <textarea className="notebox" value={val} onChange={onChange} onBlur={flush}
        maxLength={2000} rows={3} placeholder="Ghi chú cho task này (đăng kênh nào, cần sửa gì…)" />
    </>
  );
}

function MetaModal({ d, id, copy, onReload, onClose }) {
  const [busy, setBusy] = useState(null);   // "t3" / "d1" — ô đang lưu
  const [err, setErr] = useState("");
  const titles = d.titles || [];
  const hooks = d.hooks || [];
  const descs = d.descriptions || [];
  const scores = d.title_scores || [];
  const notes = d.title_notes || [];
  const n = Math.max(titles.length, hooks.length);
  const ci = d.chosen_title_idx;
  const cd = d.chosen_desc_idx;

  /** Lưu lựa chọn vào metadata_options.chosen_* — ĐÚNG field Operator đọc → 2 bên khớp.
   *  Bấm lại vào cái đang chọn = BỎ chọn (gửi null). */
  async function choose(key, idx, row) {
    const tag = `${key === "title_idx" ? "t" : "d"}${row}`;
    setBusy(tag); setErr("");
    try {
      const r = await fetch(`/api/jobs/${id}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ choose: { [key]: idx } }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      onReload();
    } catch (e) {
      setErr(r0(e));
    } finally {
      setBusy(null);
    }
  }
  function r0(e) {
    const m = String(e?.message || e);
    return m.includes("Chưa đăng nhập")
      ? "Chưa mở khoá — vào trang /keys nhập mật khẩu rồi quay lại."
      : m;
  }
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhd">
          <b style={{ fontSize: 15 }}>📋 Tiêu đề · Hook · Mô tả</b>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {titles.length > 0 && <button className="btn sm" onClick={() => copy(titles.join("\n"), `Đã copy ${titles.length} tiêu đề`)}>Copy tiêu đề</button>}
            {hooks.length > 0 && <button className="btn sm" onClick={() => copy(hooks.join("\n"), `Đã copy ${hooks.length} hook`)}>Copy hook</button>}
            <button className="btn sm ghost" onClick={onClose}>✕ Đóng</button>
          </div>
        </div>
        <div className="mbody">
          {/* nhắc ngay cặp Operator ĐANG dùng — khỏi phải dò trong 20 dòng */}
          {Number.isInteger(ci) && titles[ci] ? (
            <div className="copybox" style={{ borderColor: "var(--green)", background: "rgba(52,211,153,.08)" }}>
              <div className="t">
                <b style={{ color: "var(--green)" }}>★ Đã chọn (#{ci + 1})</b><br />{titles[ci]}
                {hooks[ci] ? <><br /><span style={{ color: "var(--amber)" }}>🖼 {hooks[ci]}</span></> : null}
              </div>
              <button className="btn sm" onClick={() => copy(titles[ci], "Đã copy tiêu đề đã chọn")}>Copy</button>
            </div>
          ) : (
            <div className="muted-note">
              {d.authed ? "Chưa chọn tiêu đề nào — bấm ★ ở dòng muốn dùng."
                : "Chưa chọn tiêu đề nào (chọn ở Operator → ★ Đặt làm chính)."}
            </div>
          )}
          {!d.authed && n > 0 && (
            <div className="muted-note">🔒 Muốn chọn ngay trên web thì mở khoá ở{" "}
              <a href="/keys" style={{ color: "var(--accent)" }}>trang /keys</a> (nhập mật khẩu),
              lựa chọn sẽ đồng bộ về Operator.</div>
          )}
          {err && <div className="muted-note" style={{ color: "var(--red)" }}>⚠ {err}</div>}

          {n > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table className="mtable">
                <thead><tr><th style={{ width: 34 }}>#</th><th>Tiêu đề</th><th>Hook (thumbnail)</th><th style={{ width: 52 }}>Điểm</th>{d.authed && <th style={{ width: 46 }}>Chọn</th>}</tr></thead>
                <tbody>
                  {Array.from({ length: n }).map((_, i) => {
                    const t = titles[i] || ""; const h = hooks[i] || "";
                    const chosen = i === ci;
                    const sc = scores[i];
                    return (
                      <tr key={i} title={notes[i] ? `Vì sao đáng click: ${notes[i]}` : undefined}
                        style={chosen ? { background: "rgba(52,211,153,.10)" } : undefined}>
                        <td style={{ color: "var(--accent)", fontWeight: 700 }}>{chosen ? "★" : i + 1}</td>
                        <td><div className="cellcopy"><span style={{ flex: 1 }}>{t}</span>{t && <button className="btn sm ghost" title="Copy tiêu đề" onClick={() => copy(t, "Đã copy tiêu đề")}>📋</button>}</div></td>
                        <td><div className="cellcopy"><span style={{ flex: 1, color: "var(--amber)" }}>{h}</span>{h && <button className="btn sm ghost" title="Copy hook" onClick={() => copy(h, "Đã copy hook")}>📋</button>}</div></td>
                        <td style={{ textAlign: "right", color: "var(--muted)" }}>{Number.isFinite(sc) ? sc : "—"}</td>
                        {d.authed && (
                          <td style={{ textAlign: "center" }}>
                            <button className={`btn sm${chosen ? "" : " ghost"}`}
                              disabled={busy === `t${i}`}
                              title={chosen ? "Bỏ chọn cặp này" : "Đặt cặp này làm tiêu đề+hook chính"}
                              onClick={() => choose("title_idx", chosen ? null : i, i)}>
                              {busy === `t${i}` ? "…" : (chosen ? "★" : "☆")}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <div className="muted-note">Chưa có tiêu đề.</div>}

          <div className="k">📝 Mô tả ({descs.length})</div>
          {descs.length ? descs.map((desc, i) => (
            <div className="copybox" key={i} style={i === cd ? { borderColor: "var(--green)", background: "rgba(52,211,153,.08)" } : undefined}>
              <div className="t">{i === cd ? "★ " : ""}{desc}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button className="btn sm" onClick={() => copy(desc, "Đã copy mô tả")}>Copy</button>
                {d.authed && (
                  <button className={`btn sm${i === cd ? "" : " ghost"}`}
                    disabled={busy === `d${i}`}
                    title={i === cd ? "Bỏ chọn mô tả này" : "Đặt mô tả này làm chính"}
                    onClick={() => choose("desc_idx", i === cd ? null : i, i)}>
                    {busy === `d${i}` ? "…" : (i === cd ? "★ Đang dùng" : "☆ Chọn")}
                  </button>
                )}
              </div>
            </div>
          )) : <div className="muted-note">Chưa có.</div>}
        </div>
      </div>
    </div>
  );
}
