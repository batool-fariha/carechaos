/** CareChaos mark: a "C" ring with a gap, and the amber dot that never arrived. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#14181f" />
      <path d="M22.51 21.46A8.5 8.5 0 1 1 22.51 10.54" fill="none" stroke="#3ddbc8" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="26.6" cy="16" r="2" fill="#f5b13d" />
    </svg>
  );
}
