import { useEffect, useMemo, useState } from "react";
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, PencilSimple, Trash, FilePdf, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import SearchableSelect from "@/components/SearchableSelect";

const emptyOrder = { client_id: "", items: [], delivery_date: "", notes: "", status: "pending", discount: 0 };

const statusColors = {
  pending: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30",
  in_progress: "bg-primary/10 text-primary border-primary/30",
  completed: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
};

export default function Orders() {
  const { t } = useLanguage();
  const { hasPermission } = useAuth();
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyOrder);
  const [deleteId, setDeleteId] = useState(null);

  // PDF options dialog
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfDate, setPdfDate] = useState(tomorrowStr);
  const [pdfMode, setPdfMode] = useState("all");
  const [pdfSupplier, setPdfSupplier] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [o, c, p, s] = await Promise.all([
        api.get("/orders"),
        api.get("/clients"),
        api.get("/products"),
        api.get("/suppliers"),
      ]);
      setOrders(o.data);
      setClients(c.data);
      setProducts(p.data);
      setSuppliers(s.data);
    } catch (e) { toast.error(formatApiError(e)); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyOrder, items: [{ product_id: "", quantity: 1, price: null }] });
    setDialogOpen(true);
  };

  const openEdit = (o) => {
    setEditing(o);
    setForm({
      client_id: o.client_id,
      delivery_date: o.delivery_date || "",
      notes: o.notes || "",
      status: o.status,
      discount: o.discount || 0,
      items: o.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity, price: i.price })),
    });
    setDialogOpen(true);
  };

  const addItem = () => setForm({ ...form, items: [...form.items, { product_id: "", quantity: 1, price: null }] });
  const removeItem = (idx) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
  const updateItem = (idx, patch) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], ...patch };
    setForm({ ...form, items });
  };

  const save = async () => {
    const payload = {
      ...form,
      delivery_date: form.delivery_date || null,
      discount: parseFloat(form.discount) || 0,
      items: form.items
        .filter((i) => i.product_id && i.quantity > 0)
        .map((i) => ({
          product_id: i.product_id,
          quantity: parseInt(i.quantity) || 1,
          price: i.price !== null && i.price !== "" ? parseFloat(i.price) : null,
        })),
    };
    if (!payload.client_id) { toast.error(t("client") + " *"); return; }
    if (payload.items.length === 0) { toast.error(t("add_item")); return; }

    try {
      if (editing) {
        await api.put(`/orders/${editing.id}`, payload);
        toast.success(t("updated_successfully"));
      } else {
        await api.post("/orders", payload);
        toast.success(t("created_successfully"));
      }
      setDialogOpen(false);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const doDelete = async () => {
    try {
      await api.delete(`/orders/${deleteId}`);
      toast.success(t("deleted_successfully"));
      setDeleteId(null);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const downloadPdf = async () => {
    if (pdfMode === "supplier_products" && !pdfSupplier) {
      toast.error(t("choose_supplier"));
      return;
    }
    try {
      const params = { target_date: pdfDate, mode: pdfMode };
      if (pdfMode === "supplier_products") params.supplier_id = pdfSupplier;
      const response = await api.get(`/orders/daily-pdf`, { params, responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = url; a.download = `orders_${pdfDate}_${pdfMode}.pdf`; a.click();
      URL.revokeObjectURL(url);
      setPdfDialogOpen(false);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <Layout title={t("orders")}>
      <div className="space-y-4" data-testid="orders-page">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap items-end gap-2">
            {hasPermission("orders", "pdf") && (
              <Button variant="outline" onClick={() => setPdfDialogOpen(true)} data-testid="orders-pdf-btn">
                <FilePdf size={16} /> {t("daily_pdf")}
              </Button>
            )}
          </div>
          {hasPermission("orders", "create") && (
            <Button onClick={openNew} data-testid="orders-new-btn">
              <Plus size={16} /> {t("new_order")}
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("client")}</TableHead>
                  <TableHead>{t("delivery_date")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("order_items")}</TableHead>
                  <TableHead className="text-right">{t("total_no_vat")}</TableHead>
                  <TableHead className="text-right">{t("total_with_vat")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead className="text-right">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{t("loading")}</TableCell></TableRow>
                ) : orders.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground" data-testid="orders-empty">{t("no_data")}</TableCell></TableRow>
                ) : orders.map((o) => (
                  <TableRow key={o.id} data-testid={`order-row-${o.id}`}>
                    <TableCell className="font-medium">{o.client_name}</TableCell>
                    <TableCell className="font-mono text-xs">{o.delivery_date || "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="text-xs text-muted-foreground">
                        {o.items.slice(0, 2).map((i) => `${i.quantity}× ${i.product_name}`).join(", ")}
                        {o.items.length > 2 && ` +${o.items.length - 2}`}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-muted-foreground">€{Number(o.total_no_vat || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums font-semibold">€{Number(o.total || 0).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[o.status] || ""}>
                        {t(`status_${o.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {hasPermission("orders", "update") && (
                          <Button variant="ghost" size="icon" onClick={() => openEdit(o)} data-testid={`order-edit-${o.id}`}>
                            <PencilSimple size={16} />
                          </Button>
                        )}
                        {hasPermission("orders", "delete") && (
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(o.id)} data-testid={`order-delete-${o.id}`}>
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

      {/* PDF options dialog */}
      <Dialog open={pdfDialogOpen} onOpenChange={setPdfDialogOpen}>
        <DialogContent className="max-w-md" data-testid="pdf-options-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">{t("pdf_options")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-mono tracking-wider">{t("delivery_date")}</Label>
              <Input type="date" value={pdfDate} onChange={(e) => setPdfDate(e.target.value)} data-testid="pdf-date-input" />
            </div>
            <RadioGroup value={pdfMode} onValueChange={setPdfMode} className="space-y-2">
              <label className="flex items-start gap-2 p-2 rounded border border-border cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="all" id="pdf-all" className="mt-0.5" data-testid="pdf-mode-all" />
                <div className="text-sm">{t("pdf_mode_full")}</div>
              </label>
              <label className="flex items-start gap-2 p-2 rounded border border-border cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="clients_only" id="pdf-clients" className="mt-0.5" data-testid="pdf-mode-clients" />
                <div className="text-sm">{t("pdf_mode_clients")}</div>
              </label>
              <label className="flex items-start gap-2 p-2 rounded border border-border cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="supplier_products" id="pdf-supplier" className="mt-0.5" data-testid="pdf-mode-supplier" />
                <div className="text-sm flex-1">{t("pdf_mode_supplier")}</div>
              </label>
            </RadioGroup>
            {pdfMode === "supplier_products" && (
              <div className="space-y-1.5 pl-2 border-l-2 border-primary">
                <Label className="text-xs uppercase font-mono tracking-wider">{t("choose_supplier")}</Label>
                <Select value={pdfSupplier} onValueChange={setPdfSupplier}>
                  <SelectTrigger data-testid="pdf-supplier-select"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.length === 0 ? (
                      <SelectItem disabled value="_none">{t("no_data")}</SelectItem>
                    ) : suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPdfDialogOpen(false)} data-testid="pdf-cancel">{t("cancel")}</Button>
            <Button onClick={downloadPdf} data-testid="pdf-download">
              <FilePdf size={16} /> {t("download")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto w-[95vw]" data-testid="order-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? t("edit_order") : t("new_order")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase font-mono tracking-wider">{t("client")} *</Label>
                <SearchableSelect
                  items={clients}
                  value={form.client_id}
                  onChange={(id) => setForm({ ...form, client_id: id })}
                  getLabel={(c) => c.name}
                  getSearch={(c) => `${c.name || ""} ${c.tax_id || ""} ${c.email || ""} ${c.phone || ""}`}
                  renderRow={(c) => (
                    <div className="flex flex-col min-w-0">
                      <span className="truncate font-medium">{c.name}</span>
                      <span className="text-[11px] text-muted-foreground font-mono truncate">
                        NIF: {c.tax_id || "—"}{c.email ? ` · ${c.email}` : ""}
                      </span>
                    </div>
                  )}
                  searchPlaceholder={t("search_client_placeholder")}
                  emptyText={t("no_data")}
                  testid="order-client-select"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase font-mono tracking-wider">{t("delivery_date")}</Label>
                <Input type="date" value={form.delivery_date || ""} onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} data-testid="order-delivery-date" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-mono tracking-wider">{t("status")}</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger data-testid="order-status-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{t("status_pending")}</SelectItem>
                  <SelectItem value="in_progress">{t("status_in_progress")}</SelectItem>
                  <SelectItem value="completed">{t("status_completed")}</SelectItem>
                  <SelectItem value="cancelled">{t("status_cancelled")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-mono tracking-wider">{t("discount")}</Label>
              <Input type="number" min="0" max="100" step="0.5" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} data-testid="order-discount" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase font-mono tracking-wider">{t("order_items")}</Label>
                <Button type="button" size="sm" variant="outline" onClick={addItem} data-testid="order-add-item">
                  <Plus size={14} /> {t("add_item")}
                </Button>
              </div>
              <div className="space-y-2">
                {form.items.map((item, idx) => {
                  const prod = products.find((p) => p.id === item.product_id);
                  const priceVat = item.price !== null && item.price !== "" ? parseFloat(item.price) : (prod?.price || 0);
                  const priceNoVat = prod ? (prod.price_no_vat || priceVat / (1 + (prod.vat_rate || 23) / 100)) : 0;
                  const qty = parseInt(item.quantity) || 0;
                  const subtotal = qty * priceVat;
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end p-2 rounded-md bg-muted/40 border border-border" data-testid={`order-item-${idx}`}>
                      <div className="col-span-12 sm:col-span-6">
                        <SearchableSelect
                          items={products}
                          value={item.product_id}
                          onChange={(id) => updateItem(idx, { product_id: id })}
                          getLabel={(p) => `${p.name}${p.sku ? ` · ${p.sku}` : ""}`}
                          getSearch={(p) => `${p.name || ""} ${p.sku || ""} ${p.barcode || ""}`}
                          renderRow={(p) => (
                            <div className="flex flex-col min-w-0">
                              <span className="truncate font-medium text-sm">{p.name}</span>
                              <span className="text-[11px] text-muted-foreground font-mono truncate">
                                {p.sku || "—"} · €{Number(p.price_no_vat || 0).toFixed(2)} s/IVA · €{Number(p.price || 0).toFixed(2)} c/IVA
                              </span>
                            </div>
                          )}
                          searchPlaceholder={t("search_product_placeholder")}
                          emptyText={t("no_data")}
                          testid={`order-item-product-${idx}`}
                          placeholder={t("product")}
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <Input
                          type="number" min="1" value={item.quantity}
                          onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                          className="h-9"
                          data-testid={`order-item-qty-${idx}`}
                        />
                      </div>
                      <div className="col-span-6 sm:col-span-3 text-xs text-right font-mono tabular-nums text-muted-foreground self-center">
                        {prod && (
                          <div className="leading-tight">
                            <div className="text-[10px] text-muted-foreground">€{(qty * priceNoVat).toFixed(2)} s/IVA</div>
                            <div className="font-semibold text-foreground">€{subtotal.toFixed(2)} c/IVA</div>
                          </div>
                        )}
                      </div>
                      <div className="col-span-2 sm:col-span-1 flex justify-end">
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)} data-testid={`order-item-remove-${idx}`} className="h-8 w-8">
                          <X size={14} />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-mono tracking-wider">{t("notes")}</Label>
              <Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="order-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="order-cancel-btn">{t("cancel")}</Button>
            <Button onClick={save} data-testid="order-save-btn">{t("save")}</Button>
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
            <AlertDialogCancel data-testid="order-delete-cancel">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} data-testid="order-delete-confirm">{t("delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
