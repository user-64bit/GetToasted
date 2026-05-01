import { DEX_PROGRAM_IDS, TRACKED_DEX_PROGRAM_ID_SET } from "./dex-programs.js";
import { JITO_TIP_ACCOUNTS_SEED } from "./jito.js";
import { KNOWN_SANDWICH_BOTS } from "./known-bots.js";

const reverseDex = (label: string): string | undefined =>
  Object.entries(DEX_PROGRAM_IDS).find(([, dex]) => dex === label)?.[0];

export const TRACKED_DEX_PROGRAMS = {
  RAYDIUM_AMM_V4: reverseDex("raydium_amm_v4")!,
  RAYDIUM_CLMM: reverseDex("raydium_clmm")!,
  RAYDIUM_CPMM: reverseDex("raydium_cpmm")!,
  ORCA_WHIRLPOOL: reverseDex("orca_whirlpool")!,
  METEORA_DLMM: reverseDex("meteora_dlmm")!,
  METEORA_DAMM_V2: reverseDex("meteora_damm_v2")!,
  PHOENIX: reverseDex("phoenix")!,
  PUMPSWAP: reverseDex("pumpswap")!,
  PUMPFUN_BONDING: reverseDex("pumpfun_bonding")!,
  LIFINITY_V2: reverseDex("lifinity_v2")!,
} as const;

export const TRACKED_DEX_PROGRAM_IDS = TRACKED_DEX_PROGRAM_ID_SET;
export const JITO_TIP_ACCOUNTS_INITIAL = JITO_TIP_ACCOUNTS_SEED;

export const KNOWN_SANDWICH_BOTS_LEGACY: Record<
  string,
  { name: string; confidence: number; program?: boolean }
> = Object.fromEntries(
  [...KNOWN_SANDWICH_BOTS.entries()].map(([address, bot]) => [
    address,
    { name: bot.name, confidence: bot.confidence, program: bot.isProgram },
  ]),
);

export { KNOWN_SANDWICH_BOTS_LEGACY as KNOWN_SANDWICH_BOTS };
