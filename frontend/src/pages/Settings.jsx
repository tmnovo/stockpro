import { useEffect, useRef, useState } from "react";
import Layout from "@/components/Layout";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadSimple, Sun, Moon, Translate } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Settings() {
  const { t, lang, setLang } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const [settings, setSettings] = useState({ company_name: "", company_logo: null });
  const [loaded, setLoaded] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current_password: "", new_password: "" });
  const fileRef = useRef(null);

  useEffect(() => {
    api.get("/settings").then(({ data }) => {
      setSettings({ company_name: data.company_name || "", company_logo: data.company_logo || null });
      setLoaded(true);
    });
  }, []);

  const saveSettings = async () => {
    try {
      await api.put("/settings", settings);
      toast.success(t("updated_successfully"));
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const onLogoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Max 2MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setSettings({ ...settings, company_logo: reader.result });
    };
    reader.readAsDataURL(file);
  };

  const changePassword = async () => {
    if (!passwordForm.current_password || passwordForm.new_password.length < 6) {
      toast.error("Password min 6 chars");
      return;
    }
    try {
      await api.post("/auth/change-password", passwordForm);
      toast.success(t("updated_successfully"));
      setPasswordForm({ current_password: "", new_password: "" });
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <Layout title={t("settings")}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl" data-testid="settings-page">
        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">{t("theme")} & {t("language")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase font-mono tracking-wider">{t("theme")}</Label>
              <div className="flex gap-2">
                <Button variant={theme === "light" ? "default" : "outline"} size="sm" onClick={() => setTheme("light")} data-testid="settings-theme-light">
                  <Sun size={16} /> {t("light")}
                </Button>
                <Button variant={theme === "dark" ? "default" : "outline"} size="sm" onClick={() => setTheme("dark")} data-testid="settings-theme-dark">
                  <Moon size={16} /> {t("dark")}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase font-mono tracking-wider">{t("language")}</Label>
              <div className="flex gap-2">
                <Button variant={lang === "pt" ? "default" : "outline"} size="sm" onClick={() => setLang("pt")} data-testid="settings-lang-pt">
                  <Translate size={16} /> Português
                </Button>
                <Button variant={lang === "en" ? "default" : "outline"} size="sm" onClick={() => setLang("en")} data-testid="settings-lang-en">
                  <Translate size={16} /> English
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Password */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">{t("change_password")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-mono tracking-wider">{t("current_password")}</Label>
              <Input type="password" value={passwordForm.current_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                data-testid="settings-current-password" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-mono tracking-wider">{t("new_password")}</Label>
              <Input type="password" value={passwordForm.new_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                data-testid="settings-new-password" />
            </div>
            <Button onClick={changePassword} data-testid="settings-change-password-btn">{t("change_password")}</Button>
          </CardContent>
        </Card>

        {/* Company */}
        {user?.role === "admin" && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="font-display text-base">{t("company_name")} & {t("company_logo")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase font-mono tracking-wider">{t("company_name")}</Label>
                    <Input
                      value={settings.company_name}
                      onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                      data-testid="settings-company-name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase font-mono tracking-wider">{t("company_logo")}</Label>
                    <input type="file" ref={fileRef} accept="image/*" className="hidden" onChange={onLogoChange} data-testid="settings-logo-input" />
                    <Button variant="outline" onClick={() => fileRef.current?.click()} data-testid="settings-logo-btn">
                      <UploadSimple size={16} /> {t("upload_logo")}
                    </Button>
                  </div>
                  <Button onClick={saveSettings} disabled={!loaded} data-testid="settings-save-btn">{t("save")}</Button>
                </div>
                <div className="flex items-center justify-center p-6 rounded-md border border-border bg-muted/40 min-h-32">
                  {settings.company_logo ? (
                    <img src={settings.company_logo} alt="Logo" className="max-h-28 max-w-full object-contain" data-testid="settings-logo-preview" />
                  ) : (
                    <div className="text-sm text-muted-foreground">No logo</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
