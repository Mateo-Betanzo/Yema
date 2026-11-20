// "Reenviar código" (spec 002, change of 2026-11-19, RF-60): 60 s after each email with a code. The
// screens open right after a code was sent, so the count starts when they mount.
import { useEffect, useState } from "react";

import { resendSecondsLeft } from "@/logic/auth-flow";

export function useResendCooldown(): { secondsLeft: number; restart: () => void } {
  const [sentAt, setSentAt] = useState(() => Date.now());
  const [now, setNow] = useState(sentAt);
  const secondsLeft = resendSecondsLeft(sentAt, now);
  // The clock ticks only while counting: one interval per count, not one per second.
  const counting = secondsLeft > 0;

  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [counting]);

  function restart() {
    const moment = Date.now();
    setSentAt(moment);
    setNow(moment);
  }

  return { secondsLeft, restart };
}
