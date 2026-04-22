import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { api, formatApiError } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Plus, PencilSimple, Trash, Key } from "@phosphor-icons/react";
import { toast } from "sonner";

const RESOURCES = ["clients", "products", "orders", "users", "logs", "settings"];
const ACTIONS_BY_RESOURCE = {
  clients: ["view", "create", "update", "delete", "import", "export"],
  products: ["view", "create", "update", "delete", "import", "export"],
  orders: ["view", "create", "update", "delete", "pdf"],
  users: ["view", "create", "update", "delete"],
  logs: ["view"],
  settings: ["view", "update"],
};

const emptyUser = { email: "", password: "", name: "", role: "seller" };

export default function Users() {
  const { t } = useLanguage();
  const { user: current } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyUser);
  const [deleteId, setDeleteId] = useState(null);
  const [permsDialog, setPermsDialog] = useState(null);
  const [permsForm, setPermsForm] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/users");
      setUsers(data);
    } catch (e) { toast.error(formatApiError(e)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(emptyUser); setDialogOpen(true); };
  const openEdit = (u) => { setEditing(u); setForm({ email: u.email, name: u.name, role: u.role, password: "" }); setDialogOpen(true); };

  const save = async () => {
    try {
      if (editing) {
        const payload = { name: form.name, role: form.role };
        if (form.password) payload.password = form.password;
        await api.put(`/users/${editing.id}`, payload);
        toast.success(t("updated_successfully"));
      } else {
        await api.post("/users", form);
        toast.success(t("created_successfully"));
      }
      setDialogOpen(false);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const doDelete = async () => {
    try {
      await api.delete(`/users/${deleteId}`);
      toast.success(t("deleted_successfully"));
      setDeleteId(null);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const toggleActive = async (u) => {
    try {
      await api.put(`/users/${u.id}`, { active: !u.active });
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const openPerms = (u) => {
    setPermsDialog(u);
    setPermsForm({ ...(u.permissions || {}) });
  };

  const togglePerm = (resource, action) => {
    const current = permsForm[resource] || [];
    const updated = current.includes(action) ? current.filter((a) => a !== action) : [...current, action];
    setPermsForm({ ...permsForm, [resource]: updated });
  };

  const savePerms = async () => {
    try {
      await api.put(`/users/${permsDialog.id}`, { permissions: permsForm });
      toast.success(t("updated_successfully"));
      setPermsDialog(null);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <Layout title={t("users")}>
      <div className="space-y-4" data-testid="users-page">
        <div className="flex justify-end">
          <Button onClick={openNew} data-testid="users-new-btn">
            <Plus size={16} /> {t("new_user")}
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("email")}</TableHead>
                  <TableHead>{t("role")}</TableHead>
                  <TableHead>{t("active")}</TableHead>
                  <TableHead className="text-right">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">{t("loading")}</TableCell></TableRow>
                ) : users.map((u) => (
                  <TableRow key={u.id} data-testid={`user-row-${u.id}`}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{t(`role_${u.role}`)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={u.active}
                        onCheckedChange={() => toggleActive(u)}
                        disabled={u.id === current?.id}
                        data-testid={`user-active-${u.id}`}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openPerms(u)} data-testid={`user-perms-${u.id}`}>
                          <Key size={16} />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(u)} data-testid={`user-edit-${u.id}`}>
                          <PencilSimple size={16} />
                        </Button>
                        {u.id !== current?.id && (
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(u.id)} data-testid={`user-delete-${u.id}`}>
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
        <DialogContent className="max-w-md" data-testid="user-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? t("edit_user") : t("new_user")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-mono tracking-wider">{t("email")} *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!!editing} data-testid="user-email" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-mono tracking-wider">{t("name")} *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="user-name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-mono tracking-wider">{t("role")} *</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="user-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{t("role_admin")}</SelectItem>
                  <SelectItem value="warehouse">{t("role_warehouse")}</SelectItem>
                  <SelectItem value="seller">{t("role_seller")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-mono tracking-wider">
                {editing ? t("new_password") + " (opcional)" : t("password") + " *"}
              </Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="user-password" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="user-cancel-btn">{t("cancel")}</Button>
            <Button onClick={save} data-testid="user-save-btn">{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={!!permsDialog} onOpenChange={(o) => !o && setPermsDialog(null)}>
        <DialogContent className="max-w-xl" data-testid="perms-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">{t("permissions")} — {permsDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {RESOURCES.map((r) => (
              <div key={r} className="border border-border rounded-md p-3">
                <div className="font-semibold text-sm capitalize mb-2">{t(r)}</div>
                <div className="flex flex-wrap gap-3">
                  {ACTIONS_BY_RESOURCE[r].map((a) => (
                    <label key={a} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={(permsForm[r] || []).includes(a)}
                        onCheckedChange={() => togglePerm(r, a)}
                        data-testid={`perm-${r}-${a}`}
                      />
                      <span className="capitalize">{a}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermsDialog(null)} data-testid="perms-cancel-btn">{t("cancel")}</Button>
            <Button onClick={savePerms} data-testid="perms-save-btn">{t("save")}</Button>
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
            <AlertDialogCancel data-testid="user-delete-cancel">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} data-testid="user-delete-confirm">{t("delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
