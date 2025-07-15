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
  docStyle.setProperty("--popup", colors.popup);
  docStyle.setProperty("--popup_border", colors.popup_border);
  docStyle.setProperty("--popup_highlight", colors.popup_highlight);
  docStyle.setProperty("--popup_highlight_text", colors.popup_highlight_text);
  docStyle.setProperty("--popup_text", colors.popup_text);
  docStyle.setProperty("--toolbar", colors.toolbar);
  docStyle.setProperty("--test", colors.toolbar_bottom_separator);
  //console.info("Theme updated successfully:", theme);
}

browser.theme.onUpdated.addListener(async ({ theme, windowId }) => {
  try {
    const currentWindow = await browser.windows.getCurrent();
    if (!windowId || windowId === currentWindow.id) {
      applyThemeStyle(theme);
    } else {
      //console.info("Theme update skipped for windowId:", windowId);
    }
  } catch (error) {
    console.error("Error handling theme update:", error);
  }
});

setInitialStyle();
