"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  AI_WORKSPACE_PRESETS,
  AI_WORKSPACE_PRESET_LABELS,
  type AiWorkspacePreset,
  type WorkspaceResultDTO,
} from "@/lib/validation/crm-ai-workspace";
import { messageForFailure, postJson } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// --- AI Client Workspace tab (Wave 4.2 flex) ------------------------------------------------

export function AiWorkspaceTab({ clientId }: { clientId: string }) {
  const [customPrompt, setCustomPrompt] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [logging, setLogging] = useState(false);

  async function generate(input: { preset?: AiWorkspacePreset; customPrompt?: string }) {
    setPending(true);
    setResult(null);
    const res = await postJson<WorkspaceResultDTO>(
      `/api/crm/clients/${clientId}/ai-workspace`,
      input,
    );
    setPending(false);
    if (res.ok) setResult(res.data.text);
    else toast.error(messageForFailure(res.failure));
  }

  async function logToCrm() {
    if (!result) return;
    setLogging(true);
    const res = await postJson(`/api/crm/clients/${clientId}/notes`, { text: result });
    setLogging(false);
    if (res.ok) toast.success("Logged to CRM as a note");
    else toast.error(messageForFailure(res.failure));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {AI_WORKSPACE_PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            variant="secondary"
            size="sm"
            loading={pending}
            onClick={() => void generate({ preset })}
          >
            {AI_WORKSPACE_PRESET_LABELS[preset]}
          </Button>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          aria-label="Custom prompt"
          placeholder="Or ask something specific about this client…"
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && customPrompt.trim()) {
              void generate({ customPrompt: customPrompt.trim() });
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          disabled={!customPrompt.trim()}
          loading={pending}
          onClick={() => void generate({ customPrompt: customPrompt.trim() })}
        >
          Ask
        </Button>
      </div>

      {pending ? <p className="text-sm text-gray">Generating…</p> : null}

      {result ? (
        <div className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4">
          <p className="text-sm whitespace-pre-wrap text-charcoal">{result}</p>
          <div className="flex justify-end border-t border-black/5 pt-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={logging}
              onClick={() => void logToCrm()}
            >
              Log to CRM
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
