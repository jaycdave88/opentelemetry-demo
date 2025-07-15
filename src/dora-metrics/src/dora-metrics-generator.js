// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

const moment = require('moment');

class DoraMetricsGenerator {
  constructor() {
    this.services = [
      'frontend', 'cart', 'checkout', 'payment', 'shipping', 
      'product-catalog', 'recommendation', 'ad', 'currency', 'email'
    ];
    
    this.teams = {
      'frontend': 'Frontend Team',
      'cart': 'Commerce Team',
      'checkout': 'Commerce Team',
      'payment': 'Payments Team',
      'shipping': 'Logistics Team',
      'product-catalog': 'Catalog Team',
      'recommendation': 'ML Team',
      'ad': 'Marketing Team',
      'currency': 'Platform Team',
      'email': 'Platform Team'
    };

    this.currentMetrics = {};
    this.historicalData = [];
    this.augmentAdoptionDate = moment().subtract(7, 'days'); // 7 days ago
    this.augmentActive = false; // Start with poor metrics, improve when incidents are resolved
    this.incidentResolutionCount = 0; // Track how many incidents have been resolved
  }

  async generateHistoricalData() {
    console.log('Generating historical DORA metrics data...');
    
    const startDate = moment().subtract(30, 'days');
    const endDate = moment();
    
    for (const service of this.services) {
      await this.generateServiceHistoricalData(service, startDate, endDate);
    }
    
    console.log('Historical data generation completed');
  }

  async generateServiceHistoricalData(serviceName, startDate, endDate) {
    const team = this.teams[serviceName];
    const current = startDate.clone();
    
    while (current.isBefore(endDate)) {
      const isPostAugment = current.isAfter(this.augmentAdoptionDate);
      
      // Generate metrics based on pre/post Augment adoption
      const metrics = this.generateMetricsForDate(serviceName, current, isPostAugment);
      
      // Update Prometheus metrics
      this.updatePrometheusMetrics(serviceName, team, metrics);
      
      // Store historical data
      this.historicalData.push({
        service: serviceName,
        team,
        date: current.format('YYYY-MM-DD'),
        timestamp: current.unix(),
        isPostAugment,
        ...metrics
      });
      
      current.add(1, 'day');
    }
  }

  generateMetricsForDate(serviceName, date, isPostAugment) {
    // Base metrics for pre-Augment (EXTREMELY poor performance - DEEP RED zone)
    let baseMetrics = {
      deploymentFrequency: this.randomBetween(0.01, 0.05), // Once every 20-100 days (CATASTROPHIC)
      leadTimeMinutes: this.randomBetween(5760, 14400), // 4-10 days (CATASTROPHIC)
      mttrMinutes: this.randomBetween(1440, 4320), // 24-72 hours (CATASTROPHIC)
      changeFailureRate: this.randomBetween(35, 60) // 35-60% failure rate (CATASTROPHIC)
    };

    // Service-specific variations (make checkout CATASTROPHICALLY worse)
    const serviceMultipliers = {
      'checkout': { mttr: 3.5, changeFailure: 2.2, deploymentFreq: 0.3, leadTime: 2.0 }, // Checkout is CATASTROPHIC
      'payment': { mttr: 2.2, changeFailure: 1.8, deploymentFreq: 0.5, leadTime: 1.6 },
      'frontend': { deploymentFreq: 0.4, leadTime: 1.8, mttr: 1.8, changeFailure: 1.6 },
      'cart': { mttr: 1.8, changeFailure: 1.6, deploymentFreq: 0.6, leadTime: 1.5 }
    };

    const multiplier = serviceMultipliers[serviceName] || {};
    
    if (multiplier.mttr) baseMetrics.mttrMinutes *= multiplier.mttr;
    if (multiplier.changeFailure) baseMetrics.changeFailureRate *= multiplier.changeFailure;
    if (multiplier.deploymentFreq) baseMetrics.deploymentFrequency *= multiplier.deploymentFreq;
    if (multiplier.leadTime) baseMetrics.leadTimeMinutes *= multiplier.leadTime;

    // Post-Augment improvements (DRAMATIC transformation to Elite performance)
    if (isPostAugment && this.augmentActive) {
      baseMetrics.deploymentFrequency *= this.randomBetween(50, 100); // Transform to multiple deployments per day
      baseMetrics.leadTimeMinutes *= this.randomBetween(0.01, 0.05); // Transform to 15-60 minutes
      baseMetrics.mttrMinutes *= this.randomBetween(0.02, 0.08); // Transform to 5-30 minutes
      baseMetrics.changeFailureRate *= this.randomBetween(0.05, 0.15); // Transform to 1-5%
    }

    // Add some daily variation
    const variation = this.randomBetween(0.8, 1.2);
    Object.keys(baseMetrics).forEach(key => {
      baseMetrics[key] *= variation;
    });

    // Ensure realistic bounds
    baseMetrics.deploymentFrequency = Math.max(0.1, Math.min(20, baseMetrics.deploymentFrequency));
    baseMetrics.leadTimeMinutes = Math.max(15, Math.min(5760, baseMetrics.leadTimeMinutes)); // 15min - 4 days
    baseMetrics.mttrMinutes = Math.max(5, Math.min(2880, baseMetrics.mttrMinutes)); // 5min - 2 days
    baseMetrics.changeFailureRate = Math.max(0, Math.min(50, baseMetrics.changeFailureRate));

    return baseMetrics;
  }

  updatePrometheusMetrics(serviceName, team, metrics) {
    if (!global.doraMetrics) return;

    const labels = { service_name: serviceName, team, environment: 'production' };
    
    global.doraMetrics.deploymentFrequency.set(labels, metrics.deploymentFrequency);
    global.doraMetrics.leadTime.set(labels, metrics.leadTimeMinutes);
    global.doraMetrics.changeFailureRate.set(labels, metrics.changeFailureRate);
    
    // MTTR is updated separately during incidents
    if (metrics.mttrMinutes) {
      global.doraMetrics.mttr.set(
        { ...labels, incident_id: 'baseline' }, 
        metrics.mttrMinutes
      );
    }
  }

  updateMetrics() {
    // Update current metrics for all services
    for (const service of this.services) {
      const team = this.teams[service];
      const isPostAugment = moment().isAfter(this.augmentAdoptionDate);
      const metrics = this.generateMetricsForDate(service, moment(), isPostAugment);
      
      this.currentMetrics[service] = metrics;
      this.updatePrometheusMetrics(service, team, metrics);
    }
  }

  getCurrentMetrics() {
    return this.currentMetrics;
  }

  getHistoricalData(serviceName, days = 30) {
    const cutoff = moment().subtract(days, 'days');
    return this.historicalData.filter(d => 
      (!serviceName || d.service === serviceName) && 
      moment(d.date).isAfter(cutoff)
    );
  }

  getDoraBand(metric, value) {
    const bands = {
      deploymentFrequency: {
        elite: 1, // Multiple per day
        high: 0.14, // Weekly
        medium: 0.03, // Monthly
        low: 0
      },
      leadTimeMinutes: {
        elite: 60, // < 1 hour
        high: 1440, // < 1 day
        medium: 10080, // < 1 week
        low: Infinity
      },
      mttrMinutes: {
        elite: 60, // < 1 hour
        high: 1440, // < 1 day
        medium: 10080, // < 1 week
        low: Infinity
      },
      changeFailureRate: {
        elite: 5, // < 5%
        high: 10, // < 10%
        medium: 15, // < 15%
        low: Infinity
      }
    };

    const thresholds = bands[metric];
    if (!thresholds) return 'unknown';

    if (metric === 'deploymentFrequency') {
      if (value >= thresholds.elite) return 'elite';
      if (value >= thresholds.high) return 'high';
      if (value >= thresholds.medium) return 'medium';
      return 'low';
    } else {
      if (value <= thresholds.elite) return 'elite';
      if (value <= thresholds.high) return 'high';
      if (value <= thresholds.medium) return 'medium';
      return 'low';
    }
  }

  randomBetween(min, max) {
    return Math.random() * (max - min) + min;
  }

  // Method to activate Augment improvements when incidents are resolved
  onIncidentResolved(incident) {
    this.incidentResolutionCount++;

    // Activate Augment improvements after first incident resolution
    if (!this.augmentActive && this.incidentResolutionCount >= 1) {
      console.log('🚀 Augment Code activated! DORA metrics will improve...');
      this.augmentActive = true;

      // Regenerate current metrics with improvements
      this.updateMetrics();
    }
  }

  // Method to check if Augment is active
  isAugmentActive() {
    return this.augmentActive;
  }

  // Method to get current improvement status
  getImprovementStatus() {
    return {
      augmentActive: this.augmentActive,
      incidentResolutionCount: this.incidentResolutionCount,
      metricsImproved: this.augmentActive
    };
  }

  // Method to reset Augment status for demo purposes
  resetAugmentStatus() {
    console.log('🔄 Resetting Augment status to initial state (poor metrics)...');
    this.augmentActive = false;
    this.incidentResolutionCount = 0;

    // Regenerate current metrics without improvements (back to poor/red state)
    this.updateMetrics();

    console.log('✅ Augment status reset - metrics will now show red/poor performance');
  }

  // Simulate incident impact on metrics
  simulateIncidentImpact(serviceName, incidentDurationMinutes, workflowType) {
    const team = this.teams[serviceName];
    const labels = { service_name: serviceName, team, environment: 'production' };

    // Update MTTR
    global.doraMetrics.mttr.set(
      { ...labels, incident_id: `incident_${Date.now()}` },
      incidentDurationMinutes
    );

    // Increase change failure rate temporarily
    const currentFailureRate = this.currentMetrics[serviceName]?.changeFailureRate || 10;
    const impactMultiplier = workflowType === 'manual' ? 1.5 : 1.1;

    global.doraMetrics.changeFailureRate.set(
      labels,
      Math.min(50, currentFailureRate * impactMultiplier)
    );

    // Record incident
    global.doraMetrics.incidentCount.inc({
      service_name: serviceName,
      severity: 'high',
      status: 'resolved',
      workflow_type: workflowType
    });

    global.doraMetrics.incidentDuration.observe(
      { service_name: serviceName, severity: 'high', workflow_type: workflowType },
      incidentDurationMinutes
    );
  }

  // Get DORA performance classification
  getPerformanceClassification(serviceName) {
    const metrics = this.currentMetrics[serviceName];
    if (!metrics) return 'unknown';

    const bands = {
      deploymentFrequency: this.getDoraBand('deploymentFrequency', metrics.deploymentFrequency),
      leadTime: this.getDoraBand('leadTimeMinutes', metrics.leadTimeMinutes),
      mttr: this.getDoraBand('mttrMinutes', metrics.mttrMinutes),
      changeFailureRate: this.getDoraBand('changeFailureRate', metrics.changeFailureRate)
    };

    // Calculate overall performance (worst metric determines overall)
    const bandOrder = ['elite', 'high', 'medium', 'low'];
    const worstBand = bandOrder.find(band =>
      Object.values(bands).includes(band)
    ) || 'unknown';

    return { overall: worstBand, individual: bands };
  }
}

module.exports = DoraMetricsGenerator;
