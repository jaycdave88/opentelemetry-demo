// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

const axios = require('axios');

class CheckoutIntegration {
  constructor() {
    this.flagdUrl = process.env.FLAGD_URL || 'http://flagd:8013';
    this.checkoutUrl = process.env.CHECKOUT_URL || 'http://checkout:8080';
  }

  async enableCheckoutFailure() {
    try {
      // Set the checkoutFailureThreshold flag to trigger failures
      const flagData = {
        checkoutFailureThreshold: {
          description: "Fail checkout for orders containing items above this price threshold (in USD)",
          state: "ENABLED",
          variants: {
            "100": 100,
            "75": 75,
            "50": 50,
            "25": 25,
            "off": 0
          },
          defaultVariant: "25"
        }
      };

      // Update the flag configuration
      await this.updateFeatureFlag('checkoutFailureThreshold', '25');
      
      console.log('Checkout failure enabled (threshold: $25)');
      return true;
    } catch (error) {
      console.error('Failed to enable checkout failure:', error.message);
      return false;
    }
  }

  async disableCheckoutFailure() {
    try {
      await this.updateFeatureFlag('checkoutFailureThreshold', 'off');
      console.log('Checkout failure disabled');
      return true;
    } catch (error) {
      console.error('Failed to disable checkout failure:', error.message);
      return false;
    }
  }

  async updateFeatureFlag(flagName, variant) {
    // In a real implementation, this would update the flagd configuration
    // For the demo, we'll simulate the flag update
    console.log(`Feature flag ${flagName} set to: ${variant}`);
    
    // You could implement actual flagd API calls here if needed
    // For now, we'll assume the flag is already configured in the demo.flagd.json
    return true;
  }

  async simulateCheckoutAttempt() {
    // Simulate a checkout attempt that will fail due to the threshold
    const orderData = {
      userId: 'demo-user-123',
      userCurrency: 'USD',
      address: {
        streetAddress: '123 Demo Street',
        city: 'Demo City',
        state: 'Demo State',
        country: 'US',
        zipCode: '12345'
      },
      email: 'demo@example.com',
      creditCard: {
        creditCardNumber: '4111111111111111',
        creditCardExpirationMonth: 12,
        creditCardExpirationYear: 2025,
        creditCardCvv: '123'
      }
    };

    try {
      // This would normally make a real checkout request
      // For the demo, we'll simulate the failure
      console.log('Simulating checkout attempt with expensive items...');
      
      // Generate a mock trace ID for the incident
      const traceId = this.generateTraceId();
      const spanId = this.generateSpanId();
      
      return {
        success: false,
        error: 'Order contains expensive items: item OLJCESPC7Z costs $75.00 which exceeds the threshold of $25',
        traceId,
        spanId,
        technicalDetails: this.generateTechnicalDetails()
      };
    } catch (error) {
      console.error('Checkout simulation failed:', error.message);
      throw error;
    }
  }

  generateTraceId() {
    return Array.from({length: 32}, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  generateSpanId() {
    return Array.from({length: 16}, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  generateTechnicalDetails() {
    return `
=== TECHNICAL BUG REPORT ===
ISSUE: Checkout failure due to expensive items blocking order completion
SEVERITY: HIGH - Business Logic Error
COMPONENT: Checkout Service (src/checkout/main.go)

ERROR ANALYSIS:
- Original Error: item OLJCESPC7Z costs $75.00 which exceeds the threshold of $25
- Error Location: checkExpensiveItems() function, line ~650
- Failure Point: PlaceOrder() method, line ~270
- Feature Flag: checkoutFailureThreshold = 25
- Error Type: Business logic validation failure

TRACE CONTEXT:
- Service: checkout
- Operation: PlaceOrder
- User ID: demo-user-123
- Cart Items: 1 item (OLJCESPC7Z - Vintage Typewriter)
- Total Value: $75.00 USD

ITEM ANALYSIS:
- Item 1: OLJCESPC7Z
  * Price: $75.00 USD
  * Quantity: 1
  * Exceeds Threshold: true (threshold: $25)

ROOT CAUSE ANALYSIS:
The checkout service implements a business rule that prevents orders
containing items above a configurable price threshold. This is controlled
by the 'checkoutFailureThreshold' feature flag.

BUSINESS IMPACT:
- Customer cannot complete purchase of expensive items
- Revenue loss for high-value transactions
- Poor user experience with unclear error handling
- No alternative checkout flow for expensive items

RECOMMENDED SOLUTION:
1. Review business logic for expensive item handling
2. Consider implementing tiered approval process
3. Add better user messaging for threshold violations
4. Implement alternative payment flows for high-value items

MONITORING LINKS:
- Service Dashboard: http://grafana:3000/d/demo-dashboard
- Trace Details: http://jaeger-query:16686/trace/{traceId}
- Service Logs: Available in OpenSearch
- Recent Deployments: Check CI/CD pipeline status
    `.trim();
  }

  async createIncidentFromCheckoutFailure(checkoutResult, workflowType = 'manual') {
    const incidentData = {
      serviceName: 'checkout',
      title: 'Checkout Service Failure - Expensive Items Blocked',
      description: 'Customers unable to complete checkout for orders containing expensive items above $25 threshold',
      severity: 'high',
      workflowType,
      traceId: checkoutResult.traceId,
      spanId: checkoutResult.spanId,
      errorDetails: checkoutResult.technicalDetails,
      tags: ['demo', 'checkout-failure', workflowType + '-workflow']
    };

    return incidentData;
  }

  async monitorCheckoutHealth() {
    // Monitor checkout service health and detect failures
    try {
      const response = await axios.get(`${this.checkoutUrl}/health`, {
        timeout: 5000
      });
      
      return {
        healthy: response.status === 200,
        status: response.data
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  // Simulate different types of checkout failures for demo purposes
  async simulateFailureScenario(scenarioType) {
    const scenarios = {
      'expensive-items': {
        description: 'Items exceed price threshold',
        threshold: 25,
        itemPrice: 75
      },
      'payment-failure': {
        description: 'Payment processing failure',
        threshold: 0,
        paymentError: true
      },
      'inventory-shortage': {
        description: 'Insufficient inventory',
        threshold: 0,
        inventoryError: true
      }
    };

    const scenario = scenarios[scenarioType] || scenarios['expensive-items'];
    
    // Enable the appropriate failure condition
    if (scenarioType === 'expensive-items') {
      await this.enableCheckoutFailure();
    }

    // Simulate the checkout attempt
    const result = await this.simulateCheckoutAttempt();
    
    return {
      scenario: scenarioType,
      ...result,
      scenarioDetails: scenario
    };
  }
}

module.exports = CheckoutIntegration;
