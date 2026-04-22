import { useEffect, useRef, useState } from "react";
import Layout from "@/components/Layout";
import { api, formatApiError, API } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, UploadSimple, DownloadSimple, PencilSimple, Trash, MagnifyingGlass } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";

const emptyClient = { name: "", email: "", phone: "", address: "", tax_id: "", notes: "" };

export default function Clients() {
  const { t } = useLanguage();
  const { hasPermission } = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyClient);
  const [deleteId, setDeleteId] = useState(null);
  const fileRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/clients");
      setClients(data);
    } catch (e) { toast.error(formatApiError(e)); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(emptyClient); setDialogOpen(true); };
  const openEdit = (c) => { setEditing(c); setForm({ ...emptyClient, ...c }); setDialogOpen(true); };

  const save = async () => {
    try {
      if (editing) {
        await api.put(`/clients/${editing.id}`, form);
        toast.success(t("updated_successfully"));
      } else {
        await api.post("/clients", form);
        toast.success(t("created_successfully"));
      }
      setDialogOpen(false);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const doDelete = async () => {
    try {
      await api.delete(`/clients/${deleteId}`);
      toast.success(t("deleted_successfully"));
      setDeleteId(null);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const onImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/clients/import", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`${t("imported_successfully")}: ${data.inserted}`);
      load();
    } catch (err) { toast.error(formatApiError(err)); }
    e.target.value = "";
  };

  const doExport = async () => {
    try {
      const response = await api.get("/clients/export", { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = url; a.download = "clients.xlsx"; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const filtered = clients.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.tax_id || "").includes(search)
  );

  return (
    <Layout title={t("clients")}>
      <div className="space-y-4" data-testid="clients-page">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="relative max-w-sm w-full">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="clients-search"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <input type="file" ref={fileRef} className="hidden" accept=".csv,.xlsx,.xls" onChange={onImport} data-testid="clients-import-input" />
            {hasPermission("clients", "import") && (
              <Button variant="outline" onClick={() => fileRef.current?.click()} data-testid="clients-import-btn">
                <UploadSimple size={16} /> {t("import")}
              </Button>
            )}
            {hasPermission("clients", "export") && (
              <Button variant="outline" onClick={doExport} data-testid="clients-export-btn">
                <DownloadSimple size={16} /> {t("export")}
              </Button>
            )}
            {hasPermission("clients", "create") && (
              <Button onClick={openNew} data-testid="clients-new-btn">
                <Plus size={16} /> {t("new_client")}
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("email")}</TableHead>
                  <TableHead>{t("phone")}</TableHead>
                  <TableHead>{t("tax_id")}</TableHead>
                  <TableHead className="text-right">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">{t("loading")}</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">{t("no_data")}</TableCell></TableRow>
                ) : filtered.map((c) => (
                  <TableRow key={c.id} data-testid={`client-row-${c.id}`}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email || "—"}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">{c.phone || "—"}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">{c.tax_id || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {hasPermission("clients", "update") && (
                          <Button variant="ghost" size="icon" onClick={() => openEdit(c)} data-testid={`client-edit-${c.id}`}>
                            <PencilSimple size={16} />
                          </Button>
                        )}
                        {hasPermission("clients", "delete") && (
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(c.id)} data-testid={`client-delete-${c.id}`}>
                            <Trash size={16} className="text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="client-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? t("edit_client") : t("new_client")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Field label={t("name")} value={form.name} onChange={(v) => setForm({ ...form, name: v })} required testid="field-client-name" />
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("email")} value={form.email} onChange={(v) => setForm({ ...form, email: v })} testid="field-client-email" />
              <Field label={t("phone")} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} testid="field-client-phone" />
            </div>
            <Field label={t("address")} value={form.address} onChange={(v) => setForm({ ...form, address: v })} testid="field-client-address" />
            <Field label={t("tax_id")} value={form.tax_id} onChange={(v) => setForm({ ...form, tax_id: v })} testid="field-client-taxid" />
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-mono tracking-wider">{t("notes")}</Label>
              <Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="field-client-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="client-cancel-btn">{t("cancel")}</Button>
            <Button onClick={save} disabled={!form.name?.trim()} data-testid="client-save-btn">{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirm_delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirm_delete")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="client-delete-cancel">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} data-testid="client-delete-confirm">{t("delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

function Field({ label, value, onChange, required, testid, type = "text" }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase font-mono tracking-wider">{label}{required && " *"}</Label>
      <Input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} required={required} data-testid={testid} />
    </div>
  );
}
