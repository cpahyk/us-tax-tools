import { timingSafeEqual } from "node:crypto";
import { dispatchNotificationEmails } from "@/lib/notifications";

export async function POST(request: Request) {
  const secret = process.env.NOTIFICATION_CRON_SECRET;
  const token = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || Buffer.byteLength(token) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await dispatchNotificationEmails();
    return Response.json(result, { status: result.configured ? 200 : 503 });
  } catch {
    return Response.json({ error: "Notification delivery temporarily unavailable" }, { status: 503 });
  }
}
