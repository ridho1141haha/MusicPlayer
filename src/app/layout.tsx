import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ridho Music Web Lab — QA harness",
  description:
    "Web QA Lab for Ridho Music (Android, Java + Media3): QA dashboard, InnerTube search playground, fixture & parser tester over shared sanitized fixtures, interactive UI prototype and feature parity matrix.",
  keywords: ["Ridho Music", "QA lab", "Android", "Java", "Media3", "InnerTube", "fixtures", "parser"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Ridho Music Web Lab",
    description: "Test Ridho Music features in the browser before they ship to the Android APK.",
    siteName: "Ridho Music",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
