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
  title: "Eldoria Online — RPG Souls-like Pixel Art",
  description: "MMORPG top-down 2D de fantasia e sobrevivência. Combate souls-like, masmorras, farm de inimigos e plantações. Forje seu destino em Eldoria.",
  keywords: ["Eldoria", "RPG", "pixel art", "souls-like", "survival", "dungeon", "2D"],
  authors: [{ name: "Eldoria Online" }],
  icons: {
    icon: "/game/icon.png",
    apple: "/game/icon.png",
  },
  openGraph: {
    title: "Eldoria Online",
    description: "RPG pixel art isekai souls-like com masmorras e sobrevivência",
    url: "https://chat.z.ai",
    siteName: "Eldoria Online",
    type: "website",
    images: [{ url: "/game/icon.png", width: 1024, height: 1024 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Eldoria Online",
    description: "RPG pixel art isekai souls-like com masmorras e sobrevivência",
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
        suppressHydrationWarning
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
