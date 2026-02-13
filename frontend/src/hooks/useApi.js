import { useState, useEffect, useCallback } from "react";

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
 */
export function useApiData(path, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch(path);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [path, ...deps]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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