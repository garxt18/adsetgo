/**
 * Hero animation: one agency at the centre, its clients around it, figures
 * flowing out along each link.
 *
 * It draws what the product does -- a single connection feeding many private
 * reports -- rather than a mock report with invented numbers. Every colour is a
 * theme token or currentColor, so it is correct in light and dark without a
 * second drawing, and the motion stops under prefers-reduced-motion through
 * the rule in globals.css.
 */

const CENTER = { x: 300, y: 300 };

// Placed by hand rather than on a perfect circle: an even ring reads as a
// diagram, a slightly irregular one reads as a network.
const CLIENTS = [
  { x: 118, y: 150, r: 26, delay: 0 },
  { x: 470, y: 128, r: 22, delay: 0.5 },
  { x: 520, y: 330, r: 28, delay: 1 },
  { x: 430, y: 500, r: 22, delay: 1.5 },
  { x: 170, y: 478, r: 26, delay: 2 },
  { x: 84, y: 318, r: 20, delay: 2.5 },
];

export function HeroVisual() {
  return (
    <div className="relative h-full min-h-[420px] w-full">
      {/* Soft light behind the network, in the brand hue of the current theme. */}
      <div
        aria-hidden="true"
        className="animate-glow absolute inset-[12%] rounded-full bg-brand/20 blur-3xl"
      />

      <svg
        viewBox="0 0 600 600"
        className="animate-drift relative h-full w-full text-brand"
        role="img"
        aria-label="One agency connected to many clients, each receiving its own report"
      >
        {/* Faint orbit rings give the network depth without adding meaning. */}
        {[120, 200, 270].map((radius) => (
          <circle
            key={radius}
            cx={CENTER.x}
            cy={CENTER.y}
            r={radius}
            fill="none"
            stroke="var(--line)"
            strokeWidth="1"
            strokeDasharray="2 6"
          />
        ))}

        {/* Links: a quiet base line with figures travelling along it. */}
        {CLIENTS.map((client, index) => (
          <g key={`link-${index}`}>
            <line
              x1={CENTER.x}
              y1={CENTER.y}
              x2={client.x}
              y2={client.y}
              stroke="var(--line-strong)"
              strokeWidth="1.5"
            />
            <line
              x1={CENTER.x}
              y1={CENTER.y}
              x2={client.x}
              y2={client.y}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="animate-flow"
              style={{ animationDelay: `${client.delay}s` }}
            />
          </g>
        ))}

        {/* Clients: a pulse on arrival, then a small rising line inside. */}
        {CLIENTS.map((client, index) => (
          <g key={`client-${index}`}>
            <circle
              cx={client.x}
              cy={client.y}
              r={client.r}
              fill="currentColor"
              opacity="0.18"
              className="animate-pulse-ring"
              style={{
                transformOrigin: `${client.x}px ${client.y}px`,
                animationDelay: `${client.delay}s`,
              }}
            />
            <circle
              cx={client.x}
              cy={client.y}
              r={client.r}
              fill="var(--surface)"
              stroke="var(--line-strong)"
              strokeWidth="1.5"
            />
            <polyline
              points={`${client.x - client.r * 0.5},${client.y + client.r * 0.25} ${client.x - client.r * 0.15},${client.y - client.r * 0.05} ${client.x + client.r * 0.1},${client.y + client.r * 0.1} ${client.x + client.r * 0.5},${client.y - client.r * 0.35}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        ))}

        {/* The agency: the one connection everything flows from. */}
        <circle
          cx={CENTER.x}
          cy={CENTER.y}
          r="58"
          fill="currentColor"
          opacity="0.14"
          className="animate-pulse-ring"
          style={{ transformOrigin: `${CENTER.x}px ${CENTER.y}px` }}
        />
        <circle cx={CENTER.x} cy={CENTER.y} r="46" fill="currentColor" />
        <path
          d="M281 312 L294 296 L304 304 L320 284"
          fill="none"
          stroke="var(--surface)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
