# Copyright The OpenTelemetry Authors
# SPDX-License-Identifier: Apache-2.0

FROM golang:1.22-alpine AS base
WORKDIR /build

# Install protobuf compiler
RUN apk add --no-cache protobuf-dev

# Copy go module files
COPY ./src/support/go.mod ./
COPY ./src/support/go.sum ./
COPY ./src/support/tools.go ./

# Set up Go module cache
RUN go env -w GOMODCACHE=/root/.cache/go-build

# Install protobuf generation tools
RUN --mount=type=cache,target=/root/.cache/go-build \
    go list -e -f '{{range .Imports}}{{.}} {{end}}' tools.go | CGO_ENABLED=0 xargs go install -mod=readonly
