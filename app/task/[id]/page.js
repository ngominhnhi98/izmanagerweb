import { redirect } from "next/navigation";

// Deep link dạng ĐƯỜNG DẪN: /task/33 → về dashboard với ?task=33 (dashboard tự bung
// chi tiết task đó). Giữ 1 chỗ render duy nhất, khỏi trùng lặp UI.
export const dynamic = "force-dynamic";

export default function TaskDeepLink({ params }) {
  redirect(`/?task=${encodeURIComponent(params.id)}`);
}
