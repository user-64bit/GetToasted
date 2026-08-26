export type ClassValue = string | false | null | undefined;

export function cn(...args: ClassValue[]): string {
  return args.filter(Boolean).join(" ");
}

export function truncateAddress(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail + 3) return address;
  return `${address.slice(0, head)}...${address.slice(-tail)}`;
}

// cubic-bezier easing approximated as ease-out-quint — used by MonoNumber.
export function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5);
}
