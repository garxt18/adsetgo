/**
 * Building blocks for the downloadable PDF reports: one page frame, header,
 * figure tiles, charts and tables, in the product's own colours. Server only.
 *
 * Charts are drawn as vector shapes rather than pictures of the dashboard, so
 * a report prints sharp at any size and every figure in it is real text.
 */

import path from "node:path";
import type { ReactElement, ReactNode } from "react";
import {
  Document,
  Font,
  G,
  Page,
  Path,
  Polyline,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
  type DocumentProps,
} from "@react-pdf/renderer";

// The PDF standard fonts cannot draw ₹, and nearly every figure here is in
// rupees, so Inter is embedded. next.config.ts traces these files into the
// deployed functions; without that they would be missing on Vercel.
const FONTS = path.join(process.cwd(), "lib/pdf/fonts");
Font.register({
  family: "Inter",
  fonts: [
    { src: path.join(FONTS, "Inter-Regular.ttf"), fontWeight: 400 },
    { src: path.join(FONTS, "Inter-SemiBold.ttf"), fontWeight: 600 },
  ],
});
// Never break a campaign name or an account id across lines with a hyphen.
Font.registerHyphenationCallback((word) => [word]);

/** The light theme's tokens (app/globals.css): paper is always light. */
export const C = {
  ink: "#0b1220",
  inkSoft: "#556072",
  inkFaint: "#8792a4",
  line: "#e4e9f0",
  sunken: "#f1f4f9",
  brand: "#0b63e5",
  brandTint: "#eef4ff",
  positive: "#0b8f5f",
  positiveTint: "#e7f6ef",
  negative: "#c9252d",
  negativeTint: "#fdecec",
  caution: "#a65c07",
  cautionTint: "#fdf3e6",
};

export const s = StyleSheet.create({
  page: {
    fontFamily: "Inter",
    fontSize: 9,
    color: C.ink,
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
  },
  eyebrow: { fontSize: 7.5, fontWeight: 600, color: C.brand, letterSpacing: 1.2, textTransform: "uppercase" },
  label: { fontSize: 7, fontWeight: 600, color: C.inkFaint, letterSpacing: 0.8, textTransform: "uppercase" },
  muted: { color: C.inkSoft },
  faint: { color: C.inkFaint },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 11, fontWeight: 600, marginBottom: 8 },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 10 },
  row: { flexDirection: "row" },
});

/**
 * "2 October 2026, 10:42 pm IST". The platform reports in rupees for Indian
 * agencies (lib/format.ts), so the stamp uses India's clock rather than the
 * server's, which on Vercel is UTC and can be a day behind.
 */
export function generatedAt(now = new Date()): string {
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(now)} IST`;
}

/** The finished document as a download. */
export async function pdfResponse(document: ReactElement<DocumentProps>, filename: string) {
  const buffer = await renderToBuffer(document);
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      // A client's figures: never kept by a browser or proxy cache.
      "Cache-Control": "private, no-store",
    },
  });
}

/** The brand square with its rising line, as in components/ui/brand.tsx. */
function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Rect x={0} y={0} width={48} height={48} rx={12} fill={C.brand} />
      <G transform="translate(12 12)">
        <Path d="M3 17l6-6 4 4 8-8" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Path d="M15 7h6v6" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </G>
    </Svg>
  );
}

/** A4 document with the product mark and a page footer on every page. */
export function ReportDocument({
  title,
  footer,
  children,
}: {
  title: string;
  footer: string;
  children: ReactNode;
}) {
  return (
    <Document title={title} author="AdSetGo" creator="AdSetGo" producer="AdSetGo">
      <Page size="A4" style={s.page}>
        <View fixed style={{ ...s.row, alignItems: "center", marginBottom: 18 }}>
          <BrandMark />
          <Text style={{ marginLeft: 7, fontSize: 11, fontWeight: 600 }}>
            AdSet<Text style={{ color: C.brand }}>Go</Text>
          </Text>
        </View>

        {children}

        <View
          fixed
          style={{
            position: "absolute",
            left: 36,
            right: 36,
            bottom: 20,
            ...s.row,
            justifyContent: "space-between",
            borderTopWidth: 1,
            borderTopColor: C.line,
            paddingTop: 6,
            fontSize: 7,
            color: C.inkFaint,
          }}
        >
          <Text>{footer}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function ReportHeader({
  eyebrow,
  title,
  lines,
}: {
  eyebrow: string;
  title: string;
  lines: string[];
}) {
  return (
    <View>
      <Text style={s.eyebrow}>{eyebrow}</Text>
      <Text style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>{title}</Text>
      {lines.map((line) => (
        <Text key={line} style={{ ...s.muted, marginTop: 3 }}>
          {line}
        </Text>
      ))}
    </View>
  );
}

/** Coloured strip for things the reader must not miss, such as generated figures. */
export function Notice({ tone, children }: { tone: "caution" | "positive"; children: ReactNode }) {
  return (
    <View
      style={{
        marginTop: 10,
        padding: 8,
        borderRadius: 6,
        backgroundColor: tone === "caution" ? C.cautionTint : C.positiveTint,
        color: tone === "caution" ? C.caution : C.positive,
      }}
    >
      {typeof children === "string" ? <Text>{children}</Text> : children}
    </View>
  );
}

export const SAMPLE_NOTICE =
  "Sample data. These figures are generated for development and are not from Google Ads.";

export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <View style={s.section}>
      {/* Keeps a heading from being stranded at the foot of a page. */}
      <View minPresenceAhead={60}>
        <Text style={s.sectionTitle}>{title}</Text>
        {note ? <Text style={{ ...s.muted, marginTop: -4, marginBottom: 8 }}>{note}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/**
 * A period-over-period change with an arrow as well as colour, so it survives
 * black-and-white printing. Mirrors the dashboard's DeltaChip.
 */
export function Change({
  change,
  invert = false,
  neutral = false,
}: {
  change: number | null | undefined;
  invert?: boolean;
  neutral?: boolean;
}) {
  if (change === null || change === undefined || !Number.isFinite(change)) {
    return <Text style={{ fontSize: 7.5, color: C.inkFaint }}>No prior period</Text>;
  }

  const rounded = Math.round(change * 10) / 10;
  const flat = Math.abs(rounded) < 0.05;
  const good = invert ? rounded < 0 : rounded > 0;
  const [color, backgroundColor] =
    flat || neutral
      ? [C.inkSoft, C.sunken]
      : good
        ? [C.positive, C.positiveTint]
        : [C.negative, C.negativeTint];

  return (
    <Text style={{ fontSize: 7.5, fontWeight: 600, color, backgroundColor, paddingHorizontal: 4, paddingVertical: 1.5, borderRadius: 6 }}>
      {flat ? "→" : rounded > 0 ? "▲" : "▼"} {Math.abs(rounded)}%
    </Text>
  );
}

export type Tile = {
  label: string;
  value: string;
  previous?: string;
  caption?: string;
  change?: number | null;
  invert?: boolean;
  neutral?: boolean;
};

/** Figures in rows of `columns`, each with its previous value and change. */
export function TileGrid({ tiles, columns = 4 }: { tiles: Tile[]; columns?: number }) {
  const rows: Tile[][] = [];
  for (let i = 0; i < tiles.length; i += columns) rows.push(tiles.slice(i, i + columns));

  return (
    <View>
      {rows.map((row, r) => (
        <View key={r} style={{ ...s.row, marginTop: r === 0 ? 0 : 8 }} wrap={false}>
          {Array.from({ length: columns }, (_, c) => {
            const tile = row[c];
            return (
              <View key={c} style={{ flex: 1, marginLeft: c === 0 ? 0 : 8, ...(tile ? s.card : {}) }}>
                {tile ? (
                  <>
                    <Text style={s.label}>{tile.label}</Text>
                    <Text style={{ fontSize: 15, fontWeight: 600, marginTop: 5 }}>{tile.value}</Text>
                    <View style={{ ...s.row, alignItems: "center", marginTop: 5 }}>
                      {tile.change !== undefined ? (
                        <Change change={tile.change} invert={tile.invert} neutral={tile.neutral} />
                      ) : null}
                    </View>
                    {tile.previous !== undefined ? (
                      <Text style={{ ...s.faint, fontSize: 7, marginTop: 4 }}>Previous: {tile.previous}</Text>
                    ) : null}
                    {tile.caption ? <Text style={{ ...s.faint, fontSize: 7, marginTop: 4 }}>{tile.caption}</Text> : null}
                  </>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export type Point = { label: string; value: number };

/**
 * One series over the period, with the previous period dashed behind it.
 * Scaled from zero: on paper there is no hover to read exact values, so bar
 * heights and line heights should compare honestly.
 */
export function LineChart({
  title,
  total,
  points,
  comparison,
  format,
  width = 250,
  height = 90,
}: {
  title: string;
  total: string;
  points: Point[];
  comparison?: Point[];
  format: (value: number) => string;
  width?: number;
  height?: number;
}) {
  const padX = 4;
  const padTop = 8;
  const padBottom = 4;
  const values = [...points, ...(comparison ?? [])].map((p) => p.value);
  const max = Math.max(0, ...values);
  const top = max > 0 ? max * 1.1 : 1;
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;
  const xAt = (i: number, n: number) => padX + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => padTop + innerH - (v / top) * innerH;
  const line = (series: Point[]) =>
    series.map((p, i) => `${xAt(i, series.length).toFixed(1)},${yAt(p.value).toFixed(1)}`).join(" ");

  const hasData = points.length > 1 && max > 0;
  // One day (a single-day custom range) has no line to draw; say its value.
  const empty =
    points.length === 1 ? `One day only: ${format(points[0].value)} on ${points[0].label}` : "No data in this period";

  return (
    <View style={{ ...s.card, width }} wrap={false}>
      <View style={{ ...s.row, justifyContent: "space-between", alignItems: "baseline" }}>
        <Text style={{ fontWeight: 600 }}>{title}</Text>
        <Text style={{ fontSize: 11, fontWeight: 600 }}>{total}</Text>
      </View>

      {hasData ? (
        <>
          <Svg width={width - 22} height={height} viewBox={`0 0 ${width} ${height}`} style={{ marginTop: 8 }}>
            <Polyline points={`${padX},${padTop + innerH} ${width - padX},${padTop + innerH}`} stroke={C.line} strokeWidth={1} />
            {comparison && comparison.length > 1 ? (
              <Polyline points={line(comparison)} stroke={C.inkFaint} strokeWidth={1.2} strokeDasharray="3 3" fill="none" />
            ) : null}
            {points.length > 1 ? (
              <Path
                d={`M${xAt(0, points.length)},${padTop + innerH} L${line(points).replace(/ /g, " L")} L${xAt(points.length - 1, points.length)},${padTop + innerH} Z`}
                fill={C.brand}
                fillOpacity={0.1}
              />
            ) : null}
            <Polyline points={line(points)} stroke={C.brand} strokeWidth={1.8} fill="none" strokeLinejoin="round" />
          </Svg>
          <View style={{ ...s.row, justifyContent: "space-between", marginTop: 3, fontSize: 6.5, color: C.inkFaint }}>
            <Text>{points[0]?.label}</Text>
            <Text>Peak {format(Math.max(...points.map((p) => p.value)))}</Text>
            <Text>{points[points.length - 1]?.label}</Text>
          </View>
          {comparison && comparison.length > 1 ? (
            <View style={{ ...s.row, alignItems: "center", marginTop: 5, fontSize: 6.5, color: C.inkSoft }}>
              <View style={{ width: 10, height: 1.8, backgroundColor: C.brand, marginRight: 4 }} />
              <Text style={{ marginRight: 12 }}>This period</Text>
              <View style={{ width: 10, borderTopWidth: 1.2, borderTopColor: C.inkFaint, borderStyle: "dashed", marginRight: 4 }} />
              <Text>Previous period</Text>
            </View>
          ) : null}
        </>
      ) : (
        <View style={{ height, marginTop: 8, borderRadius: 6, backgroundColor: C.sunken, justifyContent: "center", alignItems: "center" }}>
          <Text style={s.faint}>{empty}</Text>
        </View>
      )}
    </View>
  );
}

/** A tiny trend line for a table cell. */
export function Sparkline({ points, width = 56, height = 14 }: { points: number[]; width?: number; height?: number }) {
  if (points.length < 2) return <Text style={{ ...s.faint, fontSize: 7 }}>—</Text>;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const coords = points
    .map((v, i) => `${((i / (points.length - 1)) * (width - 2) + 1).toFixed(1)},${(height - 1 - ((v - min) / span) * (height - 2)).toFixed(1)}`)
    .join(" ");

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Polyline points={coords} stroke={C.brand} strokeWidth={1} fill="none" />
    </Svg>
  );
}

/** Ranked horizontal bars, e.g. conversions by campaign. */
export function BarList({ items }: { items: Array<{ label: string; value: number; display: string }> }) {
  const max = Math.max(1, ...items.map((item) => item.value));

  return (
    <View>
      {items.map((item) => (
        <View key={item.label} style={{ marginBottom: 7 }} wrap={false}>
          <View style={{ ...s.row, justifyContent: "space-between" }}>
            <Text style={{ maxWidth: "80%" }}>{item.label}</Text>
            <Text style={{ fontWeight: 600 }}>{item.display}</Text>
          </View>
          <View style={{ marginTop: 3, height: 5, borderRadius: 3, backgroundColor: C.sunken }}>
            <View style={{ width: `${(item.value / max) * 100}%`, height: 5, borderRadius: 3, backgroundColor: C.brand }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export type Column = { label: string; flex: number; align?: "left" | "right" };

/** A ruled table. Rows never split across pages; the header repeats on each. */
export function Table({ columns, rows }: { columns: Column[]; rows: ReactNode[][] }) {
  const cell = (col: Column) => ({
    flex: col.flex,
    paddingHorizontal: 4,
    textAlign: col.align ?? "left",
  });

  return (
    <View>
      <View
        fixed
        style={{ ...s.row, borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 5, marginBottom: 2 }}
      >
        {columns.map((col) => (
          <Text key={col.label} style={{ ...s.label, ...cell(col) }}>
            {col.label}
          </Text>
        ))}
      </View>
      {rows.map((row, r) => (
        <View
          key={r}
          wrap={false}
          style={{ ...s.row, alignItems: "center", paddingVertical: 4.5, borderBottomWidth: 0.5, borderBottomColor: C.line }}
        >
          {row.map((value, c) =>
            typeof value === "string" || typeof value === "number" ? (
              <Text key={c} style={cell(columns[c])}>
                {value}
              </Text>
            ) : (
              <View key={c} style={{ ...cell(columns[c]), alignItems: columns[c].align === "right" ? "flex-end" : "flex-start" }}>
                {value}
              </View>
            )
          )}
        </View>
      ))}
    </View>
  );
}
