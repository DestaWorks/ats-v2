"use client";

import { useEffect, useState } from "react";
import type { PipelineHealthDTO } from "@destaworks/contracts/validation/pipeline-health";
import { postJson, messageForFailure } from "@/lib/api/client";
import { Badge, type BadgeTone } from "@destaworks/ui/badge";
import { Button } from "@destaworks/ui/button";
import { Card } from "@destaworks/ui/card";
import { Spinner } from "@destaworks/ui/spinner";

/** legacy `ats_pipeline_health`'s own rubric: 0-40 red, 40-70 orange, 70-100 green. */
function toneForScore(score: number): BadgeTone {
  if (score < 40) return "danger";
  if (score < 70) return "amber";
  return "success";
}

/**
 * AI Pipeline Health strip (Wave 5.5 backlog, legacy Drop 53 `ats_pipeline_health`) — auto-fetches
 * once on mount (matches legacy), plus a manual refresh button. No persistence: ephemeral per-view,
 * same as legacy (no health table).
 */
export function HealthStrip() {
  const [health, setHealth] = useState<PipelineHealthDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);

  async function refresh() {
    setPending(true);
    setError(null);
    const res = await postJson<PipelineHealthDTO>("/api/pipeline/health", {});
    setPending(false);
    if (res.ok) setHealth(res.data);
    else setError(messageForFailure(res.failure));
  }

  useEffect(() => {
    void refresh();
  }, []);

  if (!health && !error && !pending) return null;

  return (
    <Card className="flex items-center gap-3 px-4 py-3">
      {pending && !health ? (
        <>
          <Spinner className="h-4 w-4" />
          <p className="text-sm text-gray">Reading pipeline health…</p>
        </>
      ) : error ? (
        <p className="flex-1 text-sm text-red">{error}</p>
      ) : health ? (
        <>
          <Badge tone={toneForScore(health.healthScore)} size="md">
            {health.healthScore}
          </Badge>
          <div className="flex-1 text-sm text-charcoal">
            <p>{health.diagnostic}</p>
            <p className="text-gray">→ {health.topAction}</p>
          </div>
        </>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={() => void refresh()}
      >
        ↻ Refresh
      </Button>
    </Card>
  );
}
