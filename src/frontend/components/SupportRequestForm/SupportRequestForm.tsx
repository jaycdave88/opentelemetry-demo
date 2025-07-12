// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useState } from 'react';
import { IProductCartItem } from '../../types/Cart';
import * as S from './SupportRequestForm.styled';

export interface ISupportRequestData {
  subject: string;
  description: string;
}

interface IProps {
  onSubmit(data: ISupportRequestData): void;
  onCancel(): void;
  errorMessage?: string;
  failedItems?: IProductCartItem[];
  isSubmitting?: boolean;
}

const SupportRequestForm = ({
  onSubmit,
  onCancel,
  errorMessage,
  failedItems,
  isSubmitting = false
}: IProps) => {
  const [formData, setFormData] = useState<ISupportRequestData>({
    subject: 'Checkout Failed - Need Assistance',
    description: '',
  });

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  }, [formData, onSubmit]);

  return (
    <S.Overlay>
      <S.Modal>
        <S.Header>
          <S.Title>Need Help?</S.Title>
          <S.CloseButton onClick={onCancel} disabled={isSubmitting}>×</S.CloseButton>
        </S.Header>
        
        <S.Content>
          <S.Description>
            We&apos;re sorry your order couldn&apos;t be completed. Please provide some details below and
            we&apos;ll create a support ticket to help resolve this issue.
          </S.Description>

          <S.Form onSubmit={handleSubmit}>
            <S.FormGroup>
              <S.Label htmlFor="subject">Subject</S.Label>
              <S.Input
                id="subject"
                name="subject"
                type="text"
                value={formData.subject}
                onChange={handleChange}
                required
                disabled={isSubmitting}
              />
            </S.FormGroup>

            <S.FormGroup>
              <S.Label htmlFor="description">Description (Optional)</S.Label>
              <S.TextArea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Please describe any additional details about the issue you encountered..."
                rows={4}
                disabled={isSubmitting}
              />
            </S.FormGroup>

            {errorMessage && (
              <S.ErrorDetails>
                <S.ErrorTitle>Error Details:</S.ErrorTitle>
                <S.ErrorText>{errorMessage}</S.ErrorText>
              </S.ErrorDetails>
            )}

            {failedItems && failedItems.length > 0 && (
              <S.OrderDetails>
                <S.OrderTitle>Items in Cart:</S.OrderTitle>
                <S.ItemList>
                  {failedItems.map((item) => (
                    <S.Item key={item.productId}>
                      <S.ItemName>{item.product.name}</S.ItemName>
                      <S.ItemQuantity>Qty: {item.quantity}</S.ItemQuantity>
                    </S.Item>
                  ))}
                </S.ItemList>
              </S.OrderDetails>
            )}

            <S.ButtonContainer>
              <S.CancelButton type="button" onClick={onCancel} disabled={isSubmitting}>
                Cancel
              </S.CancelButton>
              <S.SubmitButton type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating Ticket...' : 'Create Support Ticket'}
              </S.SubmitButton>
            </S.ButtonContainer>
          </S.Form>
        </S.Content>
      </S.Modal>
    </S.Overlay>
  );
};

export default SupportRequestForm;
