/**
 * Shared popup UI helpers for workspace and window list items.
 * Provides reusable logic for creating list items and handling common events.
 */

/**
 * Sets the favicon for a list item if available from the browser tab or fallback.
 * @param {HTMLElement} li - The list item element.
 * @param {number} windowId - The window ID to query for favicon.
 * @param {string} [fallback] - Optional fallback favicon URL.
 */
function setFavicon(li, windowId, fallback) {
  const defaultFallback = browser.runtime.getURL('icons/globe-16.svg');
  const iconToUse = fallback || defaultFallback;
  if (windowId) {
    browser.tabs.query({ windowId, active: true }).then((tabs) => {
      const img = li.querySelector('.favicon');
      if (tabs && tabs[0] && tabs[0].favIconUrl) {
        if (img) img.src = tabs[0].favIconUrl;
      } else if (img) {
        img.src = iconToUse;
      }
    }).catch(() => {
      const img = li.querySelector('.favicon');
      if (img) img.src = iconToUse;
    });
  } else {
    const img = li.querySelector('.favicon');
    if (img) img.src = iconToUse;
  }
}

/**
 * Adds drag and click event listeners to a list item for workspace/window actions.
 * @param {HTMLElement} li - The list item element.
 * @param {Object} options - Options for event handling.
 * @param {Function} [options.onDragStart] - Handler for drag start.
 * @param {Function} [options.onClick] - Handler for click (excluding button clicks).
 * @param {string} [options.buttonSelector] - Selector for action button inside li.
 * @param {Function} [options.onButtonClick] - Handler for button click.
 */
function addListItemEvents(li, { onDragStart, onClick, buttonSelector, onButtonClick }) {
  if (onDragStart) {
    li.setAttribute('draggable', 'true');
    li.addEventListener('dragstart', onDragStart);
  }
  if (onClick) {
    li.addEventListener('click', (e) => {
      if (buttonSelector && e.target.classList.contains(buttonSelector.replace('.', ''))) return;
      onClick(e);
    });
  }
  if (buttonSelector && onButtonClick) {
    const btn = li.querySelector(buttonSelector);
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onButtonClick(e);
      });
    }
  }
}

// Export helpers for use in other popup scripts
// (in build, these will be global)
window.popupUiHelpers = { setFavicon, addListItemEvents };
