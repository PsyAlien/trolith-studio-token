import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE = "/api";

/**
 * Generic fetch wrapper for the backend API.
 */
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || "API error");
  }
  return res.json();
}

/**
 * Hook: fetch data on mount + expose refresh.
 * Pass null as path to skip fetching (e.g. when wallet not connected).
 */
export function useApiData(path) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState(null);

  // Use ref to avoid stale closures
  const pathRef = useRef(path);
  pathRef.current = path;

  const refresh = useCallback(async () => {
    const currentPath = pathRef.current;
    if (!currentPath) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch(currentPath);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch when path changes
  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    refresh();
  }, [path, refresh]);

  return { data, loading, error, refresh };
}

/**
 * GET request helper.
 */
export async function apiGet(path) {
  return apiFetch(path);
}

/**
 * POST request helper.
 */
export async function apiPost(path, body = {}, headers = {}) {
  return apiFetch(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Trigger a manual sync.
 */
export async function triggerSync() {
  return apiPost("/sync");
}