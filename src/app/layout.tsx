import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

// The dashboard's fonts: Inter for text, Playfair Display for headings.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], weight: ["400", "600", "700"] });

export const metadata: Metadata = {
  title: "CHII Program Manager",
  description: "MELA monitoring, evaluation, learning and adaptation: CHII Program Manager and dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
