# Copyright The OpenTelemetry Authors
# SPDX-License-Identifier: Apache-2.0

FROM golang:1.22-alpine AS builder

WORKDIR /usr/src/app/

RUN apk add --no-cache ca-certificates git
RUN apk update && apk add --no-cache git

COPY ./src/support/go.mod ./src/support/go.sum ./
COPY ./src/support/genproto ./genproto
RUN go mod download
RUN go mod verify

COPY ./src/support/ ./
RUN go build -o support .

FROM alpine

RUN apk add --no-cache ca-certificates
RUN GRPC_HEALTH_PROBE_VERSION=v0.4.25 && \
    wget -qO/bin/grpc_health_probe https://github.com/grpc-ecosystem/grpc-health-probe/releases/download/${GRPC_HEALTH_PROBE_VERSION}/grpc_health_probe-linux-amd64 && \
    chmod +x /bin/grpc_health_probe

WORKDIR /usr/src/app/

COPY --from=builder /usr/src/app/support ./
EXPOSE 8080
ENTRYPOINT ["./support"]
