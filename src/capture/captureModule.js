/**
 * CaptureModule — camera invocation and file upload with validation.
 *
 * Uses the shared MIME_WHITELIST and MAX_FILE_BYTES constants from
 * src/types.js as the single source of truth for accepted formats and the
 * upload size limit (Requirements 2.2, 2.3, 2.7).
 */

import { MIME_WHITELIST, MAX_FILE_BYTES } from '../types.js';

/** Human-readable list of accepted formats for error messages. */
const ACCEPTED_FORMATS_LABEL = 'JPEG, PNG, or HEIC';

/**
 * Typed error raised when the device camera is unavailable or the Student
 * denies camera permission, so the UI can fall back to upload-only.
 */
export class CameraUnavailableError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'CameraUnavailableError';
  }
}

/**
 * Validate an image File before it is submitted to OCR.
 *
 * Rejects any MIME type outside {@link MIME_WHITELIST} (JPEG, PNG, HEIC) and
 * any file larger than {@link MAX_FILE_BYTES} (10 MB).
 *
 * @param {File} file
 * @returns {{ valid: boolean; error?: string }}
 */
export function validateFile(file) {
  const mime = (file.type || '').toLowerCase();
  if (!MIME_WHITELIST.includes(mime)) {
    return {
      valid: false,
      error: `Unsupported file format "${file.type || 'unknown'}". Please use ${ACCEPTED_FORMATS_LABEL}.`,
    };
  }
  if (file.size > MAX_FILE_BYTES) {
    const limitMb = MAX_FILE_BYTES / 1024 / 1024;
    return {
      valid: false,
      error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is ${limitMb} MB.`,
    };
  }
  return { valid: true };
}

/**
 * Open a file-picker input and resolve with the chosen File.
 * @returns {Promise<File>}
 */
export function captureFromFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = MIME_WHITELIST.join(',');
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => {
      if (input.parentNode) input.parentNode.removeChild(input);
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      cleanup();
      if (file) resolve(file);
      else reject(new Error('No file selected'));
    });

    // Handle user cancellation (focus returns to window without change firing)
    window.addEventListener(
      'focus',
      function onFocus() {
        window.removeEventListener('focus', onFocus);
        setTimeout(() => {
          if (!input.files?.length) {
            cleanup();
            reject(new Error('File selection cancelled'));
          }
        }, 500);
      },
      { once: true }
    );

    input.click();
  });
}

/**
 * Invoke the device camera and resolve with the captured File.
 *
 * On desktop, when no camera is present, or when the Student denies camera
 * permission, this rejects with a {@link CameraUnavailableError} so the UI can
 * present the upload-only fallback (Requirement 2.9).
 *
 * @returns {Promise<File>}
 */
export function captureFromCamera() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; // rear camera
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => {
      if (input.parentNode) input.parentNode.removeChild(input);
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      cleanup();
      if (file) resolve(file);
      else reject(new CameraUnavailableError('No image captured'));
    });

    input.addEventListener('error', () => {
      cleanup();
      reject(new CameraUnavailableError('Camera access failed'));
    });

    input.click();
  });
}

/**
 * Create an object URL preview for a File and return a revokable handle.
 * Call handle.revoke() when done.
 * @param {File} file
 * @returns {{ url: string; revoke: () => void }}
 */
export function createPreview(file) {
  const url = URL.createObjectURL(file);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}
