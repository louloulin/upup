/**
 * Service Locator Pattern - Lightweight DI Alternative
 *
 * Based on plan5.md architecture decision:
 * - No DI container (keeps complexity low)
 * - Direct import + ServiceLocator for中小型 project
 * - Singleton pattern for global services
 */

/**
 * Service registration type
 */
export type ServiceFactory<T> = () => T;

/**
 * Global service locator instance
 */
class ServiceLocatorImpl {
  private services = new Map<string, unknown>();
  private factories = new Map<string, ServiceFactory<unknown>>();
  private singletons = new Set<string>();

  /**
   * Register a service as a singleton (created once, reused)
   */
  registerSingleton<T>(name: string, factory: ServiceFactory<T>): void {
    this.factories.set(name, factory);
    this.singletons.add(name);
  }

  /**
   * Register a service as a factory (new instance each time)
   */
  registerFactory<T>(name: string, factory: ServiceFactory<T>): void {
    this.factories.set(name, factory);
  }

  /**
   * Get a service by name
   */
  get<T>(name: string): T {
    // For singletons, create only once
    if (this.singletons.has(name) && !this.services.has(name)) {
      const factory = this.factories.get(name);
      if (!factory) {
        throw new Error(`Service ${name} not registered`);
      }
      this.services.set(name, factory());
    }

    // For factories or cached singletons
    if (this.services.has(name)) {
      return this.services.get(name) as T;
    }

    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`Service ${name} not registered`);
    }

    return factory() as T;
  }

  /**
   * Check if a service is registered
   */
  has(name: string): boolean {
    return this.services.has(name) || this.factories.has(name);
  }

  /**
   * Clear all services (mainly for testing)
   */
  reset(): void {
    this.services.clear();
    this.factories.clear();
    this.singletons.clear();
  }
}

// Global singleton instance
export const locator = new ServiceLocatorImpl();

/**
 * Initialize default services
 */
export function initServices(): void {
  // Financial Gateway - already exists as part of tools
  // Portfolio Tracker - registers itself as singleton
  // Risk Manager - registers itself as singleton

  locator.registerSingleton('Logger', () => ({
    info: (msg: string, ...args: unknown[]) => console.log(`[INFO] ${msg}`, ...args),
    warn: (msg: string, ...args: unknown[]) => console.warn(`[WARN] ${msg}`, ...args),
    error: (msg: string, ...args: unknown[]) => console.error(`[ERROR] ${msg}`, ...args),
  }));
}

// Re-export for convenience
export const registerSingleton = locator.registerSingleton.bind(locator);
export const registerFactory = locator.registerFactory.bind(locator);
export const getService = locator.get.bind(locator);
