import { D1ClientConfig, D1QueryResult, CloudflareD1ApiResponse } from '../config/types/auth';

export class CloudflareD1Client {
  private config: D1ClientConfig;
  private baseUrl: string;

  constructor(config: D1ClientConfig) {
    this.config = config;
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}`;
  }

  async query(sql: string, params: any[] = []): Promise<D1QueryResult> {
    try {
      console.log('D1Client: Making query request:', {
        url: `${this.baseUrl}/query`,
        sql,
        params,
        hasToken: !!this.config.apiToken
      });

      const response = await fetch(`${this.baseUrl}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sql,
          params,
        }),
      });

      console.log('D1Client: Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.log('D1Client: Error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const rawResponse = await response.json() as CloudflareD1ApiResponse;
      console.log('D1Client: Raw response:', JSON.stringify(rawResponse, null, 2));
      
      // Transform the Cloudflare API response to our expected format
      const result: D1QueryResult = {
        success: rawResponse.success,
        result: rawResponse.result?.[0] || { results: [], meta: {} },
        errors: rawResponse.errors
      };
      
      console.log('D1Client: Transformed result:', {
        success: result.success,
        hasResults: !!result.result?.results?.length,
        resultCount: result.result?.results?.length || 0,
        errors: result.errors
      });
      
      return result;
    } catch (error) {
      console.error('D1 Query Error:', error);
      return {
        success: false,
        errors: [{ code: 500, message: error instanceof Error ? error.message : 'Unknown error' }],
      };
    }
  }

  async execute(sql: string, params: any[] = []): Promise<D1QueryResult> {
    return this.query(sql, params);
  }

  async batch(statements: Array<{ sql: string; params?: any[] }>): Promise<D1QueryResult[]> {
    try {
      const response = await fetch(`${this.baseUrl}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(statements),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const rawResponse = await response.json() as CloudflareD1ApiResponse;
      
      // Handle batch response format - each item in result array is a query result
      return rawResponse.result.map((item) => ({
        success: item.success,
        result: item,
        errors: rawResponse.errors
      }));
    } catch (error) {
      console.error('D1 Batch Error:', error);
      return [{
        success: false,
        errors: [{ code: 500, message: error instanceof Error ? error.message : 'Unknown error' }],
      }];
    }
  }
}