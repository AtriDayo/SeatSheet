import type { EditableSeatPlan, SeatPlan } from "../types/seat";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  ""
);

function apiPath(path: string) {
  if (API_BASE_URL.endsWith("/api") && path.startsWith("/api/")) {
    return `${API_BASE_URL}${path.slice(4)}`;
  }

  return `${API_BASE_URL}${path}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiPath(path), {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    },
    ...init
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function fetchSeatPlan() {
  return request<SeatPlan>("/api/seat-plan");
}

export function verifyAdminPassword(password: string) {
  return request<{ ok: true }>("/api/admin/verify", {
    method: "POST",
    body: JSON.stringify({ password })
  });
}

export function saveSeatPlan(plan: EditableSeatPlan, adminPassword: string) {
  return request<SeatPlan>("/api/seat-plan", {
    method: "PUT",
    headers: {
      "X-Admin-Password": adminPassword
    },
    body: JSON.stringify(plan)
  });
}
