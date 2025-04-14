// handlers.js

// Helper: Focus an existing window if it exists.
async function focusExistingWindow(windowId) {
    try {
      const win = await browser.windows.get(windowId);
      log(`Found window with ID ${windowId}:`, win);
      await browser.windows.update(windowId, { focused: true });
      return true;
    } catch (err) {
      log(`Window ID ${windowId} not found.`);
      return false;
    }
  }
  
// Save the current window's tabs as a workspace, including the window ID and a unique identifier.
async function saveWorkspace(name) {
    try {
      console.log(`Starting saveWorkspace for workspace: "${name}"`);
      
      // Generate a unique identifier (using crypto.randomUUID if available)
      let uuid;
      if (crypto && crypto.randomUUID) {
        uuid = crypto.randomUUID();
      } else {
        // Fallback for environments without crypto.randomUUID.
        uuid = 'xxxx-xxxx-xxxx-xxxx'.replace(/x/g, () =>
          ((Math.random() * 16) | 0).toString(16));
      }
      console.log(`Generated UUID for workspace: ${uuid}`);
  
      // Get current window details
      const currentWindow = await browser.windows.getCurrent();
      console.log("Current window retrieved:", currentWindow);
      
      // Query all tabs in the current window
      const tabs = await browser.tabs.query({ currentWindow: true });
      console.log("Tabs retrieved in current window:", tabs);
      const urls = tabs.map(tab => tab.url);
      
      // Create the workspace data, including the generated uuid, a user-friendly name,
      // the window ID, and the list of tab URLs.
      const workspaceData = {
        uuid: uuid,
        name: name, // preserve the user-entered name for display purposes.
        windowId: currentWindow.id,
        tabs: urls
      };
      console.log("Saving workspace data:", workspaceData);
      
      // Use the generated UUID as the key in storage.
      await browser.storage.local.set({ [uuid]: workspaceData });
      console.log(`Workspace "${name}" saved successfully with UUID ${uuid}.`);
      return { status: "ok" };
    } catch (error) {
      console.error("Error saving workspace:", error);
      return { error: error.message };
    }
  }
  
  // Open a workspace by name.
  async function openWorkspace(name) {
    try {
      log(`Attempting to open workspace: "${name}"`);
      const data = await browser.storage.local.get(name);
      log("Retrieved workspace data:", data);
      const workspace = data[name];
      if (!workspace) {
        log(`Workspace "${name}" not found.`);
        return { error: `Workspace "${name}" not found` };
      }
      if (workspace.windowId) {
        log(`Workspace "${name}" has associated windowId: ${workspace.windowId}`);
        if (await focusExistingWindow(workspace.windowId)) {
          log(`Window ${workspace.windowId} focused.`);
          return { status: `Workspace "${name}" is already open and has been focused.` };
        } else {
          log(`Window ID ${workspace.windowId} not found. Creating a new window for workspace "${name}".`);
        }
      }
      log(`Creating a new window for workspace "${name}" with saved tabs:`, workspace.tabs);
      const newWindow = await browser.windows.create({ focused: true });
      const newWindowPopulated = await browser.windows.get(newWindow.id, { populate: true });
      log("New window created:", newWindowPopulated);
      let firstTabUpdated = false;
      for (const url of workspace.tabs) {
        let finalUrl = url;
        // Replace illegal URL if necessary.
        if (url === "about:debugging#/runtime/this-firefox") {
          log(`Illegal URL encountered: "${url}". Replacing with "about:blank".`);
          finalUrl = "about:blank";
        }
        try {
          if (!firstTabUpdated) {
            const firstTabId = newWindowPopulated.tabs[0].id;
            log(`Updating first tab (ID: ${firstTabId}) with URL: ${finalUrl}`);
            const updatedTab = await browser.tabs.update(firstTabId, { url: finalUrl });
            log("First tab updated successfully:", updatedTab);
            firstTabUpdated = true;
          } else {
            log(`Creating a new tab in window ${newWindowPopulated.id} with URL: ${finalUrl}`);
            const createdTab = await browser.tabs.create({ url: finalUrl, windowId: newWindowPopulated.id });
            log("New tab created successfully:", createdTab);
          }
        } catch (err) {
          console.error(`Error opening URL "${finalUrl}":`, err);
          if (!firstTabUpdated) {
            const firstTabId = newWindowPopulated.tabs[0].id;
            log(`Fallback: Updating first tab (ID: ${firstTabId}) to "about:blank" due to error.`);
            const updatedTab = await browser.tabs.update(firstTabId, { url: "about:blank" });
            log("Fallback: First tab updated to about:blank:", updatedTab);
            firstTabUpdated = true;
          } else {
            log(`Fallback: Creating a new tab with "about:blank" due to error.`);
            const createdTab = await browser.tabs.create({ url: "about:blank", windowId: newWindowPopulated.id });
            log("Fallback: New tab created with about:blank:", createdTab);
          }
        }
      }
      // Update the workspace with the new window ID.
      workspace.windowId = newWindowPopulated.id;
      log(`Updating workspace "${name}" with new windowId: ${newWindowPopulated.id}`);
      await browser.storage.local.set({ [name]: workspace });
      log(`Workspace "${name}" opened in a new window.`);
      return { status: `Workspace "${name}" opened in a new window.` };
    } catch (error) {
      return handleError(error, "openWorkspace");
    }
  }
  
  // Delete a saved workspace.
  async function deleteWorkspace(name) {
    try {
      log(`Deleting workspace: "${name}"`);
      await browser.storage.local.remove(name);
      log(`Workspace "${name}" deleted successfully.`);
      return { status: "ok" };
    } catch (error) {
      return handleError(error, "deleteWorkspace");
    }
  }
  
  // Update the workspace based on the current state of the given window.
  async function updateWorkspaceForWindow(windowId) {
    try {
      log(`Updating workspace(s) for windowId: ${windowId}`);
      const allWorkspaces = await browser.storage.local.get();
      log("Retrieved all workspaces:", allWorkspaces);
      for (const [name, workspace] of Object.entries(allWorkspaces)) {
        if (workspace && workspace.windowId === windowId) {
          log(`Workspace "${name}" is associated with windowId ${windowId}. Updating...`);
          const tabs = await browser.tabs.query({ windowId: windowId });
          log(`Tabs currently in window ${windowId}:`, tabs);
          const urls = tabs.map(tab => tab.url);
          workspace.tabs = urls;
          log(`Updated tabs for workspace "${name}":`, urls);
          await browser.storage.local.set({ [name]: workspace });
          log(`Workspace "${name}" updated successfully.`);
        }
      }
    } catch (error) {
      console.error("Error updating workspace for window:", error);
    }
  }
  