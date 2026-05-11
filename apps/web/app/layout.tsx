import type { Metadata } from "next";
import { Fraunces, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "./_components/wallet-provider";
import { QueryProvider } from "./_components/query-provider";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["opsz", "SOFT"],
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GetToasted — Every sandwich attack on your wallet. Exposed.",
  description:
    "GetToasted scans Solana wallets for sandwich attacks and quantifies USD losses. Find out what was extracted from you.",
  metadataBase: new URL("https://gettoasted.fun"),
  openGraph: {
    title: "GetToasted",
    description:
      "Every sandwich attack on your wallet. Exposed. Solana MEV extraction has cost traders $500M+.",
    url: "https://gettoasted.fun",
    siteName: "GetToasted",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GetToasted",
    description: "Every sandwich attack on your wallet. Exposed.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${interTight.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <QueryProvider>
          <WalletProvider>{children}</WalletProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
