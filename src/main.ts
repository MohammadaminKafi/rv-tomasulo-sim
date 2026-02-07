/**
 * Main application entry point
 * Multi-page app with routing
 */

import { Router } from './ui/router';
import { HomePage } from './ui/homePage';
import { SimulatorPage } from './ui/simulatorPage';
import { DocsPage } from './ui/docsPage';

class App {
  private router: Router;
  private currentPage: HomePage | SimulatorPage | DocsPage | null;
  private appContainer: HTMLElement;
  private mainContent: HTMLElement;

  constructor() {
    this.router = new Router();
    this.currentPage = null;
    
    this.appContainer = document.getElementById('app') as HTMLElement;
    this.mainContent = document.createElement('main');
    this.mainContent.id = 'main-content';
    
    this.setupApp();
    this.router.onRouteChange((route) => this.handleRouteChange(route));
    this.handleRouteChange(this.router.getCurrentRoute());
  }

  private setupApp(): void {
    // Create header
    const header = this.createHeader();
    
    // Clear app container and add structure
    this.appContainer.innerHTML = '';
    this.appContainer.appendChild(header);
    this.appContainer.appendChild(this.mainContent);
  }

  private createHeader(): HTMLElement {
    const header = document.createElement('header');
    header.className = 'app-header';
    header.innerHTML = `
      <div class="header-content">
        <div class="logo" id="logo-link">
          <span class="logo-icon">🔬</span>
          <span class="logo-text">RISC-V Simulator</span>
        </div>
        <nav class="main-nav">
          <a href="#home" class="nav-link" data-route="home">Home</a>
          <a href="#simulator" class="nav-link" data-route="simulator">Simulator</a>
          <a href="#docs" class="nav-link" data-route="docs">Documentation</a>
        </nav>
      </div>
    `;

    // Setup logo click
    const logo = header.querySelector('#logo-link');
    logo?.addEventListener('click', () => this.router.navigateTo('home'));

    // Update active nav link on route change
    this.updateActiveNav(this.router.getCurrentRoute());

    return header;
  }

  private handleRouteChange(route: string): void {
    // Cleanup previous page
    if (this.currentPage && 'destroy' in this.currentPage) {
      this.currentPage.destroy();
    }

    // Clear main content
    this.mainContent.innerHTML = '';

    // Update active nav
    this.updateActiveNav(route);

    // Render new page
    switch (route) {
      case 'home':
        this.currentPage = new HomePage(this.router);
        this.currentPage.render(this.mainContent);
        break;
      case 'simulator':
        this.currentPage = new SimulatorPage(this.router);
        this.currentPage.render(this.mainContent);
        break;
      case 'docs':
        this.currentPage = new DocsPage(this.router);
        this.currentPage.render(this.mainContent);
        break;
    }
  }

  private updateActiveNav(route: string): void {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      const linkRoute = link.getAttribute('data-route');
      if (linkRoute === route) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new App();
});
