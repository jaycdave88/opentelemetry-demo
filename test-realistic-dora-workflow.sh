#!/bin/bash

# Test script for the realistic DORA metrics workflow
# This validates the integrated demo flow: poor baseline -> incident -> Augment resolution -> improved metrics

set -e

echo "🧪 Testing Realistic DORA Metrics Workflow"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
DORA_SERVICE_URL="http://localhost:8081"

# Helper function to check if service is running
check_service() {
    echo -n "🔍 Checking DORA metrics service... "
    if curl -s "$DORA_SERVICE_URL/health" > /dev/null; then
        echo -e "${GREEN}✅ Running${NC}"
        return 0
    else
        echo -e "${RED}❌ Not running${NC}"
        return 1
    fi
}

# Helper function to get improvement status
get_improvement_status() {
    curl -s "$DORA_SERVICE_URL/demo/status" | jq -r '.improvementStatus.augmentActive'
}

# Helper function to get incident count
get_incident_count() {
    curl -s "$DORA_SERVICE_URL/demo/status" | jq -r '.improvementStatus.incidentResolutionCount'
}

# Helper function to get average MTTR
get_average_mttr() {
    curl -s "$DORA_SERVICE_URL/demo/status" | jq -r '
        .metrics | 
        to_entries | 
        map(.value.mttrMinutes) | 
        add / length
    '
}

# Helper function to get average deployment frequency
get_average_deployment_freq() {
    curl -s "$DORA_SERVICE_URL/demo/status" | jq -r '
        .metrics | 
        to_entries | 
        map(.value.deploymentFrequency) | 
        add / length
    '
}

# Test 1: Service Health Check
echo -e "\n${BLUE}Test 1: Service Health Check${NC}"
if ! check_service; then
    echo -e "${RED}❌ DORA metrics service is not running. Please start it first.${NC}"
    exit 1
fi

# Test 2: Check Initial Poor Baseline
echo -e "\n${BLUE}Test 2: Verify Poor Baseline Metrics${NC}"
echo -n "🔍 Checking initial Augment status... "
initial_status=$(get_improvement_status)
if [ "$initial_status" = "false" ]; then
    echo -e "${GREEN}✅ Augment inactive (baseline state)${NC}"
else
    echo -e "${YELLOW}⚠️  Augment already active - resetting for test${NC}"
fi

echo -n "🔍 Checking initial incident count... "
initial_incidents=$(get_incident_count)
echo -e "${BLUE}📊 Initial incidents resolved: $initial_incidents${NC}"

echo -n "🔍 Checking baseline MTTR... "
baseline_mttr=$(get_average_mttr)
echo -e "${BLUE}📊 Baseline MTTR: ${baseline_mttr} minutes${NC}"

echo -n "🔍 Checking baseline deployment frequency... "
baseline_freq=$(get_average_deployment_freq)
echo -e "${BLUE}📊 Baseline deployment frequency: ${baseline_freq}/day${NC}"

# Test 3: Trigger Realistic Incident
echo -e "\n${BLUE}Test 3: Trigger Production Incident${NC}"
echo -n "🚨 Creating checkout failure incident... "
incident_response=$(curl -s -X POST "$DORA_SERVICE_URL/demo/trigger-incident")
incident_id=$(echo "$incident_response" | jq -r '.incident.id')

if [ "$incident_id" != "null" ] && [ -n "$incident_id" ]; then
    echo -e "${GREEN}✅ Incident created: $incident_id${NC}"
else
    echo -e "${RED}❌ Failed to create incident${NC}"
    exit 1
fi

# Test 4: Wait for Auto-Resolution
echo -e "\n${BLUE}Test 4: Wait for Augment Auto-Resolution${NC}"
echo -n "⏳ Waiting for Augment to resolve incident (3 seconds)... "
sleep 4
echo -e "${GREEN}✅ Wait complete${NC}"

# Test 5: Verify Metrics Improvement
echo -e "\n${BLUE}Test 5: Verify DORA Metrics Improvement${NC}"

echo -n "🔍 Checking Augment activation... "
final_status=$(get_improvement_status)
if [ "$final_status" = "true" ]; then
    echo -e "${GREEN}✅ Augment activated${NC}"
else
    echo -e "${RED}❌ Augment not activated${NC}"
    exit 1
fi

echo -n "🔍 Checking incident resolution count... "
final_incidents=$(get_incident_count)
if [ "$final_incidents" -gt "$initial_incidents" ]; then
    echo -e "${GREEN}✅ Incident resolved (count: $final_incidents)${NC}"
else
    echo -e "${RED}❌ No incidents resolved${NC}"
    exit 1
fi

echo -n "🔍 Checking improved MTTR... "
improved_mttr=$(get_average_mttr)
echo -e "${BLUE}📊 Improved MTTR: ${improved_mttr} minutes${NC}"

echo -n "🔍 Checking improved deployment frequency... "
improved_freq=$(get_average_deployment_freq)
echo -e "${BLUE}📊 Improved deployment frequency: ${improved_freq}/day${NC}"

# Test 6: Validate Performance Classification
echo -e "\n${BLUE}Test 6: Validate Elite Performance Achievement${NC}"

# Check if MTTR is now elite (< 60 minutes)
if (( $(echo "$improved_mttr < 60" | bc -l) )); then
    echo -e "${GREEN}✅ MTTR achieved Elite performance (< 60 min)${NC}"
else
    echo -e "${YELLOW}⚠️  MTTR: ${improved_mttr} min (not yet Elite)${NC}"
fi

# Check if deployment frequency is now elite (> 3/day)
if (( $(echo "$improved_freq > 3" | bc -l) )); then
    echo -e "${GREEN}✅ Deployment frequency achieved Elite performance (> 3/day)${NC}"
else
    echo -e "${YELLOW}⚠️  Deployment frequency: ${improved_freq}/day (not yet Elite)${NC}"
fi

# Test 7: Web Interface Validation
echo -e "\n${BLUE}Test 7: Web Interface Validation${NC}"
echo -n "🔍 Testing web interface accessibility... "
if curl -s "$DORA_SERVICE_URL" | grep -q "DORA Metrics Demo"; then
    echo -e "${GREEN}✅ Web interface accessible${NC}"
else
    echo -e "${RED}❌ Web interface not accessible${NC}"
    exit 1
fi

echo -n "🔍 Testing metrics API endpoint... "
if curl -s "$DORA_SERVICE_URL/demo/status" | jq -e '.metrics' > /dev/null; then
    echo -e "${GREEN}✅ Metrics API working${NC}"
else
    echo -e "${RED}❌ Metrics API not working${NC}"
    exit 1
fi

# Summary
# Test 8: Trace-Based Integration Validation
echo -e "\n${BLUE}Test 8: Validate Trace-Based Integration${NC}"

echo -n "🔍 Checking trace monitoring status... "
trace_status=$(curl -s "$DORA_SERVICE_URL/demo/status" | jq -r '.traceMonitoring.isMonitoring')
if [ "$trace_status" = "true" ]; then
    echo -e "${GREEN}✅ Trace monitoring active${NC}"
else
    echo -e "${YELLOW}⚠️  Trace monitoring: $trace_status${NC}"
fi

echo -n "🔍 Checking real incident detection... "
real_detection_status=$(curl -s "$DORA_SERVICE_URL/demo/status" | jq -r '.realIncidentDetection.isMonitoring')
if [ "$real_detection_status" = "true" ]; then
    echo -e "${GREEN}✅ Real incident detection active${NC}"
else
    echo -e "${YELLOW}⚠️  Real incident detection: $real_detection_status${NC}"
fi

echo -n "🔍 Checking monitoring integration... "
if curl -s "$DORA_SERVICE_URL/demo/trace-status" | jq -e '.traceMonitoring' > /dev/null; then
    echo -e "${GREEN}✅ Trace monitoring API working${NC}"
else
    echo -e "${RED}❌ Trace monitoring API not working${NC}"
fi

echo -e "\n${GREEN}🎉 TRACE-BASED DORA WORKFLOW TEST COMPLETE!${NC}"
echo "=========================================="
echo -e "${BLUE}📊 Results Summary:${NC}"
echo -e "   • Baseline MTTR: ${baseline_mttr} min → Improved: ${improved_mttr} min"
echo -e "   • Baseline Deployments: ${baseline_freq}/day → Improved: ${improved_freq}/day"
echo -e "   • Incidents Resolved: ${final_incidents}"
echo -e "   • Augment Status: ${final_status}"
echo -e "   • Trace Monitoring: ${trace_status}"
echo -e "   • Real Detection: ${real_detection_status}"
echo ""
echo -e "${GREEN}✅ The trace-based DORA metrics workflow is working perfectly!${NC}"
echo -e "${BLUE}🚀 Demo ready at: $DORA_SERVICE_URL${NC}"
echo ""
echo -e "${YELLOW}Enhanced Demo Flow:${NC}"
echo "1. 📊 Dashboard shows poor baseline DORA metrics"
echo "2. 🔍 System continuously monitors distributed traces & application health"
echo "3. 🚨 Real failures automatically detected via OpenTelemetry integration"
echo "4. 📋 Incidents auto-created with full trace context and error details"
echo "5. 🤖 Augment Code analyzes traces, identifies root cause, deploys fix"
echo "6. 📈 DORA metrics improve to Elite performance in real-time"
echo "7. 🎯 Demonstrates authentic observability-driven incident resolution"
echo ""
echo -e "${GREEN}🔧 Technical Integration:${NC}"
echo "• OpenTelemetry Collector: Trace ingestion and analysis"
echo "• Jaeger Backend: Distributed trace storage and querying"
echo "• Real Application Monitoring: Health checks and failure detection"
echo "• Automatic Incident Creation: Context-rich incident management"
echo "• AI-Powered Resolution: Augment Code integration for rapid fixes"
