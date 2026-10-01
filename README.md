# iz manager web — Next.js (Vercel)

FE quản lý riêng (folder riêng). Nối thẳng MongoDB Atlas qua API routes → deploy Vercel.

## Chức năng
- Dashboard: KPI (đang chạy / chờ người / xong / lỗi) + bảng tất cả task (phase, chờ gì, máy, stages).
- Điều khiển: pause / stop / delete (set `control.desired`).
- Hành động thủ công: duyệt review, đánh dấu CapCut xong (set stage).
- Enqueue link (tự giao cho 1 máy local đang online).
- Auto refresh 4s.

## Chạy local
```bash
npm install
cp .env.local.example .env.local   # điền MONGODB_URI (Atlas)
npm run dev                        # http://localhost:3000
```

## Deploy Vercel
1. Push folder này lên 1 repo Git.
2. Vercel → New Project → chọn repo.
3. Environment Variables: `MONGODB_URI`, `DB_NAME=iz_pipeline`.
4. Deploy. (Atlas: cho phép IP 0.0.0.0/0 hoặc Vercel egress.)

## Ghi chú
- Cùng schema với hệ (khớp Atlas $jsonSchema validator do `iz_pipeline/admin/setup_atlas.py` áp).
- `lib/newjob.js` giữ khớp `iz_pipeline/core/job.py` — khi đổi schema nhớ sync cả 2.
- Realtime hiện dùng polling 4s (đủ). Muốn push realtime: thêm 1 service change-stream (ngoài Vercel serverless).
