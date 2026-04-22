# Auth Testing Playbook

## MongoDB Verification
```
mongosh
use order_management_db
db.users.find({role: "admin"}).pretty()
```
Verify: bcrypt hash starts with `$2b$`, indexes exist.

## API Testing
```
curl -c cookies.txt -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@admin.com","password":"admin123"}'

curl -b cookies.txt http://localhost:8001/api/auth/me
```

## Roles
- admin - full access
- warehouse - view+update orders, view clients/products, generate PDF
- seller - manage clients, create orders, view products
