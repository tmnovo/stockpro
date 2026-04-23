import { useEffect, useRef, useState } from "react";
import Layout from "@/components/Layout";
import { api, formatApiError } from "@/lib/api";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const emptyProduct = { name: "", sku: "", barcode: "", category: "", description: "", price: 0, stock: 0, unit: "un", supplier_id: "" };

export default function Products() {
  const { t } = useLanguage();
  const { hasPermission } = useAuth();
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyProduct);
  const [deleteId, setDeleteId] = useState(null);
  const fileRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([api.get("/products"), api.get("/suppliers")]);
      setProducts(p.data);
      setSuppliers(s.data);
    } catch (e) { toast.error(formatApiError(e)); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(emptyProduct); setDialogOpen(true); };
  const openEdit = (p) => { setEditing(p); setForm({ ...emptyProduct, ...p }); setDialogOpen(true); };

  const save = async () => {
    const payload = {
      ...form,
      price: parseFloat(form.price) || 0,
      stock: parseInt(form.stock) || 0,
    };
    try {
      if (editing) {
        await api.put(`/products/${editing.id}`, payload);
        toast.success(t("updated_successfully"));
      } else {
        await api.post("/products", payload);
        toast.success(t("created_successfully"));
      }
      setDialogOpen(false);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const doDelete = async () => {
    try {
      await api.delete(`/products/${deleteId}`);
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
      const { data } = await api.post("/products/import", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`${t("imported_successfully")}: ${data.inserted}`);
      load();
    } catch (err) { toast.error(formatApiError(err)); }
    e.target.value = "";
  };

  const doExport = async () => {
    try {
      const response = await api.get("/products/export", { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = url; a.download = "products.xlsx"; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const filtered = products.filter((p) => {
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode || "").includes(search);
    const matchesSupplier = supplierFilter === "all" || p.supplier_id === supplierFilter ||
      (supplierFilter === "none" && !p.supplier_id);
    return matchesSearch && matchesSupplier;
  });

  return (
    <Layout title={t("products")}>
      <div className="space-y-4" data-testid="products-page">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center flex-1 max-w-2xl">
            <div className="relative max-w-sm flex-1 min-w-[220px]">
              <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="products-search" />
            </div>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="w-56" data-testid="products-supplier-filter">
                <SelectValue placeholder={t("supplier")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("supplier")}: —</SelectItem>
                <SelectItem value="none">({t("no_data")})</SelectItem>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <input type="file" ref={fileRef} className="hidden" accept=".csv,.xlsx,.xls" onChange={onImport} data-testid="products-import-input" />
            {hasPermission("products", "import") && (
              <Button variant="outline" onClick={() => fileRef.current?.click()} data-testid="products-import-btn">
                <UploadSimple size={16} /> {t("import")}
              </Button>
            )}
            {hasPermission("products", "export") && (
              <Button variant="outline" onClick={doExport} data-testid="products-export-btn">
                <DownloadSimple size={16} /> {t("export")}
              </Button>
            )}
            {hasPermission("products", "create") && (
              <Button onClick={openNew} data-testid="products-new-btn">
                <Plus size={16} /> {t("new_product")}
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
                  <TableHead>{t("sku")}</TableHead>
                  <TableHead>{t("supplier")}</TableHead>
                  <TableHead className="text-right">{t("price")}</TableHead>
                  <TableHead className="text-right">{t("stock")}</TableHead>
                  <TableHead>{t("unit")}</TableHead>
                  <TableHead className="text-right">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{t("loading")}</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{t("no_data")}</TableCell></TableRow>
                ) : filtered.map((p) => (
                  <TableRow key={p.id} data-testid={`product-row-${p.id}`}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{p.sku || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{p.supplier_name || "—"}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">€{Number(p.price).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{p.stock}</TableCell>
                    <TableCell className="text-muted-foreground">{p.unit}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {hasPermission("products", "update") && (
                          <Button variant="ghost" size="icon" onClick={() => openEdit(p)} data-testid={`product-edit-${p.id}`}>
                            <PencilSimple size={16} />
                          </Button>
                        )}
                        {hasPermission("products", "delete") && (
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(p.id)} data-testid={`product-delete-${p.id}`}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="product-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? t("edit_product") : t("new_product")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Field label={t("name")} value={form.name} onChange={(v) => setForm({ ...form, name: v })} required testid="field-product-name" />
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("sku")} value={form.sku} onChange={(v) => setForm({ ...form, sku: v })} testid="field-product-sku" />
              <Field label="Barcode" value={form.barcode} onChange={(v) => setForm({ ...form, barcode: v })} testid="field-product-barcode" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Categoria" value={form.category} onChange={(v) => setForm({ ...form, category: v })} testid="field-product-category" />
              <Field label={t("unit")} value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} testid="field-product-unit" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("price")} value={form.price} onChange={(v) => setForm({ ...form, price: v })} type="number" testid="field-product-price" />
              <Field label={t("stock")} value={form.stock} onChange={(v) => setForm({ ...form, stock: v })} type="number" testid="field-product-stock" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-mono tracking-wider">{t("supplier")}</Label>
              <Select value={form.supplier_id || "_none"} onValueChange={(v) => setForm({ ...form, supplier_id: v === "_none" ? "" : v })}>
                <SelectTrigger data-testid="field-product-supplier"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">—</SelectItem>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-mono tracking-wider">{t("description")}</Label>
              <Textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="field-product-description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="product-cancel-btn">{t("cancel")}</Button>
            <Button onClick={save} disabled={!form.name?.trim()} data-testid="product-save-btn">{t("save")}</Button>
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
            <AlertDialogCancel data-testid="product-delete-cancel">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} data-testid="product-delete-confirm">{t("delete")}</AlertDialogAction>
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
      <Input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} required={required} data-testid={testid} />
    </div>
  );
}
