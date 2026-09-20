import "server-only";
import { Resend } from "resend";

const FROM_ADDRESS = process.env.EMAIL_FROM ?? "US Tax Tools <onboarding@resend.dev>";

/**
 * Sends a transactional notification email (organizer submitted, new
 * message, etc).
 *
 * Deliberately never throws. Every call site here is a "by the way" side
 * effect of something that already succeeded (a submission, a posted
 * message) — a missing API key or a flaky network call should show up in
 * the logs, not turn a successful action into a failed one for the user.
 */
export async function sendNotificationEmail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY not set — skipped "${input.subject}" to ${input.to}`);
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });

    if (error) {
      console.error(`[email] "${input.subject}" to ${input.to} failed:`, error.message);
    }
  } catch (err) {
    console.error(`[email] Network error sending "${input.subject}" to ${input.to}:`, err);
  }
}
