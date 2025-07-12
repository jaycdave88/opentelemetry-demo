// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import styled from 'styled-components';
import Button from '../Button';

export const CheckoutForm = styled.form``;

export const StateRow = styled.div`
  display: grid;
  grid-template-columns: 35% 55%;
  gap: 10%;
`;

export const Title = styled.h1`
  margin: 0;
  margin-bottom: 24px;
`;

export const CardRow = styled.div`
  display: grid;
  grid-template-columns: 35% 35% 20%;
  gap: 5%;
`;

export const SubmitContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  flex-direction: column-reverse;

  ${({ theme }) => theme.breakpoints.desktop} {
    flex-direction: row;
    justify-content: end;
    align-items: center;
    margin-top: 67px;
  }
`;

export const CartButton = styled(Button)`
  padding: 16px 35px;
  font-weight: ${({ theme }) => theme.fonts.regular};
  width: 100%;

  ${({ theme }) => theme.breakpoints.desktop} {
    width: inherit;
  }
`;

export const EmptyCartButton = styled(Button)`
  font-weight: ${({ theme }) => theme.fonts.regular};
  color: ${({ theme }) => theme.colors.otelRed};
  width: 100%;

  ${({ theme }) => theme.breakpoints.desktop} {
    width: inherit;
  }
`;

export const ErrorMessage = styled.div`
  background-color: #fee;
  border: 1px solid #fcc;
  border-radius: 4px;
  padding: 12px 16px;
  margin: 16px 0;
  color: #c33;
  font-size: 14px;
  line-height: 1.4;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

export const SupportButton = styled.button`
  background-color: #007bff;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  align-self: flex-start;

  &:hover {
    background-color: #0056b3;
  }
`;
