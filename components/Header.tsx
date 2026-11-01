"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";

const links = [
  ["/", "Timer"],
  ["/analysis", "Analysis"],
  ["/settings", "Settings"],
] as const;

export default function Header() {
  const path = usePathname();

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
      <button className="quiet hide-narrow" onClick={logout}>Logout</button>
    </header>
  );
}
