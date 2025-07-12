// Constants
const EXPORT_FILENAME = "workspaces-export.json";

// Utility to show temporary status messages
function showStatus(msg, isError) {
  const statusEl = document.getElementById("status");
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "red" : "green";
  setTimeout(() => statusEl.textContent = "", 3000);
}

// Read JSON from selected file and send to background for import
async function processImportData(text) {
  try {
    const data = JSON.parse(text);
    const resp = await browser.runtime.sendMessage({
      action: "importWorkspaces",
      data
    });
    if (resp?.success) {
      showStatus("Import successful.", false);
    } else {
      showStatus(resp?.error || "Import failed.", true);
    }
  } catch (err) {
    console.error("Import error:", err);
    showStatus(err.message || "Import error.", true);
  }
}

// Trigger download of current workspaces JSON
async function exportWorkspaces() {
  try {
    const resp = await browser.runtime.sendMessage({ action: "exportWorkspaces" });
    if (resp?.success) {
      const json = JSON.stringify(resp.data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = EXPORT_FILENAME;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showStatus("Export successful.", false);
    } else {
      showStatus(resp?.error || "Export failed.", true);
    }
  } catch (err) {
    console.error("Export error:", err);
    showStatus(err.message || "Export error.", true);
  }
}

// Wire up buttons once DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const exportBtn = document.getElementById("export-btn");
  const importBtn = document.getElementById("import-btn");
  const fileInput = document.getElementById("import-file");

  if (!exportBtn || !importBtn || !fileInput) {
    console.error("Missing controls in options.html");
    return;
  }

  exportBtn.addEventListener("click", exportWorkspaces);
  importBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = evt => processImportData(evt.target.result);
      reader.readAsText(file);
    }
  });
});
