export const metadata = {
  title: "IzPipeline — Manager",
  description: "Bảng điều khiển pipeline reup video",
};

const CSS = `
:root{
  --bg:#0b0f1a; --bg2:#0e1424; --panel:#121a2e; --panel2:#16203a;
  --line:#223052; --line2:#2c3d63;
  --text:#e6ecf7; --muted:#8a97b3; --muted2:#6b7796;
  --accent:#6366f1; --accent2:#8b5cf6; --accentg:linear-gradient(135deg,#6366f1,#8b5cf6);
  --green:#34d399; --amber:#fbbf24; --red:#f87171; --blue:#60a5fa; --cyan:#22d3ee;
  --shadow:0 10px 30px -12px rgba(0,0,0,.6);
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  background:
    radial-gradient(1200px 600px at 80% -10%, rgba(139,92,246,.14), transparent 60%),
    radial-gradient(900px 500px at -10% 10%, rgba(99,102,241,.12), transparent 55%),
    var(--bg);
  color:var(--text); font-size:14px; line-height:1.5; -webkit-font-smoothing:antialiased;
  min-height:100vh;
}
a{color:var(--blue);text-decoration:none}
a:hover{text-decoration:underline}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-thumb{background:#26324f;border-radius:6px}
::-webkit-scrollbar-thumb:hover{background:#33436a}
::selection{background:rgba(99,102,241,.4)}

.wrap{max-width:1320px;margin:0 auto;padding:22px 26px 60px}
.card{background:linear-gradient(180deg,var(--panel),var(--bg2));border:1px solid var(--line);
  border-radius:16px;box-shadow:var(--shadow)}
.hd{display:flex;align-items:center;gap:14px;margin-bottom:20px}
.logo{width:42px;height:42px;border-radius:12px;background:var(--accentg);display:flex;
  align-items:center;justify-content:center;font-size:22px;box-shadow:0 6px 18px -6px rgba(99,102,241,.7)}
.brand h1{font-size:18px;margin:0;font-weight:700;letter-spacing:.2px}
.brand p{margin:0;color:var(--muted);font-size:12px}
.live{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:12px;
  background:var(--panel);border:1px solid var(--line);padding:6px 12px;border-radius:999px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 0 4px rgba(52,211,153,.15)}
.dot.pulse{animation:pulse 1.6s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(52,211,153,.4)}70%{box-shadow:0 0 0 7px rgba(52,211,153,0)}100%{box-shadow:0 0 0 0 rgba(52,211,153,0)}}

.enqueue{display:flex;gap:10px;padding:14px;margin-bottom:18px;flex-wrap:wrap;align-items:center}
input,select,textarea{background:var(--bg2);border:1px solid var(--line2);color:var(--text);
  border-radius:10px;padding:10px 12px;font-size:14px;outline:none;font-family:inherit}
input:focus,select:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(99,102,241,.18)}
input::placeholder{color:var(--muted2)}

.btn{background:var(--panel2);border:1px solid var(--line2);color:var(--text);border-radius:10px;
  padding:9px 14px;font-size:13px;cursor:pointer;transition:.15s;font-weight:500;white-space:nowrap}
.btn:hover{border-color:var(--accent);background:#1b264180}
.btn.primary{background:var(--accentg);border:none;color:#fff;font-weight:600;
  box-shadow:0 6px 16px -6px rgba(99,102,241,.7)}
.btn.primary:hover{filter:brightness(1.08)}
.btn.sm{padding:5px 10px;font-size:12px;border-radius:8px}
.btn.danger:hover{border-color:var(--red);color:var(--red)}
.btn.ghost{background:transparent}

.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}
.stat{padding:16px 18px;position:relative;overflow:hidden}
.stat .n{font-size:30px;font-weight:800;letter-spacing:-1px}
.stat .l{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.6px;font-weight:600}
.stat .ic{position:absolute;right:12px;top:12px;font-size:22px;opacity:.5}
.stat .accent{position:absolute;left:0;top:0;bottom:0;width:4px;border-radius:4px}

.sec-t{font-size:12px;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);
  font-weight:700;margin:20px 2px 10px}
.chips{display:flex;flex-wrap:wrap;gap:10px}
.chip{display:flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--line);
  border-radius:12px;padding:8px 13px;cursor:pointer;transition:.15s;font-size:13px}
.chip:hover{border-color:var(--line2)}
.chip.on{border-color:var(--accent);background:#1a2445;box-shadow:0 0 0 2px rgba(99,102,241,.2)}
.chip .mdot{width:8px;height:8px;border-radius:50%}
.chip small{color:var(--muted)}

.filters{display:flex;gap:8px;align-items:center;margin:16px 0 10px;flex-wrap:wrap}
/* nhắc việc phải làm tay (bấm chạy MiniMax) / máy đang trống */
.callout{margin-top:10px;padding:10px 14px;border-radius:11px;font-size:13px;
  background:rgba(248,113,113,.10);border:1px solid rgba(248,113,113,.32);color:var(--text)}
.callout.ok{background:rgba(52,211,153,.09);border-color:rgba(52,211,153,.3)}

table{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed}
thead th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;
  color:var(--muted);font-weight:700;padding:8px 8px;border-bottom:1px solid var(--line)}
tbody td{padding:7px 8px;border-bottom:1px solid #1a2440;vertical-align:middle;font-size:12.5px}
tbody tr{cursor:pointer;transition:.12s}
tbody tr:hover{background:#141d34}
/* độ rộng cột: # · video(giãn) · trạng thái · tiến độ · máy · pha · kết quả */
th:nth-child(1),td:nth-child(1){width:34px;text-align:center}
th:nth-child(3),td:nth-child(3){width:140px}
th:nth-child(4),td:nth-child(4){width:120px}
th:nth-child(5),td:nth-child(5){width:210px}
th:nth-child(6),td:nth-child(6){width:110px;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;font-size:11px}
th:nth-child(7),td:nth-child(7){width:66px}
th:nth-child(8),td:nth-child(8){width:170px}
td:nth-child(2){overflow:hidden}
/* ghi chú: 2 dòng rồi cắt (giữ chiều cao hàng ổn định) */
.notecell{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
  color:var(--text);font-size:11.5px;line-height:1.35;word-break:break-word}
.notecard{margin-top:8px;background:rgba(251,191,36,.09);border:1px solid rgba(251,191,36,.28);
  border-radius:9px;padding:7px 10px;font-size:12px;color:var(--text);word-break:break-word}
.notebox{width:100%;min-height:74px;resize:vertical;font-size:13.5px;line-height:1.5}
.thumb{width:56px;height:32px;border-radius:6px;object-fit:cover;background:#1a2440;border:1px solid var(--line);flex:none}
.thumb.ph{display:flex;align-items:center;justify-content:center;color:var(--muted2);font-size:15px}
.jtitle{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.jsub{color:var(--muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.badge{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;
  white-space:nowrap;padding:3px 8px;border-radius:6px;border:1px solid transparent}
.badge.b-done{background:rgba(52,211,153,.14);color:var(--green);border-color:rgba(52,211,153,.3)}
.badge.b-run{background:rgba(96,165,250,.14);color:var(--blue);border-color:rgba(96,165,250,.3)}
.badge.b-wait{background:rgba(251,191,36,.14);color:var(--amber);border-color:rgba(251,191,36,.3)}
.badge.b-fail{background:rgba(248,113,113,.14);color:var(--red);border-color:rgba(248,113,113,.3)}
.badge.b-idle{background:rgba(138,151,179,.12);color:var(--muted);border-color:rgba(138,151,179,.25)}

.bar{height:6px;background:#1a2440;border-radius:6px;overflow:hidden;width:64px;flex:none}
.bar>i{display:block;height:100%;background:var(--accentg);border-radius:6px;transition:width .4s}
.machine-cell{font-size:11px;white-space:nowrap;color:var(--muted);overflow:hidden;text-overflow:ellipsis;display:block}
.machine-cell b{color:var(--text);font-weight:600}

.stagerow{display:flex;gap:5px;flex-wrap:wrap}
.sdot{width:9px;height:9px;border-radius:50%;background:#33436a}
.sdot.ok{background:var(--green)} .sdot.run{background:var(--blue)}
.sdot.wait{background:var(--amber)} .sdot.fail{background:var(--red)}

/* drawer */
.scrim{position:fixed;inset:0;background:rgba(4,7,15,.6);backdrop-filter:blur(3px);z-index:40}
.drawer{position:fixed;top:0;right:0;bottom:0;width:min(1180px,96vw);background:var(--bg2);
  border-left:1px solid var(--line);z-index:50;overflow-y:auto;box-shadow:-20px 0 60px -20px rgba(0,0,0,.7);
  animation:slidein .25s ease}
@keyframes slidein{from{transform:translateX(40px);opacity:.5}to{transform:none;opacity:1}}
.drawer .dhd{position:sticky;top:0;background:linear-gradient(180deg,var(--bg2),rgba(14,20,36,.85));
  backdrop-filter:blur(6px);padding:18px 24px;border-bottom:1px solid var(--line);z-index:2;
  display:flex;align-items:center;gap:10px}
.drawer .body{padding:20px 24px 48px}
/* 2 cột khi drawer đủ rộng — tự về 1 cột khi hẹp */
.drawer-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(430px,1fr));gap:8px 28px;align-items:start}
.drawer-cols>.col{min-width:0}
.hero{width:100%;aspect-ratio:16/9;border-radius:12px;object-fit:cover;border:1px solid var(--line);background:#101830}
.hero.ph{display:flex;align-items:center;justify-content:center;color:var(--muted2);font-size:15px}
.videobox{position:relative;width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;
  border:1px solid var(--line);background:#000}
.videobox iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.muted-note{color:var(--muted);font-size:13px}
.k{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.6px;font-weight:700;margin:20px 0 8px}
.copybox{display:flex;gap:8px;align-items:flex-start;background:var(--panel);border:1px solid var(--line);
  border-radius:10px;padding:10px 12px;margin-bottom:8px}
.copybox .t{flex:1;font-size:13px;word-break:break-word}
.tlist{display:flex;flex-direction:column;gap:7px}
.trow{display:flex;gap:10px;align-items:flex-start;background:var(--panel);border:1px solid var(--line);
  border-radius:10px;padding:9px 12px;transition:.12s}
.trow:hover{border-color:var(--line2)}
.trow .num{color:var(--accent);font-weight:700;font-size:12px;min-width:20px}
.trow .txt{flex:1;font-size:13.5px}
.videolink{display:block;background:linear-gradient(135deg,rgba(99,102,241,.18),rgba(139,92,246,.14));
  border:1px solid rgba(99,102,241,.4);border-radius:12px;padding:14px;margin-bottom:10px}
/* modal metadata (bảng tiêu đề · hook) */
.modal-scrim{position:fixed;inset:0;background:rgba(4,7,15,.78);backdrop-filter:blur(4px);z-index:60;
  display:flex;align-items:center;justify-content:center;padding:20px;animation:slidein .18s ease}
.modal{background:var(--bg2);border:1px solid var(--line);border-radius:16px;width:min(960px,96vw);
  max-height:88vh;overflow:auto;box-shadow:var(--shadow)}
.modal .mhd{position:sticky;top:0;background:linear-gradient(180deg,var(--bg2),rgba(14,20,36,.9));
  backdrop-filter:blur(6px);border-bottom:1px solid var(--line);padding:14px 18px;display:flex;
  align-items:center;gap:10px;z-index:3}
.modal .mbody{padding:14px 18px 30px}
.mtable{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}
.mtable th{position:sticky;top:0;text-align:left;background:#1a2440;color:var(--muted);font-size:10.5px;
  text-transform:uppercase;letter-spacing:.5px;padding:9px 10px;border-bottom:1px solid var(--line);z-index:1}
.mtable td{padding:9px 10px;border-bottom:1px solid #1a2440;vertical-align:top}
.mtable tr:hover{background:#141d34}
.cellcopy{display:flex;gap:8px;align-items:flex-start}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--panel2);
  border:1px solid var(--accent);color:#fff;padding:11px 18px;border-radius:12px;z-index:60;
  box-shadow:var(--shadow);animation:slidein .2s ease}
.empty{text-align:center;color:var(--muted);padding:50px 20px}

/* mobile job cards (ẩn trên desktop) */
.mob{display:none}
.jcard{padding:12px;margin-bottom:10px}
.jcard .top{display:flex;gap:10px;align-items:center}
.jcard .thumb{width:64px;height:38px}
.jcard .meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;align-items:center;font-size:12px;color:var(--muted)}
.jcard .acts{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}

@media(max-width:860px){
  .desk{display:none}
  .mob{display:block}
  .wrap{padding:16px 14px 60px}
  .stats{grid-template-columns:repeat(2,1fr);gap:10px}
  .stat .n{font-size:24px}
  .enqueue{flex-direction:column;align-items:stretch}
  .enqueue input,.enqueue select,.enqueue button{width:100%!important}
  .hd{flex-wrap:wrap}
  .live{margin-left:0;order:3;width:100%;justify-content:center}
  .filters{gap:6px}
  .filters select{flex:1;min-width:0}
  .drawer{width:100vw}
  .brand h1{font-size:16px}
}
@media(max-width:420px){ .stats{grid-template-columns:1fr} }
`;

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
