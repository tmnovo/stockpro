import { NavLink, useNavigate } from "react-router-dom";
import {
  SquaresFour,
  UsersFour,
  Package,
  ClipboardText,
  UserCircle,
  ListMagnifyingGlass,
  GearSix,
  SignOut,
  CubeFocus,
  Truck,
} from "@phosphor-icons/react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

const navItems = (t, user) => {
  const items = [
    { to: "/", icon: SquaresFour, label: t("dashboard"), testid: "nav-dashboard" },
    { to: "/clients", icon: UsersFour, label: t("clients"), perm: ["clients", "view"], testid: "nav-clients" },
    { to: "/products", icon: Package, label: t("products"), perm: ["products", "view"], testid: "nav-products" },
    { to: "/suppliers", icon: Truck, label: t("suppliers"), perm: ["suppliers", "view"], testid: "nav-suppliers" },
    { to: "/orders", icon: ClipboardText, label: t("orders"), perm: ["orders", "view"], testid: "nav-orders" },
  ];
  if (user?.role === "admin") {
    items.push(
      { to: "/users", icon: UserCircle, label: t("users"), testid: "nav-users" },
      { to: "/logs", icon: ListMagnifyingGlass, label: t("logs"), testid: "nav-logs" },
    );
  }
  items.push({ to: "/settings", icon: GearSix, label: t("settings"), testid: "nav-settings" });
  return items;
};

export function SidebarContent({ companyName = "ProdStock V1.1 Beta", onNavigate }) {
  const { user, logout, hasPermission } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const items = navItems(t, user).filter((i) =>
    i.perm ? hasPermission(i.perm[0], i.perm[1]) || user?.role === "admin" : true
  );

  return (
    <div className="flex flex-col h-full bg-sidebar">
      <div className="h-16 flex items-center gap-2 px-6 border-b border-sidebar-border shrink-0">
        <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
          <CubeFocus size={18} weight="bold" className="text-primary-foreground" />
        </div>
        <div className="font-display font-bold tracking-tight text-foreground truncate" data-testid="company-name-sidebar">
          {companyName}
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              data-testid={item.testid}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-panel",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                )
              }
            >
              <Icon size={18} weight="duotone" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border shrink-0">
        <div className="px-3 py-2 mb-2">
          <div className="text-xs text-muted-foreground">Logged in as</div>
          <div className="text-sm font-semibold truncate" data-testid="user-name-sidebar">{user?.name}</div>
          <div className="text-xs text-muted-foreground capitalize">{t(`role_${user?.role}`)}</div>
        </div>
        <button
          onClick={async () => { await logout(); navigate("/login"); onNavigate?.(); }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-destructive transition-panel"
          data-testid="logout-button"
        >
          <SignOut size={18} weight="duotone" />
          <span>{t("logout")}</span>
        </button>
      </div>
    </div>
  );
}

export default function Sidebar({ companyName }) {
  return (
    <aside className="hidden md:flex md:flex-col w-64 h-screen border-r border-sidebar-border shrink-0 sticky top-0" data-testid="sidebar-desktop">
      <SidebarContent companyName={companyName} />
      <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-sidebar-border font-mono leading-snug">
        ProdStock — Made on Portugal by Tiago Novo e Bruno Santos
      </div>
    </aside>
  );
}
