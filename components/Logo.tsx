export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="12" stroke="var(--active)" strokeWidth="4" />
      <path d="M16 4a12 12 0 0 1 12 12" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
