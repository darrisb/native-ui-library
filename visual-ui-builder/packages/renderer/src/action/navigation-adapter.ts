/**
 * Navigation adapter abstraction for the action runtime.
 *
 * The executor depends on this interface rather than calling `window.location`
 * or `window.open` directly so that navigation behavior can be injected for
 * testing or alternative environments. The production browser adapter applies
 * noopener/noreferrer safeguards on new-window navigation.
 */

/** Opens a URL in the same browsing context. */
export interface NavigationAdapter {
  /** Navigate the current window to `url`. */
  navigateTo(url: string): void;

  /** Open `url` in a new browsing context/tab. */
  openInNewWindow(url: string): void;
}

/**
 * Browser-backed navigation adapter.
 *
 * - Same-window navigation uses `location.assign` so the current entry remains
 *   in the session history (back button works).
 * - New-window navigation uses `window.open` with `noopener,noreferrer` to
 *   prevent the opened page from accessing `window.opener` and to suppress the
 *   Referer header.
 */
export class BrowserNavigationAdapter implements NavigationAdapter {
  private readonly globalWindow: Window;

  constructor(globalWindow: Window = window) {
    this.globalWindow = globalWindow;
  }

  navigateTo(url: string): void {
    this.globalWindow.location.assign(url);
  }

  openInNewWindow(url: string): void {
    this.globalWindow.open(url, "_blank", "noopener,noreferrer");
  }
}
