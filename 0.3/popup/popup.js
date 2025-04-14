// popup.js

// Get references to DOM elements for saved workspaces and unsaved windows
const workspaceListEl = document.getElementById("workspaceList");
const unsavedListEl = document.getElementById("unsavedList");
const messageDiv = document.getElementById("message");

// Utility: display a status or error message
function showMessage(text, isError = false) {
  messageDiv.textContent = text;
  messageDiv.style.color = isError ? "red" : "green";
}

/* ---------------------------
   Saved Workspaces Functions
   --------------------------- */

// Populate the saved workspace list UI. (Note: We no longer include an explicit "Open" button.)
async function loadWorkspaces() {
  workspaceListEl.innerHTML = ""; // clear current list
  const items = await browser.storage.local.get();
  const fragment = document.createDocumentFragment();
  for (const [name, wsData] of Object.entries(items)) {
    // Create list item element for each saved workspace.
    const li = document.createElement("li");
    li.className = "saved-workspace-item";
    li.textContent = name;
    // Left-click on the entire entry opens the workspace.
    li.addEventListener("click", () => openWorkspace(name));
    // Add a Delete button.
    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.className = "delete-btn";
    // Prevent the li click event when deleting.
    delBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteWorkspace(name);
    });
    li.appendChild(delBtn);
    fragment.appendChild(li);
  }
  workspaceListEl.appendChild(fragment);
}

// Open a workspace by name. (Uses the same background messaging approach as before.)
async function openWorkspace(name) {
  try {
    const response = await browser.runtime.sendMessage({ command: "open", name });
    if (response && response.error) {
      showMessage("Error: " + response.error, true);
    } else {
      // Close the popup after successfully opening the workspace.
      window.close();
    }
  } catch (err) {
    console.error("Failed to send open message:", err);
    showMessage("Error opening workspace.", true);
  }
}

// Delete a workspace by name.
async function deleteWorkspace(name) {
  try {
    const response = await browser.runtime.sendMessage({ command: "delete", name });
    if (response && response.error) {
      showMessage("Error: " + response.error, true);
    } else {
      await loadWorkspaces();
    }
  } catch (err) {
    console.error("Failed to send delete message:", err);
    showMessage("Error deleting workspace.", true);
  }
}

/* ---------------------------
   Unsaved Windows Functions
   --------------------------- */

// Load and display unsaved windows: open windows that aren't already saved.
async function loadUnsavedWindows() {
  unsavedListEl.innerHTML = ""; // clear current list
  try {
    // Get all open windows with tab details.
    const allWindows = await browser.windows.getAll({ populate: true });
    // Get already saved workspaces.
    const savedData = await browser.storage.local.get();
    const savedWindowIds = new Set();
    for (const key in savedData) {
      const ws = savedData[key];
      if (ws && ws.windowId) {
        savedWindowIds.add(ws.windowId);
      }
    }
    // Filter out windows that have already been saved.
    const unsavedWindows = allWindows.filter(win => {
      return win.type === "normal" && !savedWindowIds.has(win.id);
    });
    const fragment = document.createDocumentFragment();
    unsavedWindows.forEach(win => {
      // Use the title of the window's last open tab as the workspace name.
      const lastTab = win.tabs[win.tabs.length - 1];
      const workspaceName = lastTab && lastTab.title ? lastTab.title : "Unnamed Window";
      // Create list item
      const li = document.createElement("li");
      li.className = "unsaved-window-item";
      li.textContent = workspaceName;
      // Clicking the list item focuses the window.
      li.addEventListener("click", () => {
        browser.windows.update(win.id, { focused: true });
      });
      // Create the "Save" button.
      const saveBtn = document.createElement("button");
      saveBtn.textContent = "Save";
      saveBtn.className = "unsaved-save-btn";
      saveBtn.addEventListener("click", async (event) => {
        event.stopPropagation(); // Prevent triggering the li click event.
        try {
          // Send a "save" message with the auto-generated name and specific windowId.
          const response = await browser.runtime.sendMessage({
            command: "save",
            name: workspaceName,
            windowId: win.id
          });
          if (response && response.error) {
            showMessage("Error: " + response.error, true);
          } else {
            showMessage("Workspace saved!");
            // Reload both saved and unsaved windows lists.
            await loadWorkspaces();
            await loadUnsavedWindows();
          }
        } catch (err) {
          console.error("Failed to send automatic save message:", err);
          showMessage("Error saving workspace.", true);
        }
      });
      li.appendChild(saveBtn);
      fragment.appendChild(li);
    });
    unsavedListEl.appendChild(fragment);
  } catch (error) {
    console.error("Error loading unsaved windows:", error);
    showMessage("Error loading unsaved windows.", true);
  }
}

/* ---------------------------
   Initialization
   --------------------------- */

// Initialize the popup by loading both saved workspaces and unsaved windows.
async function initialize() {
  await loadWorkspaces();
  await loadUnsavedWindows();
}

// Start the initialization.
initialize();
