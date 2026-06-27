export function MetaLogo({ color = '#1778f2', size = 18 }: { color?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M4.5 14.8c0-3.9 2.1-8 4.9-8 1.6 0 2.7 1.1 4 3.1 1.2-2 2.4-3.1 4-3.1 2.8 0 4.9 4.1 4.9 8 0 2.2-.9 3.8-2.7 3.8-1.7 0-3-1.3-5.2-5.1l-1-1.7-1 1.7c-2.2 3.8-3.5 5.1-5.2 5.1-1.8 0-2.7-1.6-2.7-3.8Z"
        stroke={color}
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
