// API Client interface (Dependency Inversion Principle)
export interface IApiClient {
  get<T>(url: string, options?: any): Promise<T>;
  post<T>(url: string, data: any, options?: any): Promise<T>;
}

export class FetchApiClient implements IApiClient {
  async get<T>(url: string, options: any = {}): Promise<T> {
    const response = await fetch(url, {
      method: 'GET',
      ...options,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  async post<T>(url: string, data: any, options: any = {}): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      ...options,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }
}