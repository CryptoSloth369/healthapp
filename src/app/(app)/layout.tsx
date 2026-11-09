import { BottomNav } from "@/components/bottom-nav";
import { TimezoneSync } from "@/components/timezone-sync";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TimezoneSync />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-28">{children}</main>
      <BottomNav />
    </>
  );
}
