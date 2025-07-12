// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import styled from 'styled-components';

export const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
`;

export const Modal = styled.div`
  background: white;
  border-radius: 8px;
  max-width: 600px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
`;

export const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #eee;
`;

export const Title = styled.h2`
  margin: 0;
  font-size: 24px;
  color: #333;
`;

export const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  
  &:hover:not(:disabled) {
    background-color: #f5f5f5;
    color: #333;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const Content = styled.div`
  padding: 24px;
`;

export const Description = styled.p`
  margin: 0 0 24px 0;
  color: #666;
  line-height: 1.5;
`;

export const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

export const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const Label = styled.label`
  font-weight: 600;
  color: #333;
  font-size: 14px;
`;

export const Input = styled.input`
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  
  &:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }
  
  &:disabled {
    background-color: #f5f5f5;
    cursor: not-allowed;
  }
`;

export const TextArea = styled.textarea`
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  resize: vertical;
  min-height: 100px;
  font-family: inherit;
  
  &:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }
  
  &:disabled {
    background-color: #f5f5f5;
    cursor: not-allowed;
  }
`;

export const ErrorDetails = styled.div`
  background-color: #fee;
  border: 1px solid #fcc;
  border-radius: 4px;
  padding: 12px;
`;

export const ErrorTitle = styled.h4`
  margin: 0 0 8px 0;
  color: #c33;
  font-size: 14px;
`;

export const ErrorText = styled.p`
  margin: 0;
  color: #c33;
  font-size: 13px;
  font-family: monospace;
  word-break: break-word;
`;

export const OrderDetails = styled.div`
  background-color: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  padding: 12px;
`;

export const OrderTitle = styled.h4`
  margin: 0 0 12px 0;
  color: #333;
  font-size: 14px;
`;

export const ItemList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const Item = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  background-color: white;
  border-radius: 4px;
  border: 1px solid #e9ecef;
`;

export const ItemName = styled.span`
  font-weight: 500;
  color: #333;
`;

export const ItemQuantity = styled.span`
  color: #666;
  font-size: 13px;
`;

export const ButtonContainer = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
`;

export const CancelButton = styled.button`
  padding: 12px 24px;
  border: 1px solid #ddd;
  background-color: white;
  color: #666;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  
  &:hover:not(:disabled) {
    background-color: #f8f9fa;
    border-color: #adb5bd;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const SubmitButton = styled.button`
  padding: 12px 24px;
  border: none;
  background-color: #007bff;
  color: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  
  &:hover:not(:disabled) {
    background-color: #0056b3;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
