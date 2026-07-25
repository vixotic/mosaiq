import { BookImage, FolderHeart, Menu, Moon, Settings, Sun, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { IconButton } from "./ui";

const links = [
  { to: "/library", label: "Library", icon: BookImage },
  { to: "/collections", label: "Collections", icon: FolderHeart },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(() =>
    localStorage.getItem("mosaiq-theme")
      ? localStorage.getItem("mosaiq-theme") === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("mosaiq-theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <div className="app-shell">
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
        <nav className="nav" aria-label="Main navigation">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) => `nav__link ${isActive ? "nav__link--active" : ""}`}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__note">
          <span>Private by default</span>
          <p>Your originals stay on this machine.</p>
        </div>
        <button className="theme-toggle" onClick={() => setDark(!dark)}>
          {dark ? <Sun size={17} /> : <Moon size={17} />}
          {dark ? "Light mode" : "Dark mode"}
        </button>
      </aside>
      <main className="main-content">{children}</main>
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
      <span>Mosaiq</span>
    </NavLink>
  );
}
