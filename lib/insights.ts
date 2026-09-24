/**
 * Notable changes, worked out from figures the report already loaded.
 *
 * The bar for saying anything is deliberately high. A page that flags every
 * wobble trains people to ignore it, so a change has to clear both a
 * percentage threshold and a size floor -- a 60% rise on two conversions is
 * noise, not news -- and at most three are ever shown, largest first.
 */

export type Alert = {
  id: string;
  tone: "positive" | "caution";
  headline: string;
  detail: string;
};

export type AlertMetrics = {
  cost: number;
  conversions: number;
  costPerConversion: number;
  conversionRate: number;
  clicks: number;
};

export type AlertCampaign = {
  id: string;
  name: string;
  cost: number;
  conversions: number;
};

const THRESHOLD = 15;

function change(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** The campaign whose spend moved most, which is usually the explanation. */
function biggestSpendMover(
  campaigns: AlertCampaign[],
  previous: AlertCampaign[]
): { name: string; delta: number } | null {
  if (campaigns.length === 0) return null;

  const previousById = new Map(previous.map((c) => [c.id, c]));
  let leader: { name: string; delta: number } | null = null;

  for (const campaign of campaigns) {
    const before = previousById.get(campaign.id)?.cost ?? 0;
    const delta = campaign.cost - before;

    if (!leader || Math.abs(delta) > Math.abs(leader.delta)) {
      leader = { name: campaign.name, delta };
    }
  }

  return leader;
}

export function buildAlerts({
  metrics,
  previousMetrics,
  campaigns,
  previousCampaigns,
  formatCurrency,
}: {
  metrics: AlertMetrics;
  previousMetrics: AlertMetrics | null;
  campaigns: AlertCampaign[];
  previousCampaigns: AlertCampaign[];
  formatCurrency: (value: number) => string;
}): Alert[] {
  if (!previousMetrics) return [];

  const alerts: Alert[] = [];
  const mover = biggestSpendMover(campaigns, previousCampaigns);
  const attribution =
    mover && Math.abs(mover.delta) > 1
      ? ` The largest move was ${mover.name}, ${mover.delta > 0 ? "up" : "down"} ${formatCurrency(Math.abs(mover.delta))}.`
      : "";

  // Cost per conversion: the figure that decides whether spending more was
  // worth it, so it is checked before volume.
  const cpaChange = change(metrics.costPerConversion, previousMetrics.costPerConversion);
  if (
    cpaChange !== null &&
    Math.abs(cpaChange) >= THRESHOLD &&
    metrics.conversions >= 5 &&
    previousMetrics.conversions >= 5
  ) {
    const worse = cpaChange > 0;
    alerts.push({
      id: "cpa",
      tone: worse ? "caution" : "positive",
      headline: `Each conversion cost ${Math.abs(Math.round(cpaChange))}% ${worse ? "more" : "less"} than last period`,
      detail: `${formatCurrency(metrics.costPerConversion)} against ${formatCurrency(previousMetrics.costPerConversion)}.${worse ? attribution : ""}`,
    });
  }

  const conversionChange = change(metrics.conversions, previousMetrics.conversions);
  if (
    conversionChange !== null &&
    Math.abs(conversionChange) >= THRESHOLD &&
    Math.max(metrics.conversions, previousMetrics.conversions) >= 10
  ) {
    const up = conversionChange > 0;
    alerts.push({
      id: "conversions",
      tone: up ? "positive" : "caution",
      headline: `Conversions ${up ? "rose" : "fell"} ${Math.abs(Math.round(conversionChange))}%`,
      detail: `${metrics.conversions} this period against ${previousMetrics.conversions} before.`,
    });
  }

  const spendChange = change(metrics.cost, previousMetrics.cost);
  if (spendChange !== null && Math.abs(spendChange) >= THRESHOLD && metrics.cost > 0) {
    const up = spendChange > 0;
    // Spending more is only worth flagging as a worry when results did not follow.
    const resultsFollowed =
      conversionChange !== null && conversionChange >= spendChange - 5;

    alerts.push({
      id: "spend",
      tone: up && !resultsFollowed ? "caution" : "positive",
      headline: `Spend ${up ? "rose" : "fell"} ${Math.abs(Math.round(spendChange))}%`,
      detail:
        up && !resultsFollowed
          ? `${formatCurrency(metrics.cost)} against ${formatCurrency(previousMetrics.cost)}, without a matching rise in conversions.${attribution}`
          : `${formatCurrency(metrics.cost)} against ${formatCurrency(previousMetrics.cost)}.${attribution}`,
    });
  }

  return alerts.slice(0, 3);
}
