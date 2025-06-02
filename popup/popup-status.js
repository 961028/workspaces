// Status message display logic for popup extension
import { STATUS_DISPLAY_TIME } from './popup-constants.js';
import { getDomElement } from './popup-dom-utils.js';

/**
 * Displays a status message to the user and automatically clears it.
 * @param {string} message - The message text.
 * @param {boolean} isError - Whether the message indicates an error.
 */
export function showStatus(message, isError) {
  try {
    const statusEl = getDomElement("status");
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = isError ? "error" : "success";
    setTimeout(() => {
      statusEl.textContent = "";
      statusEl.className = "";
    }, STATUS_DISPLAY_TIME);
  } catch (error) {
    console.error("Error displaying status message:", error);
  }
}
