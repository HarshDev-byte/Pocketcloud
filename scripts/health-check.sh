#!/bin/bash
# Health check script for PocketCloud
# Returns 0 if healthy, 1 if unhealthy
# Used by systemd or monitoring tools

HEALTH_URL="${HEALTH_URL:-http://localhost:3000/health}"

# Make request with 5 second timeout
RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/pocketcloud-health.json --max-time 5 "$HEALTH_URL" 2>/dev/null)
HTTP_CODE="${RESPONSE: -3}"

# Check HTTP status code
if [ "$HTTP_CODE" = "200" ]; then
  # Parse JSON to verify status field
  STATUS=$(cat /tmp/pocketcloud-health.json 2>/dev/null | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
  
  if [ "$STATUS" = "healthy" ]; then
    echo "PocketCloud is healthy"
    rm -f /tmp/pocketcloud-health.json
    exit 0
  else
    echo "PocketCloud is unhealthy: $STATUS"
    cat /tmp/pocketcloud-health.json 2>/dev/null
    rm -f /tmp/pocketcloud-health.json
    exit 1
  fi
else
  echo "PocketCloud health check failed: HTTP $HTTP_CODE"
  rm -f /tmp/pocketcloud-health.json
  exit 1
fi
