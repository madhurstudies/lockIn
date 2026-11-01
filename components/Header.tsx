"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";

const links = [
  ["/", "Timer"],
  ["/analysis", "Analysis"],
] as const;

export default function Header() {
  const path = usePathname();

  function toggleTheme() {
    const el = document.documentElement;
    const dark = getComputedStyle(el).colorScheme === "dark";
    const next = dark ? "light" : "dark";
    el.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {}
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    location.href = "/login";
  }

  return (
    <header className="bar">
      <Link href="/" className="logo" aria-label="Lock In"><Logo /></Link>
      <nav className="nav">
        {links.map(([href, label]) => (
          <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
      <button className="quiet icon" onClick={toggleTheme} aria-label="Toggle light or dark theme">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />
        </svg>
      </button>
      <button className="quiet" onClick={logout}>Logout</button>
    </header>
  );
}
