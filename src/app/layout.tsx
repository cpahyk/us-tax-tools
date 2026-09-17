import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "US Tax Tools",
  description:
    "Secure tax organizer and document portal for accounting firms and their clients.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
