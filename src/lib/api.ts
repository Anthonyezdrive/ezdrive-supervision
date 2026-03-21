// ============================================================
// EZDrive — API Client Helper
// Authenticated calls to Edge Function API endpoints
// ============================================================

import { supabase } from "./supabase";

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api`;

async function getAuthHeaders(): Promise<Record<string, string>> {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    // Try refresh as fallback
    const { data } = await supabase.auth.refreshSession();
    session = data.session;
  }
  if (!session?.access_token) throw new Error("Not authenticated");
  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/${path}`, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text}`);
  }
  const json = await res.json();
  return (json.data ?? json) as T;
}

export async function apiPost<T = unknown>(
  path: string,
  body?: unknown
): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/${path}`, {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text}`);
  }
  const json = await res.json();
  return (json.data ?? json) as T;
}

export async function apiPut<T = unknown>(
  path: string,
  body?: unknown
): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/${path}`, {
    method: "PUT",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text}`);
  }
  const json = await res.json();
  return (json.data ?? json) as T;
}

export async function apiDelete<T = unknown>(path: string): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/${path}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text}`);
  }
  const json = await res.json();
  return (json.data ?? json) as T;
}

/** Download raw response (PDF, CSV) */
export async function apiDownload(
  path: string
): Promise<{ blob: Blob; filename: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/${path}`, { headers });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] ?? "download";
  const blob = await res.blob();
  return { blob, filename };
}
