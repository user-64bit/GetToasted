// Map of known sandwich-attacker pubkeys → human-readable names.
// Populated as the detector identifies and confirms sandwich operators.
// Empty by default; the detector pipeline writes here over time.
export const KNOWN_SANDWICH_BOTS: Record<string, string> = {};

export function lookupBotName(address: string): string | undefined {
  return KNOWN_SANDWICH_BOTS[address];
}
