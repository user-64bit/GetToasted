import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "./_components/wallet-provider";
import { QueryProvider } from "./_components/query-provider";

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GetToasted — See every sandwich attack on your Solana wallet",
  description:
    "GetToasted reconstructs the sandwich attacks run against your Solana wallet and prices what MEV bots extracted from you, down to the cent.",
  metadataBase: new URL("https://gettoasted.fun"),
  openGraph: {
    title: "GetToasted — the forensic record of what MEV took from you",
    description:
      "Paste a Solana wallet. GetToasted reconstructs every sandwich attack — attacker, validator, pool, and the exact USD extracted.",
    url: "https://gettoasted.fun",
    siteName: "GetToasted",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GetToasted — see every sandwich attack on your wallet",
    description:
      "A forensic scan of your Solana wallet. Every sandwich attack, reconstructed and priced.",
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
      className={`${interTight.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <QueryProvider>
          <WalletProvider>{children}</WalletProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
