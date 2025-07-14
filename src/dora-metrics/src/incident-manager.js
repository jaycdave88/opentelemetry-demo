// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const axios = require('axios');
const CheckoutIntegration = require('./checkout-integration');

class IncidentManager {
  constructor(doraGenerator = null) {
    this.incidents = new Map();
    this.currentScenario = null;
    this.checkoutIntegration = new CheckoutIntegration();
    this.doraGenerator = doraGenerator; // Reference to DORA metrics generator
    this.jiraConfig = {
      baseUrl: process.env.JIRA_BASE_URL || 'https://your-domain.atlassian.net',
      email: process.env.JIRA_EMAIL || 'demo@example.com',
      apiToken: process.env.JIRA_API_TOKEN || 'demo-token',
      projectKey: process.env.JIRA_PROJECT_KEY || 'DEMO'
    };
    this.slackWebhook = process.env.SLACK_WEBHOOK_URL;
  }

  async createIncident(incidentData) {
    const incident = {
      id: uuidv4(),
      serviceName: incidentData.serviceName || 'checkout',
      title: incidentData.title || 'Checkout Service Failure',
      description: incidentData.description || 'Service experiencing failures',
      severity: incidentData.severity || 'high',
      status: 'open',
      workflowType: incidentData.workflowType || 'manual',
      createdAt: moment().toISOString(),
      resolvedAt: null,
      traceId: incidentData.traceId,
      spanId: incidentData.spanId,
      errorDetails: incidentData.errorDetails,
      jiraTicketId: incidentData.jiraTicketId || null,
      prUrl: null,
      dashboardUrl: null,
      tags: incidentData.tags || []
    };

    this.incidents.set(incident.id, incident);

    // Create Jira ticket based on workflow type (only if not already provided)
    if (!incident.jiraTicketId) {
      if (incident.workflowType === 'manual') {
        await this.createManualJiraTicket(incident);
      } else {
        await this.createAugmentJiraTicket(incident);
      }
    }

    // Record incident metrics
    if (global.doraMetrics) {
      global.doraMetrics.incidentCount.inc({
        service_name: incident.serviceName,
        severity: incident.severity,
        status: 'open',
        workflow_type: incident.workflowType
      });
    }

    console.log(`Incident created: ${incident.id} (${incident.workflowType} workflow)`);
    return incident;
  }

  async resolveIncident(incidentId, resolutionData) {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    const resolvedAt = moment();
    const durationMinutes = resolvedAt.diff(moment(incident.createdAt), 'minutes');

    incident.status = 'resolved';
    incident.resolvedAt = resolvedAt.toISOString();
    incident.resolutionNotes = resolutionData.notes;
    incident.prUrl = resolutionData.prUrl;
    incident.durationMinutes = durationMinutes;

    // Update DORA metrics
    if (global.doraMetrics) {
      const DoraMetricsGenerator = require('./dora-metrics-generator');
      const generator = new DoraMetricsGenerator();
      generator.simulateIncidentImpact(
        incident.serviceName,
        durationMinutes,
        incident.workflowType
      );
    }

    // Send Slack notification if MTTR crosses threshold
    await this.checkMttrThreshold(incident);

    // Update Jira ticket
    await this.updateJiraTicket(incident);

    // Notify DORA metrics generator about incident resolution
    if (this.doraGenerator) {
      this.doraGenerator.onIncidentResolved(incident);
    }

    console.log(`Incident resolved: ${incidentId} (${durationMinutes} minutes)`);
    return incident;
  }

  async createManualJiraTicket(incident) {
    const description = this.buildManualTicketDescription(incident);
    
    const ticketData = {
      fields: {
        project: { key: this.jiraConfig.projectKey },
        summary: `[MANUAL] ${incident.title}`,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: description }]
            }
          ]
        },
        issuetype: { name: 'Bug' },
        priority: { name: 'High' },
        labels: ['manual-workflow', 'incident', incident.serviceName]
      }
    };

    try {
      const response = await this.makeJiraRequest('POST', '/rest/api/3/issue', ticketData);
      incident.jiraTicketId = response.data.key;
      incident.jiraUrl = `${this.jiraConfig.baseUrl}/browse/${response.data.key}`;
      console.log(`Manual Jira ticket created: ${incident.jiraTicketId}`);
    } catch (error) {
      console.error('Failed to create manual Jira ticket:', error.message);
    }
  }

  async createAugmentJiraTicket(incident) {
    const description = this.buildAugmentTicketDescription(incident);
    
    const ticketData = {
      fields: {
        project: { key: this.jiraConfig.projectKey },
        summary: `[AUGMENT] ${incident.title} - Auto-Enriched`,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: description }]
            },
            { type: 'rule' },
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Co-authored by ' },
                {
                  type: 'text',
                  text: 'Augment Code',
                  marks: [{
                    type: 'link',
                    attrs: { href: 'https://www.augmentcode.com/?utm_source=atlassian&utm_medium=jira_issue&utm_campaign=jira' }
                  }]
                }
              ]
            }
          ]
        },
        issuetype: { name: 'Bug' },
        priority: { name: 'High' },
        labels: ['augment-workflow', 'incident', 'auto-enriched', incident.serviceName]
      }
    };

    try {
      const response = await this.makeJiraRequest('POST', '/rest/api/3/issue', ticketData);
      incident.jiraTicketId = response.data.key;
      incident.jiraUrl = `${this.jiraConfig.baseUrl}/browse/${response.data.key}`;
      
      // Add remote links for Augment workflow
      await this.addJiraRemoteLinks(incident);
      
      console.log(`Augment Jira ticket created: ${incident.jiraTicketId}`);
    } catch (error) {
      console.error('Failed to create Augment Jira ticket:', error.message);
    }
  }

  buildManualTicketDescription(incident) {
    return `
INCIDENT REPORT - Manual Workflow

Service: ${incident.serviceName}
Severity: ${incident.severity}
Status: ${incident.status}
Created: ${incident.createdAt}

DESCRIPTION:
${incident.description}

ERROR DETAILS:
${incident.errorDetails || 'Error details need to be manually investigated'}

MANUAL INVESTIGATION REQUIRED:
- Check service logs manually
- Analyze traces in Jaeger UI
- Review recent deployments
- Identify root cause
- Implement fix
- Test and deploy

TRACE INFORMATION:
${incident.traceId ? `Trace ID: ${incident.traceId}` : 'Trace ID needs to be found manually'}
${incident.spanId ? `Span ID: ${incident.spanId}` : 'Span ID needs to be found manually'}

NEXT STEPS:
1. Investigate logs and traces
2. Identify root cause
3. Create fix
4. Test solution
5. Deploy and verify
6. Update this ticket with resolution
    `.trim();
  }

  buildAugmentTicketDescription(incident) {
    const dashboardUrl = `http://grafana:3000/d/dora-dashboard/dora-metrics?var-service=${incident.serviceName}&from=now-1h&to=now`;
    const jaegerUrl = incident.traceId ? 
      `http://jaeger-query:16686/trace/${incident.traceId}` : 
      'http://jaeger-query:16686';

    return `
INCIDENT REPORT - Augment Code Workflow

Service: ${incident.serviceName}
Severity: ${incident.severity}
Status: ${incident.status}
Created: ${incident.createdAt}

DESCRIPTION:
${incident.description}

AUTO-ENRICHED CONTEXT:
✅ Service-specific DORA dashboard filtered for this incident
✅ Direct trace links with full context
✅ Recommended fix workflow with branch/PR automation
✅ Historical incident patterns and solutions
✅ Automated testing and deployment pipeline

ERROR DETAILS:
${incident.errorDetails || 'Detailed error analysis available in linked trace'}

REPRODUCTION STEPS:
1. Navigate to checkout page
2. Add items totaling > $25 to cart
3. Attempt to complete checkout
4. Observe failure with technical details

RECOMMENDED WORKFLOW:
1. Review linked trace and dashboard
2. Use Augment Code IDE context panel
3. Apply suggested fix from similar incidents
4. Run automated tests
5. Create PR with auto-generated description
6. Deploy via automated pipeline

QUICK LINKS:
🔗 DORA Dashboard: ${dashboardUrl}
🔗 Trace Analysis: ${jaegerUrl}
🔗 Service Logs: Available in OpenSearch
🔗 Recent Deployments: Check CI/CD pipeline

AUTOMATED ACTIONS TAKEN:
- Context gathered from traces and logs
- Similar incidents analyzed
- Fix recommendations prepared
- Branch and PR templates ready
    `.trim();
  }

  async addJiraRemoteLinks(incident) {
    const links = [
      {
        object: {
          url: `http://grafana:3000/d/dora-dashboard/dora-metrics?var-service=${incident.serviceName}`,
          title: 'DORA Metrics Dashboard',
          summary: 'Service-specific DORA metrics and incident context'
        }
      }
    ];

    if (incident.traceId) {
      links.push({
        object: {
          url: `http://jaeger-query:16686/trace/${incident.traceId}`,
          title: 'Distributed Trace',
          summary: 'Full trace context for this incident'
        }
      });
    }

    for (const link of links) {
      try {
        await this.makeJiraRequest(
          'POST',
          `/rest/api/3/issue/${incident.jiraTicketId}/remotelink`,
          link
        );
      } catch (error) {
        console.error('Failed to add Jira remote link:', error.message);
      }
    }
  }

  async updateJiraTicket(incident) {
    if (!incident.jiraTicketId) return;

    const updateData = {
      fields: {
        status: { name: incident.status === 'resolved' ? 'Done' : 'In Progress' }
      }
    };

    if (incident.status === 'resolved') {
      const resolutionComment = {
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: `Incident resolved in ${incident.durationMinutes} minutes.\n\n${incident.resolutionNotes || 'Resolution completed.'}`
                }
              ]
            }
          ]
        }
      };

      try {
        await this.makeJiraRequest(
          'POST',
          `/rest/api/3/issue/${incident.jiraTicketId}/comment`,
          resolutionComment
        );
      } catch (error) {
        console.error('Failed to add resolution comment:', error.message);
      }
    }

    try {
      await this.makeJiraRequest(
        'PUT',
        `/rest/api/3/issue/${incident.jiraTicketId}`,
        updateData
      );
    } catch (error) {
      console.error('Failed to update Jira ticket:', error.message);
    }
  }

  async checkMttrThreshold(incident) {
    const thresholds = {
      elite: 60,    // 1 hour
      high: 1440,   // 1 day
      medium: 10080 // 1 week
    };

    let band = 'low';
    if (incident.durationMinutes <= thresholds.elite) band = 'elite';
    else if (incident.durationMinutes <= thresholds.high) band = 'high';
    else if (incident.durationMinutes <= thresholds.medium) band = 'medium';

    // Send Slack notification for Elite performance
    if (band === 'elite' && this.slackWebhook) {
      await this.sendSlackNotification({
        text: `🚀 DORA Metric Alert: MTTR for ${incident.serviceName} just improved to ${incident.durationMinutes}min (Elite)!`,
        attachments: [{
          color: 'good',
          fields: [
            { title: 'Service', value: incident.serviceName, short: true },
            { title: 'MTTR', value: `${incident.durationMinutes} minutes`, short: true },
            { title: 'Performance Band', value: 'Elite', short: true },
            { title: 'Workflow', value: incident.workflowType, short: true }
          ],
          actions: [
            {
              type: 'button',
              text: 'View Dashboard',
              url: `http://grafana:3000/d/dora-dashboard/dora-metrics?var-service=${incident.serviceName}`
            },
            {
              type: 'button',
              text: 'View Jira Ticket',
              url: incident.jiraUrl
            }
          ]
        }]
      });
    }
  }

  async sendSlackNotification(message) {
    if (!this.slackWebhook) return;

    try {
      await axios.post(this.slackWebhook, message);
    } catch (error) {
      console.error('Failed to send Slack notification:', error.message);
    }
  }

  async makeJiraRequest(method, endpoint, data) {
    const auth = Buffer.from(`${this.jiraConfig.email}:${this.jiraConfig.apiToken}`).toString('base64');

    return axios({
      method,
      url: `${this.jiraConfig.baseUrl}${endpoint}`,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      data
    });
  }

  // Demo scenario triggers
  async triggerManualScenario() {
    this.currentScenario = 'manual';

    // Enable checkout failure and simulate the failure
    await this.checkoutIntegration.enableCheckoutFailure();
    const checkoutResult = await this.checkoutIntegration.simulateCheckoutAttempt();

    // Create incident from the checkout failure
    const incidentData = await this.checkoutIntegration.createIncidentFromCheckoutFailure(
      checkoutResult,
      'manual'
    );

    const incident = await this.createIncident(incidentData);

    // Simulate manual resolution after 8 hours (480 minutes) - compressed to 2 minutes for demo
    setTimeout(async () => {
      await this.resolveIncident(incident.id, {
        notes: 'Manually investigated logs, identified feature flag issue, updated configuration, tested and deployed fix. Resolution took significant time due to manual context gathering and investigation.',
        prUrl: 'https://github.com/opentelemetry-demo/pull/manual-fix-123'
      });

      // Disable the failure after resolution
      await this.checkoutIntegration.disableCheckoutFailure();
    }, 8000); // 8 seconds for demo (represents 8 hours)

    return { scenario: 'manual', incident, checkoutResult };
  }

  async triggerAugmentScenario() {
    this.currentScenario = 'augment';

    // Enable checkout failure and simulate the failure
    await this.checkoutIntegration.enableCheckoutFailure();
    const checkoutResult = await this.checkoutIntegration.simulateCheckoutAttempt();

    // Create incident from the checkout failure with Augment workflow
    const incidentData = await this.checkoutIntegration.createIncidentFromCheckoutFailure(
      checkoutResult,
      'augment'
    );

    const incident = await this.createIncident(incidentData);

    // Simulate Augment resolution after 40 minutes - compressed to 45 seconds for demo
    setTimeout(async () => {
      await this.resolveIncident(incident.id, {
        notes: 'Used Augment Code workflow: context auto-gathered from traces and logs, fix applied from similar incidents database, automated testing passed, PR auto-created with full context and deployed via CI/CD pipeline.',
        prUrl: 'https://github.com/opentelemetry-demo/pull/augment-fix-124'
      });

      // Disable the failure after resolution
      await this.checkoutIntegration.disableCheckoutFailure();
    }, 3000); // 3 seconds for demo (represents 40 minutes)

    return { scenario: 'augment', incident, checkoutResult };
  }

  getCurrentScenario() {
    return this.currentScenario;
  }

  getActiveIncidents() {
    return Array.from(this.incidents.values()).filter(i => i.status === 'open');
  }

  // Get recent incidents (for trace monitoring)
  getRecentIncidents(limit = 10) {
    return Array.from(this.incidents.values())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }

  getIncidents(filters = {}) {
    let incidents = Array.from(this.incidents.values());

    if (filters.serviceName) {
      incidents = incidents.filter(i => i.serviceName === filters.serviceName);
    }

    if (filters.status) {
      incidents = incidents.filter(i => i.status === filters.status);
    }

    if (filters.workflowType) {
      incidents = incidents.filter(i => i.workflowType === filters.workflowType);
    }

    if (filters.jiraTicketId) {
      incidents = incidents.filter(i => i.jiraTicketId === filters.jiraTicketId);
    }

    return incidents.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // Reset all incidents for demo purposes
  resetIncidents() {
    const clearedCount = this.incidents.size;
    this.incidents.clear();
    this.currentScenario = null;
    console.log(`Reset: Cleared ${clearedCount} incidents for demo`);
    return clearedCount;
  }
}

module.exports = IncidentManager;
