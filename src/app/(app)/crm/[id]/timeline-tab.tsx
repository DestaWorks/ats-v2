"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ClientNoteDTO } from "@/lib/validation/client-note";
import type { ClientTimelineEntryDTO } from "@/lib/validation/client";
import { messageForFailure, postJson } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";

// --- Timeline tab (Wave 4.2 slice 2, extended with a note quick-add in the Health-Score slice) --

const TIMELINE_ICON: Record<ClientTimelineEntryDTO["kind"], string> = {
  client_created: "🏢",
  contact_added: "👤",
  task_created: "📋",
  task_completed: "✅",
  meeting_logged: "🗓️",
  deal_created: "💼",
  deal_closed: "🏁",
  note_logged: "📝",
};

export function TimelineTab({
  clientId,
  entries,
  onNoteAdded,
}: {
  clientId: string;
  entries: ClientTimelineEntryDTO[];
  onNoteAdded: (entry: ClientTimelineEntryDTO) => void;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);

  async function addNote() {
    if (!text.trim()) return;
    setPending(true);
    const res = await postJson<{ note: ClientNoteDTO }>(`/api/crm/clients/${clientId}/notes`, {
      text: text.trim(),
    });
    setPending(false);
    if (res.ok) {
      setText("");
      toast.success("Note logged");
      onNoteAdded({
        kind: "note_logged",
        at: res.data.note.createdAt,
        summary: `Note logged: ${res.data.note.text.length > 120 ? `${res.data.note.text.slice(0, 120)}…` : res.data.note.text}`,
      });
    } else {
      toast.error(messageForFailure(res.failure));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          aria-label="Log a note"
          placeholder="Log a quick call/touch note…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void addNote();
          }}
        />
        <Button type="button" size="sm" loading={pending} onClick={() => void addNote()}>
          Log note
        </Button>
      </div>

      {entries.length === 0 ? (
        <EmptyState title="No activity yet" description="Activity will appear here over time." />
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e, i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-lg border border-black/5 bg-white p-3"
            >
              <span className="text-lg" aria-hidden>
                {TIMELINE_ICON[e.kind]}
              </span>
              <div className="flex-1">
                <p className="text-sm text-charcoal">{e.summary}</p>
              </div>
              <time className="text-xs whitespace-nowrap text-gray">
                {new Date(e.at).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
