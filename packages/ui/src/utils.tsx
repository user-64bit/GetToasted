export type ClassValue = string | false | null | undefined;

export function cn(...args: ClassValue[]): string {
  return args.filter(Boolean).join(" ");
}

export function truncateAddress(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail + 3) return address;
  return `${address.slice(0, head)}...${address.slice(-tail)}`;
}

export function formatUsd(value: number, decimals = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// cubic-bezier(0.16, 1, 0.3, 1) — the spec's preferred easing curve, approximated as ease-out-quint
export function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5);
}
