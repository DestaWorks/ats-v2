"use client";

/**
 * Foundation styleguide (Wave 0.6). A living reference that wires and visually
 * proves the shared FE baseline: display states, the react-hook-form + Zod form
 * stack, and accessible dnd-kit drag-and-drop. Dev/reference route — remove or gate
 * before launch.
 */

import { useState } from "react";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input, controlClass } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, Td } from "@/components/ui/table";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { signInSchema, type SignInInput } from "@/lib/validation/auth";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-bold tracking-wide text-navy uppercase">{title}</h2>
      {children}
    </section>
  );
}

function SortableRow({ id, label }: { id: string; label: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      {...attributes}
      {...listeners}
      className="cursor-grab rounded-md border border-black/10 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
    >
      {label}
    </li>
  );
}

export default function StyleguidePage() {
  // --- Form (react-hook-form + Zod) ---
  const form = useZodForm(signInSchema);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;
  const onSubmit = (data: SignInInput) => toast.success(`Valid form → ${data.email}`);

  // --- dnd-kit sortable ---
  const [items, setItems] = useState([
    { id: "a", label: "New Candidate" },
    { id: "b", label: "Initial Screening" },
    { id: "c", label: "Submitted to Client" },
  ]);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((list) => {
        const from = list.findIndex((i) => i.id === active.id);
        const to = list.findIndex((i) => i.id === over.id);
        return arrayMove(list, from, to);
      });
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-10 p-8">
      <header className="no-print">
        <p className="text-xs font-semibold tracking-widest text-brand uppercase">
          Wave 0.6 · Foundation
        </p>
        <h1 className="text-2xl font-bold text-navy">Styleguide</h1>
        <p className="text-sm text-gray">
          Shared FE primitives, the form stack, and accessible DnD.
        </p>
      </header>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Primary</Button>
          <Button variant="success">Success</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="xs">xs</Button>
          <Button size="sm">sm</Button>
          <Button size="md">md</Button>
          <Button size="lg">lg</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button loading>Saving…</Button>
          <Button variant="success" loading>
            Saving…
          </Button>
          <Button disabled>Disabled</Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">neutral</Badge>
          <Badge tone="navy">navy</Badge>
          <Badge tone="success">success</Badge>
          <Badge tone="amber">amber</Badge>
          <Badge tone="danger">danger</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">12</Badge>
          <Badge tone="danger" size="sm" pill={false}>
            overdue · 9d
          </Badge>
          <Badge tone="amber" size="sm" pill={false}>
            stuck · 7d
          </Badge>
        </div>
      </Section>

      <Section title="Cards">
        <Card className="p-4">
          <p className="text-xs font-semibold tracking-wide text-gray uppercase">Card</p>
          <p className="mt-1 text-sm text-charcoal">
            The shared panel container — <code>rounded-xl border bg-white</code>. Polymorphic via{" "}
            <code>as</code> (section / aside) and padding/layout come from <code>className</code>.
          </p>
        </Card>
      </Section>

      <Section title="Table">
        <Table caption="Example candidates" columns={["Legacy ID", "Name", "Status"]}>
          <tr className="hover:bg-black/[0.02]">
            <Td className="font-mono text-xs">L-001</Td>
            <Td className="font-medium">Ada Lovelace</Td>
            <Td>
              <Badge tone="success" size="sm">
                add
              </Badge>
            </Td>
          </tr>
          <tr className="hover:bg-black/[0.02]">
            <Td className="font-mono text-xs">L-002</Td>
            <Td className="font-medium">Alan Turing</Td>
            <Td>
              <Badge tone="amber" size="sm">
                flag
              </Badge>
            </Td>
          </tr>
        </Table>
      </Section>

      <Section title="Display states">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="flex items-center gap-2 text-sm text-gray">
            <Spinner /> Loading…
          </div>
        </div>
        <EmptyState
          title="No candidates yet"
          description="Sourced leads you promote will show up here."
        />
        <ErrorState
          message="Could not load the pipeline."
          onRetry={() => toast.info("Retry clicked")}
        />
      </Section>

      <Section title="Form (react-hook-form + Zod)">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3" noValidate>
          <Field label="Email" htmlFor="sg-email" required error={errors.email?.message}>
            <input
              id="sg-email"
              type="email"
              {...register("email")}
              className={cn(controlClass, "px-3 py-2 text-sm")}
            />
          </Field>
          <Field label="Password" htmlFor="sg-password" required error={errors.password?.message}>
            <input
              id="sg-password"
              type="password"
              {...register("password")}
              className={cn(controlClass, "px-3 py-2 text-sm")}
            />
          </Field>
          <Button type="submit" disabled={isSubmitting} className="self-start">
            Validate
          </Button>
        </form>
      </Section>

      <Section title="Form controls (Input · Select · Textarea)">
        <div className="flex max-w-sm flex-col gap-3">
          <Field label="Input" htmlFor="sg-input">
            <Input id="sg-input" placeholder="Text input" />
          </Field>
          <Field label="Select" htmlFor="sg-select">
            <Select id="sg-select" defaultValue="">
              <option value="">Choose…</option>
              <option value="a">Option A</option>
              <option value="b">Option B</option>
            </Select>
          </Field>
          <Field label="Textarea" htmlFor="sg-textarea">
            <Textarea
              id="sg-textarea"
              rows={3}
              className="resize-y"
              placeholder="Multi-line text"
            />
          </Field>
        </div>
      </Section>

      <Section title="Drag & drop (dnd-kit — keyboard accessible)">
        <p className="text-xs text-gray">
          Focus an item with Tab, then use Space + arrow keys to reorder.
        </p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <SortableRow key={item.id} id={item.id} label={item.label} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </Section>
    </main>
  );
}
