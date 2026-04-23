import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Sidebar, { SidebarContent } from "./Sidebar";
import Header from "./Header";
import { api } from "@/lib/api";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export default function Layout({ title, children }) {
  const [companyName, setCompanyName] = useState("ProdStock V1.1 Beta");
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    api.get("/settings")
      .then(({ data }) => setCompanyName(data.company_name || "ProdStock V1.1 Beta"))
      .catch(() => {});
  }, []);

  // Close drawer on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar companyName={companyName} />

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 bg-sidebar" data-testid="mobile-sidebar">
          <SidebarContent companyName={companyName} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col min-w-0">
        <Header title={title} onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 p-3 sm:p-4 md:p-6 max-w-[1600px] w-full">
          {children}
        </main>
        <footer className="px-4 py-3 text-xs text-muted-foreground border-t border-border text-center font-mono md:hidden">
          ProdStock — Made on Portugal by Tiago Novo e Bruno Santos
        </footer>
      </div>
    </div>
  );
}
