import type { Metadata } from "next";
import localFont from "next/font/local";
import { DM_Sans } from "next/font/google";
import "./globals.css";

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
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
    <html lang="en" className={`${geistMono.variable} ${dmSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
