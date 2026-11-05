import { useEffect, useRef, useState } from "react";

export function useWidth<T extends HTMLElement>(initial = 800) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((es) => setW(Math.max(200, es[0].contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export const cat = (i: number, n: number) => (n <= 8 ? `var(--cat-${(i % 8) + 1})` : "var(--neutral-mark)");
