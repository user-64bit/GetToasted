export type KnownBot = {
  address: string;
  name: string;
  confidence: number;
  isProgram: boolean;
  source:
    | "mrgn_research"
    | "helius_report"
    | "ghostlogs"
    | "sandwiched_me"
    | "manual";
  notes?: string;
};

const ENTRIES: KnownBot[] = [
  {
    address: "9973hWbcumZNeKd4UxW1wT892rcdHQNwjfnz8KwzyWp6",
    name: "arsc-cold",
    confidence: 1.0,
    isProgram: false,
    source: "mrgn_research",
    notes: "Long-running operator wallet associated with arsc cluster",
  },
  {
    address: "Ai4zqY7gjyAPhtUsGnCfabM5oHcZLt3htjpSoUKvxkkt",
    name: "arsc-active",
    confidence: 1.0,
    isProgram: false,
    source: "mrgn_research",
    notes: "Hot operator wallet for arsc cluster",
  },
  {
    address: "B91piBSfCBRs5rUxCMRdJEGv7tNEnFxweWcdQJHJoFpi",
    name: "B91",
    confidence: 1.0,
    isProgram: true,
    source: "helius_report",
    notes: "Known sandwich program — fronts identified victim swaps",
  },
];

export const KNOWN_SANDWICH_BOTS: ReadonlyMap<string, KnownBot> = new Map(
  ENTRIES.map((e) => [e.address, e]),
);

export function isKnownBot(address: string): KnownBot | null {
  return KNOWN_SANDWICH_BOTS.get(address) ?? null;
}
