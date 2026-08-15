"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export const PipelineDistributionChart = dynamic(
  () => import("./pipeline-distribution-chart").then((m) => m.PipelineDistributionChart),
  { ssr: false, loading: () => <Skeleton className="h-56 w-full" /> },
);
