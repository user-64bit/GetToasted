import type { ReactNode } from "react";

interface PullQuoteProps {
  attr?: string;
  children: ReactNode;
}

export function PullQuote({ attr, children }: PullQuoteProps) {
  return (
    <div className="pullquote">
      <div className="pullquote-text">{children}</div>
      {attr ? <div className="pullquote-attr">— {attr}</div> : null}
    </div>
  );
}
