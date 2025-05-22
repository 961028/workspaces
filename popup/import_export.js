/**
 * Processes the raw text data from an import file.
 * @param {string} dataString - The raw JSON string from a file.
 * @returns {Promise<void>}
 */
async function processImportData(dataString) {
  try {
    const importedData = JSON.parse(dataString);
    const response = await browser.runtime.sendMessage({
      action: "importWorkspaces",
      data: importedData,
    });
    if (response && response.success) {
      showStatus("Import successful.", false);
      await loadState();
    } else {
      showStatus(response?.error || "Import failed.", true);
    }
  } catch (error) {
    console.error("Process import error:", error);
    showStatus(error.message || "Import error.", true);
  }
}

/**
 * Exports the saved workspaces by triggering a download of JSON data.
 * @returns {Promise<void>}
 */
async function exportWorkspaces() {
  try {
    const response = await browser.runtime.sendMessage({ action: "exportWorkspaces" });
    if (response && response.success) {
      const data = JSON.stringify(response.data, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = EXPORT_FILENAME; // Use constant for filename
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showStatus("Export successful.", false);
    } else {
      showStatus(response?.error || "Export failed.", true);
    }
  } catch (error) {
    console.error("Export error:", error);
    showStatus(error.message || "Export error.", true);
  }
}

/**
 * Handles the file input change event for importing workspace data.
 * @param {Event} e - The file input change event.
 */
function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) {
    console.warn("No file selected for import.");
    return;
  }
  const reader = new FileReader();
  reader.onload = async function (evt) {
    await processImportData(evt.target.result);
  };
  reader.readAsText(file);
}

/**
 * Sets up the export and import buttons in the UI.
 */
function setupExportImportButtons() {
  const container = getDomElement("export-import-controls");
  if (!container) {
    console.warn("Export/Import container not found.");
    return;
  }

  // Create hidden file input for importing workspaces.
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/json";
  fileInput.style.display = "none";
  fileInput.addEventListener("change", handleImportFile);
  container.appendChild(fileInput);

  // Create Export Button.
  const exportBtn = document.createElement("button");
  exportBtn.id = "export-btn";
  exportBtn.textContent = "Export Workspaces";
  exportBtn.addEventListener("click", exportWorkspaces);
  container.appendChild(exportBtn);

  // Create Import Button.
  const importBtn = document.createElement("button");
  importBtn.id = "import-btn";
  importBtn.textContent = "Import Workspaces";
  importBtn.addEventListener("click", () => fileInput.click());
  container.appendChild(importBtn);
}
