// src/hooks/useOnline.js
// A shop's internet drops. navigator.onLine alone lies — it only reports whether a network
// interface exists, not whether the API is reachable — so when the browser claims to be
// offline, or a request has just failed, we actually poll the health endpoint.
import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_URL } from "../services/api";

const PROBE_MS = 8000;

export default function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  const [checking, setChecking] = useState(false);
  const timer = useRef(null);

  const probe = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`${BASE_URL}/health`, { method: "GET", cache: "no-store" });
      setOnline(res.ok);
      return res.ok;
    } catch {
      setOnline(false);
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const goOffline = () => setOnline(false);
    const goOnline = () => probe();
    const goUp = () => setOnline(true);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    // Any request that failed to reach the server marks us offline (set by the axios
    // interceptor), which then starts the recovery polling below; any response that did
    // arrive marks us back up without waiting for the next poll.
    window.addEventListener("api-unreachable", goOffline);
    window.addEventListener("api-reachable", goUp);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("api-unreachable", goOffline);
      window.removeEventListener("api-reachable", goUp);
    };
  }, [probe]);

  // Only poll while we believe we are down, so a healthy till makes no extra requests.
  useEffect(() => {
    if (online) {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      return undefined;
    }
    timer.current = setInterval(probe, PROBE_MS);
    return () => timer.current && clearInterval(timer.current);
  }, [online, probe]);

  return { online, recheck: probe, isChecking: checking };
}
