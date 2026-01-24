import dynamic from "next/dynamic";

const DashboardChart = dynamic(() => import("@/components/DashboardChart"), {
  ssr: false,
});

const DashboardChartTrend = dynamic(
  () => import("@/components/DashboardChartTrend"),
  { ssr: false }
);

const DashboardTable = dynamic(() => import("@/components/DashboardTable"), {
  ssr: false,
});

const cards = [
  {
    title: "Active Opportunities",
    value: "186",
    change: "+12%",
    changeUp: true,
    desc: "vs last month",
    icon: "📋",
  },
  {
    title: "Total Value",
    value: "$124.2M",
    change: "+8%",
    changeUp: true,
    desc: "estimated",
    icon: "💰",
  },
  {
    title: "Agencies Tracked",
    value: "24",
    change: "0%",
    changeUp: true,
    desc: "across federal",
    icon: "🏛️",
  },
  {
    title: "Closing Soon",
    value: "31",
    change: "-3",
    changeUp: false,
    desc: "next 14 days",
    icon: "⏱️",
  },
];

export default function DashboardPage() {
  return (
    <div className="p-6 lg:p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-600 mt-1">
          Overview of government contract opportunities
        </p>
      </header>

      {/* Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <div
            key={c.title}
            className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500">{c.title}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{c.value}</p>
                <p className="text-xs text-slate-400 mt-1">
                  <span
                    className={
                      c.changeUp ? "text-emerald-600" : "text-amber-600"
                    }
                  >
                    {c.change}
                  </span>{" "}
                  {c.desc}
                </p>
              </div>
              <span className="text-2xl opacity-80" aria-hidden>
                {c.icon}
              </span>
            </div>
          </div>
        ))}
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
          <DashboardChart />
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
          <DashboardChartTrend />
        </div>
      </section>

      {/* Table */}
      <section>
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Recent Opportunities
          </h2>
          <DashboardTable />
        </div>
      </section>
    </div>
  );
}
