"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { apiFetch } from "./fetcher";
import type {
  ScanStartResponse,
  SandwichesPage,
  SandwichesQuery,
  WalletSummary,
} from "./types";

export const walletKeys = {
  summary: (address: string) => ["wallet", address] as const,
  sandwiches: (address: string, q: SandwichesQuery) =>
    ["wallet", address, "sandwiches", q] as const,
};

export function fetchWalletSummary(address: string): Promise<WalletSummary> {
  return apiFetch<WalletSummary>(`/api/v1/wallets/${address}`);
}

export function fetchSandwiches(
  address: string,
  q: SandwichesQuery = {},
): Promise<SandwichesPage> {
  const params = new URLSearchParams();
  if (q.limit !== undefined) params.set("limit", String(q.limit));
  if (q.cursor) params.set("cursor", q.cursor);
  if (q.fromDate) params.set("fromDate", q.fromDate);
  if (q.toDate) params.set("toDate", q.toDate);
  if (q.dex) params.set("dex", q.dex);
  if (q.minLossUsd !== undefined) params.set("minLossUsd", String(q.minLossUsd));
  const qs = params.toString();
  return apiFetch<SandwichesPage>(
    `/api/v1/wallets/${address}/sandwiches${qs ? `?${qs}` : ""}`,
  );
}

type SummaryOpts = Omit<
  UseQueryOptions<WalletSummary, Error, WalletSummary, ReturnType<typeof walletKeys.summary>>,
  "queryKey" | "queryFn"
>;

export function useWalletSummary(address: string | undefined, options?: SummaryOpts) {
  return useQuery({
    queryKey: walletKeys.summary(address ?? ""),
    queryFn: () => fetchWalletSummary(address!),
    enabled: Boolean(address),
    ...options,
  });
}

export function useWalletSandwiches(
  address: string | undefined,
  q: SandwichesQuery = {},
) {
  return useQuery({
    queryKey: walletKeys.sandwiches(address ?? "", q),
    queryFn: () => fetchSandwiches(address!, q),
    enabled: Boolean(address),
  });
}

export function useStartScan(address: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<ScanStartResponse>(`/api/v1/wallets/${address}/scan`, {
        method: "POST",
      }),
    onSuccess: () => {
      if (address) qc.invalidateQueries({ queryKey: walletKeys.summary(address) });
    },
  });
}
