// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import type { NextApiRequest, NextApiResponse } from 'next';
import InstrumentationMiddleware from '../../utils/telemetry/InstrumentationMiddleware';
import SupportGateway from '../../gateways/rpc/Support.gateway';
import { CreateSupportRequestRequest, CreateSupportRequestResponse } from '../../protos/demo';

type TResponse = CreateSupportRequestResponse | { error: string };

const handler = async ({ method, body }: NextApiRequest, res: NextApiResponse<TResponse>) => {
  switch (method) {
    case 'POST': {
      try {
        const supportRequestData = body as CreateSupportRequestRequest;
        console.log('Support request received:', JSON.stringify(supportRequestData, null, 2));
        console.log('SUPPORT_ADDR:', process.env.SUPPORT_ADDR);

        const response = await SupportGateway.createSupportRequest(supportRequestData);
        console.log('Support response:', response);
        return res.status(200).json(response);
      } catch (error) {
        console.error('Support request error:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));

        // Extract error message from gRPC error
        let errorMessage = 'Failed to create support request';
        if (error && typeof error === 'object') {
          if ('details' in error && typeof error.details === 'string') {
            errorMessage = error.details;
          } else if ('message' in error && typeof error.message === 'string') {
            errorMessage = error.message;
          }
        }

        return res.status(500).json({ error: errorMessage });
      }
    }

    default: {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  }
};

export default InstrumentationMiddleware(handler);
