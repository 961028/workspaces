// Initialization logic for popup extension
import { setupExportImportButtons } from './popup-import-export.js';

/**
 * Initializes the popup by setting up context menus, drag-and-drop listeners, loading state, and theme.
 * @returns {Promise<void>}
 */
export async function initPopup() {
  try {
    createContextMenu();
    await loadState();
    document.addEventListener("click", hideContextMenu);
    await setInitialStyle();
  } catch (error) {
    console.error("Error during popup initialization:", error);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initPopup();
    setupExportImportButtons();
  } catch (error) {
    console.error("Error during DOMContentLoaded initialization:", error);
  }
});

// Ensure popup_ui_helpers.js is loaded for shared helpers
// (In build, this will be global. For dev, load dynamically if needed.)
if (typeof window !== 'undefined' && !window.popupUiHelpers) {
  const script = document.createElement('script');
  script.src = 'popup_ui_helpers.js';
  script.onload = () => console.info('popup_ui_helpers.js loaded');
  document.head.appendChild(script);
}
