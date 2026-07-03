export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-8">
      <p className="text-xs font-semibold tracking-widest text-brand uppercase">
        Desta Works · Foundation
      </p>
      <h1 className="text-3xl font-bold text-navy">DestaHealth ATS</h1>
      <p className="text-gray">
        New stack scaffold is live (Wave 0). Auth, database, and the pipeline land in the next waves
        — see <code className="rounded bg-label px-1 py-0.5 text-navy">docs/</code>.
      </p>
    </main>
  );
}
