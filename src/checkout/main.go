// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"go.opentelemetry.io/otel/attribute"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
	"go.opentelemetry.io/otel/trace"

	"github.com/IBM/sarama"
	"github.com/google/uuid"
	otelhooks "github.com/open-feature/go-sdk-contrib/hooks/open-telemetry/pkg"
	flagd "github.com/open-feature/go-sdk-contrib/providers/flagd/pkg"
	"github.com/open-feature/go-sdk/openfeature"
	"github.com/sirupsen/logrus"
	"go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/contrib/instrumentation/runtime"
	"go.opentelemetry.io/otel"
	otelcodes "go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	sdkresource "go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"

	pb "github.com/open-telemetry/opentelemetry-demo/src/checkout/genproto/oteldemo"
	"github.com/open-telemetry/opentelemetry-demo/src/checkout/kafka"
	"github.com/open-telemetry/opentelemetry-demo/src/checkout/money"
)

//go:generate go install google.golang.org/protobuf/cmd/protoc-gen-go
//go:generate go install google.golang.org/grpc/cmd/protoc-gen-go-grpc
//go:generate protoc --go_out=./ --go-grpc_out=./ --proto_path=../../pb ../../pb/demo.proto

var log *logrus.Logger
var tracer trace.Tracer
var resource *sdkresource.Resource
var initResourcesOnce sync.Once

func init() {
	log = logrus.New()
	log.Level = logrus.DebugLevel
	log.Formatter = &logrus.JSONFormatter{
		FieldMap: logrus.FieldMap{
			logrus.FieldKeyTime:  "timestamp",
			logrus.FieldKeyLevel: "severity",
			logrus.FieldKeyMsg:   "message",
		},
		TimestampFormat: time.RFC3339Nano,
	}
	log.Out = os.Stdout
}

func initResource() *sdkresource.Resource {
	initResourcesOnce.Do(func() {
		extraResources, _ := sdkresource.New(
			context.Background(),
			sdkresource.WithOS(),
			sdkresource.WithProcess(),
			sdkresource.WithContainer(),
			sdkresource.WithHost(),
		)
		resource, _ = sdkresource.Merge(
			sdkresource.Default(),
			extraResources,
		)
	})
	return resource
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

type checkout struct {
	productCatalogSvcAddr string
	cartSvcAddr           string
	currencySvcAddr       string
	shippingSvcAddr       string
	emailSvcAddr          string
	paymentSvcAddr        string
	kafkaBrokerSvcAddr    string
	pb.UnimplementedCheckoutServiceServer
	KafkaProducerClient     sarama.AsyncProducer
	shippingSvcClient       pb.ShippingServiceClient
	productCatalogSvcClient pb.ProductCatalogServiceClient
	cartSvcClient           pb.CartServiceClient
	currencySvcClient       pb.CurrencyServiceClient
	emailSvcClient          pb.EmailServiceClient
	paymentSvcClient        pb.PaymentServiceClient
}

func main() {
	var port string
	mustMapEnv(&port, "CHECKOUT_PORT")

	tp := initTracerProvider()
	defer func() {
		if err := tp.Shutdown(context.Background()); err != nil {
			log.Printf("Error shutting down tracer provider: %v", err)
		}
	}()

	mp := initMeterProvider()
	defer func() {
		if err := mp.Shutdown(context.Background()); err != nil {
			log.Printf("Error shutting down meter provider: %v", err)
		}
	}()

	err := runtime.Start(runtime.WithMinimumReadMemStatsInterval(time.Second))
	if err != nil {
		log.Fatal(err)
	}

	openfeature.SetProvider(flagd.NewProvider())
	openfeature.AddHooks(otelhooks.NewTracesHook())

	tracer = tp.Tracer("checkout")

	svc := new(checkout)

	mustMapEnv(&svc.shippingSvcAddr, "SHIPPING_ADDR")
	c := mustCreateClient(svc.shippingSvcAddr)
	svc.shippingSvcClient = pb.NewShippingServiceClient(c)
	defer c.Close()

	mustMapEnv(&svc.productCatalogSvcAddr, "PRODUCT_CATALOG_ADDR")
	c = mustCreateClient(svc.productCatalogSvcAddr)
	svc.productCatalogSvcClient = pb.NewProductCatalogServiceClient(c)
	defer c.Close()

	mustMapEnv(&svc.cartSvcAddr, "CART_ADDR")
	c = mustCreateClient(svc.cartSvcAddr)
	svc.cartSvcClient = pb.NewCartServiceClient(c)
	defer c.Close()

	mustMapEnv(&svc.currencySvcAddr, "CURRENCY_ADDR")
	c = mustCreateClient(svc.currencySvcAddr)
	svc.currencySvcClient = pb.NewCurrencyServiceClient(c)
	defer c.Close()

	mustMapEnv(&svc.emailSvcAddr, "EMAIL_ADDR")
	c = mustCreateClient(svc.emailSvcAddr)
	svc.emailSvcClient = pb.NewEmailServiceClient(c)
	defer c.Close()

	mustMapEnv(&svc.paymentSvcAddr, "PAYMENT_ADDR")
	c = mustCreateClient(svc.paymentSvcAddr)
	svc.paymentSvcClient = pb.NewPaymentServiceClient(c)
	defer c.Close()

	svc.kafkaBrokerSvcAddr = os.Getenv("KAFKA_ADDR")

	if svc.kafkaBrokerSvcAddr != "" {
		svc.KafkaProducerClient, err = kafka.CreateKafkaProducer([]string{svc.kafkaBrokerSvcAddr}, log)
		if err != nil {
			log.Fatal(err)
		}
	}

	log.Infof("service config: %+v", svc)

	lis, err := net.Listen("tcp", fmt.Sprintf(":%s", port))
	if err != nil {
		log.Fatal(err)
	}

	var srv = grpc.NewServer(
		grpc.StatsHandler(otelgrpc.NewServerHandler()),
	)
	pb.RegisterCheckoutServiceServer(srv, svc)
	healthpb.RegisterHealthServer(srv, svc)
	log.Infof("starting to listen on tcp: %q", lis.Addr().String())
	err = srv.Serve(lis)
	log.Fatal(err)
}

func mustMapEnv(target *string, envKey string) {
	v := os.Getenv(envKey)
	if v == "" {
		panic(fmt.Sprintf("environment variable %q not set", envKey))
	}
	*target = v
}

func (cs *checkout) Check(ctx context.Context, req *healthpb.HealthCheckRequest) (*healthpb.HealthCheckResponse, error) {
	return &healthpb.HealthCheckResponse{Status: healthpb.HealthCheckResponse_SERVING}, nil
}

func (cs *checkout) Watch(req *healthpb.HealthCheckRequest, ws healthpb.Health_WatchServer) error {
	return status.Errorf(codes.Unimplemented, "health check via Watch not implemented")
}

func (cs *checkout) PlaceOrder(ctx context.Context, req *pb.PlaceOrderRequest) (*pb.PlaceOrderResponse, error) {
	span := trace.SpanFromContext(ctx)
	span.SetAttributes(
		attribute.String("app.user.id", req.UserId),
		attribute.String("app.user.currency", req.UserCurrency),
	)
	log.Infof("[PlaceOrder] user_id=%q user_currency=%q", req.UserId, req.UserCurrency)

	var err error
	defer func() {
		if err != nil {
			span.AddEvent("error", trace.WithAttributes(semconv.ExceptionMessageKey.String(err.Error())))
		}
	}()

	orderID, err := uuid.NewUUID()
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to generate order uuid")
	}

	prep, err := cs.prepareOrderItemsAndShippingQuoteFromCart(ctx, req.UserId, req.UserCurrency, req.Address)
	if err != nil {
		return nil, status.Errorf(codes.Internal, err.Error())
	}
	log.Infof("[DEBUG] Order preparation completed: %d items prepared", len(prep.orderItems))
	span.AddEvent("prepared")

	// Check for expensive items if feature flag is enabled
	log.Infof("[DEBUG] About to call checkExpensiveItems with %d items", len(prep.orderItems))
	if err := cs.checkExpensiveItems(ctx, prep.orderItems); err != nil {
		span.AddEvent("checkout_failed_expensive_items", trace.WithAttributes(
			attribute.String("failure.reason", err.Error()),
		))

		// Create detailed technical error for bug reporting
		technicalDetails := cs.generateTechnicalErrorDetails(ctx, prep, err)

		return nil, status.Errorf(codes.FailedPrecondition, "Order contains expensive items: %v\n\nTECHNICAL_DETAILS:%s", err, technicalDetails)
	}

	total := &pb.Money{CurrencyCode: req.UserCurrency,
		Units: 0,
		Nanos: 0}
	total = money.Must(money.Sum(total, prep.shippingCostLocalized))
	for _, it := range prep.orderItems {
		multPrice := money.MultiplySlow(it.Cost, uint32(it.GetItem().GetQuantity()))
		total = money.Must(money.Sum(total, multPrice))
	}

	txID, err := cs.chargeCard(ctx, total, req.CreditCard)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to charge card: %+v", err)
	}
	log.Infof("payment went through (transaction_id: %s)", txID)
	span.AddEvent("charged",
		trace.WithAttributes(attribute.String("app.payment.transaction.id", txID)))

	shippingTrackingID, err := cs.shipOrder(ctx, req.Address, prep.cartItems)
	if err != nil {
		return nil, status.Errorf(codes.Unavailable, "shipping error: %+v", err)
	}
	shippingTrackingAttribute := attribute.String("app.shipping.tracking.id", shippingTrackingID)
	span.AddEvent("shipped", trace.WithAttributes(shippingTrackingAttribute))

	_ = cs.emptyUserCart(ctx, req.UserId)

	orderResult := &pb.OrderResult{
		OrderId:            orderID.String(),
		ShippingTrackingId: shippingTrackingID,
		ShippingCost:       prep.shippingCostLocalized,
		ShippingAddress:    req.Address,
		Items:              prep.orderItems,
	}

	shippingCostFloat, _ := strconv.ParseFloat(fmt.Sprintf("%d.%02d", prep.shippingCostLocalized.GetUnits(), prep.shippingCostLocalized.GetNanos()/1000000000), 64)
	totalPriceFloat, _ := strconv.ParseFloat(fmt.Sprintf("%d.%02d", total.GetUnits(), total.GetNanos()/1000000000), 64)

	span.SetAttributes(
		attribute.String("app.order.id", orderID.String()),
		attribute.Float64("app.shipping.amount", shippingCostFloat),
		attribute.Float64("app.order.amount", totalPriceFloat),
		attribute.Int("app.order.items.count", len(prep.orderItems)),
		shippingTrackingAttribute,
	)

	if err := cs.sendOrderConfirmation(ctx, req.Email, orderResult); err != nil {
		log.Warnf("failed to send order confirmation to %q: %+v", req.Email, err)
	} else {
		log.Infof("order confirmation email sent to %q", req.Email)
	}

	// send to kafka only if kafka broker address is set
	if cs.kafkaBrokerSvcAddr != "" {
		log.Infof("sending to postProcessor")
		cs.sendToPostProcessor(ctx, orderResult)
	}

	resp := &pb.PlaceOrderResponse{Order: orderResult}
	return resp, nil
}

type orderPrep struct {
	orderItems            []*pb.OrderItem
	cartItems             []*pb.CartItem
	shippingCostLocalized *pb.Money
}

func (cs *checkout) prepareOrderItemsAndShippingQuoteFromCart(ctx context.Context, userID, userCurrency string, address *pb.Address) (orderPrep, error) {

	ctx, span := tracer.Start(ctx, "prepareOrderItemsAndShippingQuoteFromCart")
	defer span.End()

	var out orderPrep
	cartItems, err := cs.getUserCart(ctx, userID)
	if err != nil {
		return out, fmt.Errorf("cart failure: %+v", err)
	}
	orderItems, err := cs.prepOrderItems(ctx, cartItems, userCurrency)
	if err != nil {
		return out, fmt.Errorf("failed to prepare order: %+v", err)
	}
	shippingUSD, err := cs.quoteShipping(ctx, address, cartItems)
	if err != nil {
		return out, fmt.Errorf("shipping quote failure: %+v", err)
	}
	shippingPrice, err := cs.convertCurrency(ctx, shippingUSD, userCurrency)
	if err != nil {
		return out, fmt.Errorf("failed to convert shipping cost to currency: %+v", err)
	}

	out.shippingCostLocalized = shippingPrice
	out.cartItems = cartItems
	out.orderItems = orderItems

	var totalCart int32
	for _, ci := range cartItems {
		totalCart += ci.Quantity
	}
	shippingCostFloat, _ := strconv.ParseFloat(fmt.Sprintf("%d.%02d", shippingPrice.GetUnits(), shippingPrice.GetNanos()/1000000000), 64)

	span.SetAttributes(
		attribute.Float64("app.shipping.amount", shippingCostFloat),
		attribute.Int("app.cart.items.count", int(totalCart)),
		attribute.Int("app.order.items.count", len(orderItems)),
	)
	return out, nil
}

func mustCreateClient(svcAddr string) *grpc.ClientConn {
	c, err := grpc.NewClient(svcAddr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithStatsHandler(otelgrpc.NewClientHandler()),
	)
	if err != nil {
		log.Fatalf("could not connect to %s service, err: %+v", svcAddr, err)
	}

	return c
}

func (cs *checkout) quoteShipping(ctx context.Context, address *pb.Address, items []*pb.CartItem) (*pb.Money, error) {
	shippingQuote, err := cs.shippingSvcClient.
		GetQuote(ctx, &pb.GetQuoteRequest{
			Address: address,
			Items:   items})
	if err != nil {
		return nil, fmt.Errorf("failed to get shipping quote: %+v", err)
	}
	return shippingQuote.GetCostUsd(), nil
}

func (cs *checkout) getUserCart(ctx context.Context, userID string) ([]*pb.CartItem, error) {
	cart, err := cs.cartSvcClient.GetCart(ctx, &pb.GetCartRequest{UserId: userID})
	if err != nil {
		return nil, fmt.Errorf("failed to get user cart during checkout: %+v", err)
	}
	return cart.GetItems(), nil
}

func (cs *checkout) emptyUserCart(ctx context.Context, userID string) error {
	if _, err := cs.cartSvcClient.EmptyCart(ctx, &pb.EmptyCartRequest{UserId: userID}); err != nil {
		return fmt.Errorf("failed to empty user cart during checkout: %+v", err)
	}
	return nil
}

func (cs *checkout) prepOrderItems(ctx context.Context, items []*pb.CartItem, userCurrency string) ([]*pb.OrderItem, error) {
	out := make([]*pb.OrderItem, len(items))

	for i, item := range items {
		product, err := cs.productCatalogSvcClient.GetProduct(ctx, &pb.GetProductRequest{Id: item.GetProductId()})
		if err != nil {
			return nil, fmt.Errorf("failed to get product #%q", item.GetProductId())
		}
		price, err := cs.convertCurrency(ctx, product.GetPriceUsd(), userCurrency)
		if err != nil {
			return nil, fmt.Errorf("failed to convert price of %q to %s", item.GetProductId(), userCurrency)
		}
		out[i] = &pb.OrderItem{
			Item: item,
			Cost: price}
	}
	return out, nil
}

func (cs *checkout) convertCurrency(ctx context.Context, from *pb.Money, toCurrency string) (*pb.Money, error) {
	result, err := cs.currencySvcClient.Convert(ctx, &pb.CurrencyConversionRequest{
		From:   from,
		ToCode: toCurrency})
	if err != nil {
		return nil, fmt.Errorf("failed to convert currency: %+v", err)
	}
	return result, err
}

func (cs *checkout) chargeCard(ctx context.Context, amount *pb.Money, paymentInfo *pb.CreditCardInfo) (string, error) {
	paymentService := cs.paymentSvcClient
	if cs.isFeatureFlagEnabled(ctx, "paymentUnreachable") {
		badAddress := "badAddress:50051"
		c := mustCreateClient(badAddress)
		paymentService = pb.NewPaymentServiceClient(c)
	}

	paymentResp, err := paymentService.Charge(ctx, &pb.ChargeRequest{
		Amount:     amount,
		CreditCard: paymentInfo})
	if err != nil {
		return "", fmt.Errorf("could not charge the card: %+v", err)
	}
	return paymentResp.GetTransactionId(), nil
}

func (cs *checkout) sendOrderConfirmation(ctx context.Context, email string, order *pb.OrderResult) error {
	emailPayload, err := json.Marshal(map[string]interface{}{
		"email": email,
		"order": order,
	})
	if err != nil {
		return fmt.Errorf("failed to marshal order to JSON: %+v", err)
	}

	resp, err := otelhttp.Post(ctx, cs.emailSvcAddr+"/send_order_confirmation", "application/json", bytes.NewBuffer(emailPayload))
	if err != nil {
		return fmt.Errorf("failed POST to email service: %+v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed POST to email service: expected 200, got %d", resp.StatusCode)
	}

	return err
}

func (cs *checkout) shipOrder(ctx context.Context, address *pb.Address, items []*pb.CartItem) (string, error) {
	resp, err := cs.shippingSvcClient.ShipOrder(ctx, &pb.ShipOrderRequest{
		Address: address,
		Items:   items})
	if err != nil {
		return "", fmt.Errorf("shipment failed: %+v", err)
	}
	return resp.GetTrackingId(), nil
}

func (cs *checkout) sendToPostProcessor(ctx context.Context, result *pb.OrderResult) {
	message, err := proto.Marshal(result)
	if err != nil {
		log.Errorf("Failed to marshal message to protobuf: %+v", err)
		return
	}

	msg := sarama.ProducerMessage{
		Topic: kafka.Topic,
		Value: sarama.ByteEncoder(message),
	}

	// Inject tracing info into message
	span := createProducerSpan(ctx, &msg)
	defer span.End()

	// Send message and handle response
	startTime := time.Now()
	select {
	case cs.KafkaProducerClient.Input() <- &msg:
		log.Infof("Message sent to Kafka: %v", msg)
		select {
		case successMsg := <-cs.KafkaProducerClient.Successes():
			span.SetAttributes(
				attribute.Bool("messaging.kafka.producer.success", true),
				attribute.Int("messaging.kafka.producer.duration_ms", int(time.Since(startTime).Milliseconds())),
				attribute.KeyValue(semconv.MessagingKafkaMessageOffset(int(successMsg.Offset))),
			)
			log.Infof("Successful to write message. offset: %v, duration: %v", successMsg.Offset, time.Since(startTime))
		case errMsg := <-cs.KafkaProducerClient.Errors():
			span.SetAttributes(
				attribute.Bool("messaging.kafka.producer.success", false),
				attribute.Int("messaging.kafka.producer.duration_ms", int(time.Since(startTime).Milliseconds())),
			)
			span.SetStatus(otelcodes.Error, errMsg.Err.Error())
			log.Errorf("Failed to write message: %v", errMsg.Err)
		case <-ctx.Done():
			span.SetAttributes(
				attribute.Bool("messaging.kafka.producer.success", false),
				attribute.Int("messaging.kafka.producer.duration_ms", int(time.Since(startTime).Milliseconds())),
			)
			span.SetStatus(otelcodes.Error, "Context cancelled: "+ctx.Err().Error())
			log.Warnf("Context canceled before success message received: %v", ctx.Err())
		}
	case <-ctx.Done():
		span.SetAttributes(
			attribute.Bool("messaging.kafka.producer.success", false),
			attribute.Int("messaging.kafka.producer.duration_ms", int(time.Since(startTime).Milliseconds())),
		)
		span.SetStatus(otelcodes.Error, "Failed to send: "+ctx.Err().Error())
		log.Errorf("Failed to send message to Kafka within context deadline: %v", ctx.Err())
		return
	}

	ffValue := cs.getIntFeatureFlag(ctx, "kafkaQueueProblems")
	if ffValue > 0 {
		log.Infof("Warning: FeatureFlag 'kafkaQueueProblems' is activated, overloading queue now.")
		for i := 0; i < ffValue; i++ {
			go func(i int) {
				cs.KafkaProducerClient.Input() <- &msg
				_ = <-cs.KafkaProducerClient.Successes()
			}(i)
		}
		log.Infof("Done with #%d messages for overload simulation.", ffValue)
	}
}

func createProducerSpan(ctx context.Context, msg *sarama.ProducerMessage) trace.Span {
	spanContext, span := tracer.Start(
		ctx,
		fmt.Sprintf("%s publish", msg.Topic),
		trace.WithSpanKind(trace.SpanKindProducer),
		trace.WithAttributes(
			semconv.PeerService("kafka"),
			semconv.NetworkTransportTCP,
			semconv.MessagingSystemKafka,
			semconv.MessagingDestinationName(msg.Topic),
			semconv.MessagingOperationPublish,
			semconv.MessagingKafkaDestinationPartition(int(msg.Partition)),
		),
	)

	carrier := propagation.MapCarrier{}
	propagator := otel.GetTextMapPropagator()
	propagator.Inject(spanContext, carrier)

	for key, value := range carrier {
		msg.Headers = append(msg.Headers, sarama.RecordHeader{Key: []byte(key), Value: []byte(value)})
	}

	return span
}

func (cs *checkout) isFeatureFlagEnabled(ctx context.Context, featureFlagName string) bool {
	client := openfeature.NewClient("checkout")

	// Default value is set to false, but you could also make this a parameter.
	featureEnabled, _ := client.BooleanValue(
		ctx,
		featureFlagName,
		false,
		openfeature.EvaluationContext{},
	)

	return featureEnabled
}

func (cs *checkout) getIntFeatureFlag(ctx context.Context, featureFlagName string) int {
	client := openfeature.NewClient("checkout")

	// Default value is set to 0, but you could also make this a parameter.
	featureFlagValue, _ := client.IntValue(
		ctx,
		featureFlagName,
		0,
		openfeature.EvaluationContext{},
	)

	return int(featureFlagValue)
}

func (cs *checkout) checkExpensiveItems(ctx context.Context, orderItems []*pb.OrderItem) error {
	// Get the price threshold from feature flag
	priceThreshold := cs.getIntFeatureFlag(ctx, "checkoutFailureThreshold")

	log.Infof("[DEBUG] checkExpensiveItems called with %d items, threshold: %d", len(orderItems), priceThreshold)

	// If threshold is 0, feature is disabled
	if priceThreshold == 0 {
		log.Infof("[DEBUG] Feature disabled (threshold=0), skipping expensive items check")
		return nil
	}

	span := trace.SpanFromContext(ctx)
	span.SetAttributes(
		attribute.Int("app.checkout.price_threshold", priceThreshold),
	)

	for _, item := range orderItems {
		// Convert price to USD for comparison (threshold is in USD)
		priceUSD, err := cs.currencySvcClient.Convert(ctx, &pb.CurrencyConversionRequest{
			From:   item.Cost,
			ToCode: "USD",
		})
		if err != nil {
			log.Warnf("Failed to convert price to USD for threshold check: %v", err)
			// Continue with original price if conversion fails
			priceUSD = item.Cost
		}

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

func (cs *checkout) generateTechnicalErrorDetails(ctx context.Context, prep orderPrep, originalErr error) string {
	span := trace.SpanFromContext(ctx)

	// Get feature flag configuration
	priceThreshold := cs.getIntFeatureFlag(ctx, "checkoutFailureThreshold")

	// Build comprehensive technical report
	var details strings.Builder

	details.WriteString("\n\n=== TECHNICAL BUG REPORT ===\n")
	details.WriteString("ISSUE: Checkout failure due to expensive items blocking order completion\n")
	details.WriteString("SEVERITY: HIGH - Business Logic Error\n")
	details.WriteString("COMPONENT: Checkout Service (src/checkout/main.go)\n\n")

	// Error Analysis
	details.WriteString("ERROR ANALYSIS:\n")
	details.WriteString(fmt.Sprintf("- Original Error: %s\n", originalErr.Error()))
	details.WriteString(fmt.Sprintf("- Error Location: checkExpensiveItems() function, line ~650\n"))
	details.WriteString(fmt.Sprintf("- Failure Point: PlaceOrder() method, line ~270\n"))
	details.WriteString(fmt.Sprintf("- Feature Flag: checkoutFailureThreshold = %d\n", priceThreshold))
	details.WriteString("- Error Type: Business logic validation failure\n\n")

	// System Context
	details.WriteString("SYSTEM CONTEXT:\n")
	details.WriteString(fmt.Sprintf("- Service: checkout-service\n"))
	details.WriteString(fmt.Sprintf("- Method: PlaceOrder (gRPC)\n"))
	details.WriteString(fmt.Sprintf("- Trace ID: %s\n", span.SpanContext().TraceID().String()))
	details.WriteString(fmt.Sprintf("- Span ID: %s\n", span.SpanContext().SpanID().String()))
	details.WriteString(fmt.Sprintf("- User Currency: %s\n", prep.orderItems[0].Cost.CurrencyCode))
	details.WriteString(fmt.Sprintf("- Total Items: %d\n", len(prep.orderItems)))

	// Detailed Item Analysis
	details.WriteString("\nITEM ANALYSIS:\n")
	for i, item := range prep.orderItems {
		priceUSD := float64(item.Cost.Units) + float64(item.Cost.Nanos)/1e9
		details.WriteString(fmt.Sprintf("- Item %d: %s\n", i+1, item.Item.ProductId))
		details.WriteString(fmt.Sprintf("  * Price: $%.2f USD\n", priceUSD))
		details.WriteString(fmt.Sprintf("  * Quantity: %d\n", item.Item.Quantity))
		details.WriteString(fmt.Sprintf("  * Exceeds Threshold: %t (threshold: $%d)\n", priceUSD > float64(priceThreshold), priceThreshold))
	}

	// Stack Trace Simulation
	details.WriteString("\nCALL STACK:\n")
	details.WriteString("1. frontend/pages/api/checkout.ts:25 - POST /api/checkout\n")
	details.WriteString("2. frontend/gateways/Api.gateway.ts:45 - ApiGateway.placeOrder()\n")
	details.WriteString("3. checkout/main.go:250 - PlaceOrder() gRPC method\n")
	details.WriteString("4. checkout/main.go:270 - checkExpensiveItems() validation\n")
	details.WriteString("5. checkout/main.go:650 - Price threshold comparison\n")

	// Root Cause Analysis
	details.WriteString("\nROOT CAUSE ANALYSIS:\n")
	details.WriteString("The checkout service implements a business rule that prevents orders\n")
	details.WriteString("containing items above a configurable price threshold. This is controlled\n")
	details.WriteString("by the 'checkoutFailureThreshold' feature flag.\n\n")
	details.WriteString("BUSINESS IMPACT:\n")
	details.WriteString("- Customer cannot complete purchase of expensive items\n")
	details.WriteString("- Revenue loss for high-value transactions\n")
	details.WriteString("- Poor user experience with unclear error handling\n")
	details.WriteString("- No alternative checkout flow for expensive items\n\n")

	// Suggested Fixes
	details.WriteString("SUGGESTED FIXES:\n")
	details.WriteString("1. IMMEDIATE (Low Risk):\n")
	details.WriteString("   - Increase checkoutFailureThreshold feature flag value\n")
	details.WriteString("   - Add better error messaging for users\n")
	details.WriteString("   - Implement 'Request Manager Approval' workflow\n\n")
	details.WriteString("2. SHORT TERM (Medium Risk):\n")
	details.WriteString("   - Add item-category based thresholds\n")
	details.WriteString("   - Implement split-payment options\n")
	details.WriteString("   - Add admin override capabilities\n\n")
	details.WriteString("3. LONG TERM (High Risk):\n")
	details.WriteString("   - Redesign checkout flow for enterprise customers\n")
	details.WriteString("   - Implement approval workflows\n")
	details.WriteString("   - Add payment plan options\n\n")

	// Code References
	details.WriteString("CODE REFERENCES:\n")
	details.WriteString("- Main Logic: src/checkout/main.go:621-663 (checkExpensiveItems)\n")
	details.WriteString("- Feature Flag: src/checkout/main.go:600-620 (getIntFeatureFlag)\n")
	details.WriteString("- Error Handling: src/checkout/main.go:268-278 (PlaceOrder)\n")
	details.WriteString("- Frontend: src/frontend/pages/api/checkout.ts\n")
	details.WriteString("- Support Integration: src/support/main.go:240-350\n\n")

	// Configuration Details
	details.WriteString("CONFIGURATION:\n")
	details.WriteString("- Feature Flag Service: Connected\n")
	details.WriteString(fmt.Sprintf("- Current Threshold: $%d USD\n", priceThreshold))
	details.WriteString("- Currency Service: Connected\n")
	details.WriteString("- Support Service: Connected\n\n")

	// Reproduction Steps
	details.WriteString("REPRODUCTION STEPS:\n")
	details.WriteString("1. Add item with price > $100 to cart\n")
	details.WriteString("2. Proceed to checkout\n")
	details.WriteString("3. Fill in payment/shipping details\n")
	details.WriteString("4. Click 'Place Order'\n")
	details.WriteString("5. Observe error: 'Order contains expensive items'\n\n")

	details.WriteString("=== END TECHNICAL REPORT ===\n")

	return details.String()
}
