/**
 * Instant skeleton while the intercepted detail's RSC payload loads — the dialog appears the
 * moment the card is clicked (perceived performance), then streams in the real content.
 */
export default function InterceptedDetailLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Loading candidate"
        className="w-full max-w-4xl animate-pulse rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="h-4 w-28 rounded bg-black/10" />
        <div className="mt-6 h-7 w-64 rounded bg-black/10" />
        <div className="mt-3 flex gap-2">
          <div className="h-5 w-14 rounded-full bg-black/10" />
          <div className="h-5 w-20 rounded-full bg-black/10" />
          <div className="h-5 w-32 rounded-full bg-black/10" />
        </div>
        <div className="mt-6 h-3 w-16 rounded bg-black/10" />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-6 w-24 rounded-full bg-black/10" />
          ))}
        </div>
        <div className="mt-8 h-64 rounded-xl bg-black/5" />
      </div>
    </div>
  );
}
