import {
  BookImage,
  ChevronLeft,
  ChevronRight,
  FolderHeart,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../features/auth";
import { IconButton } from "./ui";

const links = [
  { to: "/library", label: "Library", icon: BookImage },
  { to: "/smart-categories", label: "Smart categories", icon: Sparkles },
  { to: "/collections", label: "Collections", icon: FolderHeart },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { session, logout, loggingOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("mosaiq-sidebar") === "collapsed",
  );
  const [dark, setDark] = useState(() =>
    localStorage.getItem("mosaiq-theme")
      ? localStorage.getItem("mosaiq-theme") === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("mosaiq-theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    localStorage.setItem("mosaiq-sidebar", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);

  const pattern =
    pathname.startsWith("/smart-categories") || pathname.startsWith("/collections")
      ? "grid"
      : "dots";

  return (
    <div className={`app-shell ${collapsed ? "app-shell--collapsed" : ""}`}>
      <header className="mobile-header">
        <Brand />
        <IconButton
          label={open ? "Close navigation" : "Open navigation"}
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </IconButton>
      </header>
      {open && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`sidebar ${open ? "sidebar--open" : ""}`}>
        <Brand />
        <button
          className="sidebar__collapse"
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        <nav className="nav" aria-label="Main navigation">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              onClick={() => setOpen(false)}
              className={({ isActive }) => `nav__link ${isActive ? "nav__link--active" : ""}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__note">
          <span>Private by default</span>
          <p>Your originals stay in private storage.</p>
        </div>
        <button
          className="theme-toggle"
          type="button"
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          title={collapsed ? (dark ? "Light mode" : "Dark mode") : undefined}
          onClick={() => setDark(!dark)}
        >
          {dark ? <Sun size={17} /> : <Moon size={17} />}
          <span>{dark ? "Light mode" : "Dark mode"}</span>
        </button>
        <button
          className="account-action"
          type="button"
          title={collapsed ? "Sign out" : undefined}
          disabled={loggingOut}
          onClick={() => void logout()}
        >
          <LogOut size={17} />
          <span>
            Sign out
            <small>{session.owner.username}</small>
          </span>
        </button>
      </aside>
      <main className={`main-content main-content--${pattern}`}>{children}</main>
    </div>
  );
}

function Brand() {
  return (
    <NavLink to="/library" className="brand" aria-label="Mosaiq library">
      <span className="brand__mark" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="brand__word">Mosaiq</span>
    </NavLink>
  );
}
