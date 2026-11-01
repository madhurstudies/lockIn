/** Re-mounts on every tab change, so the page can ease in (see .page in globals.css). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page">{children}</div>;
}
