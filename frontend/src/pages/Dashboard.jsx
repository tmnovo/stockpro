import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UsersFour, Package, ClipboardText, ClockClockwise, Truck, TrendUp, Fire } from "@phosphor-icons/react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))",
];

export default function Dashboard() {
  const { t } = useLanguage();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/dashboard/stats").then(({ data }) => setStats(data)).catch(() => {});
  }, []);

  return (
    <Layout title={t("dashboard")}>
      <div className="space-y-6" data-testid="dashboard-page">
        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Kpi icon={UsersFour} label={t("total_clients")} value={stats?.totals.clients ?? "—"} testid="kpi-clients" />
          <Kpi icon={Package} label={t("total_products")} value={stats?.totals.products ?? "—"} testid="kpi-products" />
          <Kpi icon={Truck} label={t("total_suppliers")} value={stats?.totals.suppliers ?? "—"} testid="kpi-suppliers" />
          <Kpi icon={ClipboardText} label={t("total_orders")} value={stats?.totals.orders ?? "—"} testid="kpi-orders" />
          <Kpi icon={ClockClockwise} label={t("active_orders")} value={stats?.totals.active_orders ?? "—"} accent="warning" testid="kpi-active-orders" />
          <Kpi icon={Fire} label={t("orders_tomorrow")} value={stats?.totals.orders_tomorrow ?? "—"} accent="primary" testid="kpi-tomorrow" />
        </div>

        {/* Top products + busiest day */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2" data-testid="chart-top-products">
            <CardHeader>
              <CardTitle className="font-display text-base font-bold">{t("top_products")}</CardTitle>
            </CardHeader>
            <CardContent className="h-80 pl-0">
              {stats?.top_products?.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.top_products} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="product_name" tick={{ fontSize: 11 }} width={160} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Bar dataKey="quantity" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart t={t} />}
            </CardContent>
          </Card>

          <Card data-testid="chart-weekday">
            <CardHeader>
              <CardTitle className="font-display text-base font-bold">{t("orders_by_weekday")}</CardTitle>
            </CardHeader>
            <CardContent className="h-80 pl-0">
              {stats?.orders_by_weekday?.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.orders_by_weekday} margin={{ left: 10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart t={t} />}
            </CardContent>
          </Card>
        </div>

        {/* Supplier revenue + busiest day card */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2" data-testid="chart-supplier-revenue">
            <CardHeader>
              <CardTitle className="font-display text-base font-bold">{t("supplier_revenue")}</CardTitle>
            </CardHeader>
            <CardContent className="h-72 pl-0">
              {stats?.supplier_revenue?.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.supplier_revenue} margin={{ left: 10, right: 20, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="supplier_name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => `€${Number(v).toFixed(2)}`} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Bar dataKey="revenue" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart t={t} />}
            </CardContent>
          </Card>

          <Card data-testid="card-busiest-day">
            <CardHeader>
              <CardTitle className="font-display text-base font-bold flex items-center gap-2">
                <TrendUp size={18} weight="duotone" /> {t("busiest_day")}
              </CardTitle>
            </CardHeader>
            <CardContent className="h-72 flex flex-col items-center justify-center text-center">
              {stats?.busiest_day ? (
                <>
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">Últimos 30 dias</div>
                  <div className="font-display text-4xl font-extrabold tracking-tight text-primary">{stats.busiest_day.date}</div>
                  <div className="mt-3 text-sm text-muted-foreground">
                    <span className="font-display text-2xl font-bold text-foreground">{stats.busiest_day.count}</span> encomendas criadas
                  </div>
                </>
              ) : <EmptyChart t={t} />}
            </CardContent>
          </Card>
        </div>

        {/* Existing: Per client + Products tomorrow + Trend */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card data-testid="chart-orders-per-client">
            <CardHeader>
              <CardTitle className="font-display text-base font-bold">{t("active_orders_per_client")}</CardTitle>
            </CardHeader>
            <CardContent className="h-72 pl-0">
              {stats?.active_orders_per_client?.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.active_orders_per_client} margin={{ left: 10, right: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="client_name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Bar dataKey="count" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart t={t} />}
            </CardContent>
          </Card>

          <Card data-testid="chart-products-tomorrow">
            <CardHeader>
              <CardTitle className="font-display text-base font-bold">{t("products_tomorrow")}</CardTitle>
            </CardHeader>
            <CardContent className="h-72 pl-0">
              {stats?.products_going_tomorrow?.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.products_going_tomorrow} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="product_name" tick={{ fontSize: 11 }} width={120} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Bar dataKey="quantity" fill="hsl(var(--chart-5))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart t={t} />}
            </CardContent>
          </Card>
        </div>

        <Card data-testid="chart-trend">
          <CardHeader>
            <CardTitle className="font-display text-base font-bold">{t("orders_trend")}</CardTitle>
          </CardHeader>
          <CardContent className="h-64 pl-0">
            {stats?.orders_trend?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.orders_trend} margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                  <Line type="monotone" dataKey="count" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <EmptyChart t={t} />}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function Kpi({ icon: Icon, label, value, accent = "default", testid }) {
  const colorClass = {
    default: "text-foreground",
    primary: "text-primary",
    warning: "text-[hsl(var(--warning))]",
  }[accent];
  return (
    <Card className="transition-panel hover:-translate-y-0.5 hover:shadow-sm" data-testid={testid}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <Icon size={22} weight="duotone" className="text-muted-foreground" />
          <span className={`text-xs font-mono uppercase tracking-wider ${colorClass}`}>●</span>
        </div>
        <div className={`font-display text-3xl font-extrabold tracking-tight ${colorClass}`}>{value}</div>
        <div className="text-xs text-muted-foreground mt-1 font-mono uppercase tracking-wider">{label}</div>
      </CardContent>
    </Card>
  );
}

function EmptyChart({ t }) {
  return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{t("no_data")}</div>;
}
