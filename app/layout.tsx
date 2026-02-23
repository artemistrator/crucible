import "./globals.css";
import { Outfit } from "next/font/google";
import ProjectSidebar from "@/components/ProjectSidebar";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { Header } from "@/components/Header";
import { RouteProgressBar } from "@/components/RouteProgressBar";

const outfit = Outfit({ subsets: ["latin"], display: "swap" });

export const dynamic = "force-dynamic";

export const metadata = {
  title: "AI Orchestrator",
  description: "Превращаем сложные идеи в понятные планы разработки."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${outfit.className} flex h-screen w-screen bg-background text-foreground antialiased`}>
        <ThemeProvider defaultTheme="light" storageKey="ui-theme">
          <div className="flex h-screen w-screen flex-col">
            <RouteProgressBar />
            <Header />
            <div className="flex flex-1 overflow-hidden">
              <ProjectSidebar />
              <main className="flex-1 overflow-y-auto">{children}</main>
            </div>
            <Toaster />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
