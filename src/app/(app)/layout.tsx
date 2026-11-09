import { BottomNav } from "@/components/bottom-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-28">{children}</main>
      <BottomNav />
    </>
  );
}
