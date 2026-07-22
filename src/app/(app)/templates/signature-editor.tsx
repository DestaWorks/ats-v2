"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SIGNATURE_PRESETS, defaultSignature } from "@/lib/constants/templates";
import { patchJson, messageForFailure } from "@/lib/api/client";
import type { UserPreferencesDTO } from "@/lib/validation/user-preferences";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Email signature editor (Wave 4.1, legacy `index.html:3810-3835`) — presets, a live-editable
 * textarea, and a preview, auto-saving to `PATCH /api/me/preferences` ~500ms after the user stops
 * typing (legacy autosaved every keystroke to `localStorage`, which is free; a network PATCH per
 * keystroke isn't, so a debounce is the equivalent behavior at a sane cost — same "always saved"
 * feel, no explicit Save button).
 */
export function SignatureEditor({
  recruiterName,
  signature,
  onSaved,
  onCancel,
}: {
  recruiterName: string;
  signature: string | null;
  onSaved: (next: string | null) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(signature ?? "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const skipNextSave = useRef(true); // don't fire a save on mount for the initial value

  async function save(value: string) {
    setSaving(true);
    const res = await patchJson<UserPreferencesDTO>("/api/me/preferences", {
      emailSignature: value || null,
    });
    setSaving(false);
    if (!res.ok) toast.error(messageForFailure(res.failure));
  }

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    // Debounced autosave while typing. A pending timeout is cleared on unmount — the "Done" button
    // below force-saves immediately so navigating away right after typing never loses the edit.
    const handle = setTimeout(() => void save(draft), 500);
    return () => clearTimeout(handle);
  }, [draft]);

  const preview = draft || defaultSignature(recruiterName);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-black/5 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-navy">Email Signature</h2>
        <Button type="button" variant="secondary" size="sm" onClick={() => onCancel()}>
          ← Back to Templates
        </Button>
      </div>

      <div className="flex gap-2">
        {SIGNATURE_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setDraft(preset.body(recruiterName))}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <div>
        <div className="mb-1 text-[11px] text-gray">SIGNATURE</div>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          className="resize-y"
          placeholder={defaultSignature(recruiterName)}
        />
        <div className="mt-1 text-[11px] text-gray">{saving ? "Saving…" : "Saved"}</div>
      </div>

      <div>
        <div className="mb-1 text-[11px] text-gray">PREVIEW</div>
        <div className="rounded-lg bg-[#f8f9ff] p-3.5 text-sm whitespace-pre-wrap">{preview}</div>
      </div>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() => {
          navigator.clipboard.writeText(preview);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? "Copied!" : "Copy Signature for Gmail"}
      </Button>

      <Button
        type="button"
        size="sm"
        className="self-start"
        onClick={() => {
          void save(draft); // force-save immediately — don't rely on the debounce timer landing
          onSaved(draft || null);
        }}
      >
        Done
      </Button>
    </div>
  );
}
