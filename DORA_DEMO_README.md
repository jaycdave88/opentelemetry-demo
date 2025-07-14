# DORA Metrics Demo System

This system demonstrates the impact of Augment Code on software delivery performance using the four key DORA (DevOps Research and Assessment) metrics.

## Overview

The demo showcases two distinct workflows:

1. **Manual Workflow**: Traditional incident response with manual investigation and slow resolution
2. **Augment Code Workflow**: AI-assisted incident response with auto-enriched context and rapid resolution

## Architecture

### Components

- **DORA Metrics Service** (`src/dora-metrics/`): Core service that generates historical metrics, manages incidents, and provides demo control
- **Grafana Dashboard**: Comprehensive DORA metrics visualization with business impact correlation
- **Incident Management**: Automated Jira ticket creation with different workflows
- **Business Metrics Simulation**: Customer retention and cart abandonment correlation
- **Checkout Integration**: Simulates real service failures using existing feature flags

### Key Features

- **Historical Data Generation**: 30 days of pre/post Augment adoption metrics
- **Real-time Metric Updates**: Live DORA metrics with Prometheus integration
- **Incident Simulation**: Realistic checkout service failures with trace context
- **Jira Integration**: Auto-enriched tickets with deep links to dashboards and traces
- **Slack Notifications**: Intelligent alerts on DORA metric threshold crossings
- **Business Impact Visualization**: Correlation between DORA metrics and customer retention

## Demo Scenarios

### Manual Workflow Scenario

1. **Trigger**: Checkout failure due to expensive items (>$25 threshold)
2. **Incident Creation**: Basic Jira ticket with minimal context
3. **Resolution Process**:
   - Manual log investigation
   - Context switching between tools
   - 8+ hour resolution time (simulated as 8 seconds)
   - Basic documentation
4. **DORA Impact**: High MTTR, increased change failure rate
5. **Business Impact**: Decreased retention, increased abandonment

### Augment Code Workflow Scenario

1. **Trigger**: Same checkout failure condition
2. **Incident Creation**: Auto-enriched Jira ticket with:
   - Direct trace links
   - Service-specific dashboard links
   - Historical incident context
   - Recommended fix workflow
3. **Resolution Process**:
   - Auto-gathered context from traces/logs
   - Intelligent fix recommendations
   - Sub-1-hour resolution time (simulated as 3 seconds)
   - Automated PR creation and deployment
4. **DORA Impact**: Elite MTTR performance, low change failure rate
5. **Business Impact**: Improved retention, reduced abandonment

## Getting Started

### Prerequisites

- Docker and Docker Compose
- OpenTelemetry Demo environment running

### Setup

1. **Start the DORA Metrics Service**:
   ```bash
   docker-compose up dora-metrics
   ```

2. **Access the Demo Control Interface**:
   ```
   http://localhost:8080
   ```

3. **View the DORA Dashboard**:
   ```
   http://localhost:3000/d/dora-dashboard/dora-metrics
   ```

### Running Demo Scenarios

#### Option 1: Web Interface
1. Open http://localhost:8080
2. Click "Trigger Manual Scenario" or "Trigger Augment Scenario"
3. Watch the dashboard for metric updates
4. Check Slack for threshold crossing notifications

#### Option 2: API Endpoints
```bash
# Trigger manual workflow
curl -X POST http://localhost:8080/demo/trigger-manual-scenario

# Trigger Augment workflow
curl -X POST http://localhost:8080/demo/trigger-augment-scenario

# Check demo status
curl http://localhost:8080/demo/status
```

## Configuration

### Environment Variables

```bash
# Jira Integration
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-api-token
JIRA_PROJECT_KEY=DEMO

# Slack Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Service URLs
FLAGD_URL=http://flagd:8013
CHECKOUT_URL=http://checkout:8080
```

### DORA Metric Thresholds

The system uses industry-standard DORA performance bands:

| Metric | Elite | High | Medium | Low |
|--------|-------|------|--------|-----|
| Deployment Frequency | Multiple/day | Weekly | Monthly | < Monthly |
| Lead Time | < 1 hour | < 1 day | < 1 week | > 1 week |
| MTTR | < 1 hour | < 1 day | < 1 week | > 1 week |
| Change Failure Rate | < 5% | < 10% | < 15% | > 15% |

## Dashboard Features

### Main Panels

1. **DORA Metrics Overview**: Current performance with color-coded thresholds
2. **Trends Visualization**: Time series showing metric evolution
3. **Business Impact Correlation**: MTTR vs customer retention correlation
4. **Incident Analysis**: Workflow comparison and resolution times
5. **Service Performance Table**: Detailed breakdown by service
6. **Executive Summary**: Business impact and improvement metrics

### Interactive Features

- **Service Filtering**: Focus on specific microservices
- **Time Range Selection**: Analyze different periods
- **Drill-down Links**: Click metrics to view incidents, traces, tickets
- **Annotations**: Mark Augment adoption and incident events
- **Export Options**: PDF/CSV for executive reporting

## API Reference

### Incident Management

```bash
# Create incident
POST /incidents
{
  "serviceName": "checkout",
  "title": "Service Failure",
  "description": "Description",
  "severity": "high",
  "workflowType": "manual|augment"
}

# Resolve incident
PUT /incidents/{id}/resolve
{
  "notes": "Resolution notes",
  "prUrl": "https://github.com/repo/pull/123"
}

# List incidents
GET /incidents?serviceName=checkout&status=open
```

### Demo Control

```bash
# Trigger scenarios
POST /demo/trigger-manual-scenario
POST /demo/trigger-augment-scenario

# Get status
GET /demo/status
```

### Metrics

```bash
# Prometheus metrics
GET /metrics
```

## Customization

### Adding New Services

1. Update `services` array in `dora-metrics-generator.js`
2. Add team mapping in `teams` object
3. Configure service-specific multipliers if needed

### Modifying Scenarios

1. Edit `checkout-integration.js` for different failure types
2. Update `incident-manager.js` for custom workflows
3. Adjust resolution times and impact factors

### Dashboard Customization

1. Edit `dora-dashboard.json` for new panels
2. Add custom queries for specific metrics
3. Configure alerting rules and thresholds

## Troubleshooting

### Common Issues

1. **Metrics not appearing**: Check Prometheus scraping configuration
2. **Jira tickets not created**: Verify API credentials and project permissions
3. **Slack notifications not sent**: Confirm webhook URL and permissions
4. **Dashboard not loading**: Ensure Grafana datasource configuration

### Logs

```bash
# View service logs
docker-compose logs dora-metrics

# Check Prometheus targets
curl http://localhost:9090/api/v1/targets
```

## Demo Narrative

### Introduction (2 minutes)
"We'll demonstrate two scenarios: manual incident response vs. Augment Code workflow, showing the measurable impact on both DORA metrics and business outcomes."

### Manual Scenario (3 minutes)
1. Trigger checkout failure
2. Show basic Jira ticket creation
3. Highlight manual investigation process
4. Display 8-hour resolution time
5. Show DORA metric degradation
6. Point out business impact (retention drop)

### Augment Scenario (3 minutes)
1. Trigger same failure
2. Show auto-enriched Jira ticket
3. Highlight context automation
4. Display 40-minute resolution
5. Show Elite DORA performance
6. Demonstrate business improvement

### Executive Summary (2 minutes)
1. Compare before/after metrics
2. Show business impact correlation
3. Highlight ROI and productivity gains
4. Demonstrate reporting capabilities

## Support

For questions or issues with the DORA demo system, please refer to the OpenTelemetry Demo documentation or create an issue in the repository.
