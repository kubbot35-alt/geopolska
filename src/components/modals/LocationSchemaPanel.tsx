import React from 'react';
import {DATABASE_SCHEMA_TABLES} from '../../domain/catalogSchema';

export const LocationSchemaPanel: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="border-b border-white/10 pb-3">
        <h3 className="font-display text-sm font-bold text-white">
          Struktura tabel i kolekcji lokalizacji (Polska i Europa)
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Wszystkie zapisy przechodzą walidację schematu w regułach Firestore oraz synchronizują
          lokalny cache IndexedDB izolowany per klucz katalogu (poland / europe).
        </p>
      </div>

      {DATABASE_SCHEMA_TABLES.map((table) => (
        <section
          key={table.id}
          className="overflow-hidden rounded-xl border border-white/10 bg-[#0C131D]"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-4 py-3">
            <div>
              <h4 className="text-sm font-semibold text-white">{table.title}</h4>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="font-mono text-emerald-400">{table.path}</span>
                <span aria-hidden="true">·</span>
                <span>{table.storage}</span>
              </div>
            </div>
            <p className="text-xs text-slate-400">{table.accessSummary}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-[#101822]/70 text-slate-400">
                  <th className="px-4 py-2.5 font-medium whitespace-nowrap">Pole</th>
                  <th className="px-3 py-2.5 font-medium whitespace-nowrap">Typ</th>
                  <th className="px-3 py-2.5 font-medium whitespace-nowrap">Wymagalność</th>
                  <th className="px-3 py-2.5 font-medium whitespace-nowrap">Ograniczenia</th>
                  <th className="px-4 py-2.5 font-medium">Opis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {table.fields.map((row) => (
                  <tr key={row.field} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 font-mono font-semibold text-slate-100 whitespace-nowrap">
                      {row.field}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-emerald-300/90 whitespace-nowrap">
                      {row.type}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-300">
                      {row.required}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400 tabular-nums">
                      {row.constraints}
                    </td>
                    <td className="px-4 py-2.5 text-slate-300">{row.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
};
