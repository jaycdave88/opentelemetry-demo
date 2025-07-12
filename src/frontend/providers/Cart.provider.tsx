// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { createContext, useCallback, useContext, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ApiGateway from '../gateways/Api.gateway';
import { CartItem, OrderResult, PlaceOrderRequest } from '../protos/demo';
import { IProductCart } from '../types/Cart';
import { useCurrency } from './Currency.provider';

interface IContext {
  cart: IProductCart;
  addItem(item: CartItem): void;
  emptyCart(): void;
  placeOrder(order: PlaceOrderRequest): Promise<OrderResult>;
}

export const Context = createContext<IContext>({
  cart: { userId: '', items: [] },
  addItem: () => {},
  emptyCart: () => {},
  placeOrder: () => Promise.resolve({} as OrderResult),
});

interface IProps {
  children: React.ReactNode;
}

export const useCart = () => useContext(Context);

const CartProvider = ({ children }: IProps) => {
  const { selectedCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const mutationOptions = useMemo(
    () => ({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['cart'] });
      },
    }),
    [queryClient]
  );

  const { data: cart = { userId: '', items: [] } } = useQuery({
    queryKey: ['cart', selectedCurrency],
    queryFn: () => ApiGateway.getCart(selectedCurrency),
  });
  const addCartMutation = useMutation({
    mutationFn: ApiGateway.addCartItem,
    ...mutationOptions,
  });

  const emptyCartMutation = useMutation({
    mutationFn: ApiGateway.emptyCart,
    ...mutationOptions,
  });

  const placeOrderMutation = useMutation({
    mutationFn: ApiGateway.placeOrder,
    ...mutationOptions,
  });

  const addItem = useCallback(
    (item: CartItem) => addCartMutation.mutateAsync({ ...item, currencyCode: selectedCurrency }),
    [addCartMutation, selectedCurrency]
  );
  const emptyCart = useCallback(() => emptyCartMutation.mutateAsync(), [emptyCartMutation]);
  const placeOrder = useCallback(
    async (order: PlaceOrderRequest) => {
      try {
        console.log('[Cart Provider] Calling placeOrder with:', order);
        const result = await placeOrderMutation.mutateAsync({ ...order, currencyCode: selectedCurrency });
        console.log('[Cart Provider] placeOrder result:', result);
        return result;
      } catch (error) {
        console.log('[Cart Provider] placeOrder error:', error);
        throw error;
      }
    },
    [placeOrderMutation, selectedCurrency]
  );

  const value = useMemo(() => ({ cart, addItem, emptyCart, placeOrder }), [cart, addItem, emptyCart, placeOrder]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
};

export default CartProvider;
