# Implementation Plan: Aura Offline Math Tutor

## Overview

This plan converts the Aura PWA design into incremental coding steps. It builds on the already-scaffolded shared types and module stubs (`src/types.js`, `src/backend/fetchOCR.js`, `src/capture/captureModule.js`, `src/formatting/prettyPrinter.js`, `src/i18n/locales/en/ui.json`), then layers in OCR, formatting, the on-device tutor worker, progress persistence, localisation, the service-worker/PWA configuration, and finally wires the UI flow together. Each step references specific requirements and, where applicable, the correctness properties defined in the design document. Test sub-tasks marked with `*` are optional. Property-based tests use fast-check (minimum 100 iterations each) and are tagged `// Feature: offline-math-tutor, Property N: <text>`; unit tests use Vitest.

## Tasks

- [x] 1. Establish shared constants, answer-format helpers, and test setup
  - [x] 1.1 Extend `src/types.js` with answer-format and validation helpers
    - Add `MIME_WHITELIST = ['image/jpeg','image/png','image/heic']` and `MAX_FILE_BYTES = 10 * 1024 * 1024`
    - Add an `answerMatchesFormat(answer, answerFormat)` helper that validates a submitted answer string against a declared format pattern (integer, decimal, fraction `a/b`, etc.)
    - Keep existing `CURRICULUM_LEVELS`, `CURRICULUM_LEVEL_LABELS`, and `TOPICS` exports intact
    - _Requirements: 2.3, 2.7, 4.5, 6.6_

  - [x] 1.2 Add Vitest and fast-check configuration
    - Add a `test` script and Vitest config (jsdom environment) to the project
    - Create a shared test helper module exporting a `fakeFile({ type, size })` factory for synthesising `File` objects without real bytes
    - _Requirements: 2.3, 2.7_

- [x] 2. Implement CaptureModule (camera + file upload + validation)
  - [x] 2.1 Implement `validateFile`, `captureFromFile`, and `captureFromCamera` in `src/capture/captureModule.js`
    - `validateFile(file)` returns `{ valid, error? }`: reject MIME types outside the whitelist with an error listing JPEG, PNG, HEIC; reject files larger than `MAX_FILE_BYTES` with a size-limit error
    - `captureFromFile(input)` resolves the selected `File`; `captureFromCamera()` invokes the device camera and resolves a captured `File`
    - Handle camera-unavailable / permission-denied by rejecting with a typed error so the UI can show the upload-only fallback
    - _Requirements: 2.1, 2.2, 2.3, 2.7, 2.9_

  - [ ]* 2.2 Write property test for file format validation
    - **Property 1: File format validation rejects all non-accepted MIME types**
    - **Validates: Requirements 2.3**
    - Use `fc.string()` for MIME type and `fc.nat()` for size; assert whitelist MIME + size ≤ 10 MB → `{ valid: true }`, otherwise invalid

  - [ ]* 2.3 Write property test for file size validation
    - **Property 2: File size validation rejects all files exceeding 10 MB**
    - **Validates: Requirements 2.7**
    - Use `fc.nat({ max: 20_971_520 })` for size; assert size > 10,485,760 always rejected regardless of MIME

- [x] 3. Implement OCRService against the Roboflow EasyOCR endpoint
  - [x] 3.1 Implement `runOCR` and error types in `src/backend/fetchOCR.js`
    - Define `OCRTimeoutError`, `OCRNetworkError`, `OCRLowConfidenceError`
    - Convert the image `File` to a base64 data URL and POST to the Roboflow workflow (`"type":"url"` input)
    - Normalise the detection array: space-join `text` fields, use the minimum `confidence` as the aggregate score
    - Throw `OCRLowConfidenceError` when aggregate confidence < 0.85; use `AbortController` to cancel after 15 s and throw `OCRTimeoutError`; map network failures to `OCRNetworkError`
    - _Requirements: 2.5, 2.6, 2.8, 3.1, 3.4, 3.5_

  - [ ]* 3.2 Write property test for OCR confidence gating
    - **Property 4: OCR confidence threshold gating**
    - **Validates: Requirements 3.4**
    - Use `fc.float({ min: 0, max: 1 })` for confidence with a mocked fetch; assert confidence < 0.85 throws `OCRLowConfidenceError`, ≥ 0.85 returns the result

  - [ ]* 3.3 Write unit tests for OCR timeout and response normalisation
    - Test `AbortController` timeout path throws `OCRTimeoutError`; test multi-detection concatenation and minimum-confidence aggregation
    - _Requirements: 3.1, 3.5_

- [x] 4. Implement PrettyPrinter notation formatting
  - [x] 4.1 Implement `formatProblemText` and `formatStepText` in `src/formatting/prettyPrinter.js`
    - Apply substitution rules in order: `*` → `×`; numeric `/` → `÷` (preserve `a/b` fractions); `**` and `^` → `x^n`; preserve `sqrt(...)`; `_` → `x_n`
    - Ensure the transform is idempotent and leaves no raw substitutable operators in the output
    - _Requirements: 3.3, 5.4_

  - [ ]* 4.2 Write property test for Pretty_Printer idempotence
    - **Property 3: Pretty_Printer notation substitution round-trip consistency**
    - **Validates: Requirements 3.3, 5.4**
    - Use `fc.string()` seeded with math operator characters; assert `format(format(x)) === format(x)` and no raw substitutable operators remain

- [x] 5. Checkpoint - capture, OCR, and formatting
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement ProgressStore over IndexedDB
  - [x] 6.1 Implement `recordExerciseResult`, `getSummary`, and `clearAll` in `src/progress/progressStore.js`
    - Open `aura-progress` v1 with object store `records` (keyPath `id`, auto-increment, index on `topic`) using the `idb` wrapper
    - Before each write, if `records.count() >= 10000` delete the lowest-`id` record (FIFO eviction)
    - `getSummary` aggregates per topic: `totalAttempts`, `firstAttemptCorrect`, and `accuracyPercent = Math.round((firstAttemptCorrect / totalAttempts) * 1000) / 10`
    - Detect unavailable storage and surface a non-blocking signal so the UI can show "Progress cannot be saved on this device" and continue
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6_

  - [ ]* 6.2 Write property test for progress round-trip persistence
    - **Property 14: Progress record round-trip persistence**
    - **Validates: Requirements 7.1, 7.3**
    - Use `fc.record(...)` for `ExerciseResult`; assert a written result is reflected in its topic totals from `getSummary`

  - [ ]* 6.3 Write property test for accuracy rate calculation
    - **Property 15: Accuracy rate calculation correctness**
    - **Validates: Requirements 7.2**
    - Use `fc.nat()` for correct/total counts; assert `accuracyPercent === Math.round((firstAttemptCorrect / totalAttempts) * 1000) / 10`

  - [ ]* 6.4 Write property test for FIFO eviction at 10,000 records
    - **Property 16: Progress store FIFO eviction at 10,000 records**
    - **Validates: Requirements 7.6**
    - Use `fc.array(...)` of records with length > 10,000; assert final count is exactly 10,000 and the oldest pre-insertion `id` is gone

- [x] 7. Implement I18nService with i18next
  - [x] 7.1 Create translation namespaces and implement `src/i18n/i18nService.js`
    - Add `en/tutor.json`, `ms/ui.json`, `ms/tutor.json` alongside the existing `en/ui.json` (mirror all keys across languages)
    - Implement `initI18n`, `t`, `setLanguage`, `getCurrentLanguage`; persist selection under `aura.language` in localStorage
    - Configure English fallback for missing keys and `console.warn` the missing key
    - Emit a change event on `setLanguage` so the UI can re-render without `window.location.reload`
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 7.2 Write property test for language preference round-trip
    - **Property 17: Language preference persistence round-trip**
    - **Validates: Requirements 8.4**
    - Use `fc.constantFrom('en','ms')`; assert `setLanguage(L)` writes `aura.language` and `getCurrentLanguage()` returns `L`

  - [ ]* 7.3 Write property test for translation language consistency and fallback
    - **Property 18: All UI strings render in the selected language**
    - **Validates: Requirements 8.2, 8.6**
    - Iterate all keys × supported languages; assert non-empty string in `L`, English fallback + `console.warn` for a missing key

- [x] 8. Implement the on-device TutorEngine and Web Worker
  - [x] 8.1 Implement the WebLLM worker in `src/tutor/tutorWorker.js`
    - Initialise `Phi-3.5-mini-instruct-q4f16_1-MLC` via WebLLM with WebGPU, silently falling back to WASM when WebGPU is unavailable
    - Handle a `requestId`-correlated message protocol for classify / solution / hint / exercises / evaluate
    - Inject the language-aware system prompt (× ÷ x^n a/b notation, ≤ 40-word step explanations, no answer in hints)
    - _Requirements: 4.1, 5.1, 5.4_

  - [x] 8.2 Implement `src/tutor/tutorEngine.js` request/response orchestration
    - Spawn the worker with `new Worker(new URL('./tutorWorker.js', import.meta.url), { type: 'module' })`
    - Implement `classifyProblem`, `generateSolution`, `generateHint`, `generateExercises`, `evaluateAnswer` with `requestId` correlation and parse-failure/step-error handling
    - Enforce single-topic classification output and a valid `CurriculumLevel`
    - _Requirements: 4.1, 4.2, 4.3, 5.1, 5.6, 5.7, 6.2, 6.5_

  - [ ]* 8.3 Write property test for single-result classification
    - **Property 6: Topic classification always returns exactly one result**
    - **Validates: Requirements 4.1**
    - Use `fc.string({ minLength: 1 })` with a mocked worker; assert exactly one non-empty `topic` and one valid `CurriculumLevel`

  - [ ]* 8.4 Write property test for step explanation word count
    - **Property 8: Step explanations never exceed 40 words**
    - **Validates: Requirements 5.1**
    - Mock the worker returning generated step arrays; assert every `explanation` has ≤ 40 whitespace-split words

  - [ ]* 8.5 Write property test for generated exercise uniqueness
    - **Property 12: Generated exercise set contains no duplicates**
    - **Validates: Requirements 6.5**
    - Use `fc.integer({ min: 1, max: 5 })` for set size; assert no two exercises share an identical `prompt`

- [x] 9. Implement tutoring interaction state machine (hints, attempts, answer reveal)
  - [x] 9.1 Implement a session controller in `src/tutor/tutorSession.js`
    - Track per-step hint counts (cap at 3) and per-exercise incorrect-attempt counts
    - On incorrect answer (1st or 2nd attempt) offer exactly one hint; after two incorrect attempts allow revealing the answer + full solution and mark the exercise completed
    - Validate submitted answers against `Exercise.answerFormat` before calling `evaluateAnswer`, rejecting mismatches with an inline validation signal
    - Reject whitespace-only Problem_Text before any `TutorEngine` call
    - _Requirements: 3.6, 5.3, 6.3, 6.4, 6.6_

  - [ ]* 9.2 Write property test for whitespace-only rejection
    - **Property 5: Whitespace-only Problem_Text is always rejected**
    - **Validates: Requirements 3.6**
    - Use `fc.stringMatching(/^\s*$/)`; assert the session is prevented and `TutorEngine` is not called

  - [ ]* 9.3 Write property test for hint cap per step
    - **Property 9: Hint count per Step is capped at 3**
    - **Validates: Requirements 5.3**
    - Use `fc.integer({ min: 0, max: 10 })` request counts; assert `hintIndex >= 3` is rejected and total hints never exceed 3

  - [ ]* 9.4 Write property test for incorrect-answer single hint offer
    - **Property 10: Incorrect answer triggers exactly one hint offer**
    - **Validates: Requirements 6.3**
    - Use `fc.record(...)` for exercise/answer pairs; assert exactly one hint offered on an incorrect first/second attempt

  - [ ]* 9.5 Write property test for two-incorrect-attempt reveal
    - **Property 11: After two incorrect attempts the answer and solution are revealed**
    - **Validates: Requirements 6.4**
    - Use a sequence of incorrect `fc.string()` answers; assert after two incorrect attempts the answer + full solution reveal and the exercise is marked completed

  - [ ]* 9.6 Write property test for answer-format mismatch rejection
    - **Property 13: Answer format mismatch always triggers inline validation**
    - **Validates: Requirements 6.6**
    - Use `fc.string()` answers vs declared format patterns; assert mismatch rejected inline and `evaluateAnswer` not called

- [x] 10. Checkpoint - tutor engine, session logic, progress, and i18n
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Configure the service worker and PWA offline strategies
  - [x] 11.1 Configure `vite-plugin-pwa` / Workbox in `vite.config.js`
    - Precache static assets, translation JSON, and app shell (cache-first)
    - Add runtime caching: `NetworkFirst` with `networkTimeoutSeconds: 15` for the Roboflow endpoint; `CacheFirst` for WebLLM model shards (`model-cache`, `maxEntries: 200`)
    - Enable background update detection to drive the update banner
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

  - [x] 11.2 Implement `src/sw/serviceWorkerManager.js` registration and storage checks
    - Register the generated service worker; surface a dismissible update banner on a new version and store dismissal under `aura.updateDismissed`
    - Use the Storage API to detect available space < 50 MB and raise a warning that is dismissible only after user action
    - Detect install/cache failure and raise an "offline setup incomplete" reload prompt
    - _Requirements: 1.3, 1.4, 1.6_

- [x] 12. Implement topic detection and manual topic selection UI
  - [x] 12.1 Build the topic detection and override UI in `src/main.js`
    - Display detected Topic + Curriculum_Level after classification
    - On low classification confidence, prompt manual selection from a dropdown of all `TOPICS`
    - On "disagree", show a dropdown of all topics for the enrolled level allowing exactly one replacement
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

  - [ ]* 12.2 Write property test for curriculum-level topic coverage
    - **Property 7: All Curriculum_Levels expose the minimum required topic set**
    - **Validates: Requirements 4.5**
    - Use `fc.constantFrom(...CURRICULUM_LEVELS)`; assert the dropdown contains all twelve required topics for every level

- [x] 13. Wire the end-to-end UI flow and progress/language views
  - [x] 13.1 Implement the capture → OCR → review flow in `src/main.js`
    - Wire camera/upload entry points to `CaptureModule`, show image preview with Confirm/Retake, loading indicator within 500 ms, OCR submission, and editable Problem_Text review (pretty-printed)
    - Handle offline-OCR and low-confidence paths with manual-entry fallback
    - _Requirements: 2.4, 2.5, 2.6, 2.8, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 13.2 Implement step-by-step walkthrough and practice flow in `src/main.js`
    - Reveal one Step at a time ("Step N of M", "Next Step" → "See Summary"), hint requests, and the summary statement
    - Offer up to five exercises, submit answers, show feedback, and drive the attempt/hint/reveal session controller
    - Record results via `ProgressStore` and render the progress summary and clear-progress confirmation
    - _Requirements: 5.1, 5.2, 5.5, 6.1, 6.2, 7.1, 7.2, 7.4_

  - [x] 13.3 Implement language selection prompt, settings toggle, and live re-render
    - Show the language prompt on first load when no preference exists (default English on dismiss)
    - Re-render all visible `t()` strings on language change without a page reload
    - _Requirements: 8.1, 8.2, 8.3, 8.5_

  - [ ]* 13.4 Write property test for language switch without reload
    - **Property 19: Language switch re-renders all visible strings without page reload**
    - **Validates: Requirements 8.3**
    - Drive a language-change event sequence; assert all rendered `t()` strings update and no `window.location.reload`/navigation fires

  - [ ]* 13.5 Write accessibility and mobile-first unit checks
    - Run `axe-core` against rendered screens; assert 44×44 px touch targets, single/two-column breakpoints at 480 px, and non-empty unique ARIA labels in the selected language
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6, 9.7_

- [x] 14. Final checkpoint - full offline flow
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (unit, property, integration, and accessibility tests) and can be skipped for a faster MVP.
- Each task references specific requirements for traceability; property-test tasks additionally cite the design property they validate.
- Property-based tests use fast-check at a minimum of 100 iterations each and are tagged `// Feature: offline-math-tutor, Property N: <text>`.
- Scaffolded files (`src/types.js`, `src/backend/fetchOCR.js`, `src/capture/captureModule.js`, `src/formatting/prettyPrinter.js`, `src/i18n/locales/en/ui.json`) are extended, not recreated.
- Checkpoints ensure incremental validation at natural integration boundaries.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "6.1", "7.1", "8.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.2", "3.3", "4.2", "6.2", "6.3", "6.4", "7.2", "7.3", "8.2"] },
    { "id": 3, "tasks": ["8.3", "8.4", "8.5", "9.1", "11.1"] },
    { "id": 4, "tasks": ["9.2", "9.3", "9.4", "9.5", "9.6", "11.2", "12.1"] },
    { "id": 5, "tasks": ["12.2", "13.1", "13.2", "13.3"] },
    { "id": 6, "tasks": ["13.4", "13.5"] }
  ]
}
```
