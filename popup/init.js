// init.js
// ===== EVENT LISTENER FOR INITIALIZATION =====
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initPopup();
    setupExportImportButtons();
  } catch (error) {
    console.error("Error during DOMContentLoaded initialization:", error);
  }
});

// ===== INITIALIZATION =====
/**
 * Initializes the popup by setting up context menus, drag-and-drop listeners, loading state, and theme.
 * @returns {Promise<void>}
 */
async function initPopup() {
  try {
    createContextMenu();
    await loadState();
    document.addEventListener("click", hideContextMenu);
    await setInitialStyle();
  } catch (error) {
    console.error("Error during popup initialization:", error);
  }
}
