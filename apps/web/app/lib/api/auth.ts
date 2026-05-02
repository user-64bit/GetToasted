"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./fetcher";
import type { MeResponse } from "./types";

export const authKeys = {
  me: ["auth", "me"] as const,
};

export function fetchMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/api/auth/me");
}

export function useMe() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: fetchMe,
    staleTime: 60_000,
  });
}
