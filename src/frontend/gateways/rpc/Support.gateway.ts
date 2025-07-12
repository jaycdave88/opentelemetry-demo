// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { ChannelCredentials } from '@grpc/grpc-js';
import { SupportServiceClient, CreateSupportRequestRequest, CreateSupportRequestResponse } from '../../protos/demo';

const { SUPPORT_ADDR = 'support:8080' } = process.env;

const client = new SupportServiceClient(SUPPORT_ADDR, ChannelCredentials.createInsecure());

const SupportGateway = () => ({
  createSupportRequest(request: CreateSupportRequestRequest) {
    return new Promise<CreateSupportRequestResponse>((resolve, reject) =>
      client.createSupportRequest(request, (error, response) => (error ? reject(error) : resolve(response)))
    );
  },
});

export default SupportGateway();
