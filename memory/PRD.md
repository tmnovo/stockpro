# Product Requirements Document — Order Management System

## Problem Statement (Original)
> Cria um site para gestão de encomendas, em que por exemplo o cliente 1 pede pede x produtos, cliente 2 x produtos e etc.
> Que consiga importar e exportar clientes de outras plataformas, em exel ou word ou etc e adicionar novos produtos.
> Importar e exportar produtos e adicionar novos directo na plataforma.
> Gestão de encomendas no final do dia em PDF, para o dia seguinte!
> Adicionar utilizadores ( admin, armazém e vendedor ou acrescentar cargos e mudar permissões )
> E depois no painel admin aparecer quantas encomendas estão activas por cliente e quantos produtos vão sair no dia seguinte!
> Sistema de logs para o admin, para gerir quem mexeu no site e /ou fez alterações como acrescentar ou remover clientes, alterar encomendas etc!
> O site tem de ter front-end e back-end.
> E ser completamente seguro a ataques XML, SQL, etc!

## User Choices
- Auth: JWT email/password
- Theme: Light/dark toggle
- Language: PT + EN toggle
- Dashboard with charts
- Detailed PDF with company logo

## Architecture
- **Backend:** FastAPI + Motor (MongoDB async) + bcrypt + PyJWT + pandas + reportlab + openpyxl
- **Frontend:** React 19 + Shadcn UI + Tailwind + Recharts + Phosphor Icons
- **DB:** MongoDB (collections: users, clients, products, orders, audit_logs, settings, login_attempts)
- **Auth:** JWT access (8h) + refresh (7d) tokens in httpOnly cookies; bcrypt; brute-force protection (5 attempts → 15 min lockout)

## User Personas
- **Admin** — full access, user/permission management, logs, settings
- **Armazém (Warehouse)** — view clients/products, view + update orders, generate PDF
- **Vendedor (Seller)** — manage clients, create orders, view products

## Core Requirements (Static)
1. Secure auth (JWT + bcrypt + brute force)
2. Clients CRUD + Excel/CSV import/export (PT and EN column names)
3. Products CRUD + Excel/CSV import/export
4. Orders with multiple products per client, statuses (pending/in_progress/completed/cancelled), delivery_date
5. Daily PDF report with company logo (products summary + orders per client)
6. User management with roles + customizable permissions per resource
7. Admin audit log (who did what, when)
8. Dashboard with KPIs + charts (active orders per client, products shipping tomorrow, 7-day trend)
9. Light/dark theme + PT/EN language
10. Security: Pydantic validation (anti-XML/XXE), MongoDB (anti-SQLi), httpOnly cookies

## Implemented (2026-02-22)
- Full authentication flow (login, logout, me, refresh, change-password)
- Role-based access control with customizable permissions
- Clients: CRUD + import (CSV/XLSX) + export (XLSX)
- Products: CRUD + import (CSV/XLSX) + export (XLSX)
- Orders: CRUD with product/client validation, enriched responses (client_name, product_name, subtotals, total)
- Daily PDF: date-selectable, products summary table + per-client orders, company logo embedded
- Dashboard stats API + charts UI (bar + line) via Recharts
- Audit log for all actions (create/update/delete/login/logout/import/export/pdf_export)
- Settings: company name + logo (base64)
- User management (admin): CRUD + role change + permissions matrix + active toggle
- Theme toggle (light/dark) via CSS variables
- Language toggle PT/EN with full translation dictionary
- Brute force protection (email-based identifier, 5 attempts = 15 min lockout)

## Testing Status
- **Backend:** 30/30 pytest tests passing (100%)
- **Frontend:** Manual verification via screenshot — login & dashboard load correctly

## Admin Credentials
- Email: `admin@admin.com`
- Password: `admin123`
- Configurable via `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars or via Settings → Change Password

## P1 Backlog (Future)
- [ ] Email notifications on order creation (requires Resend/SendGrid key — currently not implemented)
- [ ] Order filters in UI (by status, date range, client)
- [ ] De-duplication on CSV imports (upsert by tax_id/sku)
- [ ] Order details modal/page with print view per-order
- [ ] Low stock alerts on product management

## P2 Backlog
- [ ] Multi-warehouse support
- [ ] Product categories
- [ ] Client tiers / pricing
- [ ] Refresh token rotation
- [ ] Secure cookie flag env-driven (for production HTTPS)
