// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

interface IRequestParams {
  url: string;
  body?: object;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  queryParams?: Record<string, any>;
  headers?: Record<string, string>;
}

const request = async <T>({
  url = '',
  method = 'GET',
  body,
  queryParams = {},
  headers = {
    'content-type': 'application/json',
  },
}: IRequestParams): Promise<T> => {
  console.log(`[Request] ${method} ${url}`, { body, queryParams });

  const response = await fetch(`${url}?${new URLSearchParams(queryParams).toString()}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers,
  });

  const responseText = await response.text();

  console.log(`[Request] Response status: ${response.status}, ok: ${response.ok}`);
  console.log(`[Request] Response text:`, responseText);

  if (!response.ok) {
    // Try to parse error response as JSON
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    if (responseText) {
      try {
        const errorData = JSON.parse(responseText);
        console.log(`[Request] Parsed error data:`, errorData);
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // If JSON parsing fails, use the raw response text
        errorMessage = responseText;
      }
    }
    console.log(`[Request] Throwing error:`, errorMessage);
    throw new Error(errorMessage);
  }

  if (!!responseText) {
    const parsedResponse = JSON.parse(responseText);
    console.log(`[Request] Parsed response:`, parsedResponse);
    return parsedResponse;
  }

  return undefined as unknown as T;
};

export default request;
