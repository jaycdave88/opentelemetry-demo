# Slack Integration Setup Guide

## Overview
The support service now includes Slack integration that sends notifications when Jira tickets are created. This allows your team to be immediately notified of support requests with direct links to the Jira tickets.

## Setup Steps

### 1. Create a Slack Webhook URL

1. Go to your Slack workspace
2. Navigate to **Apps** → **Manage** → **Custom Integrations** → **Incoming Webhooks**
3. Click **Add to Slack**
4. Choose the channel where you want notifications (e.g., `#support`)
5. Click **Add Incoming WebHooks Integration**
6. Copy the **Webhook URL** (it will look like: `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX`)

### 2. Configure Environment Variables

Update your `.env` file with the Slack webhook URL:

```bash
# Slack Integration (optional - leave empty to disable)
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
SLACK_CHANNEL="#support"
```

### 3. Restart the Support Service

After updating the environment variables, restart the support service:

```bash
# If using make
make restart service=support

# Or restart the entire demo
make stop
make start
```

## Testing the Integration

### 1. Trigger a Checkout Failure

1. Open the demo at http://localhost:8080
2. Add items to your cart with a total value over $25 (the default checkout failure threshold)
3. Go to checkout and try to place the order
4. You should see a checkout error

### 2. Create a Support Request

1. Click the **"Need Help?"** button that appears with the error
2. Fill out the support request form
3. Click **"Create Support Ticket"**

### 3. Verify the Workflow

You should see:
1. A success message with the Jira ticket ID
2. A new ticket created in your Jira project
3. A Slack notification sent to your configured channel

## Slack Message Format

The Slack notification will include:
- 🚨 Alert emoji and subject line
- Jira ticket number with clickable link
- Error message details
- User information (ID and email)
- Failed cart items (if any)
- Timestamp

## Troubleshooting

### Check Logs
```bash
docker logs support
```

Look for messages like:
- `Slack config: Channel=#support, WebhookURL configured=true`
- `Sent Slack notification for Jira ticket: ECS-XXX`
- `Failed to send Slack notification: [error details]`

### Common Issues

1. **Webhook URL not configured**: Ensure `SLACK_WEBHOOK_URL` is set in `.env`
2. **Invalid webhook URL**: Verify the URL is correct and the webhook is active
3. **Channel permissions**: Ensure the webhook has permission to post to the specified channel
4. **Network issues**: Check if the support service can reach Slack's servers

### Testing Without Checkout Failure

You can also test by directly calling the support API:

```bash
curl -X POST http://localhost:8080/api/support \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "email": "test@example.com",
    "subject": "Test Support Request",
    "description": "This is a test",
    "errorMessage": "Test error message"
  }'
```

## Next Steps

Once the Slack integration is working, you can:
1. Customize the Slack message format in `src/support/main.go`
2. Add more fields or formatting
3. Set up different channels for different types of issues
4. Add Slack buttons for common actions (coming in future updates)
