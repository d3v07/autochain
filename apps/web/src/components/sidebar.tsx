"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useChat } from "@/lib/chat-context";
import {
  LayoutGrid,
  Users,
  Package,
  ClipboardList,
  FileText,
  Sparkles,
  LogOut,
  Activity,
  FolderKanban,
} from "lucide-react";

const CUSTOMER_NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/products", label: "Products", icon: Package },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/documents", label: "Documents", icon: FolderKanban },
  { href: "/workflows", label: "Workflows", icon: Activity },
  { href: "/insights", label: "AI Insights", icon: Sparkles },
  { href: "/edi", label: "EDI Log", icon: FileText },
] as const;

const ADMIN_NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/sessions", label: "Sessions", icon: Activity },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList },
  { href: "/documents", label: "Documents", icon: FolderKanban },
  { href: "/workflows", label: "Workflows", icon: Activity },
  { href: "/insights", label: "AI Insights", icon: Sparkles },
  { href: "/edi", label: "EDI Log", icon: FileText },
] as const;

const VENDOR_NAV_ITEMS = [
  { href: "/vendor/dashboard", label: "Dashboard", icon: LayoutGrid },
  {
    href: "/vendor/purchase-orders",
    label: "Purchase Orders",
    icon: ClipboardList,
  },
  { href: "/vendor/catalog", label: "Catalog", icon: Package },
  { href: "/vendor/invoices", label: "Invoices", icon: FileText },
  { href: "/documents", label: "Documents", icon: FolderKanban },
  { href: "/workflows", label: "Workflows", icon: Activity },
  { href: "/insights", label: "AI Insights", icon: Sparkles },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { openChat } = useChat();
  const isAdmin = user?.role === "admin";
  const isVendor = user?.role === "vendor";
  const navItems = isAdmin
    ? ADMIN_NAV_ITEMS
    : isVendor
      ? VENDOR_NAV_ITEMS
      : CUSTOMER_NAV_ITEMS;

  return (
    <aside className="flex h-full w-56 flex-col border-r border-border bg-surface">
      <div className="border-b border-border px-4 py-4">
        <h1 className="text-lg font-bold tracking-tight text-accent">
          eSupplyPro
        </h1>
        <p className="text-xs text-muted">AutoChain</p>
        <button
          type="button"
          onClick={() => openChat(undefined, { shellMode: "workspace" })}
          data-agent-id="nav-assistant-workspace"
          className="mt-3 flex w-full items-center justify-between rounded border border-ai/20 bg-ai-light/40 px-3 py-2 text-left text-sm text-ai-foreground transition-colors hover:bg-ai-light"
        >
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Assistant
          </span>
          <span className="text-[11px] font-medium uppercase tracking-wide">
            Open
          </span>
        </button>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {(isAdmin || isVendor) && (
          <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
            {isAdmin ? "Admin" : "Vendor"}
          </p>
        )}
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          const isAI = item.href === "/insights";
          return (
            <Link
              key={item.href}
              href={item.href}
              data-agent-id={`nav-${item.href.split("/").filter(Boolean).join("-") || "home"}`}
              className={`flex items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors ${
                active
                  ? isAI
                    ? "bg-ai-light text-ai-foreground font-medium"
                    : "bg-accent-light text-accent font-medium"
                  : "text-muted hover:bg-background hover:text-foreground"
              }`}
            >
              <Icon className={`h-4 w-4 ${isAI && active ? "text-ai" : ""}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {user && (
        <div className="border-t border-border px-4 py-3">
          <p className="truncate text-sm font-medium text-foreground">
            {user.companyName}
          </p>
          <p className="truncate text-xs text-muted">{user.email}</p>
          <button
            onClick={logout}
            className="mt-2 flex items-center gap-1.5 text-xs text-muted hover:text-danger transition-colors"
          >
            <LogOut className="h-3 w-3" />
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}
