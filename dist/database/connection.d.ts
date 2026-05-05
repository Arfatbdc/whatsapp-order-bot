import { Pool } from 'pg';
export declare function getPool(): Pool;
export declare function query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
export declare function queryOne<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T | null>;
export declare function transaction<T>(callback: (client: import('pg').PoolClient) => Promise<T>): Promise<T>;
export declare function testConnection(): Promise<boolean>;
export declare function closePool(): Promise<void>;
//# sourceMappingURL=connection.d.ts.map