#!/bin/bash

# Reset DORA Dashboard for Demo
# This script clears all incidents and resets the dashboard to a clean state

set -e

DORA_METRICS_URL="http://localhost:8081"

echo "🔄 Resetting DORA Dashboard for demo..."

# Check if DORA metrics service is running
if ! curl -s "$DORA_METRICS_URL/health" > /dev/null; then
    echo "❌ DORA Metrics service is not running at $DORA_METRICS_URL"
    echo "   Please start the service with: docker compose up dora-metrics -d"
    exit 1
fi

# Clear all incidents
echo "🗑️  Clearing all incidents..."
response=$(curl -s -X DELETE "$DORA_METRICS_URL/incidents/reset")
cleared_count=$(echo "$response" | jq -r '.clearedCount // 0')

echo "✅ Cleared $cleared_count incidents"

# Verify clean state
echo "🔍 Verifying clean state..."
active_incidents=$(curl -s "$DORA_METRICS_URL/incidents/active" | jq '. | length')

if [ "$active_incidents" -eq 0 ]; then
    echo "✅ Dashboard is now clean and ready for demo"
    echo ""
    echo "📊 DORA Dashboard: http://localhost:8081"
    echo "🛒 Demo App: http://localhost:8080"
    echo ""
    echo "🎯 Demo Flow:"
    echo "   1. Show clean dashboard (no incidents)"
    echo "   2. Submit support request to trigger incident"
    echo "   3. Show Jira ticket with Augment instructions"
    echo "   4. Follow runbook → Create PR → Webhook → Resolve incident"
    echo "   5. Show improved DORA metrics"
else
    echo "⚠️  Warning: $active_incidents active incidents still exist"
fi
