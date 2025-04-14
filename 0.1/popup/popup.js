// popup.js

// Get references to DOM elements
const nameInput = document.getElementById("workspaceName");
const saveButton = document.getElementById("saveBtn");
const messageDiv = document.getElementById("message");
const listEl = document.getElementById("workspaceList");

// Utility: display a status or error message
function showMessage(text, isError = false) {
  messageDiv.textContent = text;
  messageDiv.style.color = isError ? "red" : "green";
}

// Populate the workspace list UI
async function loadWorkspaces() {
  listEl.innerHTML = ""; // clear current list
  const items = await browser.storage.local.get();  // get all saved workspaces
  for (const [name, urls] of Object.entries(items)) {
    // Create list item for each workspace
    const li = document.createElement("li");
    const nameSpan = document.createElement("span");
    nameSpan.textContent = name;
    nameSpan.className = "workspace-name";
    const actionsSpan = document.createElement("span");
    actionsSpan.className = "workspace-actions";
    // Open button
    const openBtn = document.createElement("button");
    openBtn.textContent = "Open";
    openBtn.addEventListener("click", () => openWorkspace(name));
    // Delete button
    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => deleteWorkspace(name));
    // Append elements
    actionsSpan.appendChild(openBtn);
    actionsSpan.appendChild(delBtn);
    li.appendChild(nameSpan);
    li.appendChild(actionsSpan);
    listEl.appendChild(li);
  }
}

// Send a save request to background when Save button is clicked
saveButton.addEventListener("click", async () => {
  const workspaceName = nameInput.value.trim();
  if (!workspaceName) {
    showMessage("Please enter a workspace name.", true);
    return;
  }
  // Send a message to background to save the workspace
  try {
    const response = await browser.runtime.sendMessage({
      command: "save",
      name: workspaceName
    });
    if (response && response.error) {
      showMessage("Error: " + response.error, true);
    } else {
      showMessage("Workspace saved!");
      nameInput.value = "";
      await loadWorkspaces();  // refresh the list to include the new workspace
    }
  } catch (err) {
    console.error("Failed to send save message:", err);
    showMessage("Error saving workspace.", true);
  }
});

// Open a workspace by name (calls background)
async function openWorkspace(name) {
  try {
    const response = await browser.runtime.sendMessage({ command: "open", name });
    if (response && response.error) {
      showMessage("Error: " + response.error, true);
    } else {
      // Optionally close the popup after opening the workspace
      window.close();
    }
  } catch (err) {
    console.error("Failed to send open message:", err);
    showMessage("Error opening workspace.", true);
  }
}

// Delete a workspace by name (calls background)
async function deleteWorkspace(name) {
  try {
    const response = await browser.runtime.sendMessage({ command: "delete", name });
    if (response && response.error) {
      showMessage("Error: " + response.error, true);
    } else {
      // Remove the item from the UI list after successful deletion
      await loadWorkspaces();
    }
  } catch (err) {
    console.error("Failed to send delete message:", err);
    showMessage("Error deleting workspace.", true);
  }
}

// Initialize the popup by loading the existing workspaces
loadWorkspaces();