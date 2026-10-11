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
  title: "Ridho Music — Open-source Android music player",
  description:
    "Delivery dashboard for Ridho Music v1.1.0: Java 17 · Media3 1.5.1 · Room 2.6.1. Download the debug APK, browse the verified source, unit tests, acceptance criteria and docs.",
  keywords: ["Ridho Music", "Android", "Java", "Media3", "ExoPlayer", "open source", "music player"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Ridho Music — Open-source Android music player",
    description: "Free & open-source Android music player built with Java and Media3. Real background playback, no ads, no trackers.",
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
