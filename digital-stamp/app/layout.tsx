import type { Metadata } from "next";
import { Kantumruy_Pro } from "next/font/google";

import "./globals.css";

const kantumruyPro = Kantumruy_Pro({
  variable: "--font-kantumruy-pro",
  subsets: ["khmer", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "digital-stamptify",
  description: "កាតសមាជិកឌីជីថលដ៏សាមញ្ញសម្រាប់អាជីវកម្មក្នុងស្រុក។",
};

export default function RootLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <html
      lang="km"
      className={`
        ${kantumruyPro.variable}
        ${kantumruyPro.className}
        h-full
        antialiased
      `}
    >
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
