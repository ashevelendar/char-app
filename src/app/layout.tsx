import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "../components/AppShell";
import { AuthGate } from "../components/AuthGate";
import { CharacterProvider } from "../context/CharacterContext";
import { AuthProvider } from "../context/AuthContext";

export const metadata: Metadata = {
  title: "D&D Character Manager",
  description: "An online D&D character manager backed by Supabase.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-stone-950 text-stone-100 antialiased">
        <AuthProvider>
          <CharacterProvider>
            <AuthGate>
              <AppShell>{children}</AppShell>
            </AuthGate>
          </CharacterProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
