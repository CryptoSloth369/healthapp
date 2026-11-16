import { AreaSwitch, BottomNav } from "@/components/bottom-nav";
import { TimezoneSync } from "@/components/timezone-sync";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TimezoneSync />
      <AreaSwitch />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-3 pb-28">{children}</main>
      <BottomNav />
    </>
  );
}
