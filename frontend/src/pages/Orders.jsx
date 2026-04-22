import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { api, API, formatApiError } from "@/lib/api";
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
import { Plus, PencilSimple, Trash, FilePdf, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";

const emptyOrder = { client_id: "", items: [], delivery_date: "", notes: "", status: "pending" };

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
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyOrder);
  const [deleteId, setDeleteId] = useState(null);
  const [pdfDate, setPdfDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });

  const load = async () => {
    setLoading(true);
    try {
      const [o, c, p] = await Promise.all([
        api.get("/orders"),
        api.get("/clients"),
        api.get("/products"),
      ]);
      setOrders(o.data);
      setClients(c.data);
      setProducts(p.data);
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
      items: form.items
        .filter((i) => i.product_id && i.quantity > 0)
        .map((i) => ({
          product_id: i.product_id,
          quantity: parseInt(i.quantity) || 1,
          price: i.price !== null && i.price !== "" ? parseFloat(i.price) : null,
        })),
    };
    if (!payload.client_id) { toast.error("Client required"); return; }
    if (payload.items.length === 0) { toast.error("Add at least 1 item"); return; }

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
    try {
      const response = await api.get(`/orders/daily-pdf`, {
        params: { target_date: pdfDate },
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = url; a.download = `orders_${pdfDate}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <Layout title={t("orders")}>
      <div className="space-y-4" data-testid="orders-page">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap items-end gap-2">
            {hasPermission("orders", "pdf") && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs uppercase font-mono tracking-wider">{t("delivery_date")}</Label>
                  <Input type="date" value={pdfDate} onChange={(e) => setPdfDate(e.target.value)} data-testid="pdf-date-input" className="w-44" />
                </div>
                <Button variant="outline" onClick={downloadPdf} data-testid="orders-pdf-btn">
                  <FilePdf size={16} /> {t("daily_pdf")}
                </Button>
              </>
            )}
          </div>
          {hasPermission("orders", "create") && (
            <Button onClick={openNew} data-testid="orders-new-btn">
              <Plus size={16} /> {t("new_order")}
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("client")}</TableHead>
                  <TableHead>{t("delivery_date")}</TableHead>
                  <TableHead>{t("order_items")}</TableHead>
                  <TableHead className="text-right">{t("total")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead className="text-right">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{t("loading")}</TableCell></TableRow>
                ) : orders.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{t("no_data")}</TableCell></TableRow>
                ) : orders.map((o) => (
                  <TableRow key={o.id} data-testid={`order-row-${o.id}`}>
                    <TableCell className="font-medium">{o.client_name}</TableCell>
                    <TableCell className="font-mono text-xs">{o.delivery_date || "—"}</TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground">
                        {o.items.slice(0, 2).map((i) => `${i.quantity}× ${i.product_name}`).join(", ")}
                        {o.items.length > 2 && ` +${o.items.length - 2}`}
                      </div>
                    </TableCell>
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

      {/* Order Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="order-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? t("edit_order") : t("new_order")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase font-mono tracking-wider">{t("client")} *</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger data-testid="order-client-select"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
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
                  const price = item.price !== null && item.price !== "" ? parseFloat(item.price) : (prod?.price || 0);
                  const subtotal = (parseInt(item.quantity) || 0) * price;
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end p-2 rounded-md bg-muted/40 border border-border" data-testid={`order-item-${idx}`}>
                      <div className="col-span-6">
                        <Select value={item.product_id} onValueChange={(v) => updateItem(idx, { product_id: v })}>
                          <SelectTrigger className="h-9" data-testid={`order-item-product-${idx}`}><SelectValue placeholder={t("product")} /></SelectTrigger>
                          <SelectContent>
                            {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · €{Number(p.price).toFixed(2)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number" min="1" value={item.quantity}
                          onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                          className="h-9"
                          data-testid={`order-item-qty-${idx}`}
                        />
                      </div>
                      <div className="col-span-3 text-xs text-right font-mono tabular-nums text-muted-foreground">
                        €{subtotal.toFixed(2)}
                      </div>
                      <div className="col-span-1 flex justify-end">
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
