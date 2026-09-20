type AuthEmailError = { code?: string; status?: number; message?: string };

export function authEmailFailure(error: AuthEmailError, audience: "client" | "staff") {
  const emailLimit = error.code === "over_email_send_rate_limit" ||
    /email rate limit exceeded/i.test(error.message ?? "");
  const rateLimited = emailLimit || error.status === 429 || error.code === "over_request_rate_limit";

  if (emailLimit) {
    return {
      error: audience === "staff"
        ? "The email service has reached its sending limit. Configure custom SMTP in Supabase Authentication, or check the existing provider and Auth rate limits. Retry after the sending window resets."
        : "Sign-in emails are temporarily unavailable because the email service has reached its sending limit. Please try later or contact your firm. If you already received a sign-in link, use that email.",
      // A minimum retry delay, not a claim about the provider's quota reset.
      cooldownSeconds: 60,
    };
  }

  if (rateLimited) {
    return { error: "Too many requests. Please wait before trying again.", cooldownSeconds: 60 };
  }

  return {
    error: audience === "staff"
      ? "The invitation could not be sent. Check the client's account status and the Auth email configuration."
      : "We couldn't send a sign-in link. Please try later or contact your firm.",
    cooldownSeconds: 0,
  };
}
