// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

const moment = require('moment');

class BusinessMetricsSimulator {
  constructor() {
    this.baseRetentionRate = 85; // 85% base retention
    this.baseAbandonmentRate = 25; // 25% base abandonment
    this.currentMetrics = {
      retentionRate: this.baseRetentionRate,
      abandonmentRate: this.baseAbandonmentRate
    };
    
    // Correlation factors between DORA metrics and business metrics
    this.correlationFactors = {
      mttr: {
        retention: -0.15, // Higher MTTR = lower retention
        abandonment: 0.20  // Higher MTTR = higher abandonment
      },
      changeFailureRate: {
        retention: -0.10,
        abandonment: 0.15
      },
      deploymentFrequency: {
        retention: 0.05,
        abandonment: -0.03
      },
      leadTime: {
        retention: -0.02,
        abandonment: 0.03
      }
    };
  }

  updateMetrics() {
    // Get current DORA metrics to calculate business impact
    const doraMetrics = this.getCurrentDoraMetrics();
    
    // Calculate retention rate based on DORA metrics
    let retentionImpact = 0;
    let abandonmentImpact = 0;

    Object.keys(this.correlationFactors).forEach(metric => {
      if (doraMetrics[metric] !== undefined) {
        const normalizedValue = this.normalizeDoraMetric(metric, doraMetrics[metric]);
        retentionImpact += normalizedValue * this.correlationFactors[metric].retention;
        abandonmentImpact += normalizedValue * this.correlationFactors[metric].abandonment;
      }
    });

    // Apply impact with some smoothing
    this.currentMetrics.retentionRate = Math.max(60, Math.min(95, 
      this.baseRetentionRate + retentionImpact + this.getRandomVariation(2)
    ));
    
    this.currentMetrics.abandonmentRate = Math.max(10, Math.min(50,
      this.baseAbandonmentRate + abandonmentImpact + this.getRandomVariation(3)
    ));

    // Update Prometheus metrics
    this.updatePrometheusMetrics();
  }

  getCurrentDoraMetrics() {
    // In a real implementation, this would fetch from the DORA metrics generator
    // For now, we'll simulate based on typical values
    const DoraMetricsGenerator = require('./dora-metrics-generator');
    const generator = new DoraMetricsGenerator();
    
    // Get average metrics across all services
    const services = ['frontend', 'cart', 'checkout', 'payment', 'shipping'];
    let totalMttr = 0;
    let totalChangeFailure = 0;
    let totalDeploymentFreq = 0;
    let totalLeadTime = 0;
    let count = 0;

    services.forEach(service => {
      const metrics = generator.currentMetrics[service];
      if (metrics) {
        totalMttr += metrics.mttrMinutes || 120;
        totalChangeFailure += metrics.changeFailureRate || 15;
        totalDeploymentFreq += metrics.deploymentFrequency || 1;
        totalLeadTime += metrics.leadTimeMinutes || 480;
        count++;
      }
    });

    if (count === 0) {
      // Fallback values
      return {
        mttrMinutes: 120,
        changeFailureRate: 15,
        deploymentFrequency: 1,
        leadTimeMinutes: 480
      };
    }

    return {
      mttrMinutes: totalMttr / count,
      changeFailureRate: totalChangeFailure / count,
      deploymentFrequency: totalDeploymentFreq / count,
      leadTimeMinutes: totalLeadTime / count
    };
  }

  normalizeDoraMetric(metric, value) {
    // Normalize DORA metrics to a standard scale for correlation calculation
    const normalizations = {
      mttrMinutes: {
        excellent: 30,    // Elite: < 1 hour
        good: 240,        // High: < 4 hours
        poor: 1440,       // Medium: < 1 day
        terrible: 2880    // Low: > 1 day
      },
      changeFailureRate: {
        excellent: 2,     // Elite: < 5%
        good: 8,          // High: < 10%
        poor: 15,         // Medium: < 15%
        terrible: 30      // Low: > 15%
      },
      deploymentFrequency: {
        excellent: 5,     // Elite: Multiple per day
        good: 1,          // High: Daily
        poor: 0.2,        // Medium: Weekly
        terrible: 0.03    // Low: Monthly
      },
      leadTimeMinutes: {
        excellent: 60,    // Elite: < 1 hour
        good: 480,        // High: < 8 hours
        poor: 2880,       // Medium: < 2 days
        terrible: 10080   // Low: > 1 week
      }
    };

    const norm = normalizations[metric];
    if (!norm) return 0;

    // For metrics where lower is better (MTTR, change failure, lead time)
    if (metric === 'mttrMinutes' || metric === 'changeFailureRate' || metric === 'leadTimeMinutes') {
      if (value <= norm.excellent) return -2; // Excellent performance
      if (value <= norm.good) return -1;      // Good performance
      if (value <= norm.poor) return 0;       // Average performance
      return 1;                               // Poor performance
    }
    
    // For metrics where higher is better (deployment frequency)
    if (metric === 'deploymentFrequency') {
      if (value >= norm.excellent) return -2; // Excellent performance
      if (value >= norm.good) return -1;      // Good performance
      if (value >= norm.poor) return 0;       // Average performance
      return 1;                               // Poor performance
    }

    return 0;
  }

  updatePrometheusMetrics() {
    if (!global.doraMetrics) return;

    // Update customer retention rate
    global.doraMetrics.customerRetention.set(
      { service_name: 'overall' },
      this.currentMetrics.retentionRate
    );

    // Update cart abandonment rate
    global.doraMetrics.cartAbandonmentRate.set(
      { service_name: 'checkout' },
      this.currentMetrics.abandonmentRate
    );
  }

  getRandomVariation(range) {
    return (Math.random() - 0.5) * 2 * range;
  }

  // Simulate incident impact on business metrics
  simulateIncidentImpact(serviceName, durationMinutes, workflowType) {
    // Immediate impact based on incident duration and workflow
    const impactMultiplier = workflowType === 'manual' ? 1.5 : 0.8;
    const durationImpact = Math.min(durationMinutes / 60, 8); // Cap at 8 hours impact
    
    // Temporary drop in retention
    const retentionDrop = durationImpact * impactMultiplier * 0.5;
    this.currentMetrics.retentionRate = Math.max(60, 
      this.currentMetrics.retentionRate - retentionDrop
    );

    // Temporary increase in abandonment
    const abandonmentIncrease = durationImpact * impactMultiplier * 0.8;
    this.currentMetrics.abandonmentRate = Math.min(50,
      this.currentMetrics.abandonmentRate + abandonmentIncrease
    );

    this.updatePrometheusMetrics();

    // Recovery simulation - metrics improve over time
    setTimeout(() => {
      this.simulateRecovery(retentionDrop, abandonmentIncrease, workflowType);
    }, 30000); // Start recovery after 30 seconds
  }

  simulateRecovery(retentionDrop, abandonmentIncrease, workflowType) {
    const recoveryRate = workflowType === 'augment' ? 0.8 : 0.3; // Augment recovers faster
    const recoverySteps = 10;
    const stepInterval = 5000; // 5 seconds between steps

    let step = 0;
    const recoveryInterval = setInterval(() => {
      step++;
      const progress = step / recoverySteps;
      const easedProgress = this.easeOutCubic(progress);

      // Gradually restore metrics
      this.currentMetrics.retentionRate = Math.min(
        this.baseRetentionRate,
        this.currentMetrics.retentionRate + (retentionDrop * easedProgress * recoveryRate)
      );

      this.currentMetrics.abandonmentRate = Math.max(
        this.baseAbandonmentRate,
        this.currentMetrics.abandonmentRate - (abandonmentIncrease * easedProgress * recoveryRate)
      );

      this.updatePrometheusMetrics();

      if (step >= recoverySteps) {
        clearInterval(recoveryInterval);
        console.log(`Business metrics recovery completed (${workflowType} workflow)`);
      }
    }, stepInterval);
  }

  easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  getCurrentMetrics() {
    return { ...this.currentMetrics };
  }

  // Generate historical business metrics data
  generateHistoricalData(days = 30) {
    const data = [];
    const startDate = moment().subtract(days, 'days');
    const augmentAdoptionDate = moment().subtract(7, 'days');

    for (let i = 0; i < days; i++) {
      const date = startDate.clone().add(i, 'days');
      const isPostAugment = date.isAfter(augmentAdoptionDate);
      
      // Pre-Augment: lower retention, higher abandonment
      let retention = this.baseRetentionRate + this.getRandomVariation(3);
      let abandonment = this.baseAbandonmentRate + this.getRandomVariation(4);

      if (!isPostAugment) {
        retention -= 8; // Lower retention pre-Augment
        abandonment += 10; // Higher abandonment pre-Augment
      } else {
        retention += 5; // Better retention post-Augment
        abandonment -= 8; // Lower abandonment post-Augment
      }

      // Ensure realistic bounds
      retention = Math.max(60, Math.min(95, retention));
      abandonment = Math.max(10, Math.min(50, abandonment));

      data.push({
        date: date.format('YYYY-MM-DD'),
        timestamp: date.unix(),
        retentionRate: retention,
        abandonmentRate: abandonment,
        isPostAugment
      });
    }

    return data;
  }

  // Get business impact summary
  getBusinessImpactSummary() {
    const historicalData = this.generateHistoricalData();
    const preAugmentData = historicalData.filter(d => !d.isPostAugment);
    const postAugmentData = historicalData.filter(d => d.isPostAugment);

    const preAvgRetention = preAugmentData.reduce((sum, d) => sum + d.retentionRate, 0) / preAugmentData.length;
    const postAvgRetention = postAugmentData.reduce((sum, d) => sum + d.retentionRate, 0) / postAugmentData.length;
    
    const preAvgAbandonment = preAugmentData.reduce((sum, d) => sum + d.abandonmentRate, 0) / preAugmentData.length;
    const postAvgAbandonment = postAugmentData.reduce((sum, d) => sum + d.abandonmentRate, 0) / postAugmentData.length;

    return {
      retentionImprovement: ((postAvgRetention - preAvgRetention) / preAvgRetention * 100).toFixed(1),
      abandonmentReduction: ((preAvgAbandonment - postAvgAbandonment) / preAvgAbandonment * 100).toFixed(1),
      currentRetention: this.currentMetrics.retentionRate.toFixed(1),
      currentAbandonment: this.currentMetrics.abandonmentRate.toFixed(1)
    };
  }
}

module.exports = BusinessMetricsSimulator;
