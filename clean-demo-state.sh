#!/bin/bash

# Clean Demo State for DORA Dashboard
# This script removes artificial demo incidents but keeps poor baseline metrics

set -e

DORA_METRICS_URL="http://localhost:8081"

echo "🧹 Cleaning demo state for realistic user workflow..."

# Check if DORA metrics service is running
if ! curl -s "$DORA_METRICS_URL/health" > /dev/null; then
    echo "❌ DORA Metrics service is not running at $DORA_METRICS_URL"
    echo "   Please start the service with: docker compose up dora-metrics -d"
    exit 1
fi

# Clear only the artificial demo incidents
echo "🗑️  Clearing artificial demo incidents..."
response=$(curl -s -X DELETE "$DORA_METRICS_URL/incidents/reset")
cleared_count=$(echo "$response" | jq -r '.clearedCount // 0')

echo "✅ Cleared $cleared_count artificial incidents"

# Restart dora-metrics container to ensure changes are reflected
echo "🔄 Restarting dora-metrics container to apply changes..."
if docker restart dora-metrics > /dev/null 2>&1; then
    echo "✅ Successfully restarted dora-metrics container"
    # Wait a moment for the service to be ready
    sleep 3
else
    echo "⚠️  Warning: Could not restart dora-metrics container (may not be running in Docker)"
fi

# Verify clean state
echo "🔍 Verifying clean state..."
# Wait for service to be fully ready after restart
echo "⏳ Waiting for service to be ready..."
for i in {1..10}; do
    if curl -s "$DORA_METRICS_URL/health" > /dev/null; then
        break
    fi
    sleep 1
done

active_incidents=$(curl -s "$DORA_METRICS_URL/incidents/active" | jq '. | length')
improvement_status=$(curl -s "$DORA_METRICS_URL/demo/status" | jq -r '.improvementStatus.augmentActive')

echo "📊 Current State:"
echo "   - Active Incidents: $active_incidents (should be 0 for clean start)"
echo "   - Augment Status: $improvement_status (should be 'false' for poor baseline)"

if [ "$active_incidents" -eq 0 ] && [ "$improvement_status" = "false" ]; then
    echo "✅ Demo state is clean and ready for realistic user workflow"
else
    echo "⚠️  Warning: Demo state may not be optimal"
fi

echo ""
echo "📊 DORA Dashboard: http://localhost:8081"
echo "🛒 Demo App: http://localhost:8080"
echo ""
echo "🎯 Realistic Demo Flow:"
echo "   1. Dashboard shows poor baseline metrics (no active incidents) ← YOU ARE HERE"
echo "   2. User encounters checkout error (item > \$25)"
echo "   3. User/system creates Jira ticket (or use existing ECS-23)"
echo "   4. Augment Code analyzes via runbook workflow"
echo "   5. Apply fix → Create PR → Resolve incident"
echo "   6. DORA metrics improve dramatically"
echo ""
echo "💡 To trigger real checkout error:"
echo "   - Go to http://localhost:8080"
echo "   - Add expensive item to cart (>\$25)"
echo "   - Try to checkout → Error occurs"
echo "   - This creates real incident for demo"
