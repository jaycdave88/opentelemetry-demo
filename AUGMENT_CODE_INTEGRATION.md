# Augment Code Integration for Bug Reporting

## Overview

This document describes the implementation of automatic Augment Code instructions in Jira tickets created through the OpenTelemetry Demo's bug reporting workflow.

## Changes Made

### 1. Enhanced Jira Content Structure

Updated the Jira content types in `src/support/main.go` to support Atlassian Document Format:

- Extended `JiraContent` struct to use `interface{}` for flexible content types
- Added `JiraMark` struct for text formatting (bold, italic, etc.)
- Added `JiraListItem` struct for bullet lists
- Enhanced `JiraText` struct to support marks/formatting

### 2. Automatic Augment Code Instructions

Created `buildJiraDescriptionContent()` method that automatically appends standardized Augment Code instructions to every Jira ticket created through the support service.

**Instructions included:**
- Root cause analysis request
- Fix recommendation request  
- User permission prompt before applying fixes
- Automated workflow steps (branch creation, PR creation, Slack notifications)
- Fallback instructions for manual fixes

### 3. Integration Points

The instructions are automatically added when:
- User encounters checkout failure in the frontend
- "Need Help?" button is clicked
- Support ticket is created via the support service
- Jira ticket is generated with full context and instructions

## Technical Implementation

### Key Files Modified

1. **`src/support/main.go`**
   - Enhanced Jira struct definitions
   - Added `buildJiraDescriptionContent()` method
   - Modified `createJiraTicket()` to use new content builder

2. **`src/support/main_test.go`** (new)
   - Unit tests for content generation
   - Validation of Jira content structure

### Content Structure

The Jira ticket now includes:

1. **Original Support Request Details**
   - User information
   - Error messages
   - Failed items
   - Shipping address

2. **Augment Code Instructions Section**
   - Formatted with horizontal rule separator
   - Bold headers for clear visibility
   - Structured bullet lists for action items
   - Conditional workflows based on user response

## Configuration

### Environment Variables

The support service uses these environment variables (already configured in docker-compose.yml):

```bash
JIRA_URL=https://your-jira-instance.atlassian.net
JIRA_USERNAME=your-username
JIRA_API_TOKEN=your-api-token
JIRA_PROJECT=DEMO
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
SLACK_CHANNEL=#support
```

### Docker Compose

The support service is already configured in `docker-compose.yml` with all necessary environment variables.

## Testing

### Unit Tests

Run the unit tests to verify the implementation:

```bash
cd src/support
go test -v
```

### Integration Testing

1. **Start the demo environment:**
   ```bash
   docker-compose up -d
   ```

2. **Configure Jira credentials** in your environment or docker-compose.yml

3. **Trigger a checkout failure:**
   - Add expensive items to cart (>$25)
   - Proceed to checkout
   - Click "Need Help?" when checkout fails

4. **Verify Jira ticket creation:**
   - Check that ticket is created in your Jira project
   - Verify Augment Code instructions are included
   - Confirm Slack notification is sent (if configured)

## Workflow Example

When a user encounters a checkout failure:

1. **Frontend Error**: User sees checkout failure with "Need Help?" button
2. **Support Request**: User fills out support form and submits
3. **Jira Ticket Creation**: Support service creates ticket with:
   - Original error details and context
   - Automatic Augment Code instructions
4. **Slack Notification**: Team receives notification with Jira link
5. **Augment Code Analysis**: When Augment Code accesses the ticket via MCP:
   - Sees clear instructions for analysis and fix workflow
   - Follows structured process for branch creation and PR submission
   - Provides user permission prompts before making changes

## Benefits

- **Standardized Process**: Every bug report includes consistent Augment Code instructions
- **Automated Workflow**: Clear steps for Augment Code to follow when fixing issues
- **User Control**: Permission prompts ensure user approval before code changes
- **Traceability**: Branch naming and PR references link back to Jira tickets
- **Team Notifications**: Slack integration keeps team informed of progress

## Future Enhancements

- Dynamic instruction customization based on error type
- Integration with GitHub Actions for automated testing
- Enhanced Slack notifications with PR status updates
- Custom field mapping for different issue types
