import type { ResumeVariant } from "@/lib/constants/documents";
import { RESUME_VARIANT_LABELS } from "@/lib/constants/documents";
import type {
  ClinicalResume,
  OperationsResume,
  PrescriberResume,
  ResumeData,
} from "@/lib/validation/resume";

/**
 * The client-facing BRANDED résumé render (parity audit P0 #6 — legacy's core output). Read-only:
 * a polished, printable document built from the reviewed extraction, in the new app's design
 * language (serif identity, hairline structure, brand wordmark) rather than the legacy 1:1 look.
 * Empty strings/arrays (the extractor's "unknown") hide their row/section, so the page never
 * prints blank labels. Pure presentation — the flow owns Print/Email actions. Print CSS relies on
 * the global baseline: app chrome is `no-print`, this card flattens to borderless white.
 */

/** Skip empty strings; join the rest with a middot. */
function metaLine(parts: (string | undefined)[]): string {
  return parts.filter((p) => p && p.trim()).join(" · ");
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="border-b border-brand/30 pb-1 text-[11px] font-bold tracking-[0.14em] text-brand uppercase">
        {title}
      </h3>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Chips({ items }: { items: string[] }) {
  const real = items.filter((s) => s.trim());
  if (real.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {real.map((s) => (
        <span
          key={s}
          className="rounded-full border border-black/10 px-2.5 py-0.5 text-xs text-charcoal"
        >
          {s}
        </span>
      ))}
    </div>
  );
}

/** The licensure table — the credential heart of a clinical/prescriber profile. */
function LicensureTable({ rows }: { rows: ClinicalResume["licensure"] }) {
  const real = rows.filter((l) => l.type.trim() || l.state.trim() || l.number.trim());
  if (real.length === 0) return null;
  return (
    <Section title="Licensure">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-black/10 text-[10px] tracking-wide text-gray uppercase">
            <th className="py-1 pr-3 font-semibold">Type</th>
            <th className="py-1 pr-3 font-semibold">State</th>
            <th className="py-1 pr-3 font-semibold">Number</th>
            <th className="py-1 pr-3 font-semibold">Status</th>
            <th className="py-1 font-semibold">Expires</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {real.map((l, i) => (
            <tr key={i}>
              <td className="py-1.5 pr-3 font-medium text-charcoal">{l.type || "—"}</td>
              <td className="py-1.5 pr-3">{l.state || "—"}</td>
              <td className="py-1.5 pr-3 tabular-nums">{l.number || "—"}</td>
              <td className="py-1.5 pr-3">{l.status || "—"}</td>
              <td className="py-1.5 tabular-nums">{l.expires || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function CommonTail({ data }: { data: ResumeData }) {
  const experience = data.experience.filter((e) => e.title.trim() || e.employer.trim());
  const education = data.education.filter((e) => e.degree.trim() || e.school.trim());
  return (
    <>
      {experience.length > 0 ? (
        <Section title="Experience">
          <div className="flex flex-col gap-4">
            {experience.map((e, i) => (
              <div key={i}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold text-charcoal">
                    {e.title}
                    {e.employer ? <span className="font-normal"> — {e.employer}</span> : null}
                  </p>
                  {e.dates ? (
                    <p className="shrink-0 text-xs text-gray tabular-nums">{e.dates}</p>
                  ) : null}
                </div>
                {metaLine([e.setting, e.location]) ? (
                  <p className="text-xs text-gray">{metaLine([e.setting, e.location])}</p>
                ) : null}
                {e.contextLine ? (
                  <p className="mt-0.5 text-xs text-charcoal italic">{e.contextLine}</p>
                ) : null}
                {e.bullets.filter((b) => b.trim()).length > 0 ? (
                  <ul className="mt-1 list-disc pl-5 text-sm text-charcoal">
                    {e.bullets
                      .filter((b) => b.trim())
                      .map((b, j) => (
                        <li key={j} className="mt-0.5">
                          {b}
                        </li>
                      ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {education.length > 0 ? (
        <Section title="Education">
          <div className="flex flex-col gap-1.5">
            {education.map((e, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
                <p className="text-charcoal">
                  <span className="font-semibold">{e.degree}</span>
                  {e.school ? ` — ${e.school}` : ""}
                  {e.honor ? <span className="text-gray italic"> · {e.honor}</span> : null}
                </p>
                <p className="shrink-0 text-xs text-gray tabular-nums">
                  {metaLine([e.location, e.year])}
                </p>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {data.verificationLine.trim() ? (
        <div className="mt-8 rounded-md border border-brand/30 bg-brand/5 px-4 py-3 print:rounded-none">
          <p className="text-[10px] font-bold tracking-[0.14em] text-brand uppercase">
            Verification
          </p>
          <p className="mt-0.5 text-sm text-charcoal">{data.verificationLine}</p>
        </div>
      ) : null}
    </>
  );
}

export function BrandedResume({ variant, data }: { variant: ResumeVariant; data: ResumeData }) {
  const clinical = variant === "clinical" ? (data as ClinicalResume) : null;
  const prescriber = variant === "prescriber" ? (data as PrescriberResume) : null;
  const operations = variant === "operations" ? (data as OperationsResume) : null;
  const licensed = clinical ?? prescriber;

  return (
    <article className="rounded-xl border border-black/10 bg-white p-8 shadow-sm sm:p-10 print:border-0 print:p-0 print:shadow-none">
      {/* Brand wordmark — the document's letterhead. */}
      <header className="flex items-baseline justify-between border-b-2 border-brand pb-3">
        <p className="font-serif text-lg tracking-[0.18em] text-brand">
          DESTA<span className="mx-1.5 text-brand/40">|</span>WORKS
        </p>
        <p className="text-[10px] font-semibold tracking-[0.14em] text-gray uppercase">
          Candidate profile · {RESUME_VARIANT_LABELS[variant]}
        </p>
      </header>

      {/* Identity block — serif name (a person), sans data. */}
      <div className="mt-6">
        <h2 className="font-serif text-3xl font-semibold text-navy">{data.name || "—"}</h2>
        {data.headerRole ? (
          <p className="mt-0.5 text-sm font-medium text-charcoal">{data.headerRole}</p>
        ) : null}
        <p className="mt-1.5 text-xs text-gray">
          {metaLine([
            metaLine([data.homeBase.city, data.homeBase.stateOrCountry]),
            data.homeBase.timezone,
            data.workMode,
            data.targetStart ? `Available ${data.targetStart}` : "",
            data.email,
            data.phone,
          ])}
        </p>
      </div>

      {data.snapshot.trim() ? (
        <p className="mt-5 font-serif text-[15px] leading-relaxed text-charcoal">{data.snapshot}</p>
      ) : null}

      {/* Credentials — licensure + identifiers (clinical/prescriber only). */}
      {licensed ? (
        <>
          <LicensureTable rows={licensed.licensure} />
          {metaLine([
            licensed.npi ? `NPI ${licensed.npi}` : "",
            licensed.caqhAttestedDate ? `CAQH attested ${licensed.caqhAttestedDate}` : "",
          ]) ? (
            <p className="mt-2 text-xs text-gray">
              {metaLine([
                licensed.npi ? `NPI ${licensed.npi}` : "",
                licensed.caqhAttestedDate ? `CAQH attested ${licensed.caqhAttestedDate}` : "",
              ])}
            </p>
          ) : null}
        </>
      ) : null}

      {prescriber ? (
        <>
          {prescriber.boardCertifications.filter((s) => s.trim()).length > 0 ? (
            <Section title="Board certifications">
              <Chips items={prescriber.boardCertifications} />
            </Section>
          ) : null}
          {prescriber.dea.filter((d) => d.number.trim() || d.state.trim()).length > 0 ? (
            <Section title="DEA registrations">
              <p className="text-sm text-charcoal">
                {prescriber.dea
                  .filter((d) => d.number.trim() || d.state.trim())
                  .map((d) => metaLine([d.state, d.number]))
                  .join(" · ")}
              </p>
            </Section>
          ) : null}
          {prescriber.hospitalAffiliations.filter((a) => a.name.trim()).length > 0 ? (
            <Section title="Hospital affiliations">
              <div className="flex flex-col gap-1">
                {prescriber.hospitalAffiliations
                  .filter((a) => a.name.trim())
                  .map((a, i) => (
                    <p key={i} className="text-sm text-charcoal">
                      <span className="font-semibold">{a.name}</span>
                      {metaLine([a.role, a.location, a.dates])
                        ? ` — ${metaLine([a.role, a.location, a.dates])}`
                        : ""}
                    </p>
                  ))}
              </div>
            </Section>
          ) : null}
        </>
      ) : null}

      {operations ? (
        <Section title="Coverage & readiness">
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {operations.coverageHours ? (
              <div className="flex justify-between gap-3">
                <dt className="text-gray">Coverage hours</dt>
                <dd className="font-medium text-charcoal">{operations.coverageHours}</dd>
              </div>
            ) : null}
            {operations.englishLevel ? (
              <div className="flex justify-between gap-3">
                <dt className="text-gray">English</dt>
                <dd className="font-medium text-charcoal">{operations.englishLevel}</dd>
              </div>
            ) : null}
            {operations.referencesStatus ? (
              <div className="flex justify-between gap-3">
                <dt className="text-gray">References</dt>
                <dd className="font-medium text-charcoal">{operations.referencesStatus}</dd>
              </div>
            ) : null}
          </dl>
        </Section>
      ) : null}

      {/* Skills — chips per variant shape. */}
      {licensed &&
      (licensed.skills.modalities.some((s) => s.trim()) ||
        licensed.skills.populations.some((s) => s.trim())) ? (
        <Section title="Modalities & populations">
          <Chips items={[...licensed.skills.modalities, ...licensed.skills.populations]} />
        </Section>
      ) : null}
      {operations ? (
        <>
          {operations.skills.functional.some((s) => s.trim()) ? (
            <Section title="Functional skills">
              <Chips items={operations.skills.functional} />
            </Section>
          ) : null}
          {operations.systemsTools.some((s) => s.trim()) ? (
            <Section title="Systems & tools">
              <Chips items={operations.systemsTools} />
            </Section>
          ) : null}
        </>
      ) : null}

      {prescriber && prescriber.publications.filter((p) => p.trim()).length > 0 ? (
        <Section title="Publications">
          <ul className="list-disc pl-5 text-sm text-charcoal">
            {prescriber.publications
              .filter((p) => p.trim())
              .map((p, i) => (
                <li key={i} className="mt-0.5">
                  {p}
                </li>
              ))}
          </ul>
        </Section>
      ) : null}

      <CommonTail data={data} />

      <footer className="mt-8 border-t border-black/10 pt-3 text-center text-[10px] tracking-wide text-gray uppercase print:mt-10">
        Prepared by Desta Works · destaworks.com
      </footer>
    </article>
  );
}
