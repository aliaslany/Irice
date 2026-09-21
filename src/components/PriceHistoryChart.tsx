"use client";

/**
 * Single-series line chart for a lot's price-per-kg history.
 *
 * Built per the dataviz skill: one series needs no legend (the section
 * title already names what's plotted), a 2px line with round caps, >=8px
 * markers with a surface-color ring, recessive hairline gridlines, and a
 * hover crosshair+tooltip. The plain list already on the page stays
 * underneath as the required table-view fallback — this component never
 * replaces it.
 */
import { useId, useMemo, useState } from "react";
import { formatJalali } from "../globals/date";
import { formatMoney, rial } from "../globals/money";
import { toPersianDigits } from "../globals/digits";

export interface PriceHistoryPoint {
  id: string;
  effectiveFromIso: string;
  pricePerKgRial: number;
}

const WIDTH = 640;
const HEIGHT = 220;
const MARGIN = { top: 16, right: 12, bottom: 28, left: 12 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;

function niceTicks(min: number, max: number, count: number): number[] {
  if (min === max) return [min];
  const span = max - min;
  const rawStep = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const niceNormalized = normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;
  const step = niceNormalized * magnitude;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}

export function PriceHistoryChart({ points }: { points: PriceHistoryPoint[] }) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const sorted = useMemo(
    () => [...points].sort((a, b) => new Date(a.effectiveFromIso).getTime() - new Date(b.effectiveFromIso).getTime()),
    [points],
  );

  const times = sorted.map((p) => new Date(p.effectiveFromIso).getTime());
  const prices = sorted.map((p) => p.pricePerKgRial);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  const ticks = niceTicks(minPrice, maxPrice, 4);
  const yMin = Math.min(minPrice, ticks[0] ?? minPrice);
  const yMax = Math.max(maxPrice, ticks[ticks.length - 1] ?? maxPrice);

  const x = (t: number) => (maxTime === minTime ? PLOT_W / 2 : ((t - minTime) / (maxTime - minTime)) * PLOT_W);
  const y = (p: number) => (yMax === yMin ? PLOT_H / 2 : PLOT_H - ((p - yMin) / (yMax - yMin)) * PLOT_H);

  const coords = sorted.map((p, i) => ({ px: x(times[i]!), py: y(prices[i]!), point: p }));
  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.px.toFixed(1)} ${c.py.toFixed(1)}`).join(" ");
  const lastPoint = coords[coords.length - 1];

  const hovered = hoverIndex !== null ? coords[hoverIndex] : null;

  function handlePointerMove(clientX: number, svg: SVGSVGElement) {
    const rect = svg.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * WIDTH - MARGIN.left;
    let nearest = 0;
    let nearestDist = Infinity;
    coords.forEach((c, i) => {
      const dist = Math.abs(c.px - relX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full touch-none overflow-hidden"
        // The page is dir="rtl", and CSS `direction` inherits into SVG text
        // layout — without overriding it here, `text-anchor="end"` flips to
        // anchor the *left* edge and grow rightward, pushing every number
        // label off the right side of the chart. The chart's own coordinate
        // space is inherently LTR (time flows left→right), so it opts out
        // of the inherited direction rather than working around it per label.
        style={{ direction: "ltr" }}
        role="img"
        aria-label="نمودار سابقه قیمت هر کیلوگرم این محموله"
        onPointerMove={(e) => handlePointerMove(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-strong)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--color-brand-strong)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {ticks.map((tick) => {
            const ty = y(tick);
            return (
              <g key={tick}>
                <line x1={0} x2={PLOT_W} y1={ty} y2={ty} stroke="var(--color-line)" strokeWidth={1} />
                <text
                  x={PLOT_W}
                  y={ty - 4}
                  textAnchor="end"
                  className="tabular"
                  fill="var(--color-muted)"
                  fontSize={10}
                >
                  {toPersianDigits(tick.toLocaleString("en-US"))}
                </text>
              </g>
            );
          })}

          {coords.length > 1 && (
            <path d={`${linePath} L ${coords[coords.length - 1]!.px} ${PLOT_H} L ${coords[0]!.px} ${PLOT_H} Z`} fill={`url(#${gradientId})`} stroke="none" />
          )}

          {coords.length > 1 && (
            <path d={linePath} fill="none" stroke="var(--color-brand-strong)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          )}

          {coords.map((c, i) => (
            <circle
              key={c.point.id}
              cx={c.px}
              cy={c.py}
              r={i === hoverIndex ? 6 : 4}
              fill="var(--color-brand-strong)"
              stroke="var(--color-surface)"
              strokeWidth={2}
            />
          ))}

          {lastPoint && (
            <text
              x={lastPoint.px}
              y={Math.max(10, lastPoint.py - 12)}
              textAnchor="end"
              className="tabular"
              fill="var(--color-ink)"
              fontSize={12}
              fontWeight={600}
            >
              {formatMoney(rial(lastPoint.point.pricePerKgRial), { unit: "toman" })}
            </text>
          )}

          {hovered && (
            <line
              x1={hovered.px}
              x2={hovered.px}
              y1={0}
              y2={PLOT_H}
              stroke="var(--color-muted)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}
        </g>
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-line bg-surface px-3 py-2 text-sm shadow-[var(--shadow-card)]"
          style={{
            // Physical `left`, not `insetInlineStart` — `hovered.px` is a
            // position in the chart's LTR coordinate space, and the logical
            // property would mirror it under the page's dir="rtl".
            left: `${(hovered.px / WIDTH) * 100}%`,
            top: `${((hovered.py + MARGIN.top) / HEIGHT) * 100}%`,
            transform: "translate(-50%, -120%)",
          }}
        >
          <p className="text-muted">{formatJalali(new Date(hovered.point.effectiveFromIso))}</p>
          <p className="tabular font-medium">
            {formatMoney(rial(hovered.point.pricePerKgRial), { unit: "toman" })}
          </p>
        </div>
      )}
    </div>
  );
}
