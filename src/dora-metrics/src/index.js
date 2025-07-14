// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

const express = require('express');
const client = require('prom-client');
const cron = require('node-cron');

const DoraMetricsGenerator = require('./dora-metrics-generator');
const IncidentManager = require('./incident-manager');
const BusinessMetricsSimulator = require('./business-metrics-simulator');
const TraceMonitor = require('./trace-monitor');
const RealIncidentDetector = require('./real-incident-detector');

const app = express();
const port = process.env.PORT || 8081;

app.use(express.json());
app.use(express.static('public'));

// Initialize components
const doraGenerator = new DoraMetricsGenerator();
const incidentManager = new IncidentManager(doraGenerator); // Pass DORA generator for metrics integration
const businessSimulator = new BusinessMetricsSimulator();
const traceMonitor = new TraceMonitor({
  jaegerUrl: process.env.JAEGER_URL || 'http://jaeger:16686',
  otelCollectorUrl: process.env.OTEL_COLLECTOR_URL || 'http://otel-collector:4317',
  checkInterval: 15000, // Check every 15 seconds
  errorThreshold: 2,    // 2 errors trigger incident
  timeWindow: 60000     // 1 minute window
});

const realIncidentDetector = new RealIncidentDetector({
  checkoutUrl: process.env.CHECKOUT_URL || 'http://checkout:8080',
  frontendUrl: process.env.FRONTEND_URL || 'http://frontend:8080',
  checkInterval: 20000, // Check every 20 seconds
  failureThreshold: 1   // 1 real failure triggers incident
});

// Prometheus metrics registry
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// DORA Metrics
const deploymentFrequency = new client.Gauge({
  name: 'dora_deployment_frequency_per_day',
  help: 'Number of deployments per day',
  labelNames: ['service_name', 'team', 'environment'],
  registers: [register]
});

const leadTime = new client.Gauge({
  name: 'dora_lead_time_minutes',
  help: 'Lead time for changes in minutes',
  labelNames: ['service_name', 'team', 'environment'],
  registers: [register]
});

const mttr = new client.Gauge({
  name: 'dora_mttr_minutes',
  help: 'Mean time to recovery in minutes',
  labelNames: ['service_name', 'team', 'environment', 'incident_id'],
  registers: [register]
});

const changeFailureRate = new client.Gauge({
  name: 'dora_change_failure_rate',
  help: 'Change failure rate as percentage',
  labelNames: ['service_name', 'team', 'environment'],
  registers: [register]
});

// Business Metrics
const customerRetention = new client.Gauge({
  name: 'business_customer_retention_rate',
  help: 'Customer retention rate percentage',
  labelNames: ['service_name'],
  registers: [register]
});

const cartAbandonmentRate = new client.Gauge({
  name: 'business_cart_abandonment_rate',
  help: 'Cart abandonment rate percentage',
  labelNames: ['service_name'],
  registers: [register]
});

// Incident Metrics
const incidentCount = new client.Counter({
  name: 'dora_incidents_total',
  help: 'Total number of incidents',
  labelNames: ['service_name', 'severity', 'status', 'workflow_type'],
  registers: [register]
});

const incidentDuration = new client.Histogram({
  name: 'dora_incident_duration_minutes',
  help: 'Incident duration in minutes',
  labelNames: ['service_name', 'severity', 'workflow_type'],
  buckets: [5, 15, 30, 60, 120, 240, 480, 960],
  registers: [register]
});

// Store metrics instances for access by other modules
global.doraMetrics = {
  deploymentFrequency,
  leadTime,
  mttr,
  changeFailureRate,
  customerRetention,
  cartAbandonmentRate,
  incidentCount,
  incidentDuration
};

// API Routes
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Incident management endpoints
app.post('/incidents', async (req, res) => {
  try {
    const incident = await incidentManager.createIncident(req.body);
    res.json(incident);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/incidents/:id/resolve', async (req, res) => {
  try {
    const incident = await incidentManager.resolveIncident(req.params.id, req.body);
    res.json(incident);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/incidents', async (req, res) => {
  try {
    const incidents = await incidentManager.getIncidents(req.query);
    res.json(incidents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/incidents/active', async (req, res) => {
  try {
    const incidents = await incidentManager.getIncidents();
    const activeIncidents = incidents.filter(incident => incident.status === 'open');
    res.json(activeIncidents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset endpoint to clear all incidents for demo purposes
app.delete('/incidents/reset', async (req, res) => {
  try {
    const clearedCount = incidentManager.resetIncidents();
    res.json({
      message: 'All incidents cleared successfully',
      clearedCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Webhook endpoint for Augment Code PR creation
app.post('/webhook/pr-created', async (req, res) => {
  try {
    const { jiraTicketId, prUrl, prNumber, repository } = req.body;

    if (!jiraTicketId || !prUrl) {
      return res.status(400).json({ error: 'jiraTicketId and prUrl are required' });
    }

    // Find incident by Jira ticket ID
    const incidents = await incidentManager.getIncidents();
    const incident = incidents.find(i => i.jiraTicketId === jiraTicketId && i.status === 'open');

    if (!incident) {
      return res.status(404).json({ error: `No active incident found for Jira ticket ${jiraTicketId}` });
    }

    // Resolve the incident
    const resolutionData = {
      notes: `Resolved via Augment Code workflow: ${jiraTicketId} - ${prUrl}`,
      prUrl: prUrl,
      resolutionMethod: 'augment-workflow'
    };

    const resolvedIncident = await incidentManager.resolveIncident(incident.id, resolutionData);

    console.log(`🤖 Incident ${incident.id} auto-resolved via Augment Code PR: ${prUrl}`);

    res.json({
      message: 'Incident resolved successfully',
      incident: resolvedIncident
    });
  } catch (error) {
    console.error('Error processing PR webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// Status endpoint for monitoring dashboard
app.get('/demo/status', (req, res) => {
  res.json({
    activeIncidents: incidentManager.getActiveIncidents(),
    metrics: doraGenerator.getCurrentMetrics(),
    improvementStatus: doraGenerator.getImprovementStatus(),
    traceMonitoring: traceMonitor.getStatus(),
    realIncidentDetection: realIncidentDetector.getStatus()
  });
});

// Trace monitoring status endpoint
app.get('/demo/trace-status', (req, res) => {
  res.json({
    traceMonitoring: traceMonitor.getStatus(),
    recentIncidents: incidentManager.getRecentIncidents(10)
  });
});

// Real incident detection status endpoint
app.get('/demo/incident-detection-status', (req, res) => {
  res.json({
    traceMonitoring: traceMonitor.getStatus(),
    realIncidentDetection: realIncidentDetector.getStatus(),
    recentIncidents: incidentManager.getRecentIncidents(5),
    message: 'System is actively monitoring for real incidents via distributed traces and application health checks'
  });
});

// Initialize historical data and start background tasks
async function initialize() {
  console.log('Initializing DORA Metrics Service...');

  // Generate historical data
  await doraGenerator.generateHistoricalData();

  // Automatic incident creation disabled - incidents will be created manually via runbook workflow
  // traceMonitor.on('incident-detected', async (incidentData) => {
  //   console.log('🚨 Real incident detected from traces:', incidentData.title);
  //   try {
  //     const incident = await incidentManager.createIncident(incidentData);
  //     console.log(`📋 Incident created from trace analysis: ${incident.id}`);
  //
  //     // Incident will be resolved manually via runbook workflow
  //     console.log(`🔧 Incident ${incident.id} created - awaiting manual resolution via runbook workflow`);
  //   } catch (error) {
  //     console.error('❌ Error creating incident from trace:', error.message);
  //   }
  // });

  // Automatic incident creation disabled - incidents will be created manually via runbook workflow
  // realIncidentDetector.on('real-incident-detected', async (incidentData) => {
  //   console.log('🚨 REAL APPLICATION FAILURE:', incidentData.title);
  //   try {
  //     const incident = await incidentManager.createIncident(incidentData);
  //     console.log(`📋 Real incident created: ${incident.id}`);
  //
  //     // Incident will be resolved manually via runbook workflow
  //     console.log(`🔧 Incident ${incident.id} created - awaiting manual resolution via runbook workflow`);
  //   } catch (error) {
  //     console.error('❌ Error creating real incident:', error.message);
  //   }
  // });

  // Start monitoring services
  traceMonitor.startMonitoring();
  realIncidentDetector.startMonitoring();

  // Start periodic metric updates
  cron.schedule('*/30 * * * * *', () => {
    doraGenerator.updateMetrics();
    businessSimulator.updateMetrics();
  });

  console.log('DORA Metrics Service initialized successfully');
}

app.listen(port, async () => {
  console.log(`DORA Metrics Service listening on port ${port}`);
  await initialize();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});
