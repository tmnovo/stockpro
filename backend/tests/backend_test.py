"""
Backend API tests for Order Management System
Covers: auth, users, clients, products, orders, dashboard, logs, settings, RBAC
"""
import os
import io
import time
import uuid
import pytest
import requests
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://stock-control-337.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@admin.com"
ADMIN_PASSWORD = "admin123"


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    assert "access_token" in s.cookies
    return s


@pytest.fixture(scope="session")
def seeded(admin_session):
    """Create a client + product for tests that need them."""
    s = admin_session
    c = s.post(f"{API}/clients", json={"name": "TEST_Client_Main", "email": "t@x.com", "tax_id": "123"}).json()
    p = s.post(f"{API}/products", json={"name": "TEST_Prod_Main", "price": 9.5, "stock": 100, "unit": "un"}).json()
    yield {"client_id": c["id"], "product_id": p["id"]}
    # teardown
    try:
        s.delete(f"{API}/clients/{c['id']}")
        s.delete(f"{API}/products/{p['id']}")
    except Exception:
        pass


# ---------- Auth tests ----------
class TestAuth:
    def test_login_success_sets_cookies(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        body = r.json()
        assert body["email"] == ADMIN_EMAIL
        assert body["role"] == "admin"
        assert "id" in body
        assert "access_token" in s.cookies
        assert "refresh_token" in s.cookies

    def test_me_with_cookie(self, admin_session):
        r = admin_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_without_cookie(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_login_invalid(self):
        # use unique identifier so brute force doesn't lock other tests
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": "noone_xyz@no.com", "password": "wrong"})
        assert r.status_code == 401

    def test_change_password_wrong_current(self, admin_session):
        r = admin_session.post(f"{API}/auth/change-password",
                               json={"current_password": "WRONG", "new_password": "newpass123"})
        assert r.status_code == 400

    def test_change_password_correct(self, admin_session):
        # change then change back
        r = admin_session.post(f"{API}/auth/change-password",
                               json={"current_password": ADMIN_PASSWORD, "new_password": "tmp_pw_999"})
        assert r.status_code == 200
        r2 = admin_session.post(f"{API}/auth/change-password",
                                json={"current_password": "tmp_pw_999", "new_password": ADMIN_PASSWORD})
        assert r2.status_code == 200

    def test_logout_clears_cookies(self):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        r = s.post(f"{API}/auth/logout")
        assert r.status_code == 200
        # After logout the set-cookie clears the cookie - session should no longer be authorized
        r2 = s.get(f"{API}/auth/me")
        # access_token cookie cleared
        assert r2.status_code == 401

    def test_brute_force_protection(self):
        s = requests.Session()
        email = f"bf_{uuid.uuid4().hex[:8]}@test.com"
        statuses = []
        for _ in range(6):
            r = s.post(f"{API}/auth/login", json={"email": email, "password": "wrong"})
            statuses.append(r.status_code)
        # After >=5 failed attempts, should 429
        assert 429 in statuses, f"Brute force not triggered. Statuses: {statuses}"


# ---------- Users tests ----------
class TestUsers:
    def test_list_users_admin(self, admin_session):
        r = admin_session.get(f"{API}/users")
        assert r.status_code == 200
        assert any(u["email"] == ADMIN_EMAIL for u in r.json())

    def test_create_update_delete_user(self, admin_session):
        email = f"TEST_u_{uuid.uuid4().hex[:6]}@test.com"
        r = admin_session.post(f"{API}/users", json={
            "email": email, "password": "testpass1", "name": "TEST User", "role": "seller"
        })
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        assert r.json()["role"] == "seller"

        # update
        r2 = admin_session.put(f"{API}/users/{uid}",
                               json={"name": "TEST Renamed", "role": "warehouse"})
        assert r2.status_code == 200
        assert r2.json()["name"] == "TEST Renamed"
        assert r2.json()["role"] == "warehouse"

        # verify via GET list
        listed = admin_session.get(f"{API}/users").json()
        found = next((u for u in listed if u["id"] == uid), None)
        assert found and found["role"] == "warehouse"

        # delete
        r3 = admin_session.delete(f"{API}/users/{uid}")
        assert r3.status_code == 200

    def test_cannot_delete_self(self, admin_session):
        me = admin_session.get(f"{API}/auth/me").json()
        r = admin_session.delete(f"{API}/users/{me['id']}")
        assert r.status_code == 400


# ---------- Clients tests ----------
class TestClients:
    def test_crud_client(self, admin_session):
        s = admin_session
        r = s.post(f"{API}/clients", json={"name": "TEST_C1", "email": "c1@x.com", "tax_id": "999"})
        assert r.status_code == 200
        cid = r.json()["id"]
        assert r.json()["name"] == "TEST_C1"

        # GET verifies persistence
        listed = s.get(f"{API}/clients").json()
        assert any(c["id"] == cid for c in listed)

        r2 = s.put(f"{API}/clients/{cid}", json={"name": "TEST_C1_upd", "email": "c1b@x.com"})
        assert r2.status_code == 200
        assert r2.json()["name"] == "TEST_C1_upd"

        r3 = s.delete(f"{API}/clients/{cid}")
        assert r3.status_code == 200

    def test_client_import_csv_english(self, admin_session):
        csv = b"name,email,phone,tax_id\nTEST_ImpEn,a@a.com,111,NIF1\n"
        files = {"file": ("clients.csv", csv, "text/csv")}
        r = admin_session.post(f"{API}/clients/import", files=files)
        assert r.status_code == 200, r.text
        assert r.json()["inserted"] == 1
        # cleanup
        for c in admin_session.get(f"{API}/clients").json():
            if c["name"].startswith("TEST_ImpEn"):
                admin_session.delete(f"{API}/clients/{c['id']}")

    def test_client_import_csv_portuguese(self, admin_session):
        csv = b"nome,email,telefone,nif\nTEST_ImpPt,b@b.com,222,NIF2\n"
        files = {"file": ("clients.csv", csv, "text/csv")}
        r = admin_session.post(f"{API}/clients/import", files=files)
        assert r.status_code == 200, r.text
        assert r.json()["inserted"] == 1
        # verify phone & tax_id persisted
        items = admin_session.get(f"{API}/clients").json()
        match = [c for c in items if c["name"] == "TEST_ImpPt"]
        assert match and match[0]["phone"] == "222"
        assert match[0]["tax_id"] == "NIF2"
        for c in match:
            admin_session.delete(f"{API}/clients/{c['id']}")

    def test_client_export_xlsx(self, admin_session):
        r = admin_session.get(f"{API}/clients/export")
        assert r.status_code == 200
        ctype = r.headers.get("content-type", "")
        assert "spreadsheet" in ctype or "officedocument" in ctype
        # xlsx files start with PK zip signature
        assert r.content[:2] == b"PK"


# ---------- Products tests ----------
class TestProducts:
    def test_crud_product(self, admin_session):
        s = admin_session
        r = s.post(f"{API}/products", json={"name": "TEST_P1", "price": 12.5, "stock": 50})
        assert r.status_code == 200
        pid = r.json()["id"]
        assert r.json()["price"] == 12.5

        r2 = s.put(f"{API}/products/{pid}", json={"name": "TEST_P1u", "price": 15.0, "stock": 40})
        assert r2.status_code == 200
        assert r2.json()["price"] == 15.0

        r3 = s.delete(f"{API}/products/{pid}")
        assert r3.status_code == 200

    def test_product_export_xlsx(self, admin_session):
        r = admin_session.get(f"{API}/products/export")
        assert r.status_code == 200
        assert r.content[:2] == b"PK"

    def test_product_import_csv(self, admin_session):
        csv = b"name,sku,price,stock,unit\nTEST_PImp,SKU1,3.5,10,un\n"
        r = admin_session.post(f"{API}/products/import",
                               files={"file": ("p.csv", csv, "text/csv")})
        assert r.status_code == 200
        assert r.json()["inserted"] == 1
        for p in admin_session.get(f"{API}/products").json():
            if p["name"] == "TEST_PImp":
                admin_session.delete(f"{API}/products/{p['id']}")


# ---------- Orders tests ----------
class TestOrders:
    def test_create_order_and_enrich(self, admin_session, seeded):
        s = admin_session
        payload = {
            "client_id": seeded["client_id"],
            "items": [{"product_id": seeded["product_id"], "quantity": 3, "price": 10.0}],
            "delivery_date": (datetime.now(timezone.utc).date() + timedelta(days=1)).isoformat(),
            "notes": "TEST order",
            "status": "pending",
        }
        r = s.post(f"{API}/orders", json=payload)
        assert r.status_code == 200, r.text
        order = r.json()
        assert order["client_name"] == "TEST_Client_Main"
        assert order["total"] == 30.0
        assert order["items"][0]["product_name"] == "TEST_Prod_Main"
        assert order["items"][0]["subtotal"] == 30.0
        oid = order["id"]

        # list orders
        listed = s.get(f"{API}/orders").json()
        assert any(o["id"] == oid for o in listed)

        # update
        r2 = s.put(f"{API}/orders/{oid}", json={"status": "in_progress"})
        assert r2.status_code == 200
        assert r2.json()["status"] == "in_progress"

        # delete
        r3 = s.delete(f"{API}/orders/{oid}")
        assert r3.status_code == 200

    def test_order_invalid_client(self, admin_session, seeded):
        r = admin_session.post(f"{API}/orders", json={
            "client_id": "non-existent-id",
            "items": [{"product_id": seeded["product_id"], "quantity": 1}]
        })
        assert r.status_code == 400

    def test_order_invalid_product(self, admin_session, seeded):
        r = admin_session.post(f"{API}/orders", json={
            "client_id": seeded["client_id"],
            "items": [{"product_id": "nope", "quantity": 1}]
        })
        assert r.status_code == 400

    def test_daily_pdf(self, admin_session, seeded):
        s = admin_session
        tgt = (datetime.now(timezone.utc).date() + timedelta(days=2)).isoformat()
        # create order for that date
        o = s.post(f"{API}/orders", json={
            "client_id": seeded["client_id"],
            "items": [{"product_id": seeded["product_id"], "quantity": 2}],
            "delivery_date": tgt,
        }).json()

        r = s.get(f"{API}/orders/daily-pdf", params={"target_date": tgt})
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"

        s.delete(f"{API}/orders/{o['id']}")


# ---------- Dashboard, logs, settings ----------
class TestDashboard:
    def test_dashboard_stats(self, admin_session):
        r = admin_session.get(f"{API}/dashboard/stats")
        assert r.status_code == 200
        body = r.json()
        assert "totals" in body
        assert "active_orders_per_client" in body
        assert "products_going_tomorrow" in body
        assert "orders_trend" in body
        assert len(body["orders_trend"]) == 7


class TestLogs:
    def test_logs_admin(self, admin_session):
        r = admin_session.get(f"{API}/logs")
        assert r.status_code == 200
        logs = r.json()
        assert isinstance(logs, list)
        # should contain at least a login action
        assert any(l.get("action") == "login" for l in logs)


class TestSettings:
    def test_get_settings(self, admin_session):
        r = admin_session.get(f"{API}/settings")
        assert r.status_code == 200
        assert "company_name" in r.json()

    def test_update_settings(self, admin_session):
        r = admin_session.put(f"{API}/settings",
                              json={"company_name": "TEST Co", "company_logo": "data:image/png;base64,iVBORw0KGgo="})
        assert r.status_code == 200
        assert r.json()["company_name"] == "TEST Co"
        # verify persistence
        r2 = admin_session.get(f"{API}/settings")
        assert r2.json()["company_name"] == "TEST Co"


# ---------- RBAC tests ----------
class TestRBAC:
    @pytest.fixture(scope="class")
    def seller_session(self, admin_session):
        email = f"TEST_seller_{uuid.uuid4().hex[:6]}@test.com"
        pw = "sellerpw1"
        r = admin_session.post(f"{API}/users", json={
            "email": email, "password": pw, "name": "TEST Seller", "role": "seller"
        })
        assert r.status_code == 200
        uid = r.json()["id"]
        s = requests.Session()
        # Use fresh IP-less identifier with unique email -> no brute-force interference
        lr = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
        assert lr.status_code == 200, lr.text
        yield s
        admin_session.delete(f"{API}/users/{uid}")

    @pytest.fixture(scope="class")
    def warehouse_session(self, admin_session):
        email = f"TEST_wh_{uuid.uuid4().hex[:6]}@test.com"
        pw = "whpass123"
        r = admin_session.post(f"{API}/users", json={
            "email": email, "password": pw, "name": "TEST WH", "role": "warehouse"
        })
        assert r.status_code == 200
        uid = r.json()["id"]
        s = requests.Session()
        lr = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
        assert lr.status_code == 200
        yield s
        admin_session.delete(f"{API}/users/{uid}")

    def test_seller_cannot_list_users(self, seller_session):
        r = seller_session.get(f"{API}/users")
        assert r.status_code == 403

    def test_seller_cannot_list_logs(self, seller_session):
        r = seller_session.get(f"{API}/logs")
        assert r.status_code == 403

    def test_warehouse_cannot_create_clients(self, warehouse_session):
        r = warehouse_session.post(f"{API}/clients", json={"name": "TEST_wh_block"})
        assert r.status_code == 403

    def test_warehouse_can_view_clients(self, warehouse_session):
        r = warehouse_session.get(f"{API}/clients")
        assert r.status_code == 200
