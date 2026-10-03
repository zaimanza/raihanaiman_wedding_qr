export function Botanical({ className = '' }: { className?: string }) {
  return (
    <svg className={`botanical ${className}`} viewBox="0 0 160 220" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 211C50 166 33 99 117 15M34 173C62 156 87 147 128 142M48 124C29 104 21 79 22 56M72 74C104 71 129 48 149 28" />
        <path d="M33 163C7 152 7 130 10 116c20 7 28 23 23 47ZM46 143c26 1 42-17 43-34-24 0-40 13-43 34ZM46 111C27 91 35 69 44 59c13 18 16 34 2 52ZM73 78c-5-28 9-46 22-51 6 22-2 41-22 51ZM91 55c25 3 43-5 48-20-21-8-38 0-48 20ZM77 159c-1-21 13-36 27-40 3 23-7 35-27 40ZM102 147c20 16 38 10 47 0-16-12-32-14-47 0Z" />
        <path d="M24 57c-14-3-15-15-5-17-6-11 3-19 11-10 7-11 17-5 13 6 12 2 12 14 0 16-2 11-15 14-19 5Z" />
        <circle cx="31" cy="44" r="3" />
        <path d="M115 17c-9 1-14-6-8-11-7-5-3-13 5-9 2-8 11-7 11 1 8-1 11 7 4 11 4 7-3 13-9 8Z" />
        <circle cx="116" cy="7" r="2" />
        <path d="m11 91 3-6 3 6-3 6-3-6ZM116 96l2-4 2 4-2 4-2-4Z" />
      </g>
    </svg>
  );
}
