# Sistema de Gestão de Encomendas

Sistema completo de gestão de encomendas com autenticação segura, controlo de permissões, importação/exportação em Excel e geração de relatórios em PDF.

## Funcionalidades

- Autenticação segura JWT (bcrypt + httpOnly cookies + brute force protection)
- Gestão de Clientes, Produtos e Encomendas (CRUD completo)
- Importação e exportação em Excel/CSV
- Geração de PDF diário das encomendas do dia seguinte (com logótipo)
- Sistema de logs/auditoria (admin)
- Utilizadores com cargos (admin, armazém, vendedor) e permissões customizáveis
- Dashboard com estatísticas e gráficos
- Tema claro/escuro com alternância
- Multi-idioma: Português e Inglês

## Credenciais Admin (padrão)

- **Email:** `admin@admin.com`
- **Password:** `admin123`

Estas credenciais podem (e devem) ser alteradas após o primeiro login em **Definições → Alterar Password**.

Também podem ser alteradas via variáveis de ambiente em `/app/backend/.env`:
```
ADMIN_EMAIL="admin@admin.com"
ADMIN_PASSWORD="admin123"
```

## Segurança

- Passwords com hash bcrypt
- JWT com access + refresh tokens em cookies httpOnly
- Proteção contra brute force (5 tentativas → 15 min de bloqueio)
- MongoDB (imune a SQL injection)
- Pydantic para validação estrita de inputs (imune a XML/XXE)
- CORS configurado
- Autorização baseada em cargos (RBAC)

## Stack

- **Backend:** FastAPI + Motor (MongoDB async) + PyJWT + bcrypt + pandas + reportlab
- **Frontend:** React 19 + Shadcn UI + Tailwind CSS + Recharts + Phosphor Icons
