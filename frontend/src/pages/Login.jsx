import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CubeFocus, Sun, Moon, Translate } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Login() {
  const { user, login } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const { theme, toggle } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  if (user && typeof user === "object") return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const ok = await login(email, password);
    setLoading(false);
    if (!ok) {
      setErr(t("invalid_login"));
      toast.error(t("invalid_login"));
    }
  };

  return (
    <div className="min-h-screen flex bg-background" data-testid="login-page">
      {/* Left panel - Branding */}
      <div className="hidden md:flex md:w-1/2 bg-card border-r border-border p-12 flex-col justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <CubeFocus size={22} weight="bold" className="text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">
            {t("app_name")}
          </span>
        </div>

        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border text-xs font-mono uppercase tracking-wider text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            B2B Order Platform
          </div>
          <h2 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            Operações diárias,<br/>
            <span className="text-primary">dados claros.</span>
          </h2>
          <p className="text-muted-foreground text-base max-w-md">
            Gestão completa de clientes, produtos e encomendas com relatórios diários em PDF e auditoria integrada.
          </p>
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border max-w-md">
            <Stat value="3" label="Cargos" />
            <Stat value="Excel" label="Import/Export" />
            <Stat value="PDF" label="Relatórios" />
          </div>
        </div>

        <div className="text-xs font-mono text-muted-foreground">
          © 2026 — Seguro · Rápido · Escalável
        </div>
      </div>

      {/* Right panel - Form */}
      <div className="flex-1 flex flex-col">
        <div className="flex justify-end items-center gap-2 p-4">
          <Button variant="ghost" size="sm" onClick={() => setLang(lang === "pt" ? "en" : "pt")} data-testid="lang-toggle-login" className="gap-2">
            <Translate size={16} />
            <span className="font-mono text-xs uppercase">{lang}</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={toggle} data-testid="theme-toggle-login">
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </Button>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="w-full max-w-md shadow-none border-border">
            <CardContent className="p-8">
              <div className="space-y-1 mb-8">
                <h1 className="font-display text-3xl font-bold tracking-tight">{t("welcome_back")}</h1>
                <p className="text-sm text-muted-foreground">{t("enter_credentials")}</p>
              </div>

              <form onSubmit={onSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs uppercase tracking-wider font-mono">{t("email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    data-testid="login-email-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-xs uppercase tracking-wider font-mono">{t("password")}</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    data-testid="login-password-input"
                  />
                </div>
                {err && <div className="text-sm text-destructive" data-testid="login-error">{err}</div>}
                <Button
                  type="submit"
                  className="w-full h-11 font-semibold"
                  disabled={loading}
                  data-testid="login-submit-button"
                >
                  {loading ? t("loading") : t("sign_in")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }) {
  return (
    <div>
      <div className="font-display text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider">{label}</div>
    </div>
  );
}
