/**
 * Simple client-side router
 */

export type Route = 'home' | 'simulator' | 'docs';

export class Router {
  private currentRoute: Route;
  private listeners: Array<(route: Route) => void>;

  constructor() {
    this.currentRoute = this.getRouteFromHash();
    this.listeners = [];

    // Listen to hash changes
    window.addEventListener('hashchange', () => {
      this.currentRoute = this.getRouteFromHash();
      this.notifyListeners();
    });
  }

  private getRouteFromHash(): Route {
    const hash = window.location.hash.slice(1) || 'home';
    if (hash === 'simulator' || hash === 'docs') {
      return hash;
    }
    return 'home';
  }

  getCurrentRoute(): Route {
    return this.currentRoute;
  }

  navigateTo(route: Route): void {
    window.location.hash = route;
  }

  onRouteChange(callback: (route: Route) => void): void {
    this.listeners.push(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach(callback => callback(this.currentRoute));
  }
}
