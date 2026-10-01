/**
 * Cloudflare Worker — "nhịp tim" free đánh thức endpoint notify-tts mỗi phút.
 * Nó chỉ gọi route Next.js kèm secret; mọi việc thật làm ở server.
 *
 * Deploy:
 *   cd worker
 *   npx wrangler deploy
 *   npx wrangler secret put CRON_SECRET     # nhập đúng CRON_SECRET như trên Vercel
 *
 * Lịch cron nằm trong wrangler.toml (mỗi phút). TARGET_URL cũng ở đó.
 */

async function trigger(env) {
  if (!env.TARGET_URL) {
    console.error("TARGET_URL chưa cấu hình");
    return;
  }
  try {
    const res = await fetch(env.TARGET_URL, {
      method: "GET",
      headers: env.CRON_SECRET ? { Authorization: `Bearer ${env.CRON_SECRET}` } : {},
    });
    const text = await res.text();
    console.log(`notify-tts -> ${res.status}: ${text.slice(0, 500)}`);
  } catch (err) {
    console.error("Gọi notify-tts thất bại", err);
  }
}

export default {
  // cron trong wrangler.toml kích hoạt
  async scheduled(_event, env) {
    await trigger(env);
  },
  // cho phép gọi tay bằng GET vào URL worker để test
  async fetch(_req, env) {
    await trigger(env);
    return new Response("Đã kích hoạt notify-tts\n");
  },
};
