"use client";
// Trình sửa chữ thumbnail: gõ text + nhiều style (font/đậm/nghiêng/cỡ/màu/gradient/viền/bóng/khung
// nền/độ mờ/xoay/giãn dòng-chữ), KÉO–THẢ vị trí chữ; xem realtime trên TẤT CẢ ảnh; slide qua ảnh;
// xuất ảnh (tải máy) hoặc lưu lên Drive (trả link + copy).
import { useCallback, useEffect, useRef, useState } from "react";

const proxy = (driveId) => `/api/thumb/img?id=${encodeURIComponent(driveId)}`;

// Font Google — ưu tiên loại đậm/tiêu đề, đa số hỗ trợ tiếng Việt (một số latin-ext có thể thiếu vài dấu).
const GF = [
  "Be Vietnam Pro", "Montserrat", "Oswald", "Roboto", "Anton", "Archivo Black", "Barlow Condensed", "Bungee",
  "Fjalla One", "Kanit", "Lilita One", "Prompt", "Roboto Condensed", "Saira Condensed", "Teko",
  "Baloo 2", "Chakra Petch", "Changa", "Exo 2", "Fredoka", "Sora", "Passion One", "Paytone One",
  "Squada One", "Staatliches", "Titan One", "Alfa Slab One", "Bebas Neue", "Rowdies",
];
const SYS = ["Arial Black", "Arial", "Tahoma", "Verdana", "Georgia", "Times New Roman", "Impact"];
const FONTS = [...GF, ...SYS];
const GF_LINK =
  "https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Anton&family=Archivo+Black&family=Baloo+2:wght@700;800&family=Barlow+Condensed:wght@700;800&family=Be+Vietnam+Pro:wght@700;800;900&family=Bebas+Neue&family=Bungee&family=Chakra+Petch:wght@700&family=Changa:wght@700;800&family=Exo+2:wght@800;900&family=Fjalla+One&family=Fredoka:wght@600;700&family=Kanit:wght@700;800;900&family=Lilita+One&family=Montserrat:wght@800;900&family=Oswald:wght@600;700&family=Passion+One:wght@700;900&family=Paytone+One&family=Prompt:wght@700;800&family=Roboto:wght@700;900&family=Roboto+Condensed:wght@700&family=Rowdies:wght@700&family=Saira+Condensed:wght@700;800&family=Sora:wght@700;800&family=Squada+One&family=Staatliches&family=Teko:wght@600;700&family=Titan+One&display=swap";

const DEFAULT_STYLE = {
  text: "", font: "Be Vietnam Pro", weight: 900, italic: false, upper: true,
  sizePct: 0.16, lineH: 1.05, letterPct: 0, align: "center",
  fill: "#ffd400", gradient: false, fill2: "#ff7a00",
  stroke: "#000000", strokePct: 0.16,
  shadow: true, shadowColor: "#000000", shadowBlurPct: 0.16, shadowDyPct: 0.06,
  opacity: 1, rotate: 0,
  box: false, boxColor: "#000000", boxOpacity: 0.35, boxPadPct: 0.25, boxRadiusPct: 0.18,
  x: 0.5, y: 0.85,
};

const PRESET_KEY = "izthumb.textPresets";
const loadPresets = () => { try { return JSON.parse(localStorage.getItem(PRESET_KEY) || "[]"); } catch { return []; } };
const savePresets = (p) => { try { localStorage.setItem(PRESET_KEY, JSON.stringify(p)); } catch { /* ignore */ } };
const blobToB64 = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.readAsDataURL(blob); });

// UI nhỏ — định nghĩa NGOÀI component để input không mất focus khi gõ.
const Row = ({ label, children }) => (
  <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" }}>{label}{children}</label>
);
const Sec = ({ title, children }) => (
  <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8, display: "grid", gap: 8 }}>
    <div style={{ fontSize: 11, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--muted2)" }}>{title}</div>
    {children}
  </div>
);

function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function wrapLines(ctx, text, upper, maxW) {
  const raw = (upper ? text.toUpperCase() : text).replace(/\r/g, "");
  const out = [];
  for (const para of raw.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); continue; }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const t = line + " " + words[i];
      if (ctx.measureText(t).width <= maxW) line = t; else { out.push(line); line = words[i]; }
    }
    out.push(line);
  }
  return out;
}

/** Vẽ ảnh (cover) + chữ theo style. Trả bbox chữ (tương đối 0..1, chưa tính xoay) để bắt kéo–thả. */
function drawThumb(ctx, img, W, H, s) {
  ctx.clearRect(0, 0, W, H);
  if (img && img.complete && img.naturalWidth) {
    const ir = img.naturalWidth / img.naturalHeight, cr = W / H;
    let dw, dh; if (ir > cr) { dh = H; dw = H * ir; } else { dw = W; dh = W / ir; }
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else { ctx.fillStyle = "#111"; ctx.fillRect(0, 0, W, H); }

  const size = Math.max(6, s.sizePct * H);
  ctx.save();
  ctx.font = `${s.italic ? "italic " : ""}${s.weight} ${size}px "${s.font}", Arial, sans-serif`;
  ctx.textAlign = s.align; ctx.textBaseline = "middle"; ctx.lineJoin = "round"; ctx.miterLimit = 2;
  try { ctx.letterSpacing = `${(s.letterPct || 0) * size}px`; } catch { /* trình duyệt cũ */ }
  const lines = wrapLines(ctx, s.text || "", s.upper, W * 0.94);
  const lineH = size * s.lineH;
  let widest = 0; for (const l of lines) widest = Math.max(widest, ctx.measureText(l).width);
  const totalH = lineH * lines.length;
  const ax = s.x * W, ay = s.y * H;
  ctx.translate(ax, ay);
  if (s.rotate) ctx.rotate((s.rotate * Math.PI) / 180);
  const tx = s.align === "left" ? -widest / 2 : s.align === "right" ? widest / 2 : 0;

  if (s.box) {
    const pad = s.boxPadPct * size;
    ctx.save(); ctx.globalAlpha = s.boxOpacity; ctx.fillStyle = s.boxColor;
    roundRect(ctx, -widest / 2 - pad, -totalH / 2 - pad, widest + pad * 2, totalH + pad * 2, s.boxRadiusPct * size);
    ctx.fill(); ctx.restore();
  }

  ctx.globalAlpha = s.opacity;
  let y = -totalH / 2 + lineH / 2;
  for (const line of lines) {
    ctx.save();
    if (s.shadow) { ctx.shadowColor = s.shadowColor; ctx.shadowBlur = size * s.shadowBlurPct; ctx.shadowOffsetY = size * s.shadowDyPct; }
    if (s.strokePct > 0) { ctx.lineWidth = size * s.strokePct; ctx.strokeStyle = s.stroke; ctx.strokeText(line, tx, y); ctx.shadowColor = "transparent"; }
    if (s.gradient) { const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2); g.addColorStop(0, s.fill); g.addColorStop(1, s.fill2); ctx.fillStyle = g; }
    else ctx.fillStyle = s.fill;
    ctx.fillText(line, tx, y);
    ctx.restore();
    y += lineH;
  }
  ctx.restore();
  return { x0: (ax - widest / 2) / W, y0: (ay - totalH / 2) / H, x1: (ax + widest / 2) / W, y1: (ay + totalH / 2) / H };
}

export default function ThumbEditor({ cands, startIdx = 0, hook = "", jid, onClose, onSaved }) {
  const [idx, setIdx] = useState(Math.max(0, Math.min(startIdx, cands.length - 1)));
  const [style, setStyle] = useState({ ...DEFAULT_STYLE, text: hook || "" });
  const [fontsReady, setFontsReady] = useState(false);
  const [presets, setPresets] = useState([]);
  const [busy, setBusy] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [saved, setSaved] = useState(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef(null);
  const imgs = useRef(new Map());
  const [, force] = useState(0);
  const drag = useRef(null);
  const bboxRef = useRef(null);
  const idxRef = useRef(idx);
  idxRef.current = idx;

  const set = (patch) => setStyle((s) => ({ ...s, ...patch }));

  useEffect(() => {
    if (!document.getElementById("izt-gf")) {
      const l = document.createElement("link"); l.id = "izt-gf"; l.rel = "stylesheet"; l.href = GF_LINK; document.head.appendChild(l);
    }
    let alive = true;
    Promise.all(GF.map((f) => document.fonts.load(`800 40px "${f}"`).catch(() => null)))
      .then(() => document.fonts.ready).then(() => { if (alive) setFontsReady(true); });
    setPresets(loadPresets());
    return () => { alive = false; };
  }, []);

  // Nạp ảnh ĐANG MỞ trước (ưu tiên), xong rồi PREFETCH các ảnh còn lại ở nền → chuyển ảnh không delay.
  useEffect(() => {
    const first = idxRef.current;
    const order = [first, ...cands.map((_, i) => i).filter((i) => i !== first)];
    let cancelled = false;
    (async () => {
      for (const i of order) {
        if (cancelled) return;
        const c = cands[i];
        if (!c || imgs.current.has(c.drive_id)) continue;
        const im = new Image();
        im.crossOrigin = "anonymous";
        const done = new Promise((res) => { im.onload = () => { force((v) => v + 1); res(); }; im.onerror = () => { force((v) => v + 1); res(); }; });
        im.src = proxy(c.drive_id);
        imgs.current.set(c.drive_id, im);
        force((v) => v + 1);
        if (i === order[0]) await done; // chờ ảnh hiện tại xong rồi mới nạp phần còn lại
      }
    })();
    return () => { cancelled = true; };
  }, [cands]);

  const curImg = imgs.current.get(cands[idx]?.drive_id);
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    bboxRef.current = drawThumb(cv.getContext("2d"), curImg, cv.width, cv.height, style);
  }, [idx, style, fontsReady, curImg, curImg?.complete]);

  const go = useCallback((d) => setIdx((i) => (i + d + cands.length) % cands.length), [cands.length]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "Escape") onClose?.(); else if (e.key === "ArrowLeft") go(-1); else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  function pointerPos(e) { const r = canvasRef.current.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; }
  function onDown(e) {
    const p = pointerPos(e), bb = bboxRef.current, pad = 0.05;
    const inside = bb && p.x >= bb.x0 - pad && p.x <= bb.x1 + pad && p.y >= bb.y0 - pad && p.y <= bb.y1 + pad;
    drag.current = { grab: true, dx: inside ? p.x - style.x : 0, dy: inside ? p.y - style.y : 0 };
    canvasRef.current.setPointerCapture?.(e.pointerId);
  }
  function onMove(e) { if (!drag.current?.grab) return; const p = pointerPos(e); set({ x: Math.min(1, Math.max(0, p.x - drag.current.dx)), y: Math.min(1, Math.max(0, p.y - drag.current.dy)) }); }
  function onUp(e) { drag.current = null; canvasRef.current.releasePointerCapture?.(e.pointerId); }

  async function exportOne(c, download = true) {
    const im = imgs.current.get(c.drive_id);
    const W = im?.naturalWidth || 1280, H = Math.round((W * 9) / 16);
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    drawThumb(cv.getContext("2d"), im, W, H, style);
    const blob = await new Promise((res) => cv.toBlob(res, "image/jpeg", 0.94));
    if (download && blob) { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = `thumb-${c.idx}.jpg`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500); }
    return blob;
  }
  async function exportAll() { setBusy("all"); for (const c of cands) { await exportOne(c, true); await new Promise((r) => setTimeout(r, 400)); } setBusy(""); }

  async function saveToDrive() {
    if (!jid) { setSaveMsg("✗ thiếu mã task"); return; }
    setBusy("save"); setSaveMsg(""); setSaved(null); setCopied(false);
    try {
      const blob = await exportOne(cands[idx], false);
      if (!blob) throw new Error("không dựng được ảnh (ảnh nền chưa tải xong?)");
      const image = await blobToB64(blob);
      const r = await fetch(`/api/jobs/${jid}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ thumb_compose: { image, name: `thumb-${cands[idx].idx}` } }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setSaved({ link: j.link, img: j.img }); setSaveMsg("✓ Đã lưu lên Drive & vào task"); onSaved?.(j);
    } catch (e) { setSaveMsg(`✗ ${e.message || e}`); } finally { setBusy(""); }
  }
  async function copyLink() { try { await navigator.clipboard.writeText(saved.link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } }

  const addPreset = () => {
    const name = window.prompt("Tên preset chữ:", `${style.font} ${style.fill}`); if (!name) return;
    const next = [{ name, style: { ...style, text: "", x: DEFAULT_STYLE.x, y: DEFAULT_STYLE.y } }, ...presets.filter((p) => p.name !== name)].slice(0, 24);
    setPresets(next); savePresets(next);
  };
  const applyPreset = (p) => set({ ...p.style, text: style.text });
  const delPreset = (name) => { const next = presets.filter((p) => p.name !== name); setPresets(next); savePresets(next); };
  const renamePreset = (oldName) => {
    const name = (window.prompt("Đổi tên preset:", oldName) || "").trim();
    if (!name || name === oldName) return;
    // đổi tên; nếu trùng tên preset khác thì ghi đè cái đó
    const next = presets.filter((p) => p.name !== name).map((p) => (p.name === oldName ? { ...p, name } : p));
    setPresets(next); savePresets(next);
  };

  const cur = cands[idx];
  const col2 = { display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8 };

  return (
    <div className="modal-scrim" style={{ padding: 12 }} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <style>{`.izt-ed select,.izt-ed input,.izt-ed textarea{width:100%;min-width:0;max-width:100%;box-sizing:border-box}
.izt-ed input[type=color]{padding:2px}
.izt-ed .izt-panel *{min-width:0}
.izt-ed .izt-panel{overflow-x:hidden}`}</style>
      <div className="izt-ed" style={{ width: "min(1320px, 100%)", height: "min(94vh, 900px)", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
          <b>✏️ Sửa chữ thumbnail</b>
          <span style={{ color: "var(--muted)", fontSize: 12 }}>Ảnh #{cur?.idx} · {idx + 1}/{cands.length}</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {saveMsg && <span style={{ fontSize: 12, color: saveMsg[0] === "✓" ? "var(--green)" : "var(--red)" }}>{saveMsg}</span>}
            <button className="btn sm primary" disabled={!!busy} onClick={saveToDrive}>{busy === "save" ? "…" : "☁ Lưu lên Drive"}</button>
            <button className="btn sm" onClick={() => exportOne(cur, true)}>⬇ Tải ảnh này</button>
            <button className="btn sm ghost" disabled={!!busy} onClick={exportAll}>{busy === "all" ? "…" : "⬇ Tải tất cả"}</button>
            <button className="btn sm ghost" onClick={onClose}>✕ Đóng</button>
          </div>
          {saved?.link && (
            <div style={{ flexBasis: "100%", display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
              <span style={{ color: "var(--muted)" }}>Link Drive:</span>
              <a href={saved.link} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{saved.link}</a>
              <button className="btn sm ghost" onClick={copyLink}>{copied ? "✓ Đã copy" : "📋 Copy"}</button>
              <a className="btn sm ghost" href={saved.link} target="_blank" rel="noreferrer">↗ Xem</a>
            </div>
          )}
        </div>

        <div style={{ display: "flex", minHeight: 0, flex: 1, overflow: "hidden" }}>
          <div style={{ flex: "1 1 auto", minWidth: 0, minHeight: 0, padding: 14, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
            <div style={{ position: "relative" }}>
              <canvas ref={canvasRef} width={1280} height={720} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
                style={{ width: "100%", aspectRatio: "16/9", borderRadius: 10, background: "#000", cursor: "move", touchAction: "none", display: "block" }} />
              <button className="btn ghost" onClick={() => go(-1)} style={arrow("left")}>‹</button>
              <button className="btn ghost" onClick={() => go(1)} style={arrow("right")}>›</button>
              {(!curImg || !curImg.complete) && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", background: "rgba(0,0,0,.35)", borderRadius: 10, fontSize: 13 }}>Đang tải ảnh…</div>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
              {cands.map((c, i) => (
                <MiniPreview key={c.drive_id} img={imgs.current.get(c.drive_id)} style={style} active={i === idx} idx={c.idx} onClick={() => setIdx(i)} dep={fontsReady} />
              ))}
            </div>
          </div>

          <div className="izt-panel" style={{ flex: "0 0 330px", minWidth: 300, maxWidth: 360, minHeight: 0, borderLeft: "1px solid var(--line)", padding: 14, display: "grid", gap: 10, alignContent: "start", overflowY: "auto", overflowX: "hidden" }}>
            <Row label="Nội dung chữ">
              <textarea rows={2} value={style.text} onChange={(e) => set({ text: e.target.value })} placeholder="Nhập chữ… (Enter để xuống dòng)" />
            </Row>
            <div style={col2}>
              <Row label="Font"><select value={style.font} onChange={(e) => set({ font: e.target.value })}>{FONTS.map((f) => <option key={f} value={f}>{f}</option>)}</select></Row>
              <Row label="Đậm"><select value={style.weight} onChange={(e) => set({ weight: Number(e.target.value) })}><option value={400}>Thường</option><option value={700}>Đậm</option><option value={800}>Rất đậm</option><option value={900}>Cực đậm</option></select></Row>
            </div>
            <div style={col2}>
              <Row label="Kiểu"><select value={style.upper ? "1" : "0"} onChange={(e) => set({ upper: e.target.value === "1" })}><option value="1">IN HOA</option><option value="0">Nguyên bản</option></select></Row>
              <Row label="Nghiêng"><select value={style.italic ? "1" : "0"} onChange={(e) => set({ italic: e.target.value === "1" })}><option value="0">Không</option><option value="1">Nghiêng</option></select></Row>
            </div>

            <Sec title="Cỡ & khoảng cách">
              <Row label={`Cỡ chữ: ${Math.round(style.sizePct * 100)}%`}><input type="range" min={4} max={40} value={Math.round(style.sizePct * 100)} onChange={(e) => set({ sizePct: Number(e.target.value) / 100 })} /></Row>
              <div style={col2}>
                <Row label={`Giãn dòng: ${style.lineH.toFixed(2)}`}><input type="range" min={80} max={180} value={Math.round(style.lineH * 100)} onChange={(e) => set({ lineH: Number(e.target.value) / 100 })} /></Row>
                <Row label={`Giãn chữ: ${Math.round(style.letterPct * 100)}%`}><input type="range" min={-5} max={40} value={Math.round(style.letterPct * 100)} onChange={(e) => set({ letterPct: Number(e.target.value) / 100 })} /></Row>
              </div>
              <div style={col2}>
                <Row label="Canh chữ"><select value={style.align} onChange={(e) => set({ align: e.target.value })}><option value="center">Giữa</option><option value="left">Trái</option><option value="right">Phải</option></select></Row>
                <Row label={`Xoay: ${style.rotate}°`}><input type="range" min={-45} max={45} value={style.rotate} onChange={(e) => set({ rotate: Number(e.target.value) })} /></Row>
              </div>
            </Sec>

            <Sec title="Màu chữ & viền">
              <div style={col2}>
                <Row label="Màu chữ"><input type="color" value={style.fill} onChange={(e) => set({ fill: e.target.value })} style={{ height: 34 }} /></Row>
                <Row label="Màu viền"><input type="color" value={style.stroke} onChange={(e) => set({ stroke: e.target.value })} style={{ height: 34 }} /></Row>
              </div>
              <Row label={`Độ dày viền: ${Math.round(style.strokePct * 100)}%`}><input type="range" min={0} max={35} value={Math.round(style.strokePct * 100)} onChange={(e) => set({ strokePct: Number(e.target.value) / 100 })} /></Row>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={style.gradient} onChange={(e) => set({ gradient: e.target.checked })} /> Gradient chữ</label>
              {style.gradient && <Row label="Màu gradient (dưới)"><input type="color" value={style.fill2} onChange={(e) => set({ fill2: e.target.value })} style={{ height: 34 }} /></Row>}
              <Row label={`Độ mờ chữ: ${Math.round(style.opacity * 100)}%`}><input type="range" min={20} max={100} value={Math.round(style.opacity * 100)} onChange={(e) => set({ opacity: Number(e.target.value) / 100 })} /></Row>
            </Sec>

            <Sec title="Bóng đổ">
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={style.shadow} onChange={(e) => set({ shadow: e.target.checked })} /> Bật bóng</label>
              {style.shadow && <>
                <div style={col2}>
                  <Row label="Màu bóng"><input type="color" value={style.shadowColor} onChange={(e) => set({ shadowColor: e.target.value })} style={{ height: 34 }} /></Row>
                  <Row label={`Độ nhoè: ${Math.round(style.shadowBlurPct * 100)}%`}><input type="range" min={0} max={40} value={Math.round(style.shadowBlurPct * 100)} onChange={(e) => set({ shadowBlurPct: Number(e.target.value) / 100 })} /></Row>
                </div>
                <Row label={`Đổ xuống: ${Math.round(style.shadowDyPct * 100)}%`}><input type="range" min={-20} max={30} value={Math.round(style.shadowDyPct * 100)} onChange={(e) => set({ shadowDyPct: Number(e.target.value) / 100 })} /></Row>
              </>}
            </Sec>

            <Sec title="Khung nền chữ">
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={style.box} onChange={(e) => set({ box: e.target.checked })} /> Bật khung nền</label>
              {style.box && <>
                <div style={col2}>
                  <Row label="Màu khung"><input type="color" value={style.boxColor} onChange={(e) => set({ boxColor: e.target.value })} style={{ height: 34 }} /></Row>
                  <Row label={`Độ mờ: ${Math.round(style.boxOpacity * 100)}%`}><input type="range" min={0} max={100} value={Math.round(style.boxOpacity * 100)} onChange={(e) => set({ boxOpacity: Number(e.target.value) / 100 })} /></Row>
                </div>
                <div style={col2}>
                  <Row label={`Đệm: ${Math.round(style.boxPadPct * 100)}%`}><input type="range" min={0} max={80} value={Math.round(style.boxPadPct * 100)} onChange={(e) => set({ boxPadPct: Number(e.target.value) / 100 })} /></Row>
                  <Row label={`Bo góc: ${Math.round(style.boxRadiusPct * 100)}%`}><input type="range" min={0} max={80} value={Math.round(style.boxRadiusPct * 100)} onChange={(e) => set({ boxRadiusPct: Number(e.target.value) / 100 })} /></Row>
                </div>
              </>}
            </Sec>

            <div style={{ fontSize: 12, color: "var(--muted)" }}>Kéo chữ trên ảnh để đặt vị trí · phím ← → đổi ảnh.</div>
            <Sec title="Preset">
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn sm" onClick={addPreset}>＋ Lưu preset</button>
                <button className="btn sm ghost" onClick={() => set({ ...DEFAULT_STYLE, text: style.text })}>↺ Mặc định</button>
              </div>
              {presets.map((p) => (
                <div key={p.name} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button className="btn sm ghost" style={{ flex: 1, justifyContent: "flex-start", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`Áp dụng preset "${p.name}"`} onClick={() => applyPreset(p)}>🎨 {p.name}</button>
                  <button className="btn sm ghost" title="Đổi tên" onClick={() => renamePreset(p.name)}>✎</button>
                  <button className="btn sm ghost" title="Xoá" onClick={() => delPreset(p.name)}>✕</button>
                </div>
              ))}
            </Sec>
          </div>
        </div>
      </div>
    </div>
  );
}

function arrow(side) {
  return { position: "absolute", top: "50%", [side]: 8, transform: "translateY(-50%)", width: 40, height: 40, borderRadius: "50%", fontSize: 22, lineHeight: "1", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.45)" };
}

function MiniPreview({ img, style, active, idx, onClick, dep }) {
  const ref = useRef(null);
  useEffect(() => { const cv = ref.current; if (cv) drawThumb(cv.getContext("2d"), img, cv.width, cv.height, style); }, [img, style, dep, img?.complete]);
  return (
    <div onClick={onClick} title={`Ảnh #${idx}`} style={{ border: `2px solid ${active ? "var(--accent, #7c6cff)" : "var(--line)"}`, borderRadius: 8, overflow: "hidden", cursor: "pointer" }}>
      <canvas ref={ref} width={320} height={180} style={{ width: "100%", display: "block", aspectRatio: "16/9" }} />
    </div>
  );
}
