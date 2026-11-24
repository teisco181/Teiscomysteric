import React, { useState } from 'react';
import { Printer, X } from 'lucide-react';
import type { CaseFile } from '../types.ts';
import { FingerprintGrid } from './FingerprintGrid.tsx';

interface PrintableDossierModalProps {
  caseFile: CaseFile;
  onClose: () => void;
}

export const PrintableDossierModal: React.FC<PrintableDossierModalProps> = ({
  caseFile,
  onClose,
}) => {
  const [includeSuspectPrints, setIncludeSuspectPrints] = useState(false);

  const liftedStamps = caseFile.evidence
    .filter((ev) => ev.visibleToPlayers)
    .flatMap((ev) =>
      ev.stamps.map((stamp) => ({
        evidenceCode: ev.code,
        evidenceTitle: ev.title,
        foundAt: ev.foundAtLabel,
        stamp,
      }))
    );

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs overflow-y-auto p-4 sm:p-8 print:p-0 print:bg-white print:static">
      {/* Control Bar (hidden when printing) */}
      <div className="no-print max-w-4xl mx-auto mb-4 flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-white dark:bg-[#0F151D] border border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Fysiek Politiedossier — Printweergave
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Druk dit dossier af als papieren spelmateriaal voor de speler.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSuspectPrints}
              onChange={(e) => setIncludeSuspectPrints(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>Ook persoonsvingerafdrukken afdrukken</span>
          </label>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Afdrukken / PDF</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
            <span>Sluiten</span>
          </button>
        </div>
      </div>

      {/* Printable Paper Sheet */}
      <article className="max-w-4xl mx-auto bg-white text-slate-900 p-8 sm:p-12 rounded-xl border border-slate-300 print:border-0 print:rounded-none print:p-6 space-y-8">
        <header className="border-b-2 border-slate-900 pb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-slate-500">
              Korps Politie · {caseFile.townName} · {caseFile.code}
            </p>
            <h1 className="text-3xl font-bold text-slate-900 mt-1">{caseFile.title}</h1>
            <p className="text-sm text-slate-600 mt-1">{caseFile.subtitle}</p>
          </div>
          <div className="text-right font-mono text-xs text-slate-600">
            <div>Dossiernummer: {caseFile.code}</div>
            <div>
              Online toegangscode:{' '}
              <strong className="text-slate-900">
                {caseFile.joinCode || caseFile.code}
              </strong>
            </div>
            <div>Systeem: Teiscomysterics</div>
          </div>
        </header>

        <section className="space-y-2">
          <h2 className="text-base font-bold border-b border-slate-300 pb-1">
            01. Zaakomschrijving &amp; Briefing
          </h2>
          <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-line">
            {caseFile.briefing}
          </p>
          {caseFile.printedDossierGuide && (
            <div className="mt-3 p-3.5 bg-slate-100 border border-slate-300 rounded text-xs text-slate-800 leading-relaxed">
              <strong>Onderzoeksinstructie voor speler:</strong> {caseFile.printedDossierGuide}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold border-b border-slate-300 pb-1">
            02. Gevonden Sporen &amp; Vingerafdrukken (Ter vergelijking online)
          </h2>
          {liftedStamps.length === 0 ? (
            <p className="text-xs text-slate-500">Nog geen vingerafdruksporen op bewijsstukken geplaatst.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {liftedStamps.map(({ evidenceCode, evidenceTitle, foundAt, stamp }) => (
                <div
                  key={stamp.id}
                  className="p-4 border border-slate-300 rounded-lg print-break-inside-avoid space-y-3"
                >
                  <div>
                    <div className="font-mono text-xs font-bold text-slate-900">
                      {stamp.label} · {evidenceCode}
                    </div>
                    <div className="text-sm font-semibold text-slate-800">{evidenceTitle}</div>
                    <div className="text-xs text-slate-600">Vindplaats: {foundAt}</div>
                  </div>
                  <div className="flex justify-center bg-slate-50 p-3 rounded border border-slate-200">
                    <FingerprintGrid
                      matrix={stamp.matrix}
                      showCoordinates
                      cellSize={13}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3 print-break-inside-avoid">
          <h2 className="text-base font-bold border-b border-slate-300 pb-1">
            03. Bekende Betrokkenen &amp; Adressen
          </h2>
          <div className="divide-y divide-slate-200 border border-slate-300 rounded-lg">
            {caseFile.persons.map((p) => {
              const workLoc = p.workLocationId
                ? caseFile.locations.find((l) => l.id === p.workLocationId)
                : p.workLocationCode
                ? caseFile.locations.find(
                    (l) =>
                      l.code.trim().toUpperCase() ===
                      p.workLocationCode?.trim().toUpperCase()
                  )
                : undefined;
              return (
                <div key={p.id} className="p-3.5 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-slate-900">
                      {p.name}{' '}
                      <span className="font-mono text-xs font-normal text-slate-500">
                        ({p.code} · {p.fingerprintCode})
                      </span>
                    </div>
                    <div className="text-xs text-slate-600">
                      {p.occupation}
                      {workLoc
                        ? ` (Werkplek: ${workLoc.code} — ${workLoc.name})`
                        : p.workLocationCode
                        ? ` (Werkplek: ${p.workLocationCode})`
                        : ''}{' '}
                      · {p.address} · Status: {p.status}
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      <strong>Alibi:</strong> {p.alibi}
                    </p>
                  </div>
                  {includeSuspectPrints && (
                    <div className="shrink-0">
                      <FingerprintGrid matrix={p.fingerprint} cellSize={6} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </article>
    </div>
  );
};
