// sql.js（WASM SQLite）最小类型面：官方无类型包，这里只声明实际用到的 API。
// 完整语义见 node_modules/sql.js/dist/sql-wasm.d.ts（如随包提供）。
declare module 'sql.js' {
  interface SqlJsStatement {
    bind(params?: unknown[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): boolean;
  }
  interface SqlJsDatabase {
    run(sql: string, params?: unknown[]): void;
    exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
    prepare(sql: string): SqlJsStatement;
    getRowsModified(): number;
    export(): Uint8Array;
    close(): void;
  }
  interface SqlJsStatic {
    Database: new (data?: Uint8Array) => SqlJsDatabase;
  }
  interface SqlJsConfig {
    locateFile?: (file: string, prefix?: string) => string;
  }
  // initSqlJs(config?) → Promise<SQL>
  function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
  export default initSqlJs;
}
