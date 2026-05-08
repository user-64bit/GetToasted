import { PROGRAM_TO_DEX } from "./constants.ts";
import type { LamportDelta, TokenDelta, TxSummary } from "./types.ts";

function keyAt(accountKeys: any[], index: number): string {
  const key = accountKeys[index];
  if (typeof key === "string") return key;
  return key?.pubkey ?? String(key);
}

function amountFrom(balance: any): bigint {
  return BigInt(balance?.uiTokenAmount?.amount ?? "0");
}

function mapTokenBalances(balances: any[] | null | undefined): Map<number, any> {
  const map = new Map<number, any>();
  for (const balance of balances ?? []) {
    map.set(Number(balance.accountIndex), balance);
  }
  return map;
}

function parseTokenDeltas(tx: any): TokenDelta[] {
  const accountKeys = tx.transaction.message.accountKeys ?? [];
  const pre = mapTokenBalances(tx.meta?.preTokenBalances);
  const post = mapTokenBalances(tx.meta?.postTokenBalances);
  const indexes = new Set([...pre.keys(), ...post.keys()]);
  const deltas: TokenDelta[] = [];

  for (const accountIndex of indexes) {
    const before = pre.get(accountIndex);
    const after = post.get(accountIndex);
    const template = after ?? before;
    const amount = amountFrom(after) - amountFrom(before);
    if (amount === 0n) continue;

    deltas.push({
      accountIndex,
      account: keyAt(accountKeys, accountIndex),
      mint: template.mint,
      owner: template.owner ?? null,
      amount,
      decimals: Number(template.uiTokenAmount?.decimals ?? 0),
    });
  }

  return deltas;
}

function parseLamportDeltas(tx: any): LamportDelta[] {
  const accountKeys = tx.transaction.message.accountKeys ?? [];
  const pre = tx.meta?.preBalances ?? [];
  const post = tx.meta?.postBalances ?? [];
  const length = Math.max(pre.length, post.length);
  const deltas: LamportDelta[] = [];

  for (let accountIndex = 0; accountIndex < length; accountIndex += 1) {
    const amount = BigInt(post[accountIndex] ?? 0) - BigInt(pre[accountIndex] ?? 0);
    if (amount === 0n) continue;

    deltas.push({
      accountIndex,
      account: keyAt(accountKeys, accountIndex),
      amount,
    });
  }

  return deltas;
}

function parsePrograms(tx: any): string[] {
  const programs = new Set<string>();
  for (const instruction of tx.transaction.message.instructions ?? []) {
    const programId = instruction.programId ?? instruction.program;
    if (programId) programs.add(programId);
  }
  for (const innerGroup of tx.meta?.innerInstructions ?? []) {
    for (const instruction of innerGroup.instructions ?? []) {
      const programId = instruction.programId ?? instruction.program;
      if (programId) programs.add(programId);
    }
  }
  return [...programs];
}

function parseDex(programs: string[]): string {
  for (const program of programs) {
    const dex = PROGRAM_TO_DEX.get(program);
    if (dex) return dex;
  }
  return "unknown";
}

function parseSigners(tx: any): string[] {
  const accountKeys = tx.transaction.message.accountKeys ?? [];
  const signers = accountKeys
    .filter((key: any) => typeof key === "object" && key.signer)
    .map((key: any) => key.pubkey);

  return signers.length ? signers : [keyAt(accountKeys, 0)];
}

export function summarizeBlock(block: any, slot = Number(block?.parentSlot ?? 0) + 1): TxSummary[] {
  return (block.transactions ?? []).map((tx: any, txIndex: number) => {
    const signature = tx.transaction.signatures[0];
    const accountKeys = tx.transaction.message.accountKeys ?? [];

    const programs = parsePrograms(tx);

    return {
      signature,
      slot,
      txIndex,
      feePayer: keyAt(accountKeys, 0),
      signers: parseSigners(tx),
      programs,
      dex: parseDex(programs),
      tokenDeltas: parseTokenDeltas(tx),
      lamportDeltas: parseLamportDeltas(tx),
      err: tx.meta?.err ?? null,
    };
  });
}
