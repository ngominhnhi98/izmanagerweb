"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const KIND = {
  ok: ["🟢", "dùng được", "var(--green)"],
  rate: ["🟡", "còn tốt, đang hết lượt", "var(--amber)"],
  denied: ["⛔", "bị chặn", "var(--red)"],
  error: ["❌", "lỗi", "var(--red)"],
};

export default function KeysPage() {
  const [data, setData] = useState(null);
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [openKey, setOpenKey] = useState(null);
  const [tab, setTab] = useState("keys");
  // ?tab=drive / ?tab=tpl — Google đăng nhập xong quay về đúng tab, link từ khối thumbnail
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("tab");
    if (q) setTab(q);
  }, []);
  const [form, setForm] = useState({ key: "", name: "", tier: "free" });
  const [tg, setTg] = useState({ bot_token: "", chat_id: "", enabled: true, bot_token_set: false });
  const loadTg = useCallback(async () => {
    try {
      const r = await fetch("/api/settings", { cache: "no-store" });
      const j = await r.json();
      if (j?.telegram) setTg((p) => ({ ...p, ...j.telegram }));
    } catch { /* giữ nguyên */ }
  }, []);
  const [rw, setRw] = useState(null);       // {modes, langs, allowed_placeholders}
  const [rwEdit, setRwEdit] = useState(null); // {key,label,template} đang sửa (mode)
  const loadRw = useCallback(async () => {
    try {
      const r = await fetch("/api/rewrite", { cache: "no-store" });
      if (r.ok) setRw(await r.json());
    } catch { /* giữ nguyên */ }
  }, []);

  const [ready, setReady] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/keys", { cache: "no-store" });
      const j = await r.json();
      if (r.status === 401) { setAuthed(false); setData(null); }
      else { setData(j); setAuthed(!!j.authed); }
    } catch { /* giữ dữ liệu cũ */ }
    finally { setReady(true); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  useEffect(() => { loadTg(); }, [loadTg]);
  useEffect(() => { loadRw(); }, [loadRw]);

  async function saveMode(m) {
    await call("/api/rewrite", { method: "POST", body: JSON.stringify({ kind: "mode", ...m }) });
    await loadRw(); setRwEdit(null); flash("✓ Đã lưu chế độ (prompt)");
  }
  async function delMode(key) {
    if (!confirm(`Xoá chế độ "${key}"? Job cũ vẫn chạy (fallback), job mới không chọn được nữa.`)) return;
    await call(`/api/rewrite?kind=mode&key=${encodeURIComponent(key)}`, { method: "DELETE" });
    await loadRw(); flash("✓ Đã xoá chế độ");
  }
  async function rollbackMode(key) {
    if (!confirm(`Khôi phục bản prompt TRƯỚC ĐÓ cho "${key}"?`)) return;
    await call("/api/rewrite", { method: "POST", body: JSON.stringify({ kind: "rollback", key, idx: 0 }) });
    await loadRw(); setRwEdit(null); flash("✓ Đã khôi phục bản trước");
  }
  async function saveLang(l) {
    await call("/api/rewrite", { method: "POST", body: JSON.stringify({ kind: "lang", ...l }) });
    await loadRw(); flash("✓ Đã lưu ngôn ngữ");
  }
  async function delLang(key) {
    if (!confirm(`Xoá ngôn ngữ "${key}"?`)) return;
    await call(`/api/rewrite?kind=lang&key=${encodeURIComponent(key)}`, { method: "DELETE" });
    await loadRw(); flash("✓ Đã xoá ngôn ngữ");
  }

  function flash(m) { setMsg(m); setTimeout(() => setMsg(""), 2600); }

  async function call(url, opts) {
    setBusy(true);
    try {
      const r = await fetch(url, { headers: { "content-type": "application/json" }, ...opts });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      await load();
      return j;
    } catch (e) {
      flash("⚠ " + e.message);
      throw e;
    } finally { setBusy(false); }
  }

  async function login(e) {
    e.preventDefault();
    try {
      await call("/api/auth", { method: "POST", body: JSON.stringify({ password: pw }) });
      setPw(""); flash("✓ Đã mở khoá");
    } catch { /* thông báo đã hiện */ }
  }
  async function logout() { await call("/api/auth", { method: "DELETE" }); flash("Đã khoá lại"); }

  async function addKey(e) {
    e.preventDefault();
    if (!form.key.trim()) return flash("⚠ Chưa nhập API key");
    await call("/api/keys", { method: "POST", body: JSON.stringify(form) });
    setForm({ key: "", name: "", tier: "free" }); flash("✓ Đã thêm key");
  }
  const patchKey = (id, body) => call(`/api/keys/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  async function delKey(id, name) {
    if (!confirm(`Xoá key "${name}"? Số liệu dùng của nó cũng mất.`)) return;
    await call(`/api/keys/${id}`, { method: "DELETE" }); flash("✓ Đã xoá");
  }
  const setLimit = (tier, model, field, value) =>
    call("/api/keys", { method: "PATCH", body: JSON.stringify({ tier, model, [field]: value }) });

  async function saveTg(e) {
    if (e) e.preventDefault();
    await call("/api/settings", { method: "POST", body: JSON.stringify(tg) });
    await loadTg(); flash("✓ Đã lưu cấu hình Telegram");
  }
  async function testTg() {
    setBusy(true);
    try {
      const r = await fetch("/api/settings/test-telegram", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ bot_token: tg.bot_token, chat_id: tg.chat_id }) });
      const j = await r.json().catch(() => ({}));
      flash(r.ok ? "✓ Đã gửi tin test — kiểm tra group Telegram" : "⚠ " + (j.error || `HTTP ${r.status}`));
    } catch (e) { flash("⚠ " + e.message); }
    finally { setBusy(false); }
  }

  // CHƯA ĐĂNG NHẬP → chỉ có ô mật khẩu, không lộ số liệu nào
  if (!ready) return <div className="wrap"><div className="empty">Đang tải…</div></div>;
  if (!authed || !data) {
    return (
      <div className="wrap">
        <div className="hd">
          <div className="logo">🔑</div>
          <div className="brand">
            <h1>Quản lý Gemini API key</h1>
            <p>Cần mật khẩu quản trị để xem và sửa</p>
          </div>
          <a className="btn ghost" style={{ marginLeft: "auto" }} href="/">← Dashboard</a>
        </div>
        <form className="card" onSubmit={login}
          style={{ padding: 22, display: "flex", gap: 10, alignItems: "center",
                   flexWrap: "wrap", maxWidth: 560, margin: "40px auto" }}>
          <span style={{ fontSize: 26 }}>🔒</span>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
            placeholder="mật khẩu quản trị" style={{ flex: 1, minWidth: 200 }} autoFocus />
          <button className="btn primary" disabled={busy}>Mở khoá</button>
        </form>
        {msg && <div className="toast">{msg}</div>}
      </div>
    );
  }
  const { keys, stats, limits, day } = data;
  const best = Object.entries(stats.left_by_model)[0];

  return (
    <div className="wrap">
      <div className="hd">
        <div className="logo">🔑</div>
        <div className="brand">
          <h1>Cài đặt</h1>
          <p>
            Pool dùng chung cho MỌI máy · {stats.enabled}/{stats.total} key bật
            {stats.denied > 0 && <> · <b style={{ color: "var(--red)" }}>{stats.denied} key chết</b></>}
            {" "}· còn <b>{stats.left_total.toLocaleString()}</b> lượt hôm nay ({day})
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <a className="btn ghost" href="/">← Dashboard</a>
          <button className="btn ghost" onClick={logout}>🔒 Khoá lại</button>
        </div>
      </div>

      <div className="filters" style={{ marginTop: 16 }}>
        {[["keys", `🔑 Key (${stats.total})`], ["allow", "🎯 Model theo tài khoản"],
          ["limits", "⚙ Hạn mức"], ["bot", "📣 Thông báo Telegram"], ["drive", "☁ Google Drive"], ["tpl", "🔤 Mẫu chữ thumbnail"],
          ["rwp", "📝 Prompt rewrite"]].map(([k, l]) => (
          <button key={k} className={"btn" + (tab === k ? " primary" : " ghost")}
            onClick={() => setTab(k)}>{l}</button>
        ))}
        {best && (
          <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 12 }}>
            Model tốt nhất còn <b style={{ color: best[1] > 0 ? "var(--green)" : "var(--red)" }}>
              {best[1]}</b> lượt
          </span>
        )}
      </div>

      {tab === "keys" && (
        <>
          {authed && (
            <form className="card" onSubmit={addKey}
              style={{ padding: 14, display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              <input placeholder="AIzaSy… (dán API key)" value={form.key} style={{ flex: 2, minWidth: 260 }}
                onChange={(e) => setForm({ ...form, key: e.target.value })} />
              <input placeholder="tên gợi nhớ" value={form.name} style={{ flex: 1, minWidth: 140 }}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
                <option value="free">Tài khoản free</option>
                <option value="pro">Tài khoản pro</option>
              </select>
              <button className="btn primary" disabled={busy}>➕ Thêm key</button>
            </form>
          )}

          {keys.length === 0 && <div className="card"><div className="empty">
            Pool chưa có key nào. {authed ? "Dán key vào ô trên để thêm." : "Mở khoá để thêm key."}
          </div></div>}

          {keys.map((k) => {
            const dead = k.status === "denied";
            const open = openKey === k.id;
            return (
              <div className="card" key={k.id} style={{ padding: 14, marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 18 }}>{dead ? "⛔" : k.enabled ? "🟢" : "⏸"}</span>
                  <b>{k.name}</b>
                  <span className={"badge " + (k.tier === "pro" ? "b-run" : "b-idle")}>{k.tier}</span>
                  <code style={{ color: "var(--muted)", fontSize: 12 }}>{k.key_masked}</code>
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>
                    đã gọi hôm nay: <b style={{ color: "var(--text)" }}>{k.used_today}</b>
                  </span>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button className="btn sm ghost" onClick={() => setOpenKey(open ? null : k.id)}>
                      {open ? "▲ Ẩn" : "▼ Chi tiết từng model"}
                    </button>
                    {authed && <>
                      <select className="btn sm" value={k.tier}
                        onChange={(e) => patchKey(k.id, { tier: e.target.value })}>
                        <option value="free">free</option><option value="pro">pro</option>
                      </select>
                      <button className="btn sm" onClick={() => patchKey(k.id, { enabled: !k.enabled })}>
                        {k.enabled ? "⏸ Tắt" : "▶ Bật"}
                      </button>
                      <button className="btn sm" onClick={() => {
                        const n = prompt("Tên mới:", k.name); if (n) patchKey(k.id, { name: n });
                      }}>✎ Đổi tên</button>
                      <button className="btn sm danger" onClick={() => delKey(k.id, k.name)}>🗑 Xoá</button>
                    </>}
                  </div>
                </div>

                {dead && (
                  <div className="callout" style={{ marginTop: 10 }}>
                    ⛔ <b>Key này đang bị chặn</b> — {k.check_message || "403 PERMISSION_DENIED"}
                    <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
                      Thường do: chưa bật Generative Language API cho project, hoặc key bị giới
                      hạn API (Cloud Console → Credentials → API restrictions).
                      {authed && <> Sửa xong thì <a href="#" onClick={(e) => {
                        e.preventDefault(); patchKey(k.id, { reset_status: true });
                      }}>bấm đây để thử lại</a>.</>}
                    </div>
                  </div>
                )}

                {open && (
                  <div style={{ overflowX: "auto", marginTop: 12 }}>
                    <table className="mtable">
                      <thead><tr>
                        <th>Model (tốt → kém)</th><th style={{ width: 190 }}>Đã gọi / RPD hôm nay</th>
                        <th style={{ width: 90 }}>RPM</th><th style={{ width: 150 }}>Trạng thái</th>
                      </tr></thead>
                      <tbody>
                        {k.models.map((m) => {
                          const pct = m.rpd_limit ? Math.min(100, (m.rpd / m.rpd_limit) * 100) : 0;
                          const over = m.rpd_exhausted || m.denied;
                          return (
                            <tr key={m.model}>
                              <td><b>{m.label}</b>
                                <div style={{ color: "var(--muted2)", fontSize: 11 }}>{m.model}</div></td>
                              <td>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <div className="bar" style={{ flex: 1, width: "auto" }}>
                                    <i style={{ width: pct + "%", background: over ? "var(--red)" : undefined }} />
                                  </div>
                                  <span style={{ fontSize: 12, minWidth: 62 }}>{m.rpd} / {m.rpd_limit}</span>
                                </div>
                              </td>
                              <td style={{ color: "var(--muted)", fontSize: 12 }}>{m.rpm_limit}/phút</td>
                              <td style={{ fontSize: 12 }}>
                                {m.unavailable ? <span style={{ color: "var(--muted2)" }}>key không có model này</span>
                                  : m.denied ? <span style={{ color: "var(--red)" }}>⛔ bị chặn</span>
                                  : m.rpd_exhausted ? <span style={{ color: "var(--red)" }}>cạn ngày</span>
                                    : m.cooling_sec > 0 ? <span style={{ color: "var(--amber)" }}>
                                      chờ RPM {m.cooling_sec}s</span>
                                      : <span style={{ color: "var(--green)" }}>sẵn sàng</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {tab === "allow" && (
        <div className="card" style={{ padding: 14 }}>
          <div className="muted-note" style={{ marginBottom: 12 }}>
            Chọn model mà từng LOẠI tài khoản được dùng. Key <b>free</b> nên giới hạn ít model:
            mỗi Flash chỉ 20 lượt/ngày, thử lan man 8 model là tốn lượt vào những model rồi cũng
            cạn ngay. Key <b>pro</b> mở rộng ra nhiều model tốt hơn.
            Hệ luôn dùng model xếp trên trước, hết SẠCH key của model đó mới hạ xuống dưới.
            {!authed && <b> Mở khoá để sửa.</b>}
          </div>
          {["free", "pro"].map((tier) => {
            const on = new Set(data.allow[tier] || []);
            return (
              <div key={tier} style={{ marginBottom: 18 }}>
                <div className="k">Tài khoản {tier} — đang bật {on.size}/{data.catalog.length} model</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {data.catalog.map((m, i) => (
                    <label key={m.id} className="trow" style={{ cursor: authed ? "pointer" : "default" }}>
                      <span className="num">#{i + 1}</span>
                      <input type="checkbox" checked={on.has(m.id)} disabled={!authed || busy}
                        style={{ width: 16, height: 16, accentColor: "var(--accent)" }}
                        onChange={(e) => {
                          const next = new Set(on);
                          e.target.checked ? next.add(m.id) : next.delete(m.id);
                          if (!next.size) return flash("⚠ Phải giữ ít nhất 1 model");
                          call("/api/keys", { method: "PATCH",
                            body: JSON.stringify({ tier, allow: [...next] }) })
                            .then(() => flash("✓ Đã lưu gói model"));
                        }} />
                      <span className="txt"><b>{m.label}</b>
                        <span style={{ color: "var(--muted2)", fontSize: 11 }}> · {m.id}</span></span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "limits" && (
        <div className="card" style={{ padding: 14 }}>
          <div className="muted-note" style={{ marginBottom: 12 }}>
            Hạn mức <b>free</b> lấy đúng theo bảng Rate Limit của AI Studio. Hạn mức <b>pro</b> là
            số khởi tạo — Google không công bố cùng chỗ và khác nhau theo hạng, nên bạn nhập số
            thật của tài khoản mình vào đây. {!authed && <b>Mở khoá để sửa.</b>}
          </div>
          {["free", "pro"].map((tier) => (
            <div key={tier} style={{ marginBottom: 18 }}>
              <div className="k">Tài khoản {tier}</div>
              <div style={{ overflowX: "auto" }}>
                <table className="mtable">
                  <thead><tr><th>Model</th><th style={{ width: 130 }}>RPM</th>
                    <th style={{ width: 150 }}>RPD</th><th style={{ width: 150 }}>TPM</th></tr></thead>
                  <tbody>
                    {limits[tier].map((m) => (
                      <tr key={m.id}>
                        <td><b>{m.label}</b>
                          <div style={{ color: "var(--muted2)", fontSize: 11 }}>{m.id}</div></td>
                        {["rpm", "rpd", "tpm"].map((f) => (
                          <td key={f}>
                            <input type="number" min="0" defaultValue={m[f]} disabled={!authed || busy}
                              style={{ width: "100%", padding: "6px 8px", fontSize: 13 }}
                              onBlur={(e) => {
                                const v = Number(e.target.value);
                                if (Number.isFinite(v) && v !== m[f]) {
                                  setLimit(tier, m.id, f, v).then(() => flash("✓ Đã lưu hạn mức"));
                                }
                              }} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "bot" && (
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ margin: "0 0 6px" }}>📣 Thông báo Telegram khi TTS xong</h3>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0 }}>
            Khi 1 task TTS xong (đã bắn audio về máy local, CapCut được) → bot bắn tin vào group.
            Cron chạy mỗi phút (Cloudflare Worker → endpoint này).
          </p>
          {!authed && (
            <div className="callout" style={{ marginBottom: 12 }}>
              🔒 Mở khoá (nhập mật khẩu) mới sửa được cấu hình. {tg.bot_token_set
                ? "Bot token đã được đặt." : "Chưa đặt bot token."}
            </div>
          )}
          <form onSubmit={saveTg} style={{ display: "grid", gap: 12, maxWidth: 620 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>Bot token (từ @BotFather)</span>
              <input type="password" placeholder="123456:ABC-..." value={tg.bot_token}
                disabled={!authed}
                onChange={(e) => setTg({ ...tg, bot_token: e.target.value })} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>
                Group chat id (vd -1001234567890 · thêm bot vào group, dùng @RawDataBot để lấy)
              </span>
              <input placeholder="-100..." value={tg.chat_id} disabled={!authed}
                onChange={(e) => setTg({ ...tg, chat_id: e.target.value })} />
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={!!tg.enabled} disabled={!authed}
                onChange={(e) => setTg({ ...tg, enabled: e.target.checked })} />
              <span>Bật gửi thông báo</span>
            </label>
            {authed && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn primary" disabled={busy}>💾 Lưu</button>
                <button type="button" className="btn ghost" disabled={busy}
                  onClick={testTg}>✈ Gửi tin test</button>
              </div>
            )}
          </form>
        </div>
      )}

      {tab === "drive" && <DriveTab />}
      {tab === "tpl" && <TemplatesTab />}

      {tab === "rwp" && (
        <div style={{ display: "grid", gap: 14 }}>
          <div className="card" style={{ padding: 14 }}>
            <h3 style={{ margin: "0 0 8px" }}>🌐 Ngôn ngữ đích (dropdown ở tool)</h3>
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0 }}>
              <b>value</b> = tên ngôn ngữ đưa cho AI (vd Korean, Thai, Arabic). <b>label</b> = tên hiện trong app.
            </p>
            <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
              <thead><tr style={{ color: "var(--muted)", textAlign: "left" }}>
                <th style={{ padding: 6 }}>Key</th><th>Label</th><th>Value (cho AI)</th><th>Bật</th><th></th>
              </tr></thead>
              <tbody>
                {(rw?.langs || []).map((l) => (
                  <tr key={l.key} style={{ borderTop: "1px solid var(--border,#2a2f3a)" }}>
                    <td style={{ padding: 6 }}><code>{l.key}</code></td>
                    <td>{l.label}</td><td><code>{l.value}</code></td>
                    <td><input type="checkbox" checked={l.enabled}
                      onChange={(e) => saveLang({ ...l, enabled: e.target.checked })} /></td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn sm danger" onClick={() => delLang(l.key)}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <LangAdder onAdd={saveLang} />
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h3 style={{ margin: 0 }}>📝 Chế độ / Prompt</h3>
              <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: "auto" }}>
                Biến cho phép: {(rw?.allowed_placeholders || []).map((p) => `{${p}}`).join(" · ")}
              </span>
            </div>
            <p style={{ color: "var(--muted)", fontSize: 13 }}>
              Mỗi chế độ = 1 prompt (ngôn ngữ là biến <code>{"{target_lang}"}</code>). Sửa lưu vào DB —
              tool tự dùng. Bắt buộc có <code>{"{target_lang}"}</code>, <code>{"{stt_list}"}</code>,
              <code>{"{subtitles_data}"}</code> và marker <b>Subtitle Rows to Process:</b>.
            </p>
            {(rw?.modes || []).map((m) => {
              const ed = rwEdit?.key === m.key;
              return (
                <div key={m.key} className="card" style={{ padding: 12, margin: "8px 0" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <b>{m.label}</b> <code style={{ color: "var(--muted)" }}>{m.key}</code>
                    {!m.enabled && <span style={{ color: "var(--amber)" }}>(tắt)</span>}
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>
                      · {m.history} bản lịch sử</span>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                      <button className="btn sm" onClick={() => setRwEdit(ed ? null
                        : { key: m.key, label: m.label, template: m.template, enabled: m.enabled })}>
                        {ed ? "▲ Đóng" : "✎ Sửa prompt"}</button>
                      {m.history > 0 && <button className="btn sm ghost"
                        onClick={() => rollbackMode(m.key)}>↩ Khôi phục bản trước</button>}
                      <button className="btn sm danger" onClick={() => delMode(m.key)}>🗑</button>
                    </div>
                  </div>
                  {ed && (
                    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <input value={rwEdit.label} placeholder="Tên hiện trong app"
                          onChange={(e) => setRwEdit({ ...rwEdit, label: e.target.value })}
                          style={{ flex: 1, minWidth: 180 }} />
                        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input type="checkbox" checked={rwEdit.enabled !== false}
                            onChange={(e) => setRwEdit({ ...rwEdit, enabled: e.target.checked })} /> Bật
                        </label>
                      </div>
                      <textarea value={rwEdit.template} spellCheck={false}
                        onChange={(e) => setRwEdit({ ...rwEdit, template: e.target.value })}
                        style={{ width: "100%", minHeight: 320, fontFamily: "monospace", fontSize: 12 }} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn primary" disabled={busy}
                          onClick={() => saveMode(rwEdit)}>💾 Lưu prompt</button>
                        <button className="btn ghost" onClick={() => setRwEdit(null)}>Huỷ</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <ModeAdder onAdd={saveMode} />
          </div>
        </div>
      )}

      {msg && <div className="toast">{msg}</div>}
    </div>
  );
}

// ── ☁ Google Drive TRUNG TÂM — chứa mẫu chữ + ảnh thumbnail ─────────────────────────
// Đăng nhập bằng Google Identity Services (popup), giống Youtube_Check. Popup trả về
// authorization CODE (không phải access token) → gửi lên server đổi lấy REFRESH TOKEN để tool
// pipeline (máy khác, lúc khác) upload được, và web xoá được ảnh không chọn.
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const DRIVE_SCOPE_GIS = "https://www.googleapis.com/auth/drive.file";

function loadGis() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const ex = document.getElementById("gis-script");
    if (ex) { ex.addEventListener("load", () => resolve()); ex.addEventListener("error", reject); return; }
    const el = document.createElement("script");
    el.src = "https://accounts.google.com/gsi/client"; el.async = true; el.defer = true; el.id = "gis-script";
    el.onload = () => resolve(); el.onerror = reject;
    document.body.appendChild(el);
  });
}

function DriveTab() {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState(null);
  const codeClient = useRef(null);
  const load = useCallback(async () => {
    try { const r = await fetch("/api/gdrive", { cache: "no-store" }); setSt(await r.json()); } catch { /* giữ nguyên */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function connect() {
    setNote(null);
    if (!CLIENT_ID) return setNote(["Server chưa đặt NEXT_PUBLIC_GOOGLE_CLIENT_ID", "var(--red)"]);
    setBusy("connect");
    try {
      await loadGis();
      // access_type=offline mặc định ở code model → Google trả refresh token khi consent lần đầu.
      codeClient.current ||= window.google.accounts.oauth2.initCodeClient({
        client_id: CLIENT_ID, scope: DRIVE_SCOPE_GIS, ux_mode: "popup",
        callback: async (resp) => {
          if (resp.error || !resp.code) { setBusy(""); setNote([`Đăng nhập bị huỷ (${resp.error || "không có code"})`, "var(--amber)"]); return; }
          try {
            const r = await fetch("/api/gdrive/exchange", {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: resp.code }),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) setNote([j.error || `HTTP ${r.status}`, "var(--red)"]);
            else setNote([`✓ Đã kết nối ${j.email || ""}`, "var(--green)"]);
            await load();
          } finally { setBusy(""); }
        },
      });
      codeClient.current.requestCode();
    } catch (e) {
      setBusy(""); setNote([`Không tải được Google popup: ${String(e?.message || e)}`, "var(--red)"]);
    }
  }
  async function act(action, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(action);
    try {
      const r = await fetch("/api/gdrive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setNote([j.error || `HTTP ${r.status}`, "var(--red)"]);
      else if (action === "clean_orphans") setNote([`Đã xoá ${j.deleted} file · còn ${j.failed} chưa xoá được`, j.failed ? "var(--amber)" : "var(--green)"]);
      else setNote(["Đã đăng xuất Google Drive", "var(--amber)"]);
      await load();
    } finally { setBusy(""); }
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <div className="card" style={{ padding: 16, display: "grid", gap: 12, maxWidth: 820 }}>
      <h3 style={{ margin: 0 }}>☁ Google Drive trung tâm — chứa mẫu chữ & ảnh thumbnail</h3>
      {note && <div style={{ color: note[1], fontSize: 13 }}>{note[0]}</div>}
      {!st ? <div style={{ color: "var(--muted)" }}>Đang tải…</div> : (
        <>
          <div style={{ fontSize: 14 }}>
            {st.connected
              ? <>🟢 Đã kết nối: <b>{st.email || "(không rõ email)"}</b>
                {st.connected_at ? <span style={{ color: "var(--muted)", fontSize: 12 }}> · từ {new Date(st.connected_at).toLocaleString("vi-VN")}</span> : null}</>
              : <>⚪ Chưa kết nối</>}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn primary" disabled={!!busy || !st.client_id} onClick={connect}>
              {busy === "connect" ? "Đang mở…" : st.connected ? "🔁 Đăng nhập lại / đổi tài khoản" : "🔑 Đăng nhập Google Drive"}</button>
            {st.connected && (
              <button className="btn ghost" disabled={!!busy} onClick={() => act("logout",
                "Đăng xuất Google Drive?\n\nẢnh thumbnail đang chờ chọn sẽ KHÔNG xoá được nữa nếu sau đó đăng nhập tài khoản khác (Drive chỉ cho chủ file xoá).")}>
                Đăng xuất</button>)}
          </div>
          {!st.client_id && <div style={{ color: "var(--red)", fontSize: 13 }}>Server chưa đặt NEXT_PUBLIC_GOOGLE_CLIENT_ID.</div>}
          {st.client_id && !st.has_secret && <div style={{ color: "var(--amber)", fontSize: 13 }}>Đăng nhập được nhưng server chưa đặt GOOGLE_CLIENT_SECRET nên chưa lưu được — xem hướng dẫn dưới.</div>}
          {st.orphans > 0 && (
            <div style={{ fontSize: 13 }}>⚠ Có <b>{st.orphans}</b> file trước đây xoá không được.{" "}
              <button className="btn sm" disabled={!!busy} onClick={() => act("clean_orphans")}>
                {busy === "clean_orphans" ? "Đang dọn…" : "🧹 Thử xoá lại"}</button></div>)}
          <div className="muted-note" style={{ fontSize: 12, lineHeight: 1.6 }}>
            Mẫu chữ bạn upload và ảnh extension tạo đều nằm trong Drive của tài khoản này (thư mục <code>IzPipeline/</code>).
            Tool pipeline dùng CHUNG đăng nhập này để upload ảnh — nhờ vậy web xoá được các ảnh bạn không chọn.
            Nên dùng một tài khoản Google riêng cho việc này.
          </div>
          {(!st.client_id || !st.has_secret) && (
            <div className="muted-note" style={{ fontSize: 12, lineHeight: 1.7 }}>
              <b>Cấu hình một lần</b> (dùng lại OAuth client "Web application" của Youtube_Check trong cùng project):<br />
              1. Google Cloud Console → Credentials → mở client Web đó → thêm <code>{origin}</code> vào <b>Authorized JavaScript origins</b> → Save.<br />
              2. Vercel → Settings → Environment Variables:
              <code> NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> (= client id đó),
              <code> GOOGLE_CLIENT_SECRET</code> (Client secret của client đó) → Redeploy.<br />
              Không cần đăng ký redirect URI: popup dùng <code>postmessage</code>.
            </div>)}
        </>
      )}
    </div>
  );
}

// ── 🔤 Mẫu chữ thumbnail ──────────────────────────────────────────────────────────
async function prepTemplate(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const okType = ["image/png", "image/jpeg", "image/webp"].includes(file.type);
  if (scale === 1 && okType && file.size <= 3.5 * 1024 * 1024) return { blob: file, w: bmp.width, h: bmp.height };
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d").drawImage(bmp, 0, 0, w, h);
  const toBlob = (type, q) => new Promise((res) => c.toBlob(res, type, q));
  // PNG giữ nền trong suốt của mẫu chữ; vẫn quá nặng (Vercel cắt body ở 4,5 MB) thì WEBP, vẫn giữ trong suốt
  let blob = await toBlob(file.type === "image/jpeg" ? "image/jpeg" : "image/png", 0.92);
  if (blob.size > 3.8 * 1024 * 1024) blob = await toBlob("image/webp", 0.92);
  return { blob, w, h };
}

function TemplatesTab() {
  const [items, setItems] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);
  const load = useCallback(async () => {
    try { const r = await fetch("/api/thumb/templates", { cache: "no-store" }); setItems((await r.json()).items || []); }
    catch { setItems([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  async function upload(file) {
    if (!file) return;
    setBusy("upload"); setMsg(null);
    try {
      const { blob, w, h } = await prepTemplate(file);
      const ext = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png";
      const fd = new FormData();
      fd.append("file", blob, `template.${ext}`);
      fd.append("name", name.trim() || file.name.replace(/\.[^.]+$/, ""));
      fd.append("w", String(w)); fd.append("h", String(h));
      const r = await fetch("/api/thumb/templates", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setName(""); setMsg(["✓ Đã thêm mẫu chữ", "var(--green)"]);
      await load();
    } catch (e) { setMsg([String(e.message || e), "var(--red)"]); }
    finally { setBusy(""); if (fileRef.current) fileRef.current.value = ""; }
  }
  async function patch(t, body) {
    const r = await fetch(`/api/thumb/templates/${t.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!r.ok) setMsg([(await r.json().catch(() => ({}))).error || `HTTP ${r.status}`, "var(--red)"]);
    await load();
  }
  async function del(t) {
    if (!window.confirm(`Xoá mẫu "${t.name}"? File trên Drive cũng bị xoá.`)) return;
    const r = await fetch(`/api/thumb/templates/${t.id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setMsg([j.error || `HTTP ${r.status}`, "var(--red)"]);
    else if (j.failed) setMsg(["Đã bỏ khỏi thư viện nhưng file trên Drive chưa xoá được (xem tab ☁ Google Drive)", "var(--amber)"]);
    await load();
  }
  return (
    <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
      <h3 style={{ margin: 0 }}>🔤 Mẫu chữ thumbnail</h3>
      <div className="muted-note" style={{ fontSize: 12 }}>
        Ảnh mẫu để model chép <b>font, màu, viền, bóng</b> của chữ — không chép nội dung chữ trong mẫu. Nên dùng ảnh chỉ có
        một dòng chữ mẫu, nền trong suốt hoặc nền trơn. Ảnh lưu vào Drive trung tâm (tab ☁ Google Drive).
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input value={name} placeholder="Tên mẫu (vd: Vàng viền đỏ)" onChange={(e) => setName(e.target.value)} style={{ flex: "1 1 220px" }} />
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
        <button className="btn primary" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          {busy === "upload" ? "Đang upload…" : "⬆ Upload mẫu chữ"}</button>
      </div>
      {msg && <div style={{ color: msg[1], fontSize: 13 }}>{msg[0]}</div>}
      {items === null ? <div style={{ color: "var(--muted)" }}>Đang tải…</div>
        : items.length === 0 ? <div className="empty">Chưa có mẫu chữ nào.</div> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {items.map((t) => (
              <div key={t.id} className="card" style={{ padding: 0, overflow: "hidden", opacity: t.enabled ? 1 : 0.55 }}>
                <div style={{ background: "repeating-conic-gradient(#8883 0% 25%, transparent 0% 50%) 50% / 16px 16px" }}>
                  <img src={t.img} alt={t.name} style={{ display: "block", width: "100%", height: 110, objectFit: "contain" }} />
                </div>
                <div style={{ padding: 10, display: "grid", gap: 6 }}>
                  <b style={{ fontSize: 13 }}>{t.name}</b>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    {t.w && t.h ? `${t.w}×${t.h} · ` : ""}{Math.round((t.bytes || 0) / 1024)} KB · dùng {t.uses} lần</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button className="btn sm ghost" onClick={() => { const v = window.prompt("Tên mẫu", t.name); if (v && v.trim()) patch(t, { name: v.trim() }); }}>✎ Đổi tên</button>
                    <button className="btn sm ghost" onClick={() => patch(t, { enabled: !t.enabled })}>{t.enabled ? "Tắt" : "Bật"}</button>
                    <button className="btn sm ghost" onClick={() => del(t)}>🗑 Xoá</button>
                  </div>
                </div>
              </div>))}
          </div>)}
    </div>
  );
}

function LangAdder({ onAdd }) {
  const [f, setF] = useState({ key: "", label: "", value: "" });
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
      <input placeholder="key (vd ja)" value={f.key} style={{ width: 100 }}
        onChange={(e) => setF({ ...f, key: e.target.value })} />
      <input placeholder="Label (vd Tiếng Nhật)" value={f.label} style={{ flex: 1, minWidth: 140 }}
        onChange={(e) => setF({ ...f, label: e.target.value })} />
      <input placeholder="Value cho AI (vd Japanese)" value={f.value} style={{ flex: 1, minWidth: 140 }}
        onChange={(e) => setF({ ...f, value: e.target.value })} />
      <button className="btn" onClick={() => { onAdd({ ...f }); setF({ key: "", label: "", value: "" }); }}>
        ➕ Thêm ngôn ngữ</button>
    </div>
  );
}

function ModeAdder({ onAdd }) {
  const [f, setF] = useState({ key: "", label: "", template: "" });
  const [open, setOpen] = useState(false);
  if (!open) return <button className="btn" onClick={() => setOpen(true)}>➕ Thêm chế độ mới</button>;
  return (
    <div className="card" style={{ padding: 12, marginTop: 8, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input placeholder="key (vd gaming)" value={f.key} style={{ width: 140 }}
          onChange={(e) => setF({ ...f, key: e.target.value })} />
        <input placeholder="Label (vd Gaming)" value={f.label} style={{ flex: 1, minWidth: 160 }}
          onChange={(e) => setF({ ...f, label: e.target.value })} />
      </div>
      <textarea placeholder="Dán prompt (phải có {target_lang}, {stt_list}, {subtitles_data} + marker Subtitle Rows to Process:)"
        value={f.template} spellCheck={false}
        onChange={(e) => setF({ ...f, template: e.target.value })}
        style={{ width: "100%", minHeight: 220, fontFamily: "monospace", fontSize: 12 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn primary" onClick={() => { onAdd({ ...f, enabled: true }); setF({ key: "", label: "", template: "" }); setOpen(false); }}>
          💾 Tạo chế độ</button>
        <button className="btn ghost" onClick={() => setOpen(false)}>Huỷ</button>
      </div>
    </div>
  );
}
