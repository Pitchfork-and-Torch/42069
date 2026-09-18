import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Floater = {
  id: number;
  x: number;
  y: number;
  text: string;
};

let nextId = 1;

export function useFloaters() {
  const [floaters, setFloaters] = useState<Floater[]>([]);

  const spawn = (text: string, x: number, y: number) => {
    const id = nextId++;
    setFloaters((prev) => [...prev.slice(-12), { id, x, y, text }]);
    window.setTimeout(() => {
      setFloaters((prev) => prev.filter((f) => f.id !== id));
    }, 950);
  };

  return { floaters, spawn };
}

export function FloatingLabels({ floaters }: { floaters: Floater[] }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {floaters.map((f) => (
        <span
          key={f.id}
          className={cn(
            "animate-float-up absolute font-mono text-sm font-medium tracking-wide text-nice",
          )}
          style={{ left: f.x, top: f.y }}
        >
          {f.text}
        </span>
      ))}
    </div>
  );
}

export function useClientMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
