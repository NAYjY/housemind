#!/usr/bin/env bash
# infra/uptimerobot/bootstrap.sh
#
# Creates UptimeRobot monitors via REST API.
# Run once during initial infra setup.
#
# Usage:
#   export UPTIMEROBOT_API_KEY=ur<your_key>
#   export BACKEND_URL=https://api.housemind.app
#   export FRONTEND_URL=https://housemind.app
#   export ALERT_EMAIL=devops@housemind.app
#   bash infra/uptimerobot/bootstrap.sh

set -euo pipefail

: "${UPTIMEROBOT_API_KEY:?UPTIMEROBOT_API_KEY is required}"
: "${BACKEND_URL:=https://api.housemind.app}"
: "${FRONTEND_URL:=https://housemind.app}"
: "${ALERT_EMAIL:?ALERT_EMAIL is required}"

UR_API="https://api.uptimerobot.com/v2"

echo "──────────────────────────────────────────"
echo " HouseMind UptimeRobot bootstrap"
echo "──────────────────────────────────────────"

# ── Helper ──────────────────────────────────────────────────────
create_monitor() {
  local name="$1"
  local url="$2"
  local keyword="${3:-}"

  local body="api_key=${UPTIMEROBOT_API_KEY}"
  body+="&friendly_name=${name}"
  body+="&url=${url}"
  body+="&type=1"        # HTTP(s)
  body+="&interval=300"  # 5 minutes
  body+="&timeout=30"
  body+="&http_method=2" # GET

  if [[ -n "$keyword" ]]; then
    body+="&keyword_type=1"
    body+="&keyword_value=${keyword}"
  fi

  response=$(curl -s -X POST "$UR_API/newMonitor" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -H "Cache-Control: no-cache" \
    --data "$body")

  stat=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('stat','fail'))")

  if [[ "$stat" == "ok" ]]; then
    monitor_id=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['monitor']['id'])")
    echo "✓ Created monitor '${name}' → ID ${monitor_id}"
    echo "$monitor_id"
  else
    echo "✗ Failed to create '${name}': $response" >&2
    return 1
  fi
}

# ── Create monitors ─────────────────────────────────────────────
echo ""
echo "Creating API liveness monitor..."
API_MONITOR_ID=$(create_monitor \
  "HouseMind API — liveness" \
  "${BACKEND_URL}/health" \
  '"status":"ok"')

echo ""
echo "Creating frontend monitor..."
FRONTEND_MONITOR_ID=$(create_monitor \
  "HouseMind Frontend" \
  "${FRONTEND_URL}")

# ── Get alert contact ID for this account ───────────────────────
echo ""
echo "Fetching alert contacts..."
CONTACTS_RESPONSE=$(curl -s -X POST "$UR_API/getAlertContacts" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "api_key=${UPTIMEROBOT_API_KEY}&limit=50")

CONTACT_ID=$(echo "$CONTACTS_RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
contacts = d.get('alert_contacts', [])
email = '${ALERT_EMAIL}'.lower()
for c in contacts:
    if c.get('value','').lower() == email:
        print(c['id'])
        break
")

if [[ -n "$CONTACT_ID" ]]; then
  echo "✓ Found alert contact ID: ${CONTACT_ID}"

  for MID in "$API_MONITOR_ID" "$FRONTEND_MONITOR_ID"; do
    curl -s -X POST "$UR_API/editMonitor" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -d "api_key=${UPTIMEROBOT_API_KEY}&id=${MID}&alert_contacts=${CONTACT_ID}_0_1" \
      > /dev/null
    echo "✓ Alert contact attached to monitor ${MID}"
  done
else
  echo "⚠ Could not find alert contact for ${ALERT_EMAIL}."
  echo "  Add it manually in UptimeRobot → My Settings → Alert Contacts."
fi

echo ""
echo "──────────────────────────────────────────"
echo " Bootstrap complete."
echo " API monitor ID:      ${API_MONITOR_ID}"
echo " Frontend monitor ID: ${FRONTEND_MONITOR_ID}"
echo "──────────────────────────────────────────"
