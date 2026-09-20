"use client";

import { useEffect, useState } from "react";

/** UI retry pacing only; Supabase remains the server-side rate limiter. */
export function useEmailCooldown() {
  const [seconds, setSeconds] = useState(0);
  const active = seconds > 0;

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setSeconds(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  return { seconds, startCooldown: setSeconds };
}
