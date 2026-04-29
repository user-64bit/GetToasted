const JUPITER_QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote";

export type JupSwapInfo = {
  ammKey: string;
  label: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  feeAmount: string;
  feeMint: string;
};

export type JupRoutePlan = {
  swapInfo: JupSwapInfo;
  percent: number;
};

export type JupQuote = {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: "ExactIn" | "ExactOut";
  slippageBps: number;
  priceImpactPct: string;
  routePlan: JupRoutePlan[];
  contextSlot?: number;
  timeTaken?: number;
};

export async function getQuote(opts: {
  inputMint: string;
  outputMint: string;
  amount: string; // u64 as string
  slippageBps?: number;
  swapMode?: "ExactIn" | "ExactOut";
}): Promise<JupQuote> {
  const params = new URLSearchParams({
    inputMint: opts.inputMint,
    outputMint: opts.outputMint,
    amount: opts.amount,
    slippageBps: String(opts.slippageBps ?? 50),
    swapMode: opts.swapMode ?? "ExactIn",
    restrictIntermediateTokens: "true",
  });

  const res = await fetch(`${JUPITER_QUOTE_URL}?${params}`);
  if (!res.ok) {
    throw new Error(`Jupiter quote failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as JupQuote;
}
