// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

package main

import (
	"testing"

	pb "github.com/opentelemetry/opentelemetry-demo/src/support/genproto/oteldemo"
)

func TestBuildJiraDescriptionContent(t *testing.T) {
	service := &supportService{}
	
	// Create a sample request
	req := &pb.CreateSupportRequestRequest{
		UserId:       "test-user-123",
		Email:        "test@example.com",
		Subject:      "Checkout Failed - Need Assistance",
		Description:  "Test description",
		ErrorMessage: "Order contains expensive items: item 66VCHSJNUP costs $349.95 which exceeds the threshold of $25",
	}

	description := "Support request from user: test-user-123\n\nEmail: test@example.com\n\nDescription: Test description\n\nError Message: Order contains expensive items: item 66VCHSJNUP costs $349.95 which exceeds the threshold of $25\n\n"

	// Test the buildJiraDescriptionContent function
	content := service.buildJiraDescriptionContent(description, req)

	// Verify that content is not empty
	if len(content) == 0 {
		t.Fatal("Expected content to be generated, but got empty slice")
	}

	// Verify that the first element contains the original description
	if content[0].Type != "paragraph" {
		t.Errorf("Expected first content type to be 'paragraph', got '%s'", content[0].Type)
	}

	// Verify that we have a rule separator
	foundRule := false
	for _, item := range content {
		if item.Type == "rule" {
			foundRule = true
			break
		}
	}
	if !foundRule {
		t.Error("Expected to find a 'rule' separator in content")
	}

	// Verify that we have bullet lists for instructions
	foundBulletList := false
	for _, item := range content {
		if item.Type == "bulletList" {
			foundBulletList = true
			break
		}
	}
	if !foundBulletList {
		t.Error("Expected to find at least one 'bulletList' in content")
	}

	// Verify that we have paragraphs with Augment Code instructions
	foundAugmentInstructions := false
	for _, item := range content {
		if item.Type == "paragraph" {
			if textContent, ok := item.Content.([]JiraText); ok {
				for _, text := range textContent {
					if text.Text == "=== AUGMENT CODE INSTRUCTIONS ===" {
						foundAugmentInstructions = true
						// Verify it has strong formatting
						if len(text.Marks) == 0 || text.Marks[0].Type != "strong" {
							t.Error("Expected Augment Code instructions to be marked as strong")
						}
						break
					}
				}
			}
		}
		if foundAugmentInstructions {
			break
		}
	}
	if !foundAugmentInstructions {
		t.Error("Expected to find Augment Code instructions in content")
	}

	t.Logf("Successfully generated Jira content with %d elements", len(content))
}

func TestJiraContentStructure(t *testing.T) {
	// Test that our Jira content structures are properly formed
	service := &supportService{}
	
	req := &pb.CreateSupportRequestRequest{
		UserId:      "test-user",
		Email:       "test@example.com",
		Subject:     "Test Subject",
		Description: "Test Description",
	}

	description := "Test description content"
	content := service.buildJiraDescriptionContent(description, req)

	// Verify each content item has the required fields
	for i, item := range content {
		if item.Type == "" {
			t.Errorf("Content item %d has empty Type field", i)
		}

		// For paragraph types, verify content structure
		if item.Type == "paragraph" {
			if item.Content == nil {
				t.Errorf("Paragraph content item %d has nil Content", i)
			}
		}

		// For bulletList types, verify content structure
		if item.Type == "bulletList" {
			if item.Content == nil {
				t.Errorf("BulletList content item %d has nil Content", i)
			}
		}
	}
}
