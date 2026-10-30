declare module 'vite' {
  export function createServer(inlineConfig?: any): Promise<any>;
  export function defineConfig(config: any): any;
  export function loadEnv(mode: string, envDir: string, prefixes?: string | string[]): Record<string, string>;
}
