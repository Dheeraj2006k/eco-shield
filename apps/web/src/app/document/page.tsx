import type { Metadata } from 'next';
import Link from 'next/link';
import { Download, FileText } from 'lucide-react';
import { LogoMark } from '@/components/shell/Logo';
import proposal from '@/data/proposal.json';
import { DocNav, ScrollTopButton } from './DocClient';

export const metadata: Metadata = {
  title: 'Project Document',
  description: 'ECO-SHIELD (Smart India Hackathon 2026, PS 26178) — full project document: architecture, hardware, AI/ML, deployment and feasibility.',
};

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'para'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; header: string[]; rows: string[][] };

interface Section {
  id: string;
  title: string;
  blocks: Block[];
}

const data = proposal as unknown as { front: Block[]; sections: Section[] };

/** Legend badges shown throughout the doc (LOCKED, ROADMAP, etc.) get a colored pill instead of plain text. */
const LEGEND_TONE: Record<string, string> = {
  LOCKED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'BENCHMARK-PENDING': 'bg-amber-50 text-amber-800 ring-amber-200',
  ADVANCED: 'bg-purple-50 text-purple-700 ring-purple-200',
  ROADMAP: 'bg-sky-50 text-sky-700 ring-sky-200',
  'VERIFY BEFORE CLAIM': 'bg-red-50 text-red-700 ring-red-200',
};

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'heading') {
          const Tag = (`h${Math.min(b.level + 1, 4)}` as unknown) as 'h3' | 'h4';
          return (
            <Tag key={i} className={b.level === 2 ? 'mt-7 text-lg font-semibold text-navy-900' : 'mt-5 text-base font-semibold text-navy-800'}>
              {b.text}
            </Tag>
          );
        }
        if (b.type === 'para') {
          return (
            <p key={i} className="mt-3 leading-relaxed text-slate-700">
              {b.text}
            </p>
          );
        }
        if (b.type === 'list') {
          return (
            <ul key={i} className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-slate-700 marker:text-navy-400">
              {b.items.map((it, j) => (
                <li key={j}>{it}</li>
              ))}
            </ul>
          );
        }
        // table — the legend table (2 cols, first col a label word) gets pill styling
        const isLegend = b.header[0] === 'Label';
        return (
          <div key={i} className="scroll-thin mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="bg-navy-50">
                  {b.header.map((h, j) => (
                    <th key={j} className="border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-navy-700">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((row, j) => (
                  <tr key={j} className="odd:bg-white even:bg-slate-50/60">
                    {row.map((cell, k) => (
                      <td key={k} className="border-b border-slate-100 px-3 py-2 align-top text-slate-700">
                        {isLegend && k === 0 ? (
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${LEGEND_TONE[cell] ?? 'bg-slate-100 text-slate-700 ring-slate-200'}`}>{cell}</span>
                        ) : (
                          cell
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}

export default function DocumentPage() {
  const toc = data.sections.map((s) => ({ id: s.id, title: s.title }));

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2.5 px-4">
          <LogoMark className="h-7 w-7" />
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-wide text-navy-900">ECO-SHIELD</p>
            <p className="hidden text-[10px] uppercase tracking-wider text-slate-500 sm:block">Project Document</p>
          </div>
          <DocNav toc={toc} />
          <div className="ml-auto flex items-center gap-1.5">
            <a
              href="/EcoShield_Project_Document.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-800"
            >
              <Download className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">Open PDF</span><span className="sm:hidden">PDF</span>
            </a>
            <a
              href="/EcoShield_Project_Document.docx"
              download
              className="hidden items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:inline-flex"
            >
              .docx
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
        {/* Cover */}
        <div className="rounded-2xl border border-navy-100 bg-white p-6 text-center shadow-card sm:p-10">
          <FileText className="mx-auto h-8 w-8 text-navy-500" aria-hidden />
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl">ECO-SHIELD</h1>
          <p className="mt-1 text-sm font-medium text-navy-600">Intelligence at the Edge of Every Disaster</p>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-600">A Resilient, AI-Powered Environmental Intelligence Network</p>
          <div className="mx-auto mt-5 grid max-w-md gap-1.5 rounded-xl bg-slate-50 p-4 text-left text-xs text-slate-600 sm:text-sm">
            <p><b className="text-slate-800">Event:</b> Smart India Hackathon 2026</p>
            <p><b className="text-slate-800">Problem Statement:</b> 26178 — Qualcomm Inc.</p>
            <p><b className="text-slate-800">Category:</b> Hardware · <b className="text-slate-800">Theme:</b> Disaster Management</p>
            <p><b className="text-slate-800">Team:</b> CODE SMITHS</p>
            <p><b className="text-slate-800">Members:</b> Kasula Kiran, K.S.V.Dheeraj Kumar, B.Ram Charan Reddy, M.Divya Tejswi, Ch.Jishnu Chowdary, K.Sai Sahitya Kannam</p>
          </div>
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
            This document describes ECO-SHIELD&apos;s full target architecture, including advanced and roadmap capabilities. The deployed demo linked from the homepage is the working software prototype — see the Document Status legend below for what is locked, benchmark-pending, advanced, or roadmap.
          </p>
        </div>

        {/* Table of contents (also duplicated in the sticky header dropdown for mobile) */}
        <nav aria-label="Table of contents" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Contents</h2>
          <ol className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {toc.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} className="text-navy-700 hover:underline">
                  {t.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Sections */}
        <article className="mt-6 space-y-6">
          {data.sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-20 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-7">
              <h2 className="text-xl font-bold text-navy-900">{s.title}</h2>
              <Blocks blocks={s.blocks} />
            </section>
          ))}
        </article>

        <footer className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 text-center text-xs text-slate-500">
          <p>ECO-SHIELD — Smart Hazard Intelligence &amp; Environmental Local Detection. Team CODE SMITHS, Smart India Hackathon 2026.</p>
          <p className="mt-2">
            <Link href="/" className="text-navy-700 hover:underline">Back to overview</Link>
            {' · '}
            <Link href="/dashboard" className="text-navy-700 hover:underline">Open live demo</Link>
          </p>
        </footer>
      </main>
      <ScrollTopButton />
    </div>
  );
}
