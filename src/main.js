// src/main.js
// Aura app shell — a small modular single-page UI for the offline math tutor.
//
// This file establishes the shell that later tasks (13.1 capture→OCR→review,
// 13.2 walkthrough/practice/progress, 13.3 language prompt/settings) extend by
// registering additional views. It intentionally keeps the structure modular:
//
//   - DOM helpers (`el`, `h`, `clear`, `showToast`) shared across all views.
//   - A view registry + `renderView(name, props)` router so new views plug in
//     via `registerView(name, renderFn)` without touching existing ones.
//   - The topic-detection view/component (12.1), the capture→OCR→review flow
//     (13.1), the walkthrough/practice/progress flow (13.2), and the language
//     prompt + settings toggle + live re-render (13.3) all built on those
//     primitives.
//
// Task 12.1 scope (Requirements 4.2, 4.3, 4.4, 4.5):
//   - Display the detected Topic + Curriculum_Level after classification.
//   - On low classification confidence, prompt manual selection from a dropdown
//     of all TOPICS.
//   - On "disagree", show a dropdown of all topics for the enrolled level and
//     allow exactly one replacement.
//
// The engine is NOT invoked here; the topic-detection view consumes a
// classification result object supplied by the caller (task 13 wires the real
// classify call into this view).

import './style.css';

import { TOPICS, CURRICULUM_LEVELS, CURRICULUM_LEVEL_LABELS } from './types.js';
import {
  initI18n,
  t,
  setLanguage,
  getCurrentLanguage,
  onLanguageChanged,
  SUPPORTED_LANGUAGES,
  LANGUAGE_STORAGE_KEY,
  DEFAULT_LANGUAGE,
} from './i18n/i18nService.js';
import {
  captureFromCamera,
  captureFromFile,
  validateFile,
  createPreview,
  CameraUnavailableError,
} from './capture/captureModule.js';
import {
  runOCR,
  OCRNetworkError,
  OCRTimeoutError,
  OCRLowConfidenceError,
  OCRAPIError,
} from './backend/fetchOCR.js';
import { formatProblemText, formatStepText } from './formatting/prettyPrinter.js';
import tutorEngine, {
  classifyProblem,
  generateSolution,
  generateExercises,
} from './tutor/tutorEngine.js';
import { createTutorSession } from './tutor/tutorSession.js';
import {
  recordExerciseResult,
  getSummary,
  clearAll,
  isStorageAvailable,
} from './progress/progressStore.js';

/* ------------------------------------------------------------------ *
 * DOM helpers (shared render utilities used across all views)
 * ------------------------------------------------------------------ */

/**
 * Create a DOM element with attributes and children in one call.
 *
 * - `attrs` keys map to properties/attributes. `class`/`className`, `text`,
 *   `html`, `dataset`, and `on*` event handlers are handled specially; every
 *   other key is set as an attribute (so `aria-label`, `for`, `type`, etc. all
 *   work). A `null`/`undefined`/`false` value skips the attribute.
 * - `children` may be nodes, strings (converted to text nodes), or nested
 *   arrays; nullish entries are ignored.
 *
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {...(Node|string|null|undefined|Array<Node|string|null|undefined>)} children
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;

    if (key === 'class' || key === 'className') {
      node.className = String(value);
    } else if (key === 'text') {
      node.textContent = String(value);
    } else if (key === 'html') {
      node.innerHTML = String(value);
    } else if (key === 'dataset' && typeof value === 'object') {
      Object.assign(node.dataset, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }

  appendChildren(node, children);
  return node;
}

/** `h` is an alias of `el` for callers that prefer the hyperscript name. */
export const h = el;

/**
 * Append a (possibly nested) list of children to a parent, skipping nullish
 * entries and converting strings to text nodes.
 * @param {Node} parent
 * @param {Array<any>} children
 */
function appendChildren(parent, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) {
      appendChildren(parent, child);
    } else if (child instanceof Node) {
      parent.appendChild(child);
    } else {
      parent.appendChild(document.createTextNode(String(child)));
    }
  }
}

/**
 * Remove all children from a node.
 * @param {Node} node
 * @returns {Node} the same node, for chaining
 */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/**
 * Minimal, non-blocking toast placeholder. The full accessible styling pass is
 * a later task (10/13.5); this provides the shared entry point now so views can
 * surface transient messages (errors, confirmations) consistently.
 *
 * @param {string} message
 * @param {{ type?: 'info'|'error'|'success', timeout?: number }} [options]
 */
export function showToast(message, options = {}) {
  const { type = 'info', timeout = 3000 } = options;
  let host = document.getElementById('toast-host');
  if (!host) {
    host = el('div', { id: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(host);
  }
  const toast = el('div', { class: `toast toast-${type}`, text: message });
  host.appendChild(toast);
  if (timeout > 0) {
    setTimeout(() => {
      toast.remove();
      if (!host.firstChild) host.remove();
    }, timeout);
  }
  return toast;
}

/* ------------------------------------------------------------------ *
 * View registry + router
 * ------------------------------------------------------------------ */

/**
 * Registered views keyed by name. Later tasks register 'capture', 'review',
 * 'solution', 'practice', 'progress', and 'settings' here.
 *
 * A render function receives `(props)` and returns a DOM node (or an array of
 * nodes) to mount into the main content region.
 *
 * @type {Map<string, (props?: object) => Node|Node[]>}
 */
const views = new Map();

/** The currently mounted view, re-rendered on language change. */
let currentView = /** @type {{ name: string, props: object }|null} */ (null);

/**
 * Register (or replace) a view renderer.
 * @param {string} name
 * @param {(props?: object) => Node|Node[]} renderFn
 */
export function registerView(name, renderFn) {
  views.set(name, renderFn);
}

/** @returns {string[]} the names of all registered views. */
export function registeredViews() {
  return [...views.keys()];
}

/**
 * Render a view by name into the main content region, replacing whatever is
 * there. Unknown view names render a simple fallback rather than throwing so a
 * mis-wired flow degrades gracefully.
 *
 * @param {string} name
 * @param {object} [props]
 */
export function renderView(name, props = {}) {
  const main = document.getElementById('app-main');
  if (!main) {
    console.error('[aura] app shell not mounted; call mountAppShell() first');
    return;
  }

  currentView = { name, props };
  clear(main);

  const renderFn = views.get(name);
  if (!renderFn) {
    main.appendChild(el('p', { class: 'view-missing', text: `Unknown view: ${name}` }));
    return;
  }

  const result = renderFn(props);
  appendChildren(main, Array.isArray(result) ? result : [result]);
}

/** Re-render the current view in place (used after a language change). */
export function rerenderCurrentView() {
  if (currentView) renderView(currentView.name, currentView.props);
}

/* ------------------------------------------------------------------ *
 * Topic detection + manual override (Task 12.1)
 * ------------------------------------------------------------------ */

/**
 * Classification confidence at or above which the detected topic is shown as a
 * confident result; below it the student is prompted to pick a topic manually
 * (Requirement 4.3).
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Build the list of topic options to show for a given Curriculum_Level.
 *
 * Per Requirement 4.5 / Property 7, every Curriculum_Level exposes the full set
 * of twelve minimum required topics, so this returns all TOPICS regardless of
 * the level. It is factored out as a pure function so the coverage property
 * (task 12.2) can assert it directly without touching the DOM.
 *
 * An unknown level is treated the same as any valid level — all topics are
 * available — so the override dropdown is never empty.
 *
 * @param {import('./types.js').CurriculumLevel|string} [_level] enrolled level
 * @returns {string[]} the canonical topic identifiers (length 12)
 */
export function topicOptionsForLevel(_level) {
  return [...TOPICS];
}

/**
 * Localise a topic identifier via the `topics` map, falling back to the raw
 * identifier if no translation exists.
 * @param {string} topic
 * @returns {string}
 */
function topicLabel(topic) {
  return t(`topics.${topic}`, { defaultValue: topic });
}

/**
 * Localise a Curriculum_Level, falling back to the static English label.
 * @param {string} level
 * @returns {string}
 */
function levelLabel(level) {
  return t(`levels.${level}`, { defaultValue: CURRICULUM_LEVEL_LABELS[level] ?? level });
}

/**
 * Build a labelled <select> of topics.
 *
 * @param {object} opts
 * @param {string} opts.id - element id (also used to associate the label)
 * @param {string} opts.label - visible/aria label text
 * @param {string[]} opts.topics - topic identifiers to list as options
 * @param {string} [opts.selected] - topic identifier to pre-select
 * @param {(topic: string) => void} [opts.onChange]
 * @returns {{ wrapper: HTMLElement, select: HTMLSelectElement }}
 */
function buildTopicSelect({ id, label, topics, selected, onChange }) {
  const select = /** @type {HTMLSelectElement} */ (
    el(
      'select',
      {
        id,
        class: 'topic-select',
        'aria-label': label,
        onChange: (e) => onChange && onChange(e.target.value),
      },
      topics.map((topic) =>
        el('option', { value: topic, selected: topic === selected }, topicLabel(topic)),
      ),
    )
  );

  const wrapper = el(
    'div',
    { class: 'field' },
    el('label', { for: id, class: 'field-label' }, label),
    select,
  );

  return { wrapper, select };
}

/**
 * Render the topic-detection view/component.
 *
 * Given a classification result it renders one of two states:
 *
 *  - Low confidence (`confidence < LOW_CONFIDENCE_THRESHOLD`) → a manual
 *    selection prompt with a dropdown of all TOPICS (Requirement 4.3). The
 *    student must pick a topic to proceed.
 *
 *  - Confident → the detected Topic + Curriculum_Level (Requirement 4.2) plus a
 *    "disagree / not right?" control that reveals a dropdown of all topics for
 *    the enrolled level, letting the student choose exactly one replacement
 *    (Requirement 4.4).
 *
 * The chosen topic is surfaced through `onTopicChosen(topic, { level, source })`
 * so task 13's flow can consume it. `source` is `'detected'`, `'manual'`, or
 * `'override'`.
 *
 * @param {object} props
 * @param {import('./types.js').Classification} props.classification
 *   `{ topic, curriculumLevel, confidence }`
 * @param {(topic: string, meta: { level: string, source: string }) => void} [props.onTopicChosen]
 * @returns {HTMLElement}
 */
export function renderTopicDetection(props = {}) {
  const { classification = {}, onTopicChosen } = props;
  const {
    topic = '',
    curriculumLevel = CURRICULUM_LEVELS[0],
    confidence = 0,
  } = classification;

  /** Fire the chosen-topic callback, guarding against a missing handler. */
  function choose(chosen, source) {
    if (typeof onTopicChosen === 'function') {
      onTopicChosen(chosen, { level: curriculumLevel, source });
    }
  }

  const section = el('section', {
    class: 'topic-detection',
    'aria-label': t('topic_label'),
  });

  // --- Low-confidence path: prompt manual selection immediately (4.3). ---
  if (!(confidence >= LOW_CONFIDENCE_THRESHOLD)) {
    const { wrapper, select } = buildTopicSelect({
      id: 'topic-manual-select',
      label: t('topics_dropdown_label'),
      topics: topicOptionsForLevel(curriculumLevel),
      selected: topic || undefined,
    });

    appendChildren(section, [
      el('p', { class: 'topic-detect-note', text: t('topic_disagree') }),
      el(
        'div',
        { class: 'topic-level-row' },
        el('span', { class: 'level-chip' }, `${t('level_label')}: ${levelLabel(curriculumLevel)}`),
      ),
      wrapper,
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary',
          onClick: () => choose(select.value, 'manual'),
        },
        t('btn_confirm'),
      ),
    ]);

    return section;
  }

  // --- Confident path: show detected topic + level with a disagree control. ---
  const detected = el(
    'div',
    { class: 'topic-detected' },
    el(
      'p',
      { class: 'topic-line' },
      el('span', { class: 'topic-field-label' }, `${t('topic_label')}: `),
      el('span', { class: 'topic-value', 'data-topic': topic }, topicLabel(topic)),
    ),
    el(
      'p',
      { class: 'level-line' },
      el('span', { class: 'level-field-label' }, `${t('level_label')}: `),
      el('span', { class: 'level-value', 'data-level': curriculumLevel }, levelLabel(curriculumLevel)),
    ),
  );

  // Holder for the override dropdown, revealed when the student disagrees.
  const overrideHolder = el('div', { class: 'topic-override' });

  const disagreeBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-link topic-disagree-btn',
      'aria-expanded': 'false',
      onClick: () => showOverride(),
    },
    t('topic_disagree'),
  );

  /** Reveal the override dropdown of all topics for the enrolled level (4.4). */
  function showOverride() {
    disagreeBtn.setAttribute('aria-expanded', 'true');
    disagreeBtn.disabled = true;
    clear(overrideHolder);

    const { wrapper, select } = buildTopicSelect({
      id: 'topic-override-select',
      label: t('topics_dropdown_label'),
      topics: topicOptionsForLevel(curriculumLevel),
      selected: topic || undefined,
    });

    appendChildren(overrideHolder, [
      wrapper,
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary',
          // Exactly one replacement topic (the single current <select> value).
          onClick: () => choose(select.value, 'override'),
        },
        t('btn_confirm'),
      ),
    ]);
  }

  appendChildren(section, [
    detected,
    el(
      'button',
      {
        type: 'button',
        class: 'btn btn-primary topic-accept-btn',
        onClick: () => choose(topic, 'detected'),
      },
      t('btn_solve'),
    ),
    disagreeBtn,
    overrideHolder,
  ]);

  return section;
}

// Register the topic-detection view so the router can mount it by name.
registerView('topic', renderTopicDetection);

/* ------------------------------------------------------------------ *
 * Capture → OCR → review flow (Task 13.1)
 *
 * Wires the camera / upload / manual-entry entry points through the
 * CaptureModule, an image preview with Confirm/Retake, an OCR submission with
 * a loading indicator rendered synchronously (so it appears within 500 ms),
 * and an editable, pretty-printed Problem_Text review that transitions into
 * topic detection via the on-device TutorEngine.
 *
 * Requirements: 2.4, 2.5, 2.6, 2.8, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6.
 *
 * A single module-level state object carries the working File, problem text,
 * and classification forward as the student moves through the flow.
 * ------------------------------------------------------------------ */

/**
 * Mutable flow state shared across the capture → OCR → review views. Reset via
 * {@link resetFlowState} whenever the student starts a brand-new problem.
 *
 * @type {{
 *   file: File|null,
 *   preview: { url: string, revoke: () => void }|null,
 *   problemText: string,
 *   classification: import('./types.js').Classification|null,
 *   ocrWarnings: string[],
 *   cameraAvailable: boolean,
 * }}
 */
const appState = {
  file: null,
  preview: null,
  problemText: '',
  classification: null,
  ocrWarnings: [],
  cameraAvailable: true,
};

/** Revoke any live preview object URL and clear the per-problem working state. */
function resetFlowState() {
  if (appState.preview) {
    appState.preview.revoke();
    appState.preview = null;
  }
  appState.file = null;
  appState.problemText = '';
  appState.classification = null;
  appState.ocrWarnings = [];
}

/**
 * Translate a thrown OCR error into the matching inline/toast message key and
 * the set of recovery actions the review flow should offer.
 *
 * @param {unknown} err
 * @returns {{ messageKey: string, retry: boolean, manual: boolean, recapture: boolean }}
 */
function describeOCRError(err) {
  if (err instanceof OCRNetworkError) {
    // Offline: OCR needs a connection — steer to manual entry (Req 2.8).
    return { messageKey: 'error_ocr_network', retry: true, manual: true, recapture: false };
  }
  if (err instanceof OCRTimeoutError) {
    // Timed out — offer a retry (Req 3.5).
    return { messageKey: 'error_ocr_timeout', retry: true, manual: true, recapture: false };
  }
  if (err instanceof OCRLowConfidenceError) {
    // Could not read clearly — re-capture or manual entry (Req 3.4).
    return { messageKey: 'error_ocr_confidence', retry: false, manual: true, recapture: true };
  }
  if (err instanceof OCRAPIError) {
    // Generic service error — retry or manual entry (Req 3.4).
    return { messageKey: 'error_ocr_api', retry: true, manual: true, recapture: true };
  }
  // Unknown failure — treat like a generic API error so the flow never crashes.
  return { messageKey: 'error_ocr_api', retry: true, manual: true, recapture: true };
}

/**
 * The capture / home view (Requirements 2.4, 2.5, 2.6). Offers Camera, Upload
 * Image, and a manual "Type Problem" entry point, and renders the image
 * preview + Confirm/Retake sub-state once a valid file has been chosen.
 *
 * Props:
 *  - `stage`: `'choose'` (default) shows the entry buttons; `'preview'` shows
 *    the selected image with Confirm/Retake.
 *  - `error`: optional pre-translated inline error string (e.g. from a failed
 *    validation) surfaced above the buttons.
 *
 * @param {{ stage?: 'choose'|'preview', error?: string }} [props]
 * @returns {HTMLElement}
 */
export function renderCapture(props = {}) {
  const { stage = 'choose', error } = props;

  const section = el('section', {
    class: 'capture-view',
    'aria-label': t('btn_camera'),
  });

  // Inline error region (file validation / camera fallback messaging).
  const errorRegion = el('p', {
    class: 'capture-error',
    role: 'alert',
    'aria-live': 'assertive',
  });
  if (error) errorRegion.textContent = error;

  /** Replace the inline error text in place without re-rendering the view. */
  function setError(message) {
    errorRegion.textContent = message || '';
  }

  // ---- Preview sub-state: image + Confirm/Retake (Req 2.4). --------------
  if (stage === 'preview' && appState.preview) {
    const img = el('img', {
      class: 'capture-preview-img',
      src: appState.preview.url,
      alt: t('ocr_edit_prompt'),
    });

    appendChildren(section, [
      errorRegion,
      el('div', { class: 'capture-preview' }, img),
      el(
        'div',
        { class: 'capture-actions' },
        el(
          'button',
          {
            type: 'button',
            class: 'btn btn-primary',
            onClick: () => submitOCR(),
          },
          t('btn_confirm'),
        ),
        el(
          'button',
          {
            type: 'button',
            class: 'btn btn-secondary',
            onClick: () => {
              // Discard this capture and return to the entry buttons (Req 2.4).
              resetFlowState();
              renderView('capture', {});
            },
          },
          t('btn_retake'),
        ),
      ),
    ]);

    return section;
  }

  // ---- Choose sub-state: Camera / Upload / Type Problem entry points. -----

  /**
   * Validate a freshly chosen File and advance to the preview sub-state, or
   * surface the matching inline format/size error (Requirements 2.5, 2.6).
   * @param {File} file
   */
  function acceptFile(file) {
    const result = validateFile(file);
    if (!result.valid) {
      // Map to the localised format/size message based on the failure kind.
      const isSize = file.size > 10 * 1024 * 1024;
      setError(t(isSize ? 'error_file_size' : 'error_file_format'));
      return;
    }
    resetFlowState();
    appState.file = file;
    appState.preview = createPreview(file);
    renderView('capture', { stage: 'preview' });
  }

  const cameraBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-primary',
      onClick: async () => {
        setError('');
        try {
          const file = await captureFromCamera();
          acceptFile(file);
        } catch (err) {
          if (err instanceof CameraUnavailableError) {
            // Fall back to upload-only and inform the student (Req 2.9 adjacent).
            appState.cameraAvailable = false;
            showToast(t('error_camera'), { type: 'error' });
            setError(t('error_camera'));
            cameraBtn.disabled = true;
          }
          // A plain cancellation is silent — nothing to recover from.
        }
      },
    },
    t('btn_camera'),
  );
  if (!appState.cameraAvailable) cameraBtn.disabled = true;

  const uploadBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-secondary',
      onClick: async () => {
        setError('');
        try {
          const file = await captureFromFile();
          acceptFile(file);
        } catch {
          // User cancelled the file picker — nothing to report.
        }
      },
    },
    t('btn_upload'),
  );

  const manualBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-link',
      onClick: () => {
        // Manual-entry path: open the review view with an empty textarea.
        resetFlowState();
        renderView('review', { manual: true });
      },
    },
    t('btn_manual'),
  );

  appendChildren(section, [
    errorRegion,
    el('div', { class: 'capture-actions' }, cameraBtn, uploadBtn),
    manualBtn,
  ]);

  return section;
}

registerView('capture', renderCapture);

/**
 * Build the Problem_Text from an OCR result. When the parser found the answer
 * options, the question and its options are laid out one per line (question, then
 * "A. ...", "B. ...") so a multiple-choice problem keeps its choices; otherwise
 * the arranged OCR text is used as is.
 *
 * @param {string} text arranged OCR text
 * @param {{ question?: string, options?: Array<{ label: string, text: string }> }} [parsed]
 * @returns {string}
 */
function composeProblemText(text, parsed) {
  const options = parsed?.options ?? [];
  if (!parsed?.question || options.length < 2) return text;
  return [parsed.question, ...options.map((o) => `${o.label}. ${o.text}`.trim())].join('\n');
}

/**
 * Submit the current {@link appState.file} to OCR.
 *
 * The loading indicator is rendered synchronously (before awaiting `runOCR`) so
 * it is visible within 500 ms of Confirm (Requirement 3.1). On success the
 * review view opens with the extracted, pretty-printed Problem_Text; on failure
 * the matching error view offers retry / re-capture / manual-entry recovery
 * (Requirements 2.8, 3.4, 3.5).
 *
 * @returns {Promise<void>}
 */
async function submitOCR() {
  if (!appState.file) {
    renderView('capture', {});
    return;
  }

  // Synchronous loading view — appears well within the 500 ms budget (Req 3.1).
  renderLoading();

  try {
    const { text, parsed } = await runOCR(appState.file);
    appState.problemText = formatProblemText(composeProblemText(text, parsed));
    // Anything the parser was unsure about (unread option label, fewer than four
    // options, empty option text) is shown on the review screen.
    appState.ocrWarnings = parsed?.warnings ?? [];
    renderView('review', { manual: false });
  } catch (err) {
    const info = describeOCRError(err);
    renderView('ocr-error', info);
  }
}

/** Render the OCR loading indicator into the main region (Requirement 3.1). */
function renderLoading() {
  const main = document.getElementById('app-main');
  if (!main) return;
  clear(main);
  // Transient, synchronous state: clear the router's current-view record so a
  // language change mid-request doesn't try to re-render an unregistered view.
  currentView = null;
  appendChildren(main, [
    el(
      'section',
      { class: 'ocr-loading', role: 'status', 'aria-live': 'polite' },
      el('div', { class: 'spinner', 'aria-hidden': 'true' }),
      el('p', { class: 'ocr-loading-text', text: t('ocr_loading') }),
    ),
  ]);
}

/**
 * The OCR error recovery view (Requirements 2.8, 3.4, 3.5). Shows the relevant
 * message and the recovery actions appropriate to the failure.
 *
 * @param {{ messageKey: string, retry?: boolean, manual?: boolean, recapture?: boolean }} props
 * @returns {HTMLElement}
 */
export function renderOCRError(props = {}) {
  const { messageKey = 'error_ocr_api', retry = false, manual = true, recapture = false } = props;

  const actions = el('div', { class: 'capture-actions' });

  if (retry) {
    actions.appendChild(
      el(
        'button',
        { type: 'button', class: 'btn btn-primary', onClick: () => submitOCR() },
        t('btn_retry'),
      ),
    );
  }

  if (recapture) {
    actions.appendChild(
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn-secondary',
          onClick: () => {
            resetFlowState();
            renderView('capture', {});
          },
        },
        t('btn_retake'),
      ),
    );
  }

  if (manual) {
    actions.appendChild(
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn-link',
          onClick: () => {
            // Keep whatever file is around but open an empty manual review.
            appState.problemText = '';
            renderView('review', { manual: true });
          },
        },
        t('btn_manual'),
      ),
    );
  }

  return el(
    'section',
    { class: 'ocr-error-view', 'aria-label': t(messageKey) },
    el('p', { class: 'ocr-error-msg', role: 'alert', text: t(messageKey) }),
    actions,
  );
}

registerView('ocr-error', renderOCRError);

/**
 * The review view (Requirements 3.1, 3.2, 3.3, 3.6). Shows the extracted
 * Problem_Text in an editable textarea (pretty-printed), keeps the working text
 * in sync as the student edits, validates against whitespace-only input, then
 * classifies the problem and transitions to the topic view.
 *
 * Props:
 *  - `manual`: when true the textarea starts empty (manual-entry path);
 *    otherwise it is seeded from {@link appState.problemText}.
 *
 * @param {{ manual?: boolean }} [props]
 * @returns {HTMLElement}
 */
export function renderReview(props = {}) {
  const { manual = false } = props;

  // Seed the editable field. Manual entry starts empty; OCR results are already
  // pretty-printed in appState.problemText. Normalise notation on display so an
  // OCR result and a typed problem are presented consistently (Req 3.3).
  const initial = manual ? '' : formatProblemText(appState.problemText || '');
  appState.problemText = initial;

  // Tell the student when the scan may have misread the question or its options.
  const ocrNotice =
    !manual && appState.ocrWarnings.length > 0
      ? el('p', {
          class: 'review-warning',
          role: 'status',
          text: t('ocr_review_check', {
            defaultValue: 'Some parts may be misread. Please check the question and the options below.',
          }),
        })
      : null;

  const textarea = /** @type {HTMLTextAreaElement} */ (
    el('textarea', {
      id: 'review-problem-text',
      class: 'review-textarea',
      rows: 8, // room for the question plus options A-D
      'aria-label': t('ocr_edit_prompt'),
      placeholder: t('error_empty_problem'),
      // Editing updates the working problem text (Req 3.2).
      onInput: (e) => {
        appState.problemText = e.target.value;
        setValidationError('');
      },
    })
  );
  textarea.value = initial;

  const validationRegion = el('p', {
    class: 'review-error',
    role: 'alert',
    'aria-live': 'assertive',
  });

  /** Set/clear the inline validation message without a re-render. */
  function setValidationError(message) {
    validationRegion.textContent = message || '';
  }

  const solveBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-primary',
      onClick: () => void handleSolve(),
    },
    t('btn_solve'),
  );

  /**
   * Validate the working text, classify it, and advance to topic detection.
   * Whitespace-only input is blocked inline and never reaches the engine
   * (Requirement 3.6 / Property 5).
   */
  async function handleSolve() {
    const text = (appState.problemText || '').trim();
    if (text === '') {
      setValidationError(t('error_empty_problem'));
      textarea.focus();
      return;
    }

    appState.problemText = text;
    solveBtn.disabled = true;
    setValidationError('');

    let classification;
    try {
      // classifyProblem spins up the on-device WebLLM worker; it only runs here
      // at user-interaction time. Guard against unsupported-device throws so the
      // flow degrades gracefully instead of crashing (Req: AI parse failure).
      classification = await classifyProblem(text, getCurrentLanguage());
    } catch (err) {
      console.error('[aura] classifyProblem failed', err);
      showToast(t('error_parse'), { type: 'error' });
      solveBtn.disabled = false;
      return;
    }

    appState.classification = classification;
    renderView('topic', {
      classification,
      onTopicChosen: (topic, meta) => {
        appState.classification = { ...classification, topic, curriculumLevel: meta.level };
        // Hand off to the step-by-step walkthrough (Task 13.2). A fresh tutor
        // session is created per problem so hint/attempt state never leaks
        // across problems.
        startWalkthrough(topic, meta.level);
      },
    });
  }

  return el(
    'section',
    { class: 'review-view', 'aria-label': t('ocr_edit_prompt') },
    el('p', { class: 'review-prompt', text: t('ocr_edit_prompt') }),
    ocrNotice,
    el(
      'div',
      { class: 'field' },
      el('label', { for: 'review-problem-text', class: 'field-label', text: t('ocr_edit_prompt') }),
      textarea,
    ),
    validationRegion,
    el('div', { class: 'capture-actions' }, solveBtn),
  );
}

registerView('review', renderReview);

/* ------------------------------------------------------------------ *
 * Step-by-step walkthrough + practice + progress flow (Task 13.2)
 *
 * Picks up where the review → topic flow hands off: given the confirmed
 * Problem_Text and the chosen Topic / Curriculum_Level, it generates a
 * step-by-step solution (revealing one Step at a time), offers hints per step
 * through the session controller, shows a closing summary, then offers up to
 * five practice Exercises with answer submission, feedback, hints, and an
 * answer-reveal after two incorrect attempts. Completed exercises are recorded
 * via ProgressStore, and the progress view renders per-topic accuracy with a
 * clear-progress confirmation.
 *
 * Requirements: 5.1, 5.2, 5.5, 6.1, 6.2, 7.1, 7.2, 7.4.
 * ------------------------------------------------------------------ */

/**
 * Number of practice exercises generated per session (Requirement 6.1 — "up to
 * five").
 */
const PRACTICE_EXERCISE_COUNT = 5;

/**
 * Walkthrough / practice working state for the current problem. Carries the
 * generated solution steps, the reveal cursor, the active tutor session, and
 * the practice exercise set + cursor. Reset by {@link startWalkthrough} for
 * every new problem so no hint/attempt state leaks across problems.
 *
 * @type {{
 *   session: ReturnType<typeof createTutorSession>|null,
 *   topic: string,
 *   level: string,
 *   steps: Array<{number: number, total: number, working: string, explanation: string}>,
 *   revealedStep: number,
 *   exercises: import('./types.js').Exercise[],
 *   exerciseIndex: number,
 * }}
 */
const tutorState = {
  session: null,
  topic: '',
  level: '',
  steps: [],
  revealedStep: 0,
  exercises: [],
  exerciseIndex: 0,
};

/**
 * (Re)create the module-level tutor session for a new problem and open the
 * solution view. One session instance is reused across the solution walkthrough
 * and the practice flow for the current problem; it is recreated here so a new
 * problem starts with clean hint/attempt state.
 *
 * @param {string} topic
 * @param {string} level
 */
function startWalkthrough(topic, level) {
  tutorState.session = createTutorSession({
    engine: tutorEngine,
    language: getCurrentLanguage(),
  });
  tutorState.topic = topic;
  tutorState.level = level;
  tutorState.steps = [];
  tutorState.revealedStep = 0;
  tutorState.exercises = [];
  tutorState.exerciseIndex = 0;

  renderView('solution', {});
}

/**
 * The solution walkthrough view (Requirements 5.1, 5.2, 5.5).
 *
 * Generates the step-by-step solution on first entry (showing a loading state
 * while awaiting, guarded so a parse/engine failure surfaces an error_parse
 * toast with a retry), then reveals one Step at a time. Each step shows
 * "Step N of M", the pretty-printed working, and the explanation, plus a Hint
 * button (session-driven, capped at 3) and a Next Step / See Summary button.
 *
 * @returns {HTMLElement}
 */
export function renderSolution() {
  const section = el('section', {
    class: 'solution-view',
    'aria-label': t('summary_title'),
  });

  // --- No steps yet: generate them (async) behind a loading indicator. ----
  if (tutorState.steps.length === 0) {
    appendChildren(section, [
      el(
        'div',
        { class: 'solution-loading', role: 'status', 'aria-live': 'polite' },
        el('div', { class: 'spinner', 'aria-hidden': 'true' }),
        el('p', { class: 'solution-loading-text', text: t('ocr_loading') }),
      ),
    ]);

    // Kick off generation after the loading frame mounts.
    void loadSolutionSteps();
    return section;
  }

  const total = tutorState.steps.length;
  const index = Math.min(tutorState.revealedStep, total - 1);
  const step = tutorState.steps[index];
  const isLast = index >= total - 1;

  // Per-step hint output region (appended to as hints are requested).
  const hintRegion = el('div', { class: 'solution-hints', 'aria-live': 'polite' });

  const hintBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-link solution-hint-btn',
      onClick: () => void handleStepHint(index, step, hintBtn, hintRegion),
    },
    t('btn_hint'),
  );
  // Reflect any hints already used for this step if the view was re-rendered.
  const usedHints = tutorState.session ? tutorState.session.hintCountForStep(index) : 0;
  if (usedHints >= 3) hintBtn.disabled = true;

  const advanceBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-primary',
      onClick: () => {
        if (isLast) {
          renderView('summary', {});
        } else {
          tutorState.revealedStep = index + 1;
          renderView('solution', {});
        }
      },
    },
    isLast ? t('btn_see_summary') : t('btn_next_step'),
  );

  appendChildren(section, [
    el('p', {
      class: 'solution-step-counter',
      text: t('step_label', { current: index + 1, total }),
    }),
    el('div', { class: 'solution-step-working', text: formatStepText(step.working || '') }),
    el('p', {
      class: 'solution-step-explanation',
      text: formatStepText(step.explanation || ''),
    }),
    hintRegion,
    el('div', { class: 'solution-actions' }, hintBtn, advanceBtn),
  ]);

  return section;
}

registerView('solution', renderSolution);

/**
 * Generate the solution steps for the current problem and re-render the
 * solution view. On an engine/parse failure, surface an error toast and offer a
 * retry button (the student can also re-enter the problem).
 *
 * @returns {Promise<void>}
 */
async function loadSolutionSteps() {
  try {
    const steps = await generateSolution(
      appState.problemText,
      tutorState.topic,
      getCurrentLanguage(),
    );
    // Guard against an empty solution so the view never gets stuck on loading.
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new Error('empty solution');
    }
    tutorState.steps = steps;
    tutorState.revealedStep = 0;
    renderView('solution', {});
  } catch (err) {
    console.error('[aura] generateSolution failed', err);
    showToast(t('error_parse'), { type: 'error' });
    renderSolutionError();
  }
}

/** Render a retry affordance when solution generation fails. */
function renderSolutionError() {
  const main = document.getElementById('app-main');
  if (!main) return;
  clear(main);
  currentView = null;
  appendChildren(main, [
    el(
      'section',
      { class: 'solution-error', 'aria-label': t('error_parse') },
      el('p', { class: 'solution-error-msg', role: 'alert', text: t('error_parse') }),
      el(
        'div',
        { class: 'solution-actions' },
        el(
          'button',
          {
            type: 'button',
            class: 'btn btn-primary',
            onClick: () => renderView('solution', {}),
          },
          t('btn_retry'),
        ),
        el(
          'button',
          {
            type: 'button',
            class: 'btn btn-link',
            onClick: () => renderView('review', { manual: true }),
          },
          t('btn_new_problem'),
        ),
      ),
    ),
  ]);
}

/**
 * Request a hint for the current step through the session controller (hint cap
 * of 3 enforced there). Appends the hint text, or shows the rejection message
 * and disables further hints for the step once the cap is hit.
 *
 * @param {number} stepIndex
 * @param {{working?: string, explanation?: string}} step
 * @param {HTMLButtonElement} hintBtn
 * @param {HTMLElement} hintRegion
 * @returns {Promise<void>}
 */
async function handleStepHint(stepIndex, step, hintBtn, hintRegion) {
  if (!tutorState.session) return;
  hintBtn.disabled = true;
  try {
    const result = await tutorState.session.requestHint(
      stepIndex,
      { working: step.working, explanation: step.explanation },
      getCurrentLanguage(),
    );

    if (!result.ok) {
      // Hint cap reached — show the rejection and keep hints disabled.
      hintRegion.appendChild(
        el('p', { class: 'solution-hint hint-rejected', role: 'alert', text: result.message }),
      );
      return;
    }

    hintRegion.appendChild(
      el(
        'p',
        { class: 'solution-hint' },
        el('span', { class: 'hint-label', text: `${t('hint_label', { n: result.hintIndex + 1 })}: ` }),
        formatStepText(result.hint || ''),
      ),
    );

    // Re-enable for the next hint unless the cap has now been reached.
    if (result.hintsUsed < 3) {
      hintBtn.disabled = false;
    }
  } catch (err) {
    console.error('[aura] requestHint failed', err);
    showToast(t('error_parse'), { type: 'error' });
    hintBtn.disabled = false;
  }
}

/**
 * The closing summary view (Requirement 5.5). Confirms the final answer (the
 * last step's working) and the topic method, then offers practice.
 *
 * @returns {HTMLElement}
 */
export function renderSummary() {
  const steps = tutorState.steps;
  const finalStep = steps.length ? steps[steps.length - 1] : null;
  const finalAnswer = finalStep ? formatStepText(finalStep.working || '') : '';

  return el(
    'section',
    { class: 'summary-view', 'aria-label': t('summary_title') },
    el('h2', { class: 'summary-title', text: t('summary_title') }),
    // Summary statement: final answer + the topic method used (Req 5.5).
    el(
      'p',
      { class: 'summary-statement' },
      `${topicLabel(tutorState.topic)} — `,
      el('span', { class: 'summary-answer', text: finalAnswer }),
    ),
    // Practice offer (Req 6.1): Accept / Dismiss.
    el('p', { class: 'practice-offer', text: t('practice_offer') }),
    el(
      'div',
      { class: 'summary-actions' },
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary',
          onClick: () => void startPractice(),
        },
        t('btn_accept'),
      ),
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn-secondary',
          // Dismiss practice — go straight to the progress view.
          onClick: () => renderView('progress', {}),
        },
        t('btn_dismiss'),
      ),
    ),
  );
}

registerView('summary', renderSummary);

/**
 * Generate the practice exercise set for the current topic/level and open the
 * practice view at the first exercise (Requirement 6.2). Shows a loading state
 * while awaiting; on failure surfaces an error toast and falls back to progress.
 *
 * @returns {Promise<void>}
 */
async function startPractice() {
  renderPracticeLoading();
  try {
    const exercises = await generateExercises(
      tutorState.topic,
      tutorState.level,
      PRACTICE_EXERCISE_COUNT,
      getCurrentLanguage(),
    );
    if (!Array.isArray(exercises) || exercises.length === 0) {
      throw new Error('no exercises');
    }
    tutorState.exercises = exercises;
    tutorState.exerciseIndex = 0;
    renderView('practice', {});
  } catch (err) {
    console.error('[aura] generateExercises failed', err);
    showToast(t('error_parse'), { type: 'error' });
    renderView('progress', {});
  }
}

/** Render a transient loading indicator while practice exercises generate. */
function renderPracticeLoading() {
  const main = document.getElementById('app-main');
  if (!main) return;
  clear(main);
  currentView = null;
  appendChildren(main, [
    el(
      'section',
      { class: 'practice-loading', role: 'status', 'aria-live': 'polite' },
      el('div', { class: 'spinner', 'aria-hidden': 'true' }),
      el('p', { class: 'practice-loading-text', text: t('ocr_loading') }),
    ),
  ]);
}

/**
 * The practice view (Requirements 6.2, 7.1). Presents one exercise at a time
 * with an answer input and Submit. Drives the session controller: an
 * answer-format mismatch shows an inline error and records nothing; an
 * evaluated result shows feedback, offers a hint on incorrect attempts, and
 * (after two incorrect) a Show Answer control that reveals the answer + full
 * solution. Each completed exercise is recorded via ProgressStore (firstAttempt
 * = correct on the very first submission). After the last exercise, moves to
 * the progress view.
 *
 * @returns {HTMLElement}
 */
export function renderPractice() {
  const { exercises, exerciseIndex } = tutorState;
  const total = exercises.length;
  const exercise = exercises[exerciseIndex];

  const section = el('section', {
    class: 'practice-view',
    'aria-label': t('btn_practice'),
  });

  if (!exercise) {
    // Nothing to show — defensively route to progress.
    void Promise.resolve().then(() => renderView('progress', {}));
    return section;
  }

  // Track, per render of this exercise, whether the student has submitted yet
  // (for the firstAttempt flag) and whether it has been recorded already.
  let submissionCount = 0;
  let recorded = false;

  const inputId = `practice-answer-${exerciseIndex}`;
  const feedbackRegion = el('p', {
    class: 'practice-feedback',
    role: 'status',
    'aria-live': 'polite',
  });
  const errorRegion = el('p', {
    class: 'practice-error',
    role: 'alert',
    'aria-live': 'assertive',
  });
  const hintRegion = el('div', { class: 'practice-hints', 'aria-live': 'polite' });
  const revealRegion = el('div', { class: 'practice-reveal' });
  const extraActions = el('div', { class: 'practice-extra-actions' });

  const input = /** @type {HTMLInputElement} */ (
    el('input', {
      id: inputId,
      type: 'text',
      class: 'practice-answer-input',
      'aria-label': t('answer_label'),
      autocomplete: 'off',
      onInput: () => {
        errorRegion.textContent = '';
      },
    })
  );

  /** Record a completed exercise once (Req 7.1). */
  function record(correct, firstAttempt) {
    if (recorded) return;
    recorded = true;
    recordExerciseResult({
      topic: tutorState.topic,
      curriculumLevel: tutorState.level,
      correct,
      firstAttempt,
      timestamp: Date.now(),
    });
  }

  /** Advance to the next exercise, or to the progress view after the last. */
  function advance() {
    if (exerciseIndex >= total - 1) {
      renderView('progress', {});
    } else {
      tutorState.exerciseIndex = exerciseIndex + 1;
      renderView('practice', {});
    }
  }

  const submitBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-primary',
      onClick: () => void handleSubmit(),
    },
    t('btn_submit'),
  );

  const nextBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-secondary practice-next-btn',
      hidden: true,
      onClick: () => advance(),
    },
    exerciseIndex >= total - 1 ? t('btn_progress') : t('btn_next_step'),
  );

  /** Offer a hint for this exercise (reuses step-0 hint budget of the session). */
  function offerHint() {
    if (extraActions.querySelector('.practice-hint-btn')) return;
    const hintBtn = el(
      'button',
      {
        type: 'button',
        class: 'btn btn-link practice-hint-btn',
        onClick: () =>
          void handleStepHint(
            0,
            { working: exercise.prompt, explanation: '' },
            hintBtn,
            hintRegion,
          ),
      },
      t('btn_hint'),
    );
    extraActions.appendChild(hintBtn);
  }

  /** Offer the Show Answer control after two incorrect attempts (Req 6.4). */
  function offerReveal() {
    if (extraActions.querySelector('.practice-reveal-btn')) return;
    const revealBtn = el(
      'button',
      {
        type: 'button',
        class: 'btn btn-secondary practice-reveal-btn',
        onClick: () => void handleReveal(),
      },
      t('btn_show_answer'),
    );
    extraActions.appendChild(revealBtn);
  }

  async function handleReveal() {
    if (!tutorState.session) return;
    try {
      const result = await tutorState.session.revealAnswer(exercise, getCurrentLanguage());
      if (!result.ok) {
        errorRegion.textContent = result.message;
        return;
      }
      // Record the (incorrect) completed exercise if not already recorded.
      record(false, false);

      clear(revealRegion);
      appendChildren(revealRegion, [
        el(
          'p',
          { class: 'reveal-answer' },
          el('strong', {}, `${t('answer_label')}: `),
          formatStepText(result.answer || ''),
        ),
        el(
          'ol',
          { class: 'reveal-solution' },
          (result.solution || []).map((s) =>
            el(
              'li',
              { class: 'reveal-solution-step' },
              el('span', { class: 'reveal-working', text: formatStepText(s.working || '') }),
              el('span', { class: 'reveal-explanation', text: formatStepText(s.explanation || '') }),
            ),
          ),
        ),
      ]);

      // Lock interaction and let the student continue.
      input.disabled = true;
      submitBtn.disabled = true;
      clear(extraActions);
      nextBtn.hidden = false;
    } catch (err) {
      console.error('[aura] revealAnswer failed', err);
      showToast(t('error_parse'), { type: 'error' });
    }
  }

  async function handleSubmit() {
    if (!tutorState.session) return;
    const answer = input.value;
    const isFirstSubmission = submissionCount === 0;

    submitBtn.disabled = true;
    errorRegion.textContent = '';

    let result;
    try {
      result = await tutorState.session.submitAnswer(exercise, answer, getCurrentLanguage());
    } catch (err) {
      console.error('[aura] submitAnswer failed', err);
      showToast(t('error_parse'), { type: 'error' });
      submitBtn.disabled = false;
      return;
    }

    // Answer-format mismatch: inline error, nothing recorded, no evaluation.
    if (!result.ok) {
      if (result.reason === 'answer-format-mismatch') {
        errorRegion.textContent = t('answer_format_error');
      } else {
        errorRegion.textContent = result.message || t('answer_format_error');
      }
      submitBtn.disabled = false;
      return;
    }

    submissionCount += 1;

    if (result.correct) {
      feedbackRegion.textContent = t('answer_correct');
      if (result.feedback && result.feedback.explanation) {
        feedbackRegion.textContent += ` ${result.feedback.explanation}`;
      }
      // firstAttempt = correct on the very first submission (Req 7.1).
      record(true, isFirstSubmission);
      input.disabled = true;
      clear(extraActions);
      nextBtn.hidden = false;
      return;
    }

    // Incorrect: feedback + explanation, re-enable submit for another try.
    feedbackRegion.textContent = t('answer_incorrect');
    if (result.feedback && result.feedback.explanation) {
      feedbackRegion.textContent += ` ${result.feedback.explanation}`;
    }
    submitBtn.disabled = false;

    // Offer exactly one hint on an incorrect attempt (Req 6.3, session-driven).
    if (result.hintOffered) offerHint();
    // After two incorrect attempts, allow revealing the answer (Req 6.4).
    if (result.canReveal) offerReveal();
  }

  appendChildren(section, [
    el('p', {
      class: 'practice-counter',
      text: t('step_label', { current: exerciseIndex + 1, total }),
    }),
    el('p', { class: 'practice-prompt', text: formatStepText(exercise.prompt || '') }),
    exercise.answerFormat
      ? el('p', { class: 'practice-format-hint', text: exercise.answerFormat })
      : null,
    el(
      'div',
      { class: 'field' },
      el('label', { for: inputId, class: 'field-label', text: t('answer_label') }),
      input,
    ),
    errorRegion,
    feedbackRegion,
    hintRegion,
    revealRegion,
    el('div', { class: 'practice-actions' }, submitBtn, nextBtn),
    extraActions,
  ]);

  return section;
}

registerView('practice', renderPractice);

/**
 * The progress view (Requirements 7.2, 7.4). Renders per-topic totals and
 * first-attempt accuracy from ProgressStore.getSummary(). Shows an empty-state
 * message when there is nothing recorded, and a non-blocking notice when
 * persistent storage is unavailable. A Clear Progress button opens a
 * confirmation dialog (Confirm clears all + toasts, Cancel dismisses). A New
 * Problem button returns to the capture view.
 *
 * @returns {HTMLElement}
 */
export function renderProgress() {
  const section = el('section', {
    class: 'progress-view',
    'aria-label': t('progress_title'),
  });

  // Content region re-rendered in place after a clear, without leaving the view.
  const listRegion = el('div', { class: 'progress-list' });
  const confirmRegion = el('div', { class: 'progress-confirm' });

  /** Populate the list region from the current summary (async). */
  async function refresh() {
    clear(listRegion);
    let summary = [];
    try {
      summary = await getSummary();
    } catch (err) {
      console.error('[aura] getSummary failed', err);
    }

    if (!isStorageAvailable()) {
      listRegion.appendChild(
        el('p', { class: 'progress-no-save', role: 'status', text: t('progress_no_save') }),
      );
    }

    if (!summary.length) {
      listRegion.appendChild(
        el('p', { class: 'progress-empty', text: t('progress_empty') }),
      );
      return;
    }

    for (const row of summary) {
      listRegion.appendChild(
        el(
          'div',
          { class: 'progress-row' },
          el('span', { class: 'progress-topic', text: topicLabel(row.topic) }),
          el('span', {
            class: 'progress-total',
            text: `${t('progress_total')}: ${row.totalAttempts}`,
          }),
          el('span', {
            class: 'progress-accuracy',
            text: `${t('progress_accuracy')}: ${row.accuracyPercent}%`,
          }),
        ),
      );
    }
  }

  /** Show the clear-progress confirmation dialog (Req 7.4). */
  function showClearConfirm() {
    clear(confirmRegion);
    appendChildren(confirmRegion, [
      el(
        'div',
        { class: 'confirm-dialog', role: 'alertdialog', 'aria-label': t('btn_clear_progress') },
        el('p', { class: 'confirm-message', text: t('progress_clear_confirm') }),
        el(
          'div',
          { class: 'confirm-actions' },
          el(
            'button',
            {
              type: 'button',
              class: 'btn btn-primary',
              onClick: async () => {
                try {
                  await clearAll();
                } catch (err) {
                  console.error('[aura] clearAll failed', err);
                }
                clear(confirmRegion);
                showToast(t('progress_cleared'), { type: 'success' });
                await refresh();
              },
            },
            t('btn_confirm_clear'),
          ),
          el(
            'button',
            {
              type: 'button',
              class: 'btn btn-secondary',
              onClick: () => clear(confirmRegion),
            },
            t('btn_cancel'),
          ),
        ),
      ),
    ]);
  }

  appendChildren(section, [
    el('h2', { class: 'progress-title', text: t('progress_title') }),
    listRegion,
    el(
      'div',
      { class: 'progress-actions' },
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn-secondary',
          onClick: () => showClearConfirm(),
        },
        t('btn_clear_progress'),
      ),
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary',
          onClick: () => {
            // Start a brand-new problem from the capture entry point.
            resetFlowState();
            renderView('capture', {});
          },
        },
        t('btn_new_problem'),
      ),
    ),
    confirmRegion,
  ]);

  // Kick off the async summary load for the initial render.
  void refresh();

  return section;
}

registerView('progress', renderProgress);

/* ------------------------------------------------------------------ *
 * Language selection prompt + settings (Task 13.3)
 *
 * On first load, when no Language_Preference exists in localStorage under
 * `aura.language`, the app lands on the language-prompt view before any other
 * content (Requirement 8.1): the student chooses Bahasa Malaysia or English, or
 * dismisses the prompt to default to English (Requirement 8.5). Both paths call
 * setLanguage (which persists the choice) and proceed to the capture view.
 *
 * A reachable settings view exposes a language toggle (Requirements 8.2, 8.3):
 * switching the language calls setLanguage, and the existing onLanguageChanged
 * subscription re-renders the shell chrome, header controls, and the current
 * view in place with no page reload (Requirement 8.3 / Property 19).
 *
 * Requirements: 8.1, 8.2, 8.3, 8.5.
 * ------------------------------------------------------------------ */

/**
 * Read any persisted Language_Preference directly from localStorage, guarded so
 * a disabled/unavailable store (private mode) never throws. Used by bootstrap
 * to decide whether the language prompt is shown on first load (Req 8.1).
 *
 * @returns {string|null} the stored language code, or null when none/unavailable.
 */
export function readStoredLanguagePreference() {
  try {
    const stored = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
    return stored && SUPPORTED_LANGUAGES.includes(stored) ? stored : null;
  } catch {
    // localStorage unavailable — treat as "no preference".
    return null;
  }
}

/**
 * Human-readable label for a language code, localised via the existing
 * `lang_en` / `lang_ms` keys with the raw code as a last-resort fallback.
 * @param {string} lang
 * @returns {string}
 */
function languageLabel(lang) {
  return t(`lang_${lang}`, { defaultValue: lang });
}

/**
 * Commit a language choice and proceed into the app. Persists via setLanguage
 * (which also notifies subscribers so any mounted chrome re-renders), reflects
 * the choice on <html lang>, then lands on the capture view.
 *
 * @param {string} lang
 * @returns {Promise<void>}
 */
async function chooseLanguageAndContinue(lang) {
  try {
    await setLanguage(lang);
  } catch (err) {
    console.error('[aura] setLanguage failed', err);
  }
  document.documentElement.lang = getCurrentLanguage();
  renderView('capture', {});
}

/**
 * The first-load language selection prompt (Requirements 8.1, 8.5). Renders a
 * title + subtitle and two clear buttons (English / Bahasa Malaysia). Choosing
 * either persists it and proceeds to capture. A dismiss/skip control defaults
 * to English and proceeds (Req 8.5).
 *
 * @returns {HTMLElement}
 */
export function renderLanguagePrompt() {
  const section = el('section', {
    class: 'language-prompt',
    'aria-label': t('lang_prompt_title'),
  });

  const buttonFor = (lang) =>
    el(
      'button',
      {
        type: 'button',
        class: 'btn btn-primary lang-choice-btn',
        'data-lang': lang,
        onClick: () => void chooseLanguageAndContinue(lang),
      },
      languageLabel(lang),
    );

  appendChildren(section, [
    el('h2', { class: 'lang-prompt-title', text: t('lang_prompt_title') }),
    el('p', { class: 'lang-prompt-subtitle', text: t('lang_prompt_subtitle') }),
    el(
      'div',
      { class: 'lang-choices' },
      // List all supported languages so the prompt stays correct if the set grows.
      SUPPORTED_LANGUAGES.map((lang) => buttonFor(lang)),
    ),
    // Dismiss/skip → default to English and proceed (Req 8.5).
    el(
      'button',
      {
        type: 'button',
        class: 'btn btn-link lang-prompt-dismiss',
        onClick: () => void chooseLanguageAndContinue(DEFAULT_LANGUAGE),
      },
      t('btn_continue'),
    ),
  ]);

  return section;
}

registerView('language', renderLanguagePrompt);

/**
 * The settings view (Requirements 8.2, 8.3). Exposes a language toggle listing
 * all SUPPORTED_LANGUAGES with the active one marked (aria-pressed). Choosing a
 * language calls setLanguage; the onLanguageChanged subscription then re-renders
 * this view in place (no reload — Req 8.3), so the newly selected button shows
 * as active and every t() string updates. A back control returns to the view
 * that opened settings.
 *
 * Props:
 *  - `returnTo`: the view name to return to via the back control (defaults to
 *    'capture'). Carried through the router so it survives a re-render.
 *
 * @param {{ returnTo?: string }} [props]
 * @returns {HTMLElement}
 */
export function renderSettings(props = {}) {
  const { returnTo = 'capture' } = props;
  const current = getCurrentLanguage();

  const section = el('section', {
    class: 'settings-view',
    'aria-label': t('settings_title'),
  });

  const toggle = el('div', {
    class: 'settings-lang-toggle',
    role: 'group',
    'aria-label': t('settings_language'),
  });

  for (const lang of SUPPORTED_LANGUAGES) {
    const active = lang === current;
    toggle.appendChild(
      el(
        'button',
        {
          type: 'button',
          class: `btn ${active ? 'btn-primary' : 'btn-secondary'} settings-lang-btn`,
          'data-lang': lang,
          'aria-pressed': active ? 'true' : 'false',
          // Changing the language re-renders this view in place (Req 8.3).
          onClick: async () => {
            if (lang === getCurrentLanguage()) return;
            try {
              await setLanguage(lang);
            } catch (err) {
              console.error('[aura] setLanguage failed', err);
            }
          },
        },
        languageLabel(lang),
      ),
    );
  }

  appendChildren(section, [
    el('h2', { class: 'settings-title', text: t('settings_title') }),
    el(
      'div',
      { class: 'field' },
      el('span', { class: 'field-label', text: t('settings_language') }),
      toggle,
    ),
    el(
      'div',
      { class: 'settings-actions' },
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn-secondary settings-back-btn',
          // Return to whatever view opened settings.
          onClick: () => renderView(returnTo, {}),
        },
        t('nav_home'),
      ),
    ),
  ]);

  return section;
}

registerView('settings', renderSettings);

/* ------------------------------------------------------------------ *
 * App shell mount + bootstrap
 * ------------------------------------------------------------------ */

/**
 * Mount the root layout (header + main content region) into #app. Idempotent:
 * calling it again reuses the existing shell. Returns the main content element.
 *
 * @param {HTMLElement} [root] defaults to #app
 * @returns {HTMLElement} the #app-main content region
 */
export function mountAppShell(root = document.getElementById('app')) {
  if (!root) throw new Error('[aura] #app root element not found');

  let main = document.getElementById('app-main');
  if (main) return main;

  // Settings entry point in the header (Req 8.2 — a reachable settings view).
  // Rendering settings remembers the view the student came from so the back
  // control returns there. Opening settings while already on it is a no-op.
  const settingsBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-link app-settings-btn',
      'aria-label': t('nav_settings'),
      onClick: () => {
        const returnTo = currentView && currentView.name !== 'settings'
          ? currentView.name
          : 'capture';
        renderView('settings', { returnTo });
      },
    },
    t('btn_settings'),
  );

  const header = el(
    'header',
    { class: 'app-header' },
    el(
      'div',
      { class: 'app-header-text' },
      el('h1', { class: 'app-title', text: t('app_name') }),
      el('p', { class: 'app-tagline', text: t('tagline') }),
    ),
    el('nav', { class: 'app-nav', 'aria-label': t('nav_settings') }, settingsBtn),
  );

  main = el('main', { id: 'app-main', class: 'app-main' });

  clear(root);
  appendChildren(root, [header, main]);
  return main;
}

/**
 * Re-render the shell chrome (title/tagline + header nav) in the active
 * language. Called on every language change so the header labels update in
 * place alongside the current view (Req 8.3), without rebuilding the shell.
 */
function refreshShellChrome() {
  const title = document.querySelector('.app-title');
  if (title) title.textContent = t('app_name');
  const tagline = document.querySelector('.app-tagline');
  if (tagline) tagline.textContent = t('tagline');

  const nav = document.querySelector('.app-nav');
  if (nav) nav.setAttribute('aria-label', t('nav_settings'));
  const settingsBtn = document.querySelector('.app-settings-btn');
  if (settingsBtn) {
    settingsBtn.textContent = t('btn_settings');
    settingsBtn.setAttribute('aria-label', t('nav_settings'));
  }
}

/**
 * Bootstrap the app: initialise i18n, mount the shell, and wire a
 * language-change subscription that re-renders chrome + the current view in
 * place (no page reload — Requirement 8.3 / Property 19).
 *
 * On first load, when no Language_Preference exists in localStorage, the app
 * lands on the language-selection prompt before any other content (Req 8.1);
 * otherwise it goes straight to the capture view as a returning student.
 *
 * @returns {Promise<void>}
 */
export async function bootstrap() {
  await initI18n();
  mountAppShell();

  onLanguageChanged(() => {
    refreshShellChrome();
    rerenderCurrentView();
  });

  // Mark the active language on <html> for styling / a11y hooks.
  document.documentElement.lang = getCurrentLanguage();

  // First load with no stored preference → prompt for a language before any
  // other content (Req 8.1). Otherwise land on capture as today (Req 8.4).
  if (readStoredLanguagePreference() === null) {
    renderView('language', {});
  } else {
    renderView('capture', {});
  }
}

// Auto-bootstrap in the browser. Guarded so unit tests can import the pure
// helpers (topicOptionsForLevel, renderTopicDetection, el, …) without the shell
// mounting as a side effect.
if (typeof document !== 'undefined' && document.getElementById('app')) {
  bootstrap().catch((err) => {
    console.error('[aura] bootstrap failed', err);
  });
}