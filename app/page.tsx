import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-white">
      <div className="w-full max-w-4xl rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-slate-900/30 md:p-12">
        <p className="text-sm font-semibold uppercase tracking-[0.26em] text-slate-300">
          Google Ads SaaS
        </p>
        <h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">
          Multi-tenant dashboard for agencies and clients.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-300">
          Secure agency isolation, dynamic Google Ads customer access, and a unified platform for agency owners and client teams.
        </p>

        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-xl bg-white px-6 py-3 font-semibold text-slate-900 transition hover:bg-slate-200"
          >
            Login
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-xl border border-slate-700 px-6 py-3 font-semibold text-white transition hover:bg-slate-800"
          >
            View Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}