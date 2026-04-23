import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Plus, PencilSimple, Trash, FilePdf, MagnifyingGlass, Package } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";

const empty = { name: "", email: "", phone: "", tax_id: "", address: "", notes: "" };

export default function Suppliers() {
  const { t } = useLanguage();
  const { hasPermission } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [deleteId, setDeleteId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/suppliers");
      setItems(data);
    } catch (e) { toast.error(formatApiError(e)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(empty); setDialogOpen(true); };
  const openEdit = (s) => { setEditing(s); setForm({ ...empty, ...s }); setDialogOpen(true); };

  const save = async () => {
    try {
      if (editing) { await api.put(`/suppliers/${editing.id}`, form); toast.success(t("updated_successfully")); }
      else { await api.post("/suppliers", form); toast.success(t("created_successfully")); }
      setDialogOpen(false); load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const doDelete = async () => {
    try {
      await api.delete(`/suppliers/${deleteId}`);
      toast.success(t("deleted_successfully"));
      setDeleteId(null); load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const downloadSupplierPdf = async (s) => {
    try {
      const response = await api.get(`/pdf/supplier`, { params: { supplier_id: s.id }, responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = url; a.download = `fornecedor_${s.name}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const filtered = items.filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.tax_id || "").includes(search)
  );

  return (
    <Layout title={t("suppliers")}>
      <div className="space-y-4" data-testid="suppliers-page">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="relative max-w-sm w-full">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="suppliers-search" />
          </div>
          {hasPermission("suppliers", "create") && (
            <Button onClick={openNew} data-testid="suppliers-new-btn">
              <Plus size={16} /> {t("new_supplier")}
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("tax_id")}</TableHead>
                  <TableHead>{t("email")}</TableHead>
                  <TableHead>{t("phone")}</TableHead>
                  <TableHead className="text-right">{t("products")}</TableHead>
                  <TableHead className="text-right">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{t("loading")}</TableCell></TableRow>
                : filtered.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{t("no_data")}</TableCell></TableRow>
                : filtered.map((s) => (
                  <TableRow key={s.id} data-testid={`supplier-row-${s.id}`}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.tax_id || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{s.email || "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.phone || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline"><Package size={12} /> {s.product_count || 0}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => downloadSupplierPdf(s)} data-testid={`supplier-pdf-${s.id}`} title="PDF">
                          <FilePdf size={16} />
                        </Button>
                        {hasPermission("suppliers", "update") && (
                          <Button variant="ghost" size="icon" onClick={() => openEdit(s)} data-testid={`supplier-edit-${s.id}`}><PencilSimple size={16} /></Button>
                        )}
                        {hasPermission("suppliers", "delete") && (
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(s.id)} data-testid={`supplier-delete-${s.id}`}><Trash size={16} className="text-destructive" /></Button>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg w-[95vw]" data-testid="supplier-dialog">
          <DialogHeader><DialogTitle className="font-display">{editing ? t("edit_supplier") : t("new_supplier")}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <F label={t("name")} value={form.name} onChange={(v) => setForm({ ...form, name: v })} required testid="field-supp-name" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <F label={t("email")} value={form.email} onChange={(v) => setForm({ ...form, email: v })} testid="field-supp-email" />
              <F label={t("phone")} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} testid="field-supp-phone" />
            </div>
            <F label={t("tax_id")} value={form.tax_id} onChange={(v) => setForm({ ...form, tax_id: v })} testid="field-supp-tax" />
            <F label={t("address")} value={form.address} onChange={(v) => setForm({ ...form, address: v })} testid="field-supp-addr" />
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-mono tracking-wider">{t("notes")}</Label>
              <Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="field-supp-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="supp-cancel-btn">{t("cancel")}</Button>
            <Button onClick={save} disabled={!form.name?.trim()} data-testid="supp-save-btn">{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirm_delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirm_delete")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="supp-delete-cancel">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} data-testid="supp-delete-confirm">{t("delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

function F({ label, value, onChange, required, testid, type = "text" }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase font-mono tracking-wider">{label}{required && " *"}</Label>
      <Input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} required={required} data-testid={testid} />
    </div>
  );
}
