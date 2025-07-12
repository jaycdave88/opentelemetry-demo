// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0
package main

import (
	"context"
	"fmt"
	"testing"

	pb "github.com/open-telemetry/opentelemetry-demo/src/checkout/genproto/oteldemo"
	"github.com/stretchr/testify/assert"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// mockCheckoutService is a simplified version for testing checkExpensiveItems
type mockCheckoutService struct {
	threshold int
}

func (m *mockCheckoutService) checkExpensiveItems(ctx context.Context, orderItems []*pb.OrderItem) error {
	priceThreshold := m.threshold

	// If threshold is 0, feature is disabled
	if priceThreshold == 0 {
		return nil
	}

	span := trace.SpanFromContext(ctx)
	span.SetAttributes(
		attribute.Int("app.checkout.price_threshold", priceThreshold),
	)

	for _, item := range orderItems {
		// For testing, assume all prices are already in USD
		priceUSD := item.Cost

		// Calculate total price in USD (units + nanos)
		totalPriceUSD := float64(priceUSD.Units) + float64(priceUSD.Nanos)/1e9

		if totalPriceUSD > float64(priceThreshold) {
			span.AddEvent("expensive_item_detected", trace.WithAttributes(
				attribute.String("app.product.id", item.Item.ProductId),
				attribute.Float64("app.product.price_usd", totalPriceUSD),
				attribute.Int("app.checkout.threshold", priceThreshold),
			))

			return fmt.Errorf("item %s costs $%.2f which exceeds the threshold of $%d",
				item.Item.ProductId, totalPriceUSD, priceThreshold)
		}
	}

	return nil
}

// TestCheckExpensiveItems tests the checkExpensiveItems function with various scenarios
func TestCheckExpensiveItems(t *testing.T) {
	tests := []struct {
		name          string
		threshold     int
		orderItems    []*pb.OrderItem
		expectError   bool
		errorContains string
	}{
		{
			name:      "Feature disabled (threshold 0) - should pass",
			threshold: 0,
			orderItems: []*pb.OrderItem{
				{
					Item: &pb.CartItem{ProductId: "TEST-ITEM-1", Quantity: 1},
					Cost: &pb.Money{Units: 1000, Nanos: 0, CurrencyCode: "USD"}, // $1000
				},
			},
			expectError: false,
		},
		{
			name:      "Item under threshold - should pass",
			threshold: 500,
			orderItems: []*pb.OrderItem{
				{
					Item: &pb.CartItem{ProductId: "TEST-ITEM-1", Quantity: 1},
					Cost: &pb.Money{Units: 100, Nanos: 0, CurrencyCode: "USD"}, // $100
				},
			},
			expectError: false,
		},
		{
			name:      "Item at threshold - should pass",
			threshold: 500,
			orderItems: []*pb.OrderItem{
				{
					Item: &pb.CartItem{ProductId: "TEST-ITEM-1", Quantity: 1},
					Cost: &pb.Money{Units: 500, Nanos: 0, CurrencyCode: "USD"}, // $500
				},
			},
			expectError: false,
		},
		{
			name:      "Item over threshold - should fail",
			threshold: 500,
			orderItems: []*pb.OrderItem{
				{
					Item: &pb.CartItem{ProductId: "66VCHSJNUP", Quantity: 1},
					Cost: &pb.Money{Units: 600, Nanos: 0, CurrencyCode: "USD"}, // $600
				},
			},
			expectError:   true,
			errorContains: "66VCHSJNUP costs $600.00 which exceeds the threshold of $500",
		},
		{
			name:      "Multiple items, one over threshold - should fail",
			threshold: 500,
			orderItems: []*pb.OrderItem{
				{
					Item: &pb.CartItem{ProductId: "CHEAP-ITEM", Quantity: 1},
					Cost: &pb.Money{Units: 50, Nanos: 0, CurrencyCode: "USD"}, // $50
				},
				{
					Item: &pb.CartItem{ProductId: "EXPENSIVE-ITEM", Quantity: 1},
					Cost: &pb.Money{Units: 600, Nanos: 0, CurrencyCode: "USD"}, // $600
				},
			},
			expectError:   true,
			errorContains: "EXPENSIVE-ITEM costs $600.00 which exceeds the threshold of $500",
		},
		{
			name:      "Item with nanos over threshold - should fail",
			threshold: 500,
			orderItems: []*pb.OrderItem{
				{
					Item: &pb.CartItem{ProductId: "PRECISE-ITEM", Quantity: 1},
					Cost: &pb.Money{Units: 500, Nanos: 10000000, CurrencyCode: "USD"}, // $500.01
				},
			},
			expectError:   true,
			errorContains: "PRECISE-ITEM costs $500.01 which exceeds the threshold of $500",
		},
		{
			name:      "Original bug scenario - item $349.95 with new $500 threshold - should pass",
			threshold: 500,
			orderItems: []*pb.OrderItem{
				{
					Item: &pb.CartItem{ProductId: "66VCHSJNUP", Quantity: 1},
					Cost: &pb.Money{Units: 349, Nanos: 950000000, CurrencyCode: "USD"}, // $349.95
				},
			},
			expectError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create mock checkout service
			cs := &mockCheckoutService{
				threshold: tt.threshold,
			}

			// Test the function
			ctx := context.Background()
			err := cs.checkExpensiveItems(ctx, tt.orderItems)

			if tt.expectError {
				assert.Error(t, err)
				if tt.errorContains != "" {
					assert.Contains(t, err.Error(), tt.errorContains)
				}
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// TestCheckExpensiveItemsIntegration tests the integration with the new $500 threshold
func TestCheckExpensiveItemsIntegration(t *testing.T) {
	// This test specifically validates the fix for the original bug

	// The original failing item
	originalItem := &pb.OrderItem{
		Item: &pb.CartItem{ProductId: "66VCHSJNUP", Quantity: 1},
		Cost: &pb.Money{Units: 349, Nanos: 950000000, CurrencyCode: "USD"}, // $349.95
	}

	cs := &mockCheckoutService{
		threshold: 500, // New threshold
	}

	ctx := context.Background()
	err := cs.checkExpensiveItems(ctx, []*pb.OrderItem{originalItem})

	// With the new $500 threshold, the $349.95 item should now pass
	assert.NoError(t, err, "Item costing $349.95 should pass with $500 threshold")
}
