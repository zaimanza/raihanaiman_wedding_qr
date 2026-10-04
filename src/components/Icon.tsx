type IconName = 'switch' | 'arrow' | 'heart' | 'check' | 'camera' | 'send' | 'retry' | 'close' | 'play' | 'upload' | 'plus';

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === 'switch' && <><path d="M4 8a8 8 0 0 1 13-3l3 3M20 3v5h-5M20 16A8 8 0 0 1 7 19l-3-3M4 21v-5h5" /><circle cx="12" cy="12" r="3" /></>}
      {name === 'arrow' && <><path d="m14 6-6 6 6 6M8 12h13" /></>}
      {name === 'heart' && <path d="M20.5 4.8a5.2 5.2 0 0 0-7.4 0L12 5.9l-1.1-1.1a5.2 5.2 0 0 0-7.4 7.4L12 21l8.5-8.8a5.2 5.2 0 0 0 0-7.4Z" />}
      {name === 'check' && <path d="m5 12 4 4L19 6" />}
      {name === 'play' && <path d="m9 5 11 7-11 7V5Z" />}
      {name === 'close' && <path d="m6 6 12 12M18 6 6 18" />}
      {name === 'camera' && <><path d="m8 5 1.5-2h5L16 5h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" /><circle cx="12" cy="12" r="4" /></>}
      {name === 'send' && <><path d="m21 3-7 18-4-7-7-4 18-7ZM10 14l11-11" /></>}
      {name === 'retry' && <><path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7" /></>}
      {name === 'upload' && <><path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></>}
      {name === 'plus' && <path d="M12 5v14M5 12h14" />}
    </svg>
  );
}
