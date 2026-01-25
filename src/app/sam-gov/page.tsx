"use client";

import { useState, useEffect } from "react";

const RESULT_LIMIT = 500;

function toMMddyyyy(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function last30(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

type Opportunity = {
  noticeId?: string;
  title?: string;
  solicitationNumber?: string;
  fullParentPathName?: string;
  postedDate?: string;
  type?: string;
  setAside?: string;
  setAsideCode?: string;
  responseDeadLine?: string;
  naicsCode?: string;
  classificationCode?: string;
  award?: { amount?: string | number; date?: string; number?: string };
  uiLink?: string | null;
  links?: { rel?: string; href?: string }[];
};

type SearchResponse = {
  totalRecords?: number;
  limit?: number;
  offset?: number;
  opportunitiesData?: Opportunity[];
  opportunities?: Opportunity[];
  error?: string;
};

function formatAward(a?: Opportunity["award"]): string {
  if (!a?.amount) return "—";
  const n = typeof a.amount === "number" ? a.amount : parseFloat(String(a.amount));
  if (Number.isNaN(n)) return String(a.amount);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function OpportunityCard({ opp }: { opp: Opportunity }) {
  const link = opp.uiLink || opp.links?.[0]?.href;
  return (
    <article className="flex flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <h3 className="line-clamp-2 text-base font-semibold text-slate-900" title={opp.title ?? ""}>
        {opp.title || "Untitled"}
      </h3>
      <dl className="mt-3 flex-1 space-y-1.5 text-sm">
        <div>
          <span className="text-slate-500">Solicitation #</span>
          <span className="ml-1.5 text-slate-700">{opp.solicitationNumber || "—"}</span>
        </div>
        <div>
          <span className="text-slate-500">Type</span>
          <span className="ml-1.5 text-slate-700">{opp.type || "—"}</span>
        </div>
        <div>
          <span className="text-slate-500">Posted</span>
          <span className="ml-1.5 text-slate-700">{opp.postedDate || "—"}</span>
        </div>
        <div>
          <span className="text-slate-500">Set-Aside</span>
          <span className="ml-1.5 text-slate-700">{opp.setAside || opp.setAsideCode || "—"}</span>
        </div>
        <div>
          <span className="text-slate-500">Response due</span>
          <span className="ml-1.5 text-slate-700">{opp.responseDeadLine || "—"}</span>
        </div>
        <div>
          <span className="text-slate-500">Award</span>
          <span className="ml-1.5 text-slate-700">{formatAward(opp.award)}</span>
        </div>
      </dl>
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex w-fit items-center justify-center rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          View on SAM.gov →
        </a>
      )}
    </article>
  );
}

async function fetchOpportunities() {
  const { from, to } = last30();
  const params = new URLSearchParams({
    postedFrom: toMMddyyyy(from),
    postedTo: toMMddyyyy(to),
    limit: String(RESULT_LIMIT),
    offset: "0",
  });
  const res = await fetch(`/api/sam-gov/opportunities?${params}`, { cache: "no-store" });
  const json: SearchResponse = await res.json();
  return { res, json };
}

export default function SamGovPage() {
  const [allRows, setAllRows] = useState<Opportunity[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setAllRows([]);
    setLoading(true);
    fetchOpportunities()
      .then(({ res, json }) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(json?.error || `Request failed (${res.status})`);
          setTotalRecords(0);
          return;
        }
        const rows = json.opportunitiesData ?? json.opportunities ?? [];
        setAllRows(rows);
        setTotalRecords(json.totalRecords ?? 0);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Request failed");
          setTotalRecords(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="p-6 lg:p-8">
      <h1 className="text-2xl font-bold text-slate-900">SAM.gov Contract Opportunities</h1>
      <p className="mt-1 text-slate-600">
        Opportunities from the last 30 days (up to {RESULT_LIMIT}).
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>
      )}

      <div className="mt-6">
        {loading && allRows.length === 0 && (
          <div className="py-12 text-center text-slate-500">Loading…</div>
        )}

        {!loading && allRows.length === 0 && totalRecords === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white py-12 text-center text-slate-500">
            No opportunities found.
          </div>
        )}

        {allRows.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {allRows.map((opp, i) => (
              <OpportunityCard
                key={opp.noticeId || opp.solicitationNumber || `card-${i}`}
                opp={opp}
              />
            ))}
          </div>
        )}

        {allRows.length > 0 && (
          <p className="mt-4 text-center text-sm text-slate-500">
            Showing {allRows.length} of {totalRecords} opportunities
          </p>
        )}
      </div>
    </div>
  );
}
