// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/sirupsen/logrus"
	"go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc"
	"go.opentelemetry.io/contrib/instrumentation/runtime"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	sdkresource "go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/status"

	pb "github.com/opentelemetry/opentelemetry-demo/src/support/genproto/oteldemo"
)

var (
	logger *logrus.Logger
	tracer trace.Tracer
)

type supportService struct {
	pb.UnimplementedSupportServiceServer
	jiraConfig  JiraConfig
	slackConfig SlackConfig
}

type JiraConfig struct {
	URL      string
	Username string
	APIToken string
	Project  string
}

type SlackConfig struct {
	WebhookURL string
	Channel    string
}

type JiraIssue struct {
	Fields JiraFields `json:"fields"`
}

type JiraFields struct {
	Project     JiraProject     `json:"project"`
	Summary     string          `json:"summary"`
	Description JiraDescription `json:"description"`
	IssueType   JiraIssueType   `json:"issuetype"`
}

type JiraProject struct {
	Key string `json:"key"`
}

type JiraDescription struct {
	Type    string        `json:"type"`
	Version int           `json:"version"`
	Content []JiraContent `json:"content"`
}

type JiraContent struct {
	Type    string      `json:"type"`
	Content interface{} `json:"content,omitempty"`
}

type JiraText struct {
	Type  string     `json:"type"`
	Text  string     `json:"text,omitempty"`
	Marks []JiraMark `json:"marks,omitempty"`
}

type JiraMark struct {
	Type string `json:"type"`
}

type JiraListItem struct {
	Type    string        `json:"type"`
	Content []JiraContent `json:"content"`
}

type JiraIssueType struct {
	Name string `json:"name"`
}

type JiraResponse struct {
	ID  string `json:"id"`
	Key string `json:"key"`
}

type SlackMessage struct {
	Channel     string            `json:"channel,omitempty"`
	Text        string            `json:"text"`
	Attachments []SlackAttachment `json:"attachments,omitempty"`
}

type SlackAttachment struct {
	Color     string       `json:"color"`
	Title     string       `json:"title"`
	TitleLink string       `json:"title_link"`
	Text      string       `json:"text"`
	Fields    []SlackField `json:"fields"`
	Footer    string       `json:"footer"`
	Timestamp int64        `json:"ts"`
}

type SlackField struct {
	Title string `json:"title"`
	Value string `json:"value"`
	Short bool   `json:"short"`
}

func init() {
	logger = logrus.New()
	logger.SetLevel(logrus.InfoLevel)
	logger.SetFormatter(&logrus.JSONFormatter{
		FieldMap: logrus.FieldMap{
			logrus.FieldKeyTime:  "timestamp",
			logrus.FieldKeyLevel: "severity",
			logrus.FieldKeyMsg:   "message",
		},
		TimestampFormat: time.RFC3339Nano,
	})
	logger.SetOutput(os.Stdout)
}

func initTracerProvider() *sdktrace.TracerProvider {
	ctx := context.Background()

	exporter, err := otlptracegrpc.New(ctx)
	if err != nil {
		log.Fatalf("new otlp trace grpc exporter failed: %v", err)
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(initResource()),
	)
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))
	return tp
}

func initMeterProvider() *sdkmetric.MeterProvider {
	ctx := context.Background()

	exporter, err := otlpmetricgrpc.New(ctx)
	if err != nil {
		log.Fatalf("new otlp metric grpc exporter failed: %v", err)
	}

	mp := sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(exporter)),
		sdkmetric.WithResource(initResource()),
	)
	otel.SetMeterProvider(mp)
	return mp
}

func initResource() *sdkresource.Resource {
	extraResources, _ := sdkresource.New(
		context.Background(),
		sdkresource.WithOS(),
		sdkresource.WithProcess(),
		sdkresource.WithContainer(),
		sdkresource.WithHost(),
	)
	resource, _ := sdkresource.Merge(
		sdkresource.Default(),
		extraResources,
	)
	return resource
}

func main() {
	ctx := context.Background()
	tp := initTracerProvider()
	defer func() {
		if err := tp.Shutdown(ctx); err != nil {
			log.Printf("Error shutting down tracer provider: %v", err)
		}
	}()

	mp := initMeterProvider()
	defer func() {
		if err := mp.Shutdown(ctx); err != nil {
			log.Printf("Error shutting down meter provider: %v", err)
		}
	}()

	if err := runtime.Start(runtime.WithMinimumReadMemStatsInterval(time.Second)); err != nil {
		log.Fatal(err)
	}

	tracer = tp.Tracer("support")

	port := os.Getenv("SUPPORT_PORT")
	if port == "" {
		port = "8080"
	}

	svc := &supportService{
		jiraConfig: JiraConfig{
			URL:      getEnvOrDefault("JIRA_URL", ""),
			Username: getEnvOrDefault("JIRA_USERNAME", ""),
			APIToken: getEnvOrDefault("JIRA_API_TOKEN", ""),
			Project:  getEnvOrDefault("JIRA_PROJECT", "DEMO"),
		},
		slackConfig: SlackConfig{
			WebhookURL: getEnvOrDefault("SLACK_WEBHOOK_URL", ""),
			Channel:    getEnvOrDefault("SLACK_CHANNEL", "#support"),
		},
	}

	logger.Infof("Support service starting on port %s", port)
	logger.Infof("Jira config: URL=%s, Project=%s", svc.jiraConfig.URL, svc.jiraConfig.Project)
	logger.Infof("Slack config: Channel=%s, WebhookURL configured=%t", svc.slackConfig.Channel, svc.slackConfig.WebhookURL != "")

	lis, err := net.Listen("tcp", fmt.Sprintf(":%s", port))
	if err != nil {
		log.Fatal(err)
	}

	srv := grpc.NewServer(
		grpc.StatsHandler(otelgrpc.NewServerHandler()),
	)
	pb.RegisterSupportServiceServer(srv, svc)
	healthpb.RegisterHealthServer(srv, svc)

	logger.Infof("Support service listening on %s", lis.Addr().String())
	if err := srv.Serve(lis); err != nil {
		log.Fatal(err)
	}
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func (s *supportService) Check(ctx context.Context, req *healthpb.HealthCheckRequest) (*healthpb.HealthCheckResponse, error) {
	return &healthpb.HealthCheckResponse{Status: healthpb.HealthCheckResponse_SERVING}, nil
}

func (s *supportService) Watch(req *healthpb.HealthCheckRequest, ws healthpb.Health_WatchServer) error {
	return status.Errorf(codes.Unimplemented, "health check via Watch not implemented")
}

func (s *supportService) CreateSupportRequest(ctx context.Context, req *pb.CreateSupportRequestRequest) (*pb.CreateSupportRequestResponse, error) {
	span := trace.SpanFromContext(ctx)
	span.SetAttributes(
		attribute.String("app.user.id", req.UserId),
		attribute.String("app.user.email", req.Email),
		attribute.String("app.support.subject", req.Subject),
	)

	logger.Infof("[CreateSupportRequest] user_id=%q email=%q subject=%q", req.UserId, req.Email, req.Subject)

	// Generate unique ID for the support request
	supportID, err := uuid.NewUUID()
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to generate support request ID: %v", err)
	}

	// Create Jira ticket if configured
	var jiraTicketID string
	logger.Infof("Jira config check: URL=%q, APIToken configured=%t", s.jiraConfig.URL, s.jiraConfig.APIToken != "")
	if s.jiraConfig.URL != "" && s.jiraConfig.APIToken != "" {
		logger.Infof("Creating Jira ticket with Augment Code instructions...")
		jiraTicketID, err = s.createJiraTicket(ctx, req)
		if err != nil {
			logger.Warnf("Failed to create Jira ticket: %v", err)
			span.AddEvent("jira_ticket_creation_failed", trace.WithAttributes(
				attribute.String("error", err.Error()),
			))
		} else {
			logger.Infof("Created Jira ticket: %s", jiraTicketID)
			span.AddEvent("jira_ticket_created", trace.WithAttributes(
				attribute.String("jira.ticket.id", jiraTicketID),
			))

			// Send Slack notification if configured
			if s.slackConfig.WebhookURL != "" {
				err = s.sendSlackNotification(ctx, req, jiraTicketID)
				if err != nil {
					logger.Warnf("Failed to send Slack notification: %v", err)
					span.AddEvent("slack_notification_failed", trace.WithAttributes(
						attribute.String("error", err.Error()),
					))
				} else {
					logger.Infof("Sent Slack notification for Jira ticket: %s", jiraTicketID)
					span.AddEvent("slack_notification_sent", trace.WithAttributes(
						attribute.String("jira.ticket.id", jiraTicketID),
					))
				}
			}
		}
	} else {
		logger.Warnf("Jira not configured - skipping ticket creation. URL=%q, APIToken configured=%t", s.jiraConfig.URL, s.jiraConfig.APIToken != "")
	}

	// Create support request response
	supportRequest := &pb.SupportRequest{
		Id:              supportID.String(),
		UserId:          req.UserId,
		Email:           req.Email,
		Subject:         req.Subject,
		Description:     req.Description,
		ErrorMessage:    req.ErrorMessage,
		FailedItems:     req.FailedItems,
		ShippingAddress: req.ShippingAddress,
		Status:          "CREATED",
		JiraTicketId:    jiraTicketID,
		CreatedAt:       time.Now().Unix(),
	}

	span.SetAttributes(
		attribute.String("app.support.id", supportRequest.Id),
		attribute.String("app.support.status", supportRequest.Status),
		attribute.String("app.jira.ticket.id", jiraTicketID),
	)

	return &pb.CreateSupportRequestResponse{
		SupportRequest: supportRequest,
	}, nil
}

func (s *supportService) GetSupportRequest(ctx context.Context, req *pb.GetSupportRequestRequest) (*pb.SupportRequest, error) {
	span := trace.SpanFromContext(ctx)
	span.SetAttributes(
		attribute.String("app.support.id", req.Id),
	)

	logger.Infof("[GetSupportRequest] id=%q", req.Id)

	// For now, return a simple response indicating the feature is not fully implemented
	// In a real implementation, this would fetch from a database
	return nil, status.Errorf(codes.Unimplemented, "GetSupportRequest not yet implemented - use CreateSupportRequest to create tickets")
}

func (s *supportService) createJiraTicket(ctx context.Context, req *pb.CreateSupportRequestRequest) (string, error) {
	span := trace.SpanFromContext(ctx)
	span.SetAttributes(
		attribute.String("jira.url", s.jiraConfig.URL),
		attribute.String("jira.project", s.jiraConfig.Project),
	)

	// Build description with order details
	description := fmt.Sprintf("Support request from user: %s\n\nEmail: %s\n\nDescription: %s\n\nError Message: %s\n\n",
		req.UserId, req.Email, req.Description, req.ErrorMessage)

	if len(req.FailedItems) > 0 {
		description += "Failed Items:\n"
		for _, item := range req.FailedItems {
			description += fmt.Sprintf("- Product ID: %s, Quantity: %d\n", item.Item.ProductId, item.Item.Quantity)
		}
	}

	if req.ShippingAddress != nil {
		description += fmt.Sprintf("\nShipping Address:\n%s\n%s, %s %s\n%s\n",
			req.ShippingAddress.StreetAddress,
			req.ShippingAddress.City,
			req.ShippingAddress.State,
			req.ShippingAddress.ZipCode,
			req.ShippingAddress.Country)
	}

	// Create Jira issue payload with Augment Code instructions
	jiraIssue := JiraIssue{
		Fields: JiraFields{
			Project: JiraProject{
				Key: s.jiraConfig.Project,
			},
			Summary: req.Subject,
			Description: JiraDescription{
				Type:    "doc",
				Version: 1,
				Content: s.buildJiraDescriptionContent(description, req),
			},
			IssueType: JiraIssueType{
				Name: "Bug",
			},
		},
	}

	// Convert to JSON
	payload, err := json.Marshal(jiraIssue)
	if err != nil {
		return "", fmt.Errorf("failed to marshal Jira issue: %v", err)
	}

	// Create HTTP request
	url := fmt.Sprintf("%s/rest/api/3/issue", s.jiraConfig.URL)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(payload))
	if err != nil {
		return "", fmt.Errorf("failed to create HTTP request: %v", err)
	}

	// Set headers
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", fmt.Sprintf("Basic %s",
		base64.StdEncoding.EncodeToString([]byte(s.jiraConfig.Username+":"+s.jiraConfig.APIToken))))

	// Make request
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("failed to make Jira API request: %v", err)
	}
	defer resp.Body.Close()

	// Check response status
	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("Jira API returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse response
	var jiraResp JiraResponse
	if err := json.NewDecoder(resp.Body).Decode(&jiraResp); err != nil {
		return "", fmt.Errorf("failed to decode Jira response: %v", err)
	}

	span.SetAttributes(
		attribute.String("jira.issue.id", jiraResp.ID),
		attribute.String("jira.issue.key", jiraResp.Key),
	)

	return jiraResp.Key, nil
}

// buildJiraDescriptionContent creates the Jira description content with Augment Code instructions
func (s *supportService) buildJiraDescriptionContent(description string, req *pb.CreateSupportRequestRequest) []JiraContent {
	logger.Infof("Building Jira description content with Augment Code instructions")

	// Add the Augment Code instructions as simple text to the description
	augmentInstructions := `

=== AUGMENT CODE INSTRUCTIONS ===

ACTION REQUESTED:
- Please review the details above and analyze the codebase for root cause.
- Summarize the specific cause (function, line, feature flag, business logic) and outline the fix you recommend.
- Before making any changes, ASK THE USER: "Would you like Augment Code to apply this fix automatically?"

If the user responds YES:
- Create a new branch named bugfix/JIRA-<ticket_id>-checkout-threshold
- Apply the code fix as outlined
- Add/modify relevant tests to cover this scenario
- Open a Pull Request on GitHub via MCP, referencing the Jira ticket and including a summary of the fix
- Notify the user via Slack when the PR is ready for review, with links to both the PR and Jira ticket

If the user responds NO:
- Stop and provide the recommended fix steps and reasoning only.`

	// Combine original description with instructions
	fullDescription := description + augmentInstructions

	logger.Infof("Full description length: %d characters", len(fullDescription))
	logger.Infof("Description preview: %s...", fullDescription[:min(200, len(fullDescription))])

	content := []JiraContent{
		{
			Type: "paragraph",
			Content: []JiraText{
				{
					Type: "text",
					Text: fullDescription,
				},
			},
		},
	}

	logger.Infof("Generated %d content elements for Jira", len(content))
	return content
}

func (s *supportService) sendSlackNotification(ctx context.Context, req *pb.CreateSupportRequestRequest, jiraTicketID string) error {
	span := trace.SpanFromContext(ctx)
	span.SetAttributes(
		attribute.String("slack.webhook.url", s.slackConfig.WebhookURL),
		attribute.String("slack.channel", s.slackConfig.Channel),
		attribute.String("jira.ticket.id", jiraTicketID),
	)

	// Build Jira ticket URL
	jiraTicketURL := fmt.Sprintf("%s/browse/%s", s.jiraConfig.URL, jiraTicketID)

	// Create Slack message
	slackMessage := SlackMessage{
		Channel: s.slackConfig.Channel,
		Text:    fmt.Sprintf("🚨 New Support Ticket Created: %s", req.Subject),
		Attachments: []SlackAttachment{
			{
				Color:     "danger",
				Title:     fmt.Sprintf("Jira Ticket: %s", jiraTicketID),
				TitleLink: jiraTicketURL,
				Text:      fmt.Sprintf("A new support ticket has been created for a checkout failure.\n\n*Error:* %s", req.ErrorMessage),
				Fields: []SlackField{
					{
						Title: "User ID",
						Value: req.UserId,
						Short: true,
					},
					{
						Title: "Email",
						Value: req.Email,
						Short: true,
					},
					{
						Title: "Subject",
						Value: req.Subject,
						Short: false,
					},
				},
				Footer:    "OpenTelemetry Demo Support",
				Timestamp: time.Now().Unix(),
			},
		},
	}

	// Add failed items if present
	if len(req.FailedItems) > 0 {
		var itemsText string
		for _, item := range req.FailedItems {
			itemsText += fmt.Sprintf("• Product ID: %s (Qty: %d)\n", item.Item.ProductId, item.Item.Quantity)
		}
		slackMessage.Attachments[0].Fields = append(slackMessage.Attachments[0].Fields, SlackField{
			Title: "Failed Items",
			Value: itemsText,
			Short: false,
		})
	}

	// Convert to JSON
	payload, err := json.Marshal(slackMessage)
	if err != nil {
		return fmt.Errorf("failed to marshal Slack message: %v", err)
	}

	// Create HTTP request
	httpReq, err := http.NewRequestWithContext(ctx, "POST", s.slackConfig.WebhookURL, bytes.NewBuffer(payload))
	if err != nil {
		return fmt.Errorf("failed to create HTTP request: %v", err)
	}

	// Set headers
	httpReq.Header.Set("Content-Type", "application/json")

	// Make request
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return fmt.Errorf("failed to make Slack webhook request: %v", err)
	}
	defer resp.Body.Close()

	// Check response status
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Slack webhook returned status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}
