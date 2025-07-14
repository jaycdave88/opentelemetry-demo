#!/bin/bash

# Copyright The OpenTelemetry Authors
# SPDX-License-Identifier: Apache-2.0

# DORA Demo Test Script
# This script validates the DORA metrics demo system

set -e

# Configuration
DORA_METRICS_URL="http://localhost:8081"
GRAFANA_URL="http://localhost:3000"
PROMETHEUS_URL="http://localhost:9090"
JAEGER_URL="http://localhost:16686"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Test functions
test_service_health() {
    local service_name=$1
    local url=$2
    
    log_info "Testing $service_name health..."
    
    if curl -s -f "$url" > /dev/null; then
        log_success "$service_name is healthy"
        return 0
    else
        log_error "$service_name is not responding"
        return 1
    fi
}

test_dora_metrics_api() {
    log_info "Testing DORA Metrics API..."
    
    # Test health endpoint
    if ! test_service_health "DORA Metrics Service" "$DORA_METRICS_URL/health"; then
        return 1
    fi
    
    # Test metrics endpoint
    log_info "Testing Prometheus metrics endpoint..."
    if curl -s "$DORA_METRICS_URL/metrics" | grep -q "dora_"; then
        log_success "DORA metrics are being exposed"
    else
        log_error "DORA metrics not found in /metrics endpoint"
        return 1
    fi
    
    # Test demo status endpoint
    log_info "Testing demo status endpoint..."
    if curl -s "$DORA_METRICS_URL/demo/status" | grep -q "currentScenario"; then
        log_success "Demo status endpoint is working"
    else
        log_error "Demo status endpoint is not working"
        return 1
    fi
    
    return 0
}

test_prometheus_integration() {
    log_info "Testing Prometheus integration..."
    
    if ! test_service_health "Prometheus" "$PROMETHEUS_URL/-/healthy"; then
        return 1
    fi
    
    # Check if DORA metrics are being scraped
    log_info "Checking if DORA metrics are being scraped..."
    if curl -s "$PROMETHEUS_URL/api/v1/query?query=dora_deployment_frequency_per_day" | grep -q "success"; then
        log_success "DORA metrics are available in Prometheus"
    else
        log_warning "DORA metrics not yet available in Prometheus (may need time to scrape)"
    fi
    
    return 0
}

test_grafana_dashboard() {
    log_info "Testing Grafana dashboard..."
    
    if ! test_service_health "Grafana" "$GRAFANA_URL/api/health"; then
        return 1
    fi
    
    # Check if DORA dashboard exists
    log_info "Checking if DORA dashboard is provisioned..."
    if curl -s "$GRAFANA_URL/api/dashboards/uid/dora-dashboard" | grep -q "DORA Metrics Dashboard"; then
        log_success "DORA dashboard is provisioned and accessible"
    else
        log_warning "DORA dashboard may not be fully provisioned yet"
    fi
    
    return 0
}

test_manual_scenario() {
    log_info "Testing manual scenario..."
    
    # Trigger manual scenario
    log_info "Triggering manual scenario..."
    response=$(curl -s -X POST "$DORA_METRICS_URL/demo/trigger-manual-scenario")
    
    if echo "$response" | grep -q "manual"; then
        log_success "Manual scenario triggered successfully"
        
        # Wait a moment and check status
        sleep 2
        status=$(curl -s "$DORA_METRICS_URL/demo/status")
        if echo "$status" | grep -q "manual"; then
            log_success "Manual scenario is active"
        else
            log_warning "Manual scenario status not reflected"
        fi
    else
        log_error "Failed to trigger manual scenario"
        echo "Response: $response"
        return 1
    fi
    
    return 0
}

test_augment_scenario() {
    log_info "Testing Augment scenario..."
    
    # Wait a moment to avoid conflicts
    sleep 3
    
    # Trigger Augment scenario
    log_info "Triggering Augment scenario..."
    response=$(curl -s -X POST "$DORA_METRICS_URL/demo/trigger-augment-scenario")
    
    if echo "$response" | grep -q "augment"; then
        log_success "Augment scenario triggered successfully"
        
        # Wait a moment and check status
        sleep 2
        status=$(curl -s "$DORA_METRICS_URL/demo/status")
        if echo "$status" | grep -q "augment"; then
            log_success "Augment scenario is active"
        else
            log_warning "Augment scenario status not reflected"
        fi
    else
        log_error "Failed to trigger Augment scenario"
        echo "Response: $response"
        return 1
    fi
    
    return 0
}

test_incidents_api() {
    log_info "Testing incidents API..."
    
    # List incidents
    log_info "Fetching incidents list..."
    incidents=$(curl -s "$DORA_METRICS_URL/incidents")
    
    if echo "$incidents" | grep -q "\["; then
        log_success "Incidents API is working"
        
        # Count incidents
        incident_count=$(echo "$incidents" | jq '. | length' 2>/dev/null || echo "unknown")
        log_info "Found $incident_count incidents"
    else
        log_error "Incidents API is not working properly"
        return 1
    fi
    
    return 0
}

test_web_interface() {
    log_info "Testing web interface..."
    
    # Test main page
    if curl -s "$DORA_METRICS_URL" | grep -q "DORA Metrics Demo"; then
        log_success "Web interface is accessible"
    else
        log_error "Web interface is not accessible"
        return 1
    fi
    
    return 0
}

# Main test execution
main() {
    echo "========================================"
    echo "DORA Metrics Demo System Test"
    echo "========================================"
    echo
    
    local failed_tests=0
    
    # Test core services
    test_dora_metrics_api || ((failed_tests++))
    echo
    
    test_prometheus_integration || ((failed_tests++))
    echo
    
    test_grafana_dashboard || ((failed_tests++))
    echo
    
    test_web_interface || ((failed_tests++))
    echo
    
    # Test API functionality
    test_incidents_api || ((failed_tests++))
    echo
    
    # Test demo scenarios
    test_manual_scenario || ((failed_tests++))
    echo
    
    test_augment_scenario || ((failed_tests++))
    echo
    
    # Summary
    echo "========================================"
    if [ $failed_tests -eq 0 ]; then
        log_success "All tests passed! DORA demo system is ready."
        echo
        echo "Quick Links:"
        echo "- Demo Control: $DORA_METRICS_URL"
        echo "- DORA Dashboard: $GRAFANA_URL/d/dora-dashboard/dora-metrics"
        echo "- Prometheus: $PROMETHEUS_URL"
        echo "- Jaeger: $JAEGER_URL"
    else
        log_error "$failed_tests test(s) failed. Please check the logs above."
        exit 1
    fi
    echo "========================================"
}

# Check if required tools are available
check_dependencies() {
    local missing_deps=0
    
    if ! command -v curl &> /dev/null; then
        log_error "curl is required but not installed"
        ((missing_deps++))
    fi
    
    if ! command -v jq &> /dev/null; then
        log_warning "jq is not installed - some tests may show limited information"
    fi
    
    if [ $missing_deps -gt 0 ]; then
        log_error "Missing required dependencies. Please install them and try again."
        exit 1
    fi
}

# Wait for services to be ready
wait_for_services() {
    log_info "Waiting for services to be ready..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "$DORA_METRICS_URL/health" > /dev/null; then
            log_success "Services are ready!"
            return 0
        fi
        
        log_info "Attempt $attempt/$max_attempts - waiting for services..."
        sleep 2
        ((attempt++))
    done
    
    log_error "Services did not become ready within expected time"
    return 1
}

# Script execution
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "DORA Demo Test Script"
    echo
    echo "Usage: $0 [options]"
    echo
    echo "Options:"
    echo "  --help, -h    Show this help message"
    echo "  --wait        Wait for services to be ready before testing"
    echo
    echo "This script tests the DORA metrics demo system components:"
    echo "- DORA Metrics Service API"
    echo "- Prometheus integration"
    echo "- Grafana dashboard"
    echo "- Demo scenarios (manual and Augment)"
    echo "- Web interface"
    exit 0
fi

check_dependencies

if [ "$1" = "--wait" ]; then
    wait_for_services || exit 1
fi

main
