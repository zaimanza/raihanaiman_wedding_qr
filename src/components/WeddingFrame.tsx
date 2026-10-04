import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createWeddingFrameSvg, weddingFrameDataUrl } from '../utils/weddingFrame';

export function WeddingFrame({ imageRef }: { imageRef: RefObject<HTMLImageElement | null> }) {
  const container = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState('');

  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const update = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const style = getComputedStyle(element);
      const inset = (side: string) => parseFloat(style.getPropertyValue(`--frame-safe-${side}`)) || 0;
      setSource(weddingFrameDataUrl(createWeddingFrameSvg(width, height, {
        top: inset('top'), bottom: inset('bottom'), right: inset('right'), left: inset('left'),
      })));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <div ref={container} className="wedding-frame" aria-hidden="true">
    {source && <img ref={imageRef} className="wedding-frame-art" src={source} alt="" draggable={false} />}
  </div>;
}
