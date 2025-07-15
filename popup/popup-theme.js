/**
 * Retrieves and applies the current theme to the popup.
 * @returns {Promise<void>}
 */
async function setInitialStyle() {
  try {
    const theme = await browser.theme.getCurrent();
    applyThemeStyle(theme);
    //console.info("Theme applied successfully:", theme);
  } catch (error) {
    console.error("Error retrieving initial theme:", error);
  }
}

/**
 * Applies CSS custom properties based on the theme colors.
 * @param {Object} theme - The theme object with color properties.
 */
function applyThemeStyle(theme) {
  if (!theme || !theme.colors) {
    console.warn("Invalid theme or missing color information.");
    return;
  }
  const { colors } = theme;
  const docStyle = document.documentElement.style;
  docStyle.setProperty("--Menu", colors.popup);
  docStyle.setProperty("--MenuText", colors.popup_text);
}

browser.theme.onUpdated.addListener(async ({ theme, windowId }) => {
  try {
    const currentWindow = await browser.windows.getCurrent();
    if (!windowId || windowId === currentWindow.id) {
      applyThemeStyle(theme);
    } else {
      console.info("Theme update skipped for windowId:", windowId);
    }
  } catch (error) {
    console.error("Error handling theme update:", error);
  }
});

setInitialStyle();