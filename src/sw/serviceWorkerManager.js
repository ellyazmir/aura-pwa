/**
 * ServiceWorkerManager — registers the Workbox-generated service worker and
 * exposes the offline-lifecycle signals the UI needs (task 13).
 *
 * Responsibilities (see design.md §7 and the Error Handling table):
 *  - Register the generated service worker via vite-plugin-pwa's
 *    `virtual:pwa-register` module and detect background updates. On a new
 *    version a dismissible update banner is surfaced; dismissal is persisted
 *    under `aura.updateDismissed` so the banner is not nagged repeatedly
 *    (Requirement 1.3).
 *  - Use the Storage API (`navigator.storage.estimate()`) to detect when the
 *    available cache space drops below 50 MB and raise a warning that the UI
 *    keeps visible until the student acts on it (Requirement 1.4).
 *  - Detect install / cache failures during first-visit setup and surface an
 *    "offline setup incomplete" message so the UI can prompt a reload while the
 *    student is still connected (Requirement 1.6).
 *
 * Testability: this module is importable in a jsdom/Vitest environment. Every
 * browser-only API (`navigator.storage`, the `virtual:pwa-register` virtual
 * module, which only resolves inside the Vite build) is guarded or imported
 * lazily inside a try/catch so importing the module never throws when those
 * APIs are absent.
 *
 * @module sw/serviceWorkerManager
 */

/**
 * localStorage key recording the ISO timestamp at which the student last
 * dismissed the update banner (see design.md "Local Storage Keys").
 * @type {string}
 */
export const UPDATE_DISMISSED_KEY = 'aura.updateDismissed';

/**
 * Minimum available cache space, in bytes, below which the insufficient-storage
 * warning is raised (Requirement 1.4: "below 50 MB of available space").
 * @type {number}
 */
export const LOW_STORAGE_THRESHOLD_BYTES = 50 * 1024 * 1024;

/**
 * @typedef {Object} StorageSignal
 * @property {boolean} low - true when available space is below the 50 MB
 *   threshold (or the estimate otherwise indicates low space).
 * @property {number|null} availableBytes - remaining bytes (`quota - usage`),
 *   or null when the Storage API is unavailable and space cannot be estimated.
 */

/**
 * @typedef {Object} ServiceWorkerController
 * @property {() => Promise<void>} applyUpdate - activate the waiting service
 *   worker and reload the page to pick up the new version.
 * @property {() => void} dismissUpdate - record the current timestamp under
 *   `aura.updateDismissed` so the update banner is not shown again for this
 *   version until the next one arrives.
 */

/**
 * @typedef {Object} InitServiceWorkerCallbacks
 * @property {() => void} [onUpdateAvailable] - a new version has been installed
 *   in the background and is waiting; the UI should show the update banner.
 * @property {() => void} [onOfflineReady] - all required assets are cached and
 *   the app is ready to run offline.
 * @property {(error: Error) => void} [onError] - registration / install failed;
 *   the error message is phrased for the "offline setup incomplete" reload
 *   prompt (Requirement 1.6).
 */

/**
 * Safely read a value from localStorage. Returns null when localStorage is
 * unavailable (private mode / disabled) rather than throwing.
 * @param {string} key
 * @returns {string|null}
 */
function safeGetItem(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/**
 * Safely persist a value to localStorage. Non-fatal when storage is unavailable.
 * @param {string} key
 * @param {string} value
 */
function safeSetItem(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Non-fatal: the dismissal simply won't survive a reload.
  }
}

/**
 * Whether the update banner has previously been dismissed by the student.
 * Reads the ISO timestamp recorded under `aura.updateDismissed`.
 *
 * @returns {boolean} true when a dismissal timestamp is present.
 */
export function isUpdateDismissed() {
  return safeGetItem(UPDATE_DISMISSED_KEY) !== null;
}

/**
 * Record that the student dismissed the update banner by writing the current
 * ISO timestamp under `aura.updateDismissed`.
 */
export function dismissUpdate() {
  safeSetItem(UPDATE_DISMISSED_KEY, new Date().toISOString());
}

/**
 * No-op controller returned when registration cannot proceed (e.g. the virtual
 * module is unavailable outside a Vite build, or service workers are
 * unsupported). `dismissUpdate` still records the dismissal; `applyUpdate`
 * resolves without doing anything so callers need not special-case it.
 * @type {ServiceWorkerController}
 */
const NOOP_CONTROLLER = {
  applyUpdate: async () => {},
  dismissUpdate,
};

/**
 * Register the generated service worker and wire the offline-lifecycle
 * callbacks. Returns a controller the UI uses to apply or dismiss an update.
 *
 * The `virtual:pwa-register` module only resolves inside the Vite build, so it
 * is imported dynamically inside a try/catch. When it cannot be loaded (e.g.
 * under Vitest, or when service workers are unsupported), a no-op controller is
 * returned and no callback fires, keeping the module safe to import and call in
 * a test environment.
 *
 * @param {InitServiceWorkerCallbacks} [callbacks]
 * @returns {Promise<ServiceWorkerController>}
 */
export async function initServiceWorker(callbacks = {}) {
  const { onUpdateAvailable, onOfflineReady, onError } = callbacks;

  // Service workers require a secure context + navigator.serviceWorker. Bail
  // out gracefully when unsupported (older browsers, test environments).
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return NOOP_CONTROLLER;
  }

  let registerSW;
  try {
    // Dynamic import so Vitest (which cannot resolve the virtual module) can
    // still import this file. The import only succeeds inside a Vite build.
    ({ registerSW } = await import('virtual:pwa-register'));
  } catch {
    // Not running inside a Vite build (or SW unsupported): nothing to register.
    return NOOP_CONTROLLER;
  }

  if (typeof registerSW !== 'function') {
    return NOOP_CONTROLLER;
  }

  // updateSW(true) tells the waiting worker to skipWaiting and reloads the page
  // so the new version takes over. Captured from registerSW below.
  let updateSW = async () => {};

  try {
    updateSW = registerSW({
      // A new version was downloaded in the background and is waiting to
      // activate. Only prompt when the student hasn't already dismissed it so
      // the banner is non-nagging (Requirement 1.3).
      onNeedRefresh() {
        if (!isUpdateDismissed()) {
          onUpdateAvailable?.();
        }
      },
      // All required assets are cached; the app can now run offline (Req 1.1).
      onOfflineReady() {
        onOfflineReady?.();
      },
      // Registration error (e.g. network interruption during first-visit asset
      // caching) → surface an "offline setup incomplete" message so the UI can
      // prompt a reload while connected (Requirement 1.6).
      onRegisterError(error) {
        onError?.(toSetupError(error));
      },
    });
  } catch (error) {
    onError?.(toSetupError(error));
    return NOOP_CONTROLLER;
  }

  return {
    /**
     * Activate the waiting worker and reload. A fresh version of the app
     * dismissal flag is cleared so the next update prompts again.
     */
    async applyUpdate() {
      try {
        // true → immediately reload once the new worker takes control.
        await updateSW(true);
      } catch (error) {
        onError?.(toSetupError(error));
      }
    },
    dismissUpdate,
  };
}

/**
 * Wrap an arbitrary registration/install failure in an Error whose message is
 * phrased for the "offline setup incomplete" reload prompt (Requirement 1.6).
 *
 * @param {unknown} error
 * @returns {Error}
 */
function toSetupError(error) {
  const detail = error instanceof Error ? error.message : String(error);
  const wrapped = new Error(
    `Offline setup is incomplete. Reload while connected to finish installing Aura for offline use. (${detail})`
  );
  wrapped.name = 'OfflineSetupIncompleteError';
  // Preserve the original error for debugging without losing the message above.
  wrapped.cause = error;
  return wrapped;
}

/**
 * Estimate remaining cache space via the Storage API and report whether it has
 * fallen below the 50 MB threshold (Requirement 1.4).
 *
 * Guards for environments without `navigator.storage.estimate` (older browsers,
 * jsdom): in that case space cannot be estimated, so `availableBytes` is null
 * and `low` is false (we don't raise a false warning when we simply can't
 * measure).
 *
 * @returns {Promise<StorageSignal>}
 */
export async function checkStorage() {
  const storage =
    typeof navigator !== 'undefined' ? navigator.storage : undefined;

  if (!storage || typeof storage.estimate !== 'function') {
    return { low: false, availableBytes: null };
  }

  let estimate;
  try {
    estimate = await storage.estimate();
  } catch {
    // Estimate failed — treat as "cannot measure" rather than low.
    return { low: false, availableBytes: null };
  }

  const quota = typeof estimate.quota === 'number' ? estimate.quota : null;
  const usage = typeof estimate.usage === 'number' ? estimate.usage : 0;

  if (quota === null) {
    // No quota reported: we cannot compute remaining space reliably.
    return { low: false, availableBytes: null };
  }

  const availableBytes = Math.max(0, quota - usage);
  const low = availableBytes < LOW_STORAGE_THRESHOLD_BYTES;

  return { low, availableBytes };
}
