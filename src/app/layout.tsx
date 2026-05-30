import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Drop CLIX",
  description: "Drop CLIX Client Portal",
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
