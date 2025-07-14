// Real Incident Detector
// Monitors actual application behavior and triggers incidents based on real failures

const axios = require('axios');
const EventEmitter = require('events');

class RealIncidentDetector extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.checkoutUrl = options.checkoutUrl || 'http://checkout:8080';
    this.frontendUrl = options.frontendUrl || 'http://frontend:8080';
    this.checkInterval = options.checkInterval || 10000; // 10 seconds
    this.failureThreshold = options.failureThreshold || 2; // 2 failures trigger incident
    
    this.recentFailures = [];
    this.isMonitoring = false;
    this.intervalId = null;
    this.lastIncidentTime = 0;
    this.incidentCooldown = 120000; // 2 minutes between incidents
    
    console.log('🔍 Real Incident Detector initialized');
  }

  // Start monitoring for real application failures
  startMonitoring() {
    if (this.isMonitoring) {
      console.log('⚠️  Real incident monitoring already running');
      return;
    }

    this.isMonitoring = true;
    console.log('🚀 Starting real incident detection...');
    
    // Check for real failures every 10 seconds
    this.intervalId = setInterval(() => {
      this.checkForRealFailures();
    }, this.checkInterval);

    // Initial check
    this.checkForRealFailures();
  }

  // Stop monitoring
  stopMonitoring() {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('🛑 Real incident monitoring stopped');
  }

  // Check for real application failures
  async checkForRealFailures() {
    try {
      // Check multiple failure scenarios
      await Promise.all([
        this.checkCheckoutFailures(),
        this.checkFrontendErrors(),
        this.checkServiceHealth()
      ]);
      
    } catch (error) {
      console.error('❌ Error checking for real failures:', error.message);
    }
  }

  // Check for checkout service failures
  async checkCheckoutFailures() {
    try {
      // Try to simulate a checkout request that might fail
      const testPayload = {
        user_id: 'test-user-' + Date.now(),
        user_currency: 'USD',
        address: {
          street_address: '123 Test St',
          city: 'Test City',
          state: 'TS',
          country: 'US',
          zip_code: '12345'
        },
        email: 'test@example.com',
        credit_card: {
          credit_card_number: '4432-8015-6152-0454',
          credit_card_cvv: 672,
          credit_card_expiration_year: 2030,
          credit_card_expiration_month: 1
        }
      };

      // This might fail if there are real issues in the checkout service
      const response = await axios.post(`${this.checkoutUrl}/checkout`, testPayload, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // If we get here, checkout is working
      // But we can still detect patterns that indicate issues
      
    } catch (error) {
      // Real checkout failure detected!
      await this.handleRealFailure('checkout', {
        type: 'CheckoutServiceError',
        message: error.message,
        statusCode: error.response?.status,
        endpoint: '/checkout',
        timestamp: new Date()
      });
    }
  }

  // Check frontend for errors
  async checkFrontendErrors() {
    try {
      // Check if frontend is responding
      const response = await axios.get(`${this.frontendUrl}/api/products`, {
        timeout: 3000
      });
      
      // Check for error patterns in response
      if (response.status >= 400) {
        await this.handleRealFailure('frontend', {
          type: 'FrontendError',
          message: `Frontend returned ${response.status}`,
          statusCode: response.status,
          endpoint: '/api/products',
          timestamp: new Date()
        });
      }
      
    } catch (error) {
      // Frontend failure detected
      await this.handleRealFailure('frontend', {
        type: 'FrontendServiceError',
        message: error.message,
        statusCode: error.response?.status,
        endpoint: '/api/products',
        timestamp: new Date()
      });
    }
  }

  // Check overall service health
  async checkServiceHealth() {
    const services = [
      { name: 'cart', url: 'http://cart:7070/cart/health' },
      { name: 'payment', url: 'http://payment:50051' }, // gRPC service
      { name: 'product-catalog', url: 'http://product-catalog:3550/products' }
    ];

    for (const service of services) {
      try {
        if (service.name === 'payment') {
          // Skip gRPC health check for now
          continue;
        }
        
        await axios.get(service.url, { timeout: 2000 });
        
      } catch (error) {
        await this.handleRealFailure(service.name, {
          type: 'ServiceHealthError',
          message: `${service.name} health check failed: ${error.message}`,
          statusCode: error.response?.status,
          endpoint: service.url,
          timestamp: new Date()
        });
      }
    }
  }

  // Handle a real failure detection
  async handleRealFailure(serviceName, failureDetails) {
    const now = Date.now();
    
    // Add to recent failures
    this.recentFailures.push({
      service: serviceName,
      timestamp: now,
      details: failureDetails
    });
    
    // Clean old failures (older than 5 minutes)
    const cutoff = now - 300000;
    this.recentFailures = this.recentFailures.filter(f => f.timestamp > cutoff);
    
    // Check if we should trigger an incident
    const serviceFailures = this.recentFailures.filter(f => f.service === serviceName);
    
    if (serviceFailures.length >= this.failureThreshold && 
        (now - this.lastIncidentTime) > this.incidentCooldown) {
      
      await this.triggerRealIncident(serviceName, serviceFailures);
      this.lastIncidentTime = now;
      
      // Clear failures for this service to prevent duplicate incidents
      this.recentFailures = this.recentFailures.filter(f => f.service !== serviceName);
    }
  }

  // Trigger incident based on real failure
  async triggerRealIncident(serviceName, failures) {
    const latestFailure = failures[failures.length - 1];
    
    const incidentData = {
      title: `${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)} Service Failure`,
      description: `Real failure detected in ${serviceName} service. ${failures.length} failures in the last 5 minutes.`,
      severity: this.determineSeverity(serviceName, failures),
      service: serviceName,
      workflowType: 'augment',
      traceId: `real-trace-${Date.now()}-${serviceName}`,
      errorDetails: {
        errorType: latestFailure.details.type,
        message: latestFailure.details.message,
        statusCode: latestFailure.details.statusCode,
        affectedEndpoint: latestFailure.details.endpoint,
        failureCount: failures.length,
        timeWindow: '5 minutes'
      },
      source: 'real-incident-detector',
      detectionMethod: 'application-monitoring',
      realFailure: true
    };
    
    console.log(`🚨 REAL APPLICATION FAILURE DETECTED: ${serviceName} (${failures.length} failures)`);
    console.log(`📋 Error: ${latestFailure.details.message}`);
    
    // Emit incident event
    this.emit('real-incident-detected', incidentData);
  }

  // Determine incident severity based on service and failure pattern
  determineSeverity(serviceName, failures) {
    // Critical services
    if (['checkout', 'payment', 'frontend'].includes(serviceName)) {
      return failures.length >= 3 ? 'critical' : 'high';
    }
    
    // Supporting services
    if (['cart', 'product-catalog'].includes(serviceName)) {
      return failures.length >= 5 ? 'high' : 'medium';
    }
    
    return 'medium';
  }

  // Manually trigger an incident (for demo purposes)
  async triggerDemoIncident() {
    const now = Date.now();
    
    // Don't trigger if we're in cooldown
    if ((now - this.lastIncidentTime) < this.incidentCooldown) {
      console.log('⏳ Demo incident trigger in cooldown period');
      return false;
    }
    
    const demoIncidentData = {
      title: 'Checkout Service Failure',
      description: 'Demo: Simulated real checkout failure for high-value items',
      severity: 'high',
      service: 'checkout',
      workflowType: 'augment',
      traceId: `demo-real-trace-${now}`,
      errorDetails: {
        errorType: 'ValidationError',
        message: 'Cart total validation failed for items over $25',
        statusCode: 500,
        affectedEndpoint: '/api/checkout/process',
        stackTrace: 'at validateCart (checkout.js:142)\n  at processOrder (checkout.js:89)'
      },
      source: 'real-incident-detector',
      detectionMethod: 'demo-trigger',
      realFailure: false,
      demoTriggered: true
    };
    
    console.log('🎭 Demo incident triggered (simulating real failure)');
    this.emit('real-incident-detected', demoIncidentData);
    this.lastIncidentTime = now;
    
    return true;
  }

  // Get monitoring status
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      recentFailures: this.recentFailures.length,
      lastIncidentTime: this.lastIncidentTime,
      failureThreshold: this.failureThreshold,
      checkInterval: this.checkInterval,
      services: ['checkout', 'frontend', 'cart', 'payment', 'product-catalog']
    };
  }
}

module.exports = RealIncidentDetector;
