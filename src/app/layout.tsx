import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: "Allo Inventory Reservations",
  description: "Concurrency-safe checkout inventory reservations for multi-warehouse retail."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>): JSX.Element {
  return (
    <html lang="en" className={outfit.variable}>
      <body className="font-sans antialiased bg-background text-foreground">
        <div className="container py-5 md:py-7">
          <header className="mb-7 flex items-center justify-between gap-4">
            <Link
              className="flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              href="/"
              aria-label="Allo inventory home"
            >
              <span
                className="grid h-10 w-10 place-items-center rounded-lg bg-primary font-extrabold text-primary-foreground"
                aria-hidden="true"
              >
                A
              </span>
              <span>
                <strong className="block text-base leading-tight">Allo Reservations</strong>
                <span className="text-sm text-muted-foreground">Multi-warehouse checkout holds</span>
              </span>
            </Link>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
