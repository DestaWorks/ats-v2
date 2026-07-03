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
              className="rounded-md border border-black/15 px-3 py-2 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
            />
          </Field>
          <Field label="Password" htmlFor="sg-password" required error={errors.password?.message}>
            <input
              id="sg-password"
              type="password"
              {...register("password")}
              className="rounded-md border border-black/15 px-3 py-2 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
            />
          </Field>
          <button
            type="submit"
            disabled={isSubmitting}
            className="self-start rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            Validate
          </button>
        </form>
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
