declare module 'sql.js' {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  interface Database {
    run(sql: string, ...params: any[]): void;
    exec(sql: string, ...params: any[]): QueryExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    getRowsModified(): number;
    close(): void;
  }

  interface Statement {
    bind(...params: any[]): boolean;
    step(): boolean;
    getAsObject(): any;
    free(): void;
    reset(): void;
  }

  interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  export default function initSqlJs(config?: any): Promise<SqlJsStatic>;
  export { SqlJsStatic, Database, Statement, QueryExecResult };
}
