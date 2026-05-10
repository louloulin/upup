// Extism SDK type declarations (for type checking without runtime)
declare module '@extism/sdk' {
  interface Plugin {
    free(): void;
  }

  interface HostFunction {
    // Host function structure
  }

  export class Plugin {
    constructor(path: string, withCache: boolean, hostFunctions: HostFunction[]);
    free(): void;
  }

  export class HostFunction {
    constructor(
      name: string,
      inputs: Array<{ name: string; type: string }>,
      outputs: Array<{ name: string; type: string }>,
      handler: (ctx: any, ...args: any[]) => any
    );
  }
}
