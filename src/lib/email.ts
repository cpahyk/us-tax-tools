import "server-only";
import { Resend } from "resend";

export function notificationEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.NEXT_PUBLIC_SITE_URL);
}

// Provider acceptance is not proof of delivery. Never log recipient or content.
export async function sendNotificationEmail(input: {
  to: string; subject: string; text: string; idempotencyKey: string;
}): Promise<boolean> {
  if (!notificationEmailConfigured()) return false;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM!, to: input.to, subject: input.subject, text: input.text,
    }, { idempotencyKey: input.idempotencyKey });
    return !error;
  } catch {
    return false;
  }
}
