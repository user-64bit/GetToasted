"use client";

import { useState } from "react";
import { CompleteView } from "./complete-view";
import type { DashboardMock } from "./mock-data";
import { ScanningView } from "./scanning-view";

export type DashboardMode = "scanning" | "complete";

interface DashboardClientProps {
  wallet: string;
  initialMode: DashboardMode;
  data: DashboardMock;
}

export function DashboardClient({
  wallet,
  initialMode,
  data,
}: DashboardClientProps) {
  const [mode, setMode] = useState<DashboardMode>(initialMode);

  if (mode === "scanning") {
    return (
      <ScanningView
        wallet={wallet}
        onComplete={() => setMode("complete")}
      />
    );
  }
  return <CompleteView wallet={wallet} data={data} />;
}
