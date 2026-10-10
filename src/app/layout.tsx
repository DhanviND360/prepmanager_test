import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Prep Manager | Command Center", description: "Live package preparation compliance inspection" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
