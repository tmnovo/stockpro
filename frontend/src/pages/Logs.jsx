import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MagnifyingGlass } from "@phosphor-icons/react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const actionColors = {
  create: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30",
  update: "bg-primary/10 text-primary border-primary/30",
  delete: "bg-destructive/10 text-destructive border-destructive/30",
  login: "bg-muted text-muted-foreground border-border",
  logout: "bg-muted text-muted-foreground border-border",
  import: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30",
  export: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30",
  pdf_export: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30",
};

export default function Logs() {
  const { t } = useLanguage();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.get("/logs", { params: { limit: 500 } })
      .then(({ data }) => setLogs(data))
      .finally(() => setLoading(false));
  }, []);

  const filtered = logs.filter((l) =>
    !search ||
    (l.user_email || "").toLowerCase().includes(search.toLowerCase()) ||
    (l.action || "").toLowerCase().includes(search.toLowerCase()) ||
    (l.entity || "").toLowerCase().includes(search.toLowerCase()) ||
    (l.details || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout title={t("logs")}>
      <div className="space-y-4" data-testid="logs-page">
        <div className="relative max-w-sm">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="logs-search" />
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("timestamp")}</TableHead>
                  <TableHead>{t("user")}</TableHead>
                  <TableHead>{t("action")}</TableHead>
                  <TableHead>{t("entity")}</TableHead>
                  <TableHead>{t("details")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">{t("loading")}</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">{t("no_data")}</TableCell></TableRow>
                ) : filtered.map((l) => (
                  <TableRow key={l.id} data-testid={`log-row-${l.id}`}>
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(l.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{l.user_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{l.user_email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={actionColors[l.action] || ""}>{l.action}</Badge>
                    </TableCell>
                    <TableCell className="capitalize text-sm">{l.entity}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-md truncate">{l.details || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
