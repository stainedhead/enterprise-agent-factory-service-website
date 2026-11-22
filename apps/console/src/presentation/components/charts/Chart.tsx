import { useId } from "react";
import s from "./charts.module.css";
import { MARKERS, type Marker } from "./palette.js";

export interface ChartSeries {
  readonly id: string;
  readonly label: string;
  /** One value per category; `null` is a gap. */
  readonly values: readonly (number | null)[];
}

export interface ChartProps {
  kind: "bar" | "line" | "stacked";
  /** The chart's accessible name. */
  title: string;
  categories: readonly string[];
  series: readonly ChartSeries[];
  /** Text of a value in the axis, the series summary and the table. */
  formatValue?: (n: number) => string;
  /** What the values measure, for the axis and the table caption. */
  unit?: string;
}

const W = 640;
const H = 260;
const M = { top: 12, right: 12, bottom: 34, left: 56 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;
const color = (i: number) => `var(--s${i % 6})`;

/** A value rounded up to a tidy axis maximum (1, 2, 2.5, 5 times a power of ten). */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return m * p;
}

function mark(kind: Marker, x: number, y: number, fill: string) {
  const r = 4;
  switch (kind) {
    case "square":
      return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} fill={fill} />;
    case "diamond":
      return (
        <polygon points={`${x},${y - 5} ${x + 5},${y} ${x},${y + 5} ${x - 5},${y}`} fill={fill} />
      );
    case "triangle":
      return <polygon points={`${x},${y - 5} ${x + 5},${y + 4} ${x - 5},${y + 4}`} fill={fill} />;
    case "cross":
      return (
        <path
          d={`M${x - 4} ${y - 4}L${x + 4} ${y + 4}M${x + 4} ${y - 4}L${x - 4} ${y + 4}`}
          stroke={fill}
          strokeWidth={2}
        />
      );
    case "ring":
      return <circle cx={x} cy={y} r={r} fill="none" stroke={fill} strokeWidth={2} />;
    default:
      return <circle cx={x} cy={y} r={r} fill={fill} />;
  }
}

const sum = (xs: readonly (number | null)[]) => xs.reduce<number>((a, v) => a + (v ?? 0), 0);

/**
 * An SVG bar, line or stacked bar chart (WEB-9, WEB-US-42.1). Every chart has a data table in the same
 * place (a disclosure), each series is a focus stop that reads its summary, and colours are never the
 * only cue (markers, legend, table). No chart library: the console's size budget forbids one.
 */
export function Chart(p: ChartProps) {
  const id = useId();
  const fmt = p.formatValue ?? ((n: number) => String(n));
  const n = p.categories.length;
  const stacked = p.kind === "stacked";
  const totals = p.categories.map((_, i) => sum(p.series.map((x) => x.values[i] ?? 0)));
  const rawMax = stacked
    ? Math.max(0, ...totals)
    : Math.max(0, ...p.series.flatMap((x) => x.values.map((v) => v ?? 0)));
  const top = niceMax(rawMax);
  const y = (v: number) => M.top + PH - (v / top) * PH;
  const band = n > 0 ? PW / n : PW;
  const xc = (i: number) => M.left + band * i + band / 2;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const step = Math.max(1, Math.ceil(n / 8));
  const empty = n === 0 || p.series.length === 0;

  return (
    <figure className={s.chart} style={{ margin: 0 }}>
      <figcaption style={{ fontWeight: 700 }}>{p.title}</figcaption>
      {empty ? (
        <p className={s.empty}>No data for this range.</p>
      ) : (
        <>
          {/* biome-ignore lint/a11y/useSemanticElements: an SVG graphic cannot be a fieldset */}
          <svg
            className={s.svg}
            viewBox={`0 0 ${W} ${H}`}
            role="group"
            aria-label={`${p.title} chart`}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line className={s.grid} x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
                <text className={s.tick} x={M.left - 6} y={y(t) + 4} textAnchor="end">
                  {fmt(t)}
                </text>
              </g>
            ))}
            {p.categories.map((c, i) =>
              i % step === 0 ? (
                <text
                  key={`${id}-${c}`}
                  className={s.tick}
                  x={xc(i)}
                  y={H - 12}
                  textAnchor="middle"
                >
                  {c}
                </text>
              ) : null,
            )}
            {p.series.map((ser, si) => {
              const total = sum(ser.values);
              const peakIdx = ser.values.reduce<number>(
                (best, v, i) => ((v ?? -1) > (ser.values[best] ?? -1) ? i : best),
                0,
              );
              const summary = `${ser.label}: total ${fmt(total)}, highest ${fmt(ser.values[peakIdx] ?? 0)} on ${p.categories[peakIdx] ?? ""}`;
              const c = color(si);
              const barW = stacked ? band * 0.6 : (band * 0.7) / p.series.length;
              return (
                // biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: a series is a focus stop that reads its summary
                <g key={ser.id} className={s.series} role="img" tabIndex={0} aria-label={summary}>
                  {p.kind === "line" ? (
                    <>
                      <polyline
                        fill="none"
                        stroke={c}
                        strokeWidth={2}
                        points={ser.values
                          .map((v, i) => (v === null ? "" : `${xc(i)},${y(v)}`))
                          .filter(Boolean)
                          .join(" ")}
                      />
                      {ser.values.map((v, i) =>
                        v === null ? null : (
                          <g key={`${ser.id}-${p.categories[i]}`}>
                            <title>{`${ser.label}, ${p.categories[i]}: ${fmt(v)}`}</title>
                            {mark(MARKERS[si % MARKERS.length] as Marker, xc(i), y(v), c)}
                          </g>
                        ),
                      )}
                    </>
                  ) : (
                    ser.values.map((v, i) => {
                      if (v === null) return null;
                      const below = stacked
                        ? sum(p.series.slice(0, si).map((x) => x.values[i] ?? 0))
                        : 0;
                      const x0 = stacked
                        ? xc(i) - barW / 2
                        : M.left + band * i + band * 0.15 + barW * si;
                      return (
                        <rect
                          key={`${ser.id}-${p.categories[i]}`}
                          x={x0}
                          y={y(below + v)}
                          width={barW}
                          height={Math.max(0, y(below) - y(below + v))}
                          fill={c}
                        >
                          <title>{`${ser.label}, ${p.categories[i]}: ${fmt(v)}`}</title>
                        </rect>
                      );
                    })
                  )}
                </g>
              );
            })}
          </svg>
          <ul className={s.legend} aria-label="Legend">
            {p.series.map((ser, si) => (
              <li key={ser.id}>
                <span className={s.swatch} style={{ background: color(si) }} aria-hidden="true" />
                {ser.label}
              </li>
            ))}
          </ul>
          <ChartTable {...p} />
        </>
      )}
    </figure>
  );
}

/** The data behind a chart as a table, in a disclosure (the accessible alternative, WEB-US-42.1). */
export function ChartTable(
  p: Pick<ChartProps, "title" | "categories" | "series" | "formatValue" | "unit">,
) {
  const fmt = p.formatValue ?? ((n: number) => String(n));
  return (
    <details>
      <summary>Data table</summary>
      <div className={s.tableWrap}>
        <table>
          <caption>{`${p.title}${p.unit ? ` (${p.unit})` : ""}`}</caption>
          <thead>
            <tr>
              <th scope="col">Period</th>
              {p.series.map((x) => (
                <th scope="col" key={x.id}>
                  {x.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {p.categories.map((c, i) => (
              <tr key={c}>
                <th scope="row">{c}</th>
                {p.series.map((x) => (
                  <td key={x.id}>{x.values[i] == null ? "—" : fmt(x.values[i] as number)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
