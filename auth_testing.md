# Auth Testing Playbook — MAXX DOORS

## Accounts
- Office: office@maxxdoors.com / MaxxOffice!2026 (role: office)
- Operators (role: operator, password for all: MaxxStation!2026):
  - core@maxxdoors.com (station: core)
  - skin@maxxdoors.com (station: skin)
  - assembly@maxxdoors.com (station: assembly)
  - press@maxxdoors.com (station: press)
  - routing@maxxdoors.com (station: routing)

## API Test
```
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)
curl -c /tmp/cookies.txt -X POST "$API/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"office@maxxdoors.com","password":"MaxxOffice!2026"}'
curl -b /tmp/cookies.txt "$API/api/auth/me"
```
Login returns the user object and sets `access_token` + `refresh_token` httpOnly cookies. `/me` returns the same user via cookie.

## Mongo Verification
- `db.users.find({role:"office"})` — bcrypt hash starts with `$2b$`
- Indexes: users.email unique, doors.door_id unique, doors.job_id, doors.floor, login_attempts.identifier
