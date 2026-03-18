'use client';

import { useEffect } from 'react';

const KEEP_ALIVE_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes

export default function BackendKeepAlive() {
  useEffect(() => {
    const ping = () => {
      fetch('/api/backend/health', { method: 'GET' }).catch(() => {});
    };

    ping();
    const id = setInterval(ping, KEEP_ALIVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
