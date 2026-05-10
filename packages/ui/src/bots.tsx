// UI-facing labels for the seed bot list in @get-toasted/core.
export const KNOWN_SANDWICH_BOTS: Record<string, string> = {
  "9973hWbcumZNeKd4UxW1wT892rcdHQNwjfnz8KwzyWp6": "arsc-cold",
  Ai4zqY7gjyAPhtUsGnCfabM5oHcZLt3htjpSoUKvxkkt: "arsc-active",
  BCbrpBpttAvwJBhJiXUcptyW9rRVWMcHFJzr6vi58q: "arsc-warm",
  B91piBSfCBRs5rUxCMRdJEGv7tNEnFxweWcdQJHJoFpi: "B91",
  vpeNALD89BZ4KxNUFjdLmFXBCwtyqBDQ85ouNoax38b: "vpe-bot",
};

export function lookupBotName(address: string): string | undefined {
  return KNOWN_SANDWICH_BOTS[address];
}
