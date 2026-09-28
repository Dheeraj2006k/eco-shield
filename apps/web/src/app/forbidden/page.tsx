import { Lock } from 'lucide-react';
import Link from 'next/link';

export default function Forbidden() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card">
        <Lock className="mx-auto h-10 w-10 text-slate-400" aria-hidden />
        <h1 className="mt-3 text-xl font-semibold text-slate-900">Access restricted</h1>
        <p className="mt-1 text-sm text-slate-600">Your role does not include the capability required for this page.</p>
        <Link href="/dashboard" className="mt-5 inline-block rounded-lg bg-navy-700 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">Back to dashboard</Link>
      </div>
    </div>
  );
}
