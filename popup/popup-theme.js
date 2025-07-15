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

  // Added theme color variables
  docStyle.setProperty("--bookmark_text", colors.bookmark_text || "");
  docStyle.setProperty("--button_background_active", colors.button_background_active || "");
  docStyle.setProperty("--button_background_hover", colors.button_background_hover || "");
  docStyle.setProperty("--frame", colors.frame || "");
  docStyle.setProperty("--frame_inactive", colors.frame_inactive || "");
  docStyle.setProperty("--frame_incognito", colors.frame_incognito || "");
  docStyle.setProperty("--frame_incognito_inactive", colors.frame_incognito_inactive || "");
  docStyle.setProperty("--icons", colors.icons || "");
  docStyle.setProperty("--icons_attention", colors.icons_attention || "");
  docStyle.setProperty("--ntp_background", colors.ntp_background || "");
  docStyle.setProperty("--ntp_header", colors.ntp_header || "");
  docStyle.setProperty("--ntp_link", colors.ntp_link || "");
  docStyle.setProperty("--ntp_text", colors.ntp_text || "");
  docStyle.setProperty("--tab_background_separator", colors.tab_background_separator || "");
  docStyle.setProperty("--tab_background_text", colors.tab_background_text || "");
  docStyle.setProperty("--tab_line", colors.tab_line || "");
  docStyle.setProperty("--tab_loading", colors.tab_loading || "");
  docStyle.setProperty("--tab_selected", colors.tab_selected || "");
  docStyle.setProperty("--tab_text", colors.tab_text || "");
  docStyle.setProperty("--toolbar_bottom_separator", colors.toolbar_bottom_separator || "");
  docStyle.setProperty("--toolbar_field", colors.toolbar_field || "");
  docStyle.setProperty("--toolbar_field_border", colors.toolbar_field_border || "");
  docStyle.setProperty("--toolbar_field_border_focus", colors.toolbar_field_border_focus || "");
  docStyle.setProperty("--toolbar_field_focus", colors.toolbar_field_focus || "");
  docStyle.setProperty("--toolbar_field_highlight", colors.toolbar_field_highlight || "");
  docStyle.setProperty("--toolbar_field_highlight_text", colors.toolbar_field_highlight_text || "");
  docStyle.setProperty("--toolbar_field_separator", colors.toolbar_field_separator || "");
  docStyle.setProperty("--toolbar_field_text", colors.toolbar_field_text || "");
  docStyle.setProperty("--toolbar_field_text_focus", colors.toolbar_field_text_focus || "");
  docStyle.setProperty("--toolbar_text", colors.toolbar_text || "");
  docStyle.setProperty("--toolbar_top_separator", colors.toolbar_top_separator || "");
  docStyle.setProperty("--toolbar_vertical_separator", colors.toolbar_vertical_separator || "");

  console.info(colors.popup);
  console.info(colors.popup_text);
  printMenuMixes(colors.popup, colors.popup_text);
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

/**
 * Prints out every mix between two hex colors in increments you choose (default 0.05)
 * as RGB, HEX and HSL.
 */
function printMenuMixes(popup, popupText, step = 0.01) {
  function parseColor(str) {
    str = str.trim();
    if (str.startsWith('#')) {
      let hex = str.slice(1);
      if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
      const num = parseInt(hex, 16);
      return [num >> 16, (num >> 8) & 0xFF, num & 0xFF];
    } else if (str.startsWith('rgb')) {
      const m = str.match(/rgba?\(([^)]+)\)/)[1].split(',').map(s => +s);
      return m.slice(0,3);
    }
    return [0,0,0];
  }
  function mixColors(a, b, t) {
    return a.map((c, i) => c * (1 - t) + b[i] * t);
  }
  function rgbToHex([r, g, b]) {
    const to2 = v => Math.round(v).toString(16).padStart(2, '0');
    return `#${to2(r)}${to2(g)}${to2(b)}`;
  }
  function rgbToHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h, s, l = (mx + mn) / 2;
    if (mx === mn) {
      h = s = 0;
    } else {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      switch (mx) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return [ h * 360, s * 100, l * 100 ];
  }
  function hslString([h, s, l]) {
    return `hsl(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%)`;
  }
  const A = parseColor(popup);
  const B = parseColor(popupText);
  for (let p = 0; p <= 1.0001; p += step) {
    const M = mixColors(A, B, p);
    const rgbStr = `rgb(${M[0].toFixed(0)}, ${M[1].toFixed(0)}, ${M[2].toFixed(0)})`;
    const hexStr = rgbToHex(M);
    const hslStr = hslString(rgbToHsl(M));
    console.log(
      `Mix ${(p*100).toFixed(3)}%: `,
      rgbStr,
      '|',
      hexStr,
      '|',
      hslStr
    );
  }
}

setInitialStyle();