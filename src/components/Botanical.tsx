import { botanicalPaths, botanicalCircles } from '../utils/botanical';

export function Botanical({ className = '' }: { className?: string }) {
  return <svg className={`botanical ${className}`} viewBox="0 0 160 220" fill="none" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
      {botanicalPaths.map(d => <path key={d} d={d} />)}
      {botanicalCircles.map(({x,y,radius}) => <circle key={x} cx={x} cy={y} r={radius} />)}
    </g>
  </svg>;
}
