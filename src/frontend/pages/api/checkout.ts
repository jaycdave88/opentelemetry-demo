// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import type { NextApiRequest, NextApiResponse } from 'next';
import InstrumentationMiddleware from '../../utils/telemetry/InstrumentationMiddleware';
import CheckoutGateway from '../../gateways/rpc/Checkout.gateway';
import { Empty, PlaceOrderRequest } from '../../protos/demo';
import { IProductCheckoutItem, IProductCheckout } from '../../types/Cart';
import ProductCatalogService from '../../services/ProductCatalog.service';

type TResponse = IProductCheckout | Empty | { error: string };

const handler = async ({ method, body, query }: NextApiRequest, res: NextApiResponse<TResponse>) => {
  switch (method) {
    case 'POST': {
      try {
        const { currencyCode = '' } = query;
        const orderData = body as PlaceOrderRequest;
        const { order: { items = [], ...order } = {} } = await CheckoutGateway.placeOrder(orderData);

        const productList: IProductCheckoutItem[] = await Promise.all(
          items.map(async ({ item: { productId = '', quantity = 0 } = {}, cost }) => {
            const product = await ProductCatalogService.getProduct(productId, currencyCode as string);

            return {
              cost,
              item: {
                productId,
                quantity,
                product,
              },
            };
          })
        );

        return res.status(200).json({ ...order, items: productList });
      } catch (error: unknown) {
        console.error('Checkout error:', error);

        // Extract error message from gRPC error
        let errorMessage = 'An unexpected error occurred during checkout.';
        if (error && typeof error === 'object' && 'details' in error) {
          errorMessage = String(error.details);
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }

        // Ensure we set the status code before sending the response
        res.status(400);
        return res.json({ error: errorMessage });
      }
    }

    default: {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  }
};

export default InstrumentationMiddleware(handler);
