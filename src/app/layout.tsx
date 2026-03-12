import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tagman",
  description: "Modern Tagman remake built with Next.js and Vercel best practices.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
