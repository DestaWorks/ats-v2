"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { LearnChapter, LearnProgressDTO } from "@/lib/validation/learn";
import { messageForFailure, patchJson } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function LearnView({
  chapters,
  initialProgress,
}: {
  chapters: LearnChapter[];
  initialProgress: LearnProgressDTO;
}) {
  const [progress, setProgress] = useState(initialProgress);
  const [active, setActive] = useState<LearnChapter | null>(null);
  const [pending, setPending] = useState(false);

  const completed = chapters.filter((c) => progress[c.id]).length;
  const pct = Math.round((completed / chapters.length) * 100);

  async function setChapterDone(chapterId: string, done: boolean) {
    setPending(true);
    const res = await patchJson<LearnProgressDTO>("/api/me/learn-progress", { chapterId, done });
    setPending(false);
    if (res.ok) setProgress(res.data);
    else toast.error(messageForFailure(res.failure));
  }

  return (
    <>
      {/* Design pass 2026-08-04: was `to-brand`, a navy→tan gradient that read as muddy/unintentional
          — legacy's tutorial banner is navy-only (`linear-gradient(135deg,#1E4A8A,#3A6BB8)`,
          `index.html:5216`), matched here exactly. */}
      <div className="rounded-xl border-none bg-gradient-to-br from-navy to-[#3A6BB8] p-6 text-white">
        <p className="mb-1.5 text-[11px] font-bold tracking-[0.12em] text-white/85 uppercase">
          Operator Tutorial
        </p>
        <h1 className="mb-1.5 text-2xl font-bold">Learn the system in 30 minutes.</h1>
        <p className="mb-3.5 max-w-xl text-sm leading-relaxed text-white/90">
          Eight focused chapters. Each ends on a &quot;Try it&quot; button that drops you into the
          real screen. Built for new associates, useful as a refresher for anyone.
        </p>
        <div className="flex items-center gap-3.5">
          <div className="h-2 max-w-sm flex-1 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-semibold whitespace-nowrap">
            {completed} of {chapters.length} complete
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {chapters.map((ch) => {
          const done = Boolean(progress[ch.id]);
          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => setActive(ch)}
              className={`flex flex-col gap-2 rounded-lg border-l-[3px] bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${done ? "border-l-green" : "border-l-black/10"}`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-bold tracking-wide text-gray uppercase">
                  Chapter {ch.num} · {ch.mins} min
                </span>
                {done ? (
                  <span className="rounded bg-green/10 px-2 py-0.5 text-[9px] font-bold tracking-wide text-green uppercase">
                    Complete
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-gray">Open →</span>
                )}
              </div>
              <p className="text-[15px] leading-tight font-bold text-charcoal">{ch.title}</p>
              <p className="text-xs leading-relaxed text-gray">{ch.blurb}</p>
            </button>
          );
        })}
      </div>

      <Modal open={active !== null} onClose={() => setActive(null)} title={active?.title ?? ""}>
        {active ? (
          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold tracking-wide text-gray uppercase">
              Chapter {active.num} · {active.mins} min
            </p>

            <div className="flex min-h-[140px] flex-col items-center justify-center gap-1.5 rounded-lg bg-gradient-to-br from-[#F5F8FF] to-[#EBF0F8] p-6 text-center">
              <p className="text-[11px] font-bold tracking-wide text-navy/80 uppercase">
                Animated Walkthrough
              </p>
              <code className="rounded border border-black/10 bg-white px-3 py-1.5 text-xs">
                {active.media}
              </code>
              <p className="max-w-xs text-[11px] text-gray">
                Record a Loom of this workflow, export as a GIF, and drop it into the{" "}
                <code>/tutorial/</code> folder with this exact filename.
              </p>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-bold tracking-wide text-gray uppercase">
                Step by step
              </p>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-charcoal">
                {active.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-black/5 pt-4">
              {progress[active.id] ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={pending}
                  onClick={() => void setChapterDone(active.id, false)}
                >
                  Mark not complete
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={pending}
                  onClick={() => void setChapterDone(active.id, true)}
                >
                  Mark complete
                </Button>
              )}
              <Link href={active.tryHref} onClick={() => void setChapterDone(active.id, true)}>
                <Button type="button" size="sm">
                  {active.tryLabel} →
                </Button>
              </Link>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
