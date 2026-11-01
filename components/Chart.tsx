"use client";
import { useEffect, useRef } from "react";

type Stack = { name: string; colour: string; values: number[] };
export type BarsOpts = {
  labels: string[]; values: number[]; stacks: Stack[] | null;
  format: (v: number) => string; tickFormat: (v: number) => string; xAt?: number[]; height?: number;
};
declare global {
  interface Window { Charts?: { bars: (el: HTMLElement, o: object) => void } }
}

/** Draws one bar chart with the vendored taste-skill helper (public/vendor/charts.js). */
export default function BarChart({ opts, label }: { opts: BarsOpts; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const legend = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!box.current || !window.Charts) return;
    window.Charts.bars(box.current, { ...opts, height: opts.height ?? 180, legend: opts.stacks ? legend.current : null });
    if (!opts.stacks && legend.current) legend.current.replaceChildren();
  }, [opts]);
  return (
    <figure className="chart" aria-label={label}>
      <div ref={legend} className="chart-legend-box" />
      <div ref={box} />
    </figure>
  );
}
