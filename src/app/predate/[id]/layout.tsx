import type { Metadata } from "next";

export const metadata: Metadata = { title: "Watch the date" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
