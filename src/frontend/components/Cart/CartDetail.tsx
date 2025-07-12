// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { useRouter } from 'next/router';
import { useCallback, useState } from 'react';
import CartItems from '../CartItems';
import CheckoutForm from '../CheckoutForm';
import { IFormData } from '../CheckoutForm/CheckoutForm';
import { ISupportRequestData } from '../SupportRequestForm';
import SessionGateway from '../../gateways/Session.gateway';
import { useCart } from '../../providers/Cart.provider';
import { useCurrency } from '../../providers/Currency.provider';
import { CreateSupportRequestRequest } from '../../protos/demo';
import * as S from '../../styles/Cart.styled';

const { userId } = SessionGateway.getSession();

const CartDetail = () => {
  const {
    cart: { items },
    emptyCart,
    placeOrder,
  } = useCart();
  const { selectedCurrency } = useCurrency();
  const { push } = useRouter();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onPlaceOrder = useCallback(
    async ({
      email,
      state,
      streetAddress,
      country,
      city,
      zipCode,
      creditCardCvv,
      creditCardExpirationMonth,
      creditCardExpirationYear,
      creditCardNumber,
    }: IFormData) => {
      setIsSubmitting(true);
      setCheckoutError(null);

      try {
        const order = await placeOrder({
          userId,
          email,
          address: {
            streetAddress,
            state,
            country,
            city,
            zipCode,
          },
          userCurrency: selectedCurrency,
          creditCard: {
            creditCardCvv,
            creditCardExpirationMonth,
            creditCardExpirationYear,
            creditCardNumber,
          },
        });

        console.log('Order response:', order);

        // Check if the response contains an error
        if (order && typeof order === 'object' && 'error' in order) {
          console.log('Order contains error, throwing:', order.error);
          throw new Error(order.error as string);
        }

        // Check if orderId is missing (another sign of error)
        if (!order || !order.orderId) {
          console.log('Order missing orderId, treating as error');
          throw new Error('Order failed - no order ID received');
        }

        console.log('Order successful, navigating to:', order.orderId);
        push({
          pathname: `/cart/checkout/${order.orderId}`,
          query: { order: JSON.stringify(order) },
        });
      } catch (error: unknown) {
        console.error('Checkout failed:', error);

        // Extract error message from the response
        let errorMessage = 'An unexpected error occurred during checkout.';
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (typeof error === 'string') {
          errorMessage = error;
        } else if (error && typeof error === 'object' && 'message' in error) {
          errorMessage = String(error.message);
        }

        setCheckoutError(errorMessage);
      } finally {
        setIsSubmitting(false);
      }
    },
    [placeOrder, push, selectedCurrency]
  );

  const onSupportRequest = useCallback(
    async (data: ISupportRequestData) => {
      try {
        const supportRequest: CreateSupportRequestRequest = {
          userId,
          email: 'user@example.com', // TODO: Get from user session
          subject: data.subject,
          description: data.description,
          errorMessage: checkoutError || '',
          failedItems: items.map(item => ({
            item: {
              productId: item.productId,
              quantity: item.quantity,
            },
            cost: {
              currencyCode: selectedCurrency,
              units: item.product.priceUsd?.units || 0,
              nanos: item.product.priceUsd?.nanos || 0,
            },
          })),
          shippingAddress: undefined, // TODO: Get from form if available
        };

        const response = await fetch('/api/support', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(supportRequest),
        });

        if (response.ok) {
          const result = await response.json();
          alert(`Support ticket created successfully! Ticket ID: ${result.supportRequest?.jiraTicketId || result.supportRequest?.id}`);
          setCheckoutError(null);
        } else {
          throw new Error('Failed to create support ticket');
        }
      } catch (error) {
        console.error('Failed to create support ticket:', error);
        alert('Failed to create support ticket. Please try again.');
      }
    },
    [selectedCurrency, items, checkoutError, userId]
  );

  return (
    <S.Container>
      <div>
        <S.Header>
          <S.CarTitle>Shopping Cart</S.CarTitle>
          <S.EmptyCartButton onClick={emptyCart} $type="link">
            Empty Cart
          </S.EmptyCartButton>
        </S.Header>
        <CartItems productList={items} />
      </div>
      <CheckoutForm
        onSubmit={onPlaceOrder}
        isSubmitting={isSubmitting}
        error={checkoutError}
        onSupportRequest={onSupportRequest}
        cartItems={items}
      />
    </S.Container>
  );
};

export default CartDetail;
