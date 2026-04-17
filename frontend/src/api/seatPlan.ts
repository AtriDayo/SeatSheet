import type { EditableSeatPlan, SeatPlan } from "../types/seat";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
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

export function saveSeatPlan(plan: EditableSeatPlan) {
  return request<SeatPlan>("/api/seat-plan", {
    method: "PUT",
    body: JSON.stringify(plan)
  });
}
