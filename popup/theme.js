// theme.js
// ===== THEME STYLING =====
/**
 * Retrieves and applies the current theme to the popup.
 * @returns {Promise<void>}
 */
async function setInitialStyle() {
  // ...existing code...
  // (Full function body from popup_backup.js)
  // ...existing code...
}

/**
 * Applies CSS custom properties based on the theme colors.
 * @param {Object} theme - The theme object with color properties.
 */
function applyThemeStyle(theme) {
  // ...existing code...
  // (Full function body from popup_backup.js)
  // ...existing code...
}

browser.theme.onUpdated.addListener(async ({ theme, windowId }) => {
  // ...existing code...
  // (Full function body from popup_backup.js)
  // ...existing code...
});
