"use client";

import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "./utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  appName?: string;
  tone?: "primary" | "secondary" | "danger";
}

const toneStyle = {
  primary: {
    background: "var(--accent)",
    color: "var(--text-inverse)",
    border: "1px solid var(--accent)",
  },
  secondary: {
    background: "var(--bg-overlay)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
  },
  danger: {
    background: "var(--threat-red)",
    color: "var(--text-inverse)",
    border: "1px solid var(--threat-red-border)",
  },
} as const;

export const Button = ({
  children,
  className,
  appName,
  tone = "secondary",
  style,
  ...props
}: ButtonProps) => {
  return (
    <button
      className={cn("gt-btn", className)}
      style={{
        ...toneStyle[tone],
        borderRadius: "var(--radius-control)",
        padding: "10px 14px",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        fontWeight: 500,
        ...style,
      }}
      data-app-name={appName}
      {...props}
    >
      {children}
    </button>
  );
};
