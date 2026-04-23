"""
Order Management System - Backend
FastAPI + MongoDB + JWT Auth + Excel I/O + PDF Reports
"""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import uuid
import logging
import secrets
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional, Dict, Any

import bcrypt
import jwt
import pandas as pd
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict, EmailStr, field_validator

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage, PageBreak
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER


# ----------------------------------------------------------------------------
# Setup
# ----------------------------------------------------------------------------
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8  # 8 hours
REFRESH_TOKEN_EXPIRE_DAYS = 7

app = FastAPI(title="Order Management System")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------------
# Helpers: Password, JWT, Time
# ----------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        "type": "refresh",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def iso(dt: datetime) -> str:
    if isinstance(dt, str):
        return dt
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


# ----------------------------------------------------------------------------
# Models
# ----------------------------------------------------------------------------
VALID_ROLES = {"admin", "warehouse", "seller"}

# Default permissions per role
DEFAULT_PERMISSIONS = {
    "admin": {
        "clients": ["view", "create", "update", "delete", "import", "export"],
        "products": ["view", "create", "update", "delete", "import", "export"],
        "orders": ["view", "create", "update", "delete", "pdf"],
        "users": ["view", "create", "update", "delete"],
        "logs": ["view"],
        "settings": ["view", "update"],
    },
    "warehouse": {
        "clients": ["view"],
        "products": ["view"],
        "orders": ["view", "update", "pdf"],
        "users": [],
        "logs": [],
        "settings": ["view"],
    },
    "seller": {
        "clients": ["view", "create", "update", "export"],
        "products": ["view"],
        "orders": ["view", "create", "update"],
        "users": [],
        "logs": [],
        "settings": ["view"],
    },
}


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    permissions: Dict[str, List[str]]
    active: bool = True
    created_at: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: str = Field(min_length=1, max_length=100)
    role: str = "seller"

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in VALID_ROLES:
            raise ValueError(f"Role must be one of {VALID_ROLES}")
        return v


class UpdateUserIn(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    role: Optional[str] = None
    active: Optional[bool] = None
    permissions: Optional[Dict[str, List[str]]] = None
    password: Optional[str] = Field(None, min_length=6, max_length=128)

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v is not None and v not in VALID_ROLES:
            raise ValueError(f"Role must be one of {VALID_ROLES}")
        return v


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=128)


class ClientIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=50)
    address: Optional[str] = Field(None, max_length=500)
    tax_id: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None, max_length=1000)


class ProductIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    sku: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = Field(None, max_length=1000)
    price: float = Field(ge=0)
    stock: int = Field(default=0, ge=0)
    unit: Optional[str] = Field(default="un", max_length=20)


class OrderItemIn(BaseModel):
    product_id: str
    quantity: int = Field(ge=1)
    price: Optional[float] = Field(default=None, ge=0)  # snapshot price, default = product price


class OrderIn(BaseModel):
    client_id: str
    items: List[OrderItemIn] = Field(min_length=1)
    delivery_date: Optional[str] = None  # ISO date "YYYY-MM-DD"
    notes: Optional[str] = Field(None, max_length=1000)
    status: Optional[str] = "pending"  # pending, in_progress, completed, cancelled


class OrderUpdateIn(BaseModel):
    client_id: Optional[str] = None
    items: Optional[List[OrderItemIn]] = None
    delivery_date: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=1000)
    status: Optional[str] = None


class SettingsIn(BaseModel):
    company_name: Optional[str] = Field(None, max_length=200)
    company_logo: Optional[str] = None  # base64 data url


# ----------------------------------------------------------------------------
# Authorization dependencies
# ----------------------------------------------------------------------------
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if not user.get("active", True):
            raise HTTPException(status_code=403, detail="User inactive")
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_permission(resource: str, action: str):
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") == "admin":
            return user
        perms = (user.get("permissions") or {}).get(resource, [])
        if action not in perms:
            raise HTTPException(status_code=403, detail=f"Permission denied: {resource}.{action}")
        return user
    return checker


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


# ----------------------------------------------------------------------------
# Audit Log helper
# ----------------------------------------------------------------------------
async def log_action(user: dict, action: str, entity: str, entity_id: Optional[str] = None,
                      details: Optional[str] = None):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user.get("id"),
        "user_email": user.get("email"),
        "user_name": user.get("name"),
        "action": action,
        "entity": entity,
        "entity_id": entity_id,
        "details": details,
        "timestamp": iso(now_utc()),
    }
    try:
        await db.audit_logs.insert_one(doc)
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")


def user_to_public(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u.get("name", ""),
        "role": u.get("role", "seller"),
        "permissions": u.get("permissions", {}),
        "active": u.get("active", True),
        "created_at": u.get("created_at"),
    }


# ----------------------------------------------------------------------------
# Brute force protection
# ----------------------------------------------------------------------------
MAX_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


async def check_brute_force(identifier: str):
    cutoff = now_utc() - timedelta(minutes=LOCKOUT_MINUTES)
    rec = await db.login_attempts.find_one({"identifier": identifier}, {"_id": 0})
    if rec and rec.get("count", 0) >= MAX_ATTEMPTS:
        last = rec.get("last_attempt")
        if isinstance(last, str):
            last = datetime.fromisoformat(last)
        if last and last > cutoff:
            raise HTTPException(status_code=429, detail="Too many failed attempts. Try again later.")
        # reset window
        await db.login_attempts.update_one({"identifier": identifier}, {"$set": {"count": 0}})


async def record_failed_attempt(identifier: str):
    await db.login_attempts.update_one(
        {"identifier": identifier},
        {"$inc": {"count": 1}, "$set": {"last_attempt": iso(now_utc())}},
        upsert=True,
    )


async def clear_attempts(identifier: str):
    await db.login_attempts.delete_one({"identifier": identifier})


# ----------------------------------------------------------------------------
# Cookies helper
# ----------------------------------------------------------------------------
def set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    response.set_cookie(
        key="access_token", value=access_token, httponly=True, secure=False,
        samesite="lax", max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60, path="/",
    )
    response.set_cookie(
        key="refresh_token", value=refresh_token, httponly=True, secure=False,
        samesite="lax", max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600, path="/",
    )


# ============================================================================
# AUTH ROUTES
# ============================================================================
@api_router.post("/auth/login")
async def login(data: LoginIn, request: Request, response: Response):
    email = data.email.lower().strip()
    # Brute force identifier: use email only (proxy-agnostic, protects the account)
    identifier = f"email:{email}"

    await check_brute_force(identifier)

    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password_hash"]):
        await record_failed_attempt(identifier)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Account inactive")

    await clear_attempts(identifier)
    access = create_access_token(user["id"], user["email"], user["role"])
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)

    await log_action(user, "login", "auth", user["id"], f"User {email} logged in")
    return user_to_public(user)


@api_router.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    await log_action(user, "logout", "auth", user["id"])
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user_to_public(user)


@api_router.post("/auth/refresh")
async def refresh_tok(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user or not user.get("active", True):
            raise HTTPException(status_code=401, detail="User not found or inactive")
        access = create_access_token(user["id"], user["email"], user["role"])
        response.set_cookie(
            key="access_token", value=access, httponly=True, secure=False,
            samesite="lax", max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60, path="/",
        )
        return {"ok": True}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


@api_router.post("/auth/change-password")
async def change_password(data: ChangePasswordIn, user: dict = Depends(get_current_user)):
    full = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    if not verify_password(data.current_password, full["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    new_hash = hash_password(data.new_password)
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": new_hash}})
    await log_action(user, "change_password", "user", user["id"], "Password changed")
    return {"ok": True}


# ============================================================================
# USERS (Admin only)
# ============================================================================
@api_router.get("/users")
async def list_users(user: dict = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users


@api_router.post("/users")
async def create_user(data: RegisterIn, user: dict = Depends(require_admin)):
    email = data.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    new_user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": data.name.strip(),
        "password_hash": hash_password(data.password),
        "role": data.role,
        "permissions": DEFAULT_PERMISSIONS.get(data.role, DEFAULT_PERMISSIONS["seller"]),
        "active": True,
        "created_at": iso(now_utc()),
    }
    await db.users.insert_one(new_user.copy())
    await log_action(user, "create", "user", new_user["id"], f"Created user {email} ({data.role})")
    return user_to_public(new_user)


@api_router.put("/users/{user_id}")
async def update_user(user_id: str, data: UpdateUserIn, user: dict = Depends(require_admin)):
    existing = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    update = {}
    if data.name is not None:
        update["name"] = data.name.strip()
    if data.role is not None:
        update["role"] = data.role
        # If permissions not passed, reset to role defaults
        if data.permissions is None:
            update["permissions"] = DEFAULT_PERMISSIONS.get(data.role, DEFAULT_PERMISSIONS["seller"])
    if data.permissions is not None:
        update["permissions"] = data.permissions
    if data.active is not None:
        update["active"] = data.active
    if data.password:
        update["password_hash"] = hash_password(data.password)
    if update:
        await db.users.update_one({"id": user_id}, {"$set": update})
    updated = await db.users.find_one({"id": user_id}, {"_id": 0})
    await log_action(user, "update", "user", user_id, f"Updated user {existing['email']}")
    return user_to_public(updated)


@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(require_admin)):
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    existing = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.delete_one({"id": user_id})
    await log_action(user, "delete", "user", user_id, f"Deleted user {existing['email']}")
    return {"ok": True}


# ============================================================================
# CLIENTS
# ============================================================================
@api_router.get("/clients")
async def list_clients(user: dict = Depends(require_permission("clients", "view"))):
    items = await db.clients.find({}, {"_id": 0}).sort("name", 1).to_list(5000)
    return items


@api_router.post("/clients")
async def create_client(data: ClientIn, user: dict = Depends(require_permission("clients", "create"))):
    doc = data.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = iso(now_utc())
    doc["updated_at"] = iso(now_utc())
    await db.clients.insert_one(doc.copy())
    await log_action(user, "create", "client", doc["id"], f"Created client {doc['name']}")
    doc.pop("_id", None)
    return doc


@api_router.put("/clients/{client_id}")
async def update_client(client_id: str, data: ClientIn, user: dict = Depends(require_permission("clients", "update"))):
    existing = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")
    update = data.model_dump()
    update["updated_at"] = iso(now_utc())
    await db.clients.update_one({"id": client_id}, {"$set": update})
    await log_action(user, "update", "client", client_id, f"Updated client {existing['name']}")
    return await db.clients.find_one({"id": client_id}, {"_id": 0})


@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, user: dict = Depends(require_permission("clients", "delete"))):
    existing = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")
    await db.clients.delete_one({"id": client_id})
    await log_action(user, "delete", "client", client_id, f"Deleted client {existing['name']}")
    return {"ok": True}


@api_router.post("/clients/import")
async def import_clients(file: UploadFile = File(...),
                         user: dict = Depends(require_permission("clients", "import"))):
    content = await file.read()
    filename = (file.filename or "").lower()
    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Use .csv, .xlsx or .xls")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {e}")

    # Normalize columns (case-insensitive)
    df.columns = [str(c).strip().lower() for c in df.columns]
    inserted = 0
    skipped = 0
    for _, row in df.iterrows():
        name = str(row.get("name") or row.get("nome") or "").strip()
        if not name or name.lower() == "nan":
            skipped += 1
            continue
        doc = {
            "id": str(uuid.uuid4()),
            "name": name,
            "email": str(row.get("email") or "").strip() or None,
            "phone": str(row.get("phone") or row.get("telefone") or "").strip() or None,
            "address": str(row.get("address") or row.get("morada") or row.get("endereco") or "").strip() or None,
            "tax_id": str(row.get("tax_id") or row.get("nif") or "").strip() or None,
            "notes": str(row.get("notes") or row.get("notas") or "").strip() or None,
            "created_at": iso(now_utc()),
            "updated_at": iso(now_utc()),
        }
        # clean 'nan' strings
        for k, v in list(doc.items()):
            if isinstance(v, str) and v.lower() == "nan":
                doc[k] = None
        await db.clients.insert_one(doc.copy())
        inserted += 1

    await log_action(user, "import", "client", None, f"Imported {inserted} clients (skipped {skipped})")
    return {"inserted": inserted, "skipped": skipped}


@api_router.get("/clients/export")
async def export_clients(user: dict = Depends(require_permission("clients", "export"))):
    items = await db.clients.find({}, {"_id": 0}).to_list(100000)
    df = pd.DataFrame(items)
    if df.empty:
        df = pd.DataFrame(columns=["id", "name", "email", "phone", "address", "tax_id", "notes"])
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Clients")
    buf.seek(0)
    await log_action(user, "export", "client", None, f"Exported {len(items)} clients")
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="clients.xlsx"'},
    )


# ============================================================================
# PRODUCTS
# ============================================================================
@api_router.get("/products")
async def list_products(user: dict = Depends(require_permission("products", "view"))):
    items = await db.products.find({}, {"_id": 0}).sort("name", 1).to_list(5000)
    return items


@api_router.post("/products")
async def create_product(data: ProductIn, user: dict = Depends(require_permission("products", "create"))):
    doc = data.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = iso(now_utc())
    doc["updated_at"] = iso(now_utc())
    await db.products.insert_one(doc.copy())
    await log_action(user, "create", "product", doc["id"], f"Created product {doc['name']}")
    doc.pop("_id", None)
    return doc


@api_router.put("/products/{product_id}")
async def update_product(product_id: str, data: ProductIn,
                         user: dict = Depends(require_permission("products", "update"))):
    existing = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")
    update = data.model_dump()
    update["updated_at"] = iso(now_utc())
    await db.products.update_one({"id": product_id}, {"$set": update})
    await log_action(user, "update", "product", product_id, f"Updated product {existing['name']}")
    return await db.products.find_one({"id": product_id}, {"_id": 0})


@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, user: dict = Depends(require_permission("products", "delete"))):
    existing = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")
    await db.products.delete_one({"id": product_id})
    await log_action(user, "delete", "product", product_id, f"Deleted product {existing['name']}")
    return {"ok": True}


@api_router.post("/products/import")
async def import_products(file: UploadFile = File(...),
                          user: dict = Depends(require_permission("products", "import"))):
    content = await file.read()
    filename = (file.filename or "").lower()
    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {e}")

    df.columns = [str(c).strip().lower() for c in df.columns]
    inserted, skipped = 0, 0
    for _, row in df.iterrows():
        name = str(row.get("name") or row.get("nome") or "").strip()
        if not name or name.lower() == "nan":
            skipped += 1
            continue
        try:
            price = float(row.get("price") or row.get("preco") or row.get("preço") or 0)
        except Exception:
            price = 0.0
        try:
            stock = int(float(row.get("stock") or row.get("estoque") or 0))
        except Exception:
            stock = 0
        doc = {
            "id": str(uuid.uuid4()),
            "name": name,
            "sku": str(row.get("sku") or "").strip() or None,
            "description": str(row.get("description") or row.get("descricao") or "").strip() or None,
            "price": price,
            "stock": stock,
            "unit": str(row.get("unit") or row.get("unidade") or "un").strip() or "un",
            "created_at": iso(now_utc()),
            "updated_at": iso(now_utc()),
        }
        for k, v in list(doc.items()):
            if isinstance(v, str) and v.lower() == "nan":
                doc[k] = None
        await db.products.insert_one(doc.copy())
        inserted += 1

    await log_action(user, "import", "product", None, f"Imported {inserted} products (skipped {skipped})")
    return {"inserted": inserted, "skipped": skipped}


@api_router.get("/products/export")
async def export_products(user: dict = Depends(require_permission("products", "export"))):
    items = await db.products.find({}, {"_id": 0}).to_list(100000)
    df = pd.DataFrame(items)
    if df.empty:
        df = pd.DataFrame(columns=["id", "name", "sku", "description", "price", "stock", "unit"])
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Products")
    buf.seek(0)
    await log_action(user, "export", "product", None, f"Exported {len(items)} products")
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="products.xlsx"'},
    )


# ============================================================================
# ORDERS
# ============================================================================
async def _enrich_order(order: dict) -> dict:
    client = await db.clients.find_one({"id": order["client_id"]}, {"_id": 0})
    order["client_name"] = client["name"] if client else "Unknown"
    enriched_items = []
    total = 0.0
    for item in order.get("items", []):
        product = await db.products.find_one({"id": item["product_id"]}, {"_id": 0})
        name = product["name"] if product else "Unknown"
        unit = product.get("unit", "un") if product else "un"
        price = float(item.get("price") or (product["price"] if product else 0))
        qty = int(item["quantity"])
        subtotal = price * qty
        total += subtotal
        enriched_items.append({
            "product_id": item["product_id"],
            "product_name": name,
            "quantity": qty,
            "price": price,
            "unit": unit,
            "subtotal": subtotal,
        })
    order["items"] = enriched_items
    order["total"] = total
    return order


# ============================================================================
# SUPPLIERS (minimal CRUD — used by Products page filter/dropdown)
# ============================================================================
class SupplierIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None, max_length=1000)


@api_router.get("/suppliers")
async def list_suppliers(user: dict = Depends(get_current_user)):
    items = await db.suppliers.find({}, {"_id": 0}).sort("name", 1).to_list(2000)
    return items


@api_router.post("/suppliers")
async def create_supplier(data: SupplierIn, user: dict = Depends(get_current_user)):
    doc = data.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = iso(now_utc())
    doc["updated_at"] = iso(now_utc())
    await db.suppliers.insert_one(doc.copy())
    await log_action(user, "create", "supplier", doc["id"], f"Created supplier {doc['name']}")
    doc.pop("_id", None)
    return doc


@api_router.put("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: str, data: SupplierIn, user: dict = Depends(get_current_user)):
    existing = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Supplier not found")
    update = data.model_dump()
    update["updated_at"] = iso(now_utc())
    await db.suppliers.update_one({"id": supplier_id}, {"$set": update})
    await log_action(user, "update", "supplier", supplier_id, f"Updated supplier {existing['name']}")
    return await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})


@api_router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str, user: dict = Depends(get_current_user)):
    existing = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Supplier not found")
    await db.suppliers.delete_one({"id": supplier_id})
    await log_action(user, "delete", "supplier", supplier_id, f"Deleted supplier {existing['name']}")
    return {"ok": True}


# ============================================================================
# ORDERS
# ============================================================================
@api_router.get("/orders")
async def list_orders(user: dict = Depends(require_permission("orders", "view")),
                      status: Optional[str] = None,
                      delivery_date: Optional[str] = None):
    q = {}
    if status:
        q["status"] = status
    if delivery_date:
        q["delivery_date"] = delivery_date
    items = await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(5000)
    return [await _enrich_order(o) for o in items]


@api_router.get("/orders/daily-pdf")
async def daily_pdf(target_date: Optional[str] = Query(None),
                    user: dict = Depends(require_permission("orders", "pdf"))):
    # Default: tomorrow
    if not target_date:
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date()
        target_date = tomorrow.isoformat()
    orders = await db.orders.find(
        {"delivery_date": target_date, "status": {"$ne": "cancelled"}},
        {"_id": 0}
    ).to_list(5000)
    enriched = [await _enrich_order(o) for o in orders]

    settings = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    company_name = settings.get("company_name") or os.environ.get("COMPANY_NAME", "Order Management")
    logo = settings.get("company_logo")

    pdf_bytes = await generate_orders_pdf(enriched, target_date, company_name, logo)
    await log_action(user, "pdf_export", "order", None,
                     f"Generated PDF for {target_date} ({len(enriched)} orders)")
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="orders_{target_date}.pdf"'},
    )


@api_router.get("/orders/{order_id}")
async def get_order(order_id: str, user: dict = Depends(require_permission("orders", "view"))):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return await _enrich_order(order)


@api_router.post("/orders")
async def create_order(data: OrderIn, user: dict = Depends(require_permission("orders", "create"))):
    if not await db.clients.find_one({"id": data.client_id}, {"_id": 0}):
        raise HTTPException(status_code=400, detail="Client not found")
    # Validate products and snapshot prices
    items_out = []
    for it in data.items:
        prod = await db.products.find_one({"id": it.product_id}, {"_id": 0})
        if not prod:
            raise HTTPException(status_code=400, detail=f"Product {it.product_id} not found")
        price = float(it.price) if it.price is not None else float(prod["price"])
        items_out.append({"product_id": it.product_id, "quantity": it.quantity, "price": price})

    doc = {
        "id": str(uuid.uuid4()),
        "client_id": data.client_id,
        "items": items_out,
        "delivery_date": data.delivery_date,
        "notes": data.notes,
        "status": data.status or "pending",
        "created_by": user["id"],
        "created_by_name": user["name"],
        "created_at": iso(now_utc()),
        "updated_at": iso(now_utc()),
    }
    await db.orders.insert_one(doc.copy())
    await log_action(user, "create", "order", doc["id"],
                     f"Created order for client {data.client_id} with {len(items_out)} items")
    return await _enrich_order(doc)


@api_router.put("/orders/{order_id}")
async def update_order(order_id: str, data: OrderUpdateIn,
                       user: dict = Depends(require_permission("orders", "update"))):
    existing = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Order not found")
    update = {}
    if data.client_id is not None:
        if not await db.clients.find_one({"id": data.client_id}, {"_id": 0}):
            raise HTTPException(status_code=400, detail="Client not found")
        update["client_id"] = data.client_id
    if data.items is not None:
        items_out = []
        for it in data.items:
            prod = await db.products.find_one({"id": it.product_id}, {"_id": 0})
            if not prod:
                raise HTTPException(status_code=400, detail=f"Product {it.product_id} not found")
            price = float(it.price) if it.price is not None else float(prod["price"])
            items_out.append({"product_id": it.product_id, "quantity": it.quantity, "price": price})
        update["items"] = items_out
    if data.delivery_date is not None:
        update["delivery_date"] = data.delivery_date
    if data.notes is not None:
        update["notes"] = data.notes
    if data.status is not None:
        update["status"] = data.status
    update["updated_at"] = iso(now_utc())
    await db.orders.update_one({"id": order_id}, {"$set": update})
    await log_action(user, "update", "order", order_id, f"Updated order {order_id}")
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return await _enrich_order(updated)


@api_router.delete("/orders/{order_id}")
async def delete_order(order_id: str, user: dict = Depends(require_permission("orders", "delete"))):
    existing = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Order not found")
    await db.orders.delete_one({"id": order_id})
    await log_action(user, "delete", "order", order_id, f"Deleted order {order_id}")
    return {"ok": True}


# ----------------------------------------------------------------------------
# PDF generation
# ----------------------------------------------------------------------------
async def generate_orders_pdf(orders: List[dict], target_date: str, company_name: str,
                               logo_data_url: Optional[str] = None) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=15 * mm, rightMargin=15 * mm,
                            topMargin=15 * mm, bottomMargin=15 * mm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=20,
                                  textColor=colors.HexColor("#0052FF"), spaceAfter=6)
    subtitle_style = ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=11,
                                     textColor=colors.HexColor("#6B7280"), spaceAfter=14)
    h2 = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=13,
                        textColor=colors.HexColor("#111827"), spaceBefore=10, spaceAfter=6)
    elements = []

    # Header with logo
    if logo_data_url and "," in logo_data_url:
        try:
            import base64
            _, b64 = logo_data_url.split(",", 1)
            logo_bytes = base64.b64decode(b64)
            logo_buf = io.BytesIO(logo_bytes)
            img = RLImage(logo_buf, width=40 * mm, height=20 * mm, kind='proportional')
            elements.append(img)
        except Exception as e:
            logger.warning(f"Could not embed logo: {e}")

    elements.append(Paragraph(company_name, title_style))
    elements.append(Paragraph(f"Relatório de Encomendas — Entrega: <b>{target_date}</b>", subtitle_style))
    elements.append(Paragraph(f"Gerado em: {now_utc().strftime('%Y-%m-%d %H:%M UTC')}", subtitle_style))

    if not orders:
        elements.append(Paragraph("Sem encomendas para a data seleccionada.", styles['Normal']))
    else:
        # Summary of products going out
        product_totals: Dict[str, Dict[str, Any]] = {}
        for o in orders:
            for it in o.get("items", []):
                key = it["product_name"]
                if key not in product_totals:
                    product_totals[key] = {"quantity": 0, "unit": it.get("unit", "un")}
                product_totals[key]["quantity"] += it["quantity"]

        elements.append(Paragraph("Resumo de Produtos", h2))
        data = [["Produto", "Quantidade Total", "Unidade"]]
        for name, info in sorted(product_totals.items()):
            data.append([name, str(info["quantity"]), info["unit"]])
        t = Table(data, colWidths=[90 * mm, 45 * mm, 35 * mm])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#0052FF")),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor("#F9F9FB")),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
            ('ALIGN', (1, 1), (1, -1), 'RIGHT'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9F9FB")]),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 10))

        # Orders per client
        elements.append(Paragraph("Encomendas por Cliente", h2))
        for o in orders:
            total = o.get("total", 0)
            elements.append(Paragraph(
                f"<b>Cliente:</b> {o['client_name']} &nbsp;&nbsp; <b>Estado:</b> {o.get('status','pending')} "
                f"&nbsp;&nbsp; <b>Total:</b> €{total:.2f}",
                styles['Normal']))
            if o.get("notes"):
                elements.append(Paragraph(f"<i>Notas: {o['notes']}</i>", styles['Normal']))
            tdata = [["Produto", "Qtd", "Preço Un.", "Subtotal"]]
            for it in o["items"]:
                tdata.append([
                    it["product_name"],
                    str(it["quantity"]),
                    f"€{it['price']:.2f}",
                    f"€{it['subtotal']:.2f}",
                ])
            tbl = Table(tdata, colWidths=[85 * mm, 25 * mm, 30 * mm, 30 * mm])
            tbl.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#111827")),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
                ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
            ]))
            elements.append(tbl)
            elements.append(Spacer(1, 8))

    doc.build(elements)
    return buf.getvalue()


# ============================================================================
# DASHBOARD
# ============================================================================
@api_router.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date()
    tomorrow = (today + timedelta(days=1)).isoformat()

    total_clients = await db.clients.count_documents({})
    total_products = await db.products.count_documents({})
    total_orders = await db.orders.count_documents({})
    active_orders = await db.orders.count_documents({"status": {"$in": ["pending", "in_progress"]}})

    # Orders per client (active)
    active_cursor = db.orders.find(
        {"status": {"$in": ["pending", "in_progress"]}}, {"_id": 0}
    )
    per_client: Dict[str, int] = {}
    async for o in active_cursor:
        per_client[o["client_id"]] = per_client.get(o["client_id"], 0) + 1
    per_client_list = []
    for cid, count in sorted(per_client.items(), key=lambda x: -x[1])[:10]:
        c = await db.clients.find_one({"id": cid}, {"_id": 0})
        per_client_list.append({"client_id": cid, "client_name": c["name"] if c else "Unknown", "count": count})

    # Products going out tomorrow
    tomorrow_orders = await db.orders.find(
        {"delivery_date": tomorrow, "status": {"$ne": "cancelled"}}, {"_id": 0}
    ).to_list(5000)
    products_tomorrow: Dict[str, int] = {}
    for o in tomorrow_orders:
        for it in o.get("items", []):
            prod = await db.products.find_one({"id": it["product_id"]}, {"_id": 0})
            name = prod["name"] if prod else "Unknown"
            products_tomorrow[name] = products_tomorrow.get(name, 0) + int(it["quantity"])
    products_tomorrow_list = [
        {"product_name": n, "quantity": q}
        for n, q in sorted(products_tomorrow.items(), key=lambda x: -x[1])[:10]
    ]

    # Orders trend (last 7 days)
    trend = []
    for i in range(6, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        start = f"{d}T00:00:00"
        end = f"{d}T23:59:59"
        cnt = await db.orders.count_documents({"created_at": {"$gte": start, "$lte": end}})
        trend.append({"date": d, "count": cnt})

    return {
        "totals": {
            "clients": total_clients,
            "products": total_products,
            "orders": total_orders,
            "active_orders": active_orders,
            "orders_tomorrow": len(tomorrow_orders),
        },
        "active_orders_per_client": per_client_list,
        "products_going_tomorrow": products_tomorrow_list,
        "orders_trend": trend,
    }


# ============================================================================
# AUDIT LOGS
# ============================================================================
@api_router.get("/logs")
async def list_logs(user: dict = Depends(require_admin),
                    limit: int = 200,
                    entity: Optional[str] = None,
                    action: Optional[str] = None):
    q = {}
    if entity:
        q["entity"] = entity
    if action:
        q["action"] = action
    items = await db.audit_logs.find(q, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return items


# ============================================================================
# SETTINGS
# ============================================================================
@api_router.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    s = await db.settings.find_one({"id": "global"}, {"_id": 0})
    if not s:
        s = {
            "id": "global",
            "company_name": os.environ.get("COMPANY_NAME", "Order Management"),
            "company_logo": None,
        }
    return s


@api_router.put("/settings")
async def update_settings(data: SettingsIn, user: dict = Depends(require_admin)):
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    update["updated_at"] = iso(now_utc())
    await db.settings.update_one({"id": "global"}, {"$set": update, "$setOnInsert": {"id": "global"}}, upsert=True)
    await log_action(user, "update", "settings", "global", "Updated settings")
    return await db.settings.find_one({"id": "global"}, {"_id": 0})


# ============================================================================
# Startup: indexes + seed admin
# ============================================================================
async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@admin.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email}, {"_id": 0})
    if existing is None:
        doc = {
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "name": "Administrator",
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "permissions": DEFAULT_PERMISSIONS["admin"],
            "active": True,
            "created_at": iso(now_utc()),
        }
        await db.users.insert_one(doc)
        logger.info(f"Seeded admin user: {admin_email}")
    else:
        # Only reset password if admin has never logged in (matches env)
        if not verify_password(admin_password, existing["password_hash"]):
            # don't override once the user may have changed password - only ensure role/permissions
            await db.users.update_one({"email": admin_email}, {"$set": {
                "role": "admin", "permissions": DEFAULT_PERMISSIONS["admin"], "active": True
            }})


@app.on_event("startup")
async def startup():
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.clients.create_index("id", unique=True)
    await db.products.create_index("id", unique=True)
    await db.orders.create_index("id", unique=True)
    await db.orders.create_index("delivery_date")
    await db.orders.create_index("status")
    await db.audit_logs.create_index("timestamp")
    await db.login_attempts.create_index("identifier")
    await db.login_attempts.create_index("last_attempt", expireAfterSeconds=3600)
    await seed_admin()
    logger.info("Backend startup complete")


@app.on_event("shutdown")
async def shutdown():
    client.close()


@api_router.get("/")
async def root():
    return {"message": "Order Management System API", "version": "1.0"}


@api_router.get("/download/project-zip")
async def download_project_zip():
    """Public endpoint: direct download of the project source code as .zip"""
    zip_path = UPLOAD_DIR / "project.zip"
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="Project zip not found")
    return StreamingResponse(
        open(zip_path, "rb"),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="order-management-system.zip"'},
    )


# Mount router & CORS
app.include_router(api_router)

cors_origins = os.environ.get('CORS_ORIGINS', '*')
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[o.strip() for o in cors_origins.split(',')] if cors_origins != '*' else ['*'],
    allow_methods=["*"],
    allow_headers=["*"],
)
