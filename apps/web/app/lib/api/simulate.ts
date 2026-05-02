"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "./fetcher";
import type { SimulateRequest, SimulateResponse } from "./types";

export function useSimulate() {
  return useMutation({
    mutationFn: (body: SimulateRequest) =>
      apiFetch<SimulateResponse>("/api/v1/simulate", {
        method: "POST",
        body,
      }),
  });
}
