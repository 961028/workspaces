/**
 * Tests for popup/popup.js
 *
 * Uses jsdom (via Jest) for DOM manipulation tests.
 * @jest-environment jsdom
 */
const fs = require("fs");
const path = require("path");
const { createBrowserMock } = require("./setup");

function getPopupHtml() {
	return fs.readFileSync(
		path.join(__dirname, "..", "popup", "popup.html"),
		"utf-8",
	);
}

function getPopupCode() {
	return fs.readFileSync(
		path.join(__dirname, "..", "popup", "popup.js"),
		"utf-8",
	);
}

/**
 * Set up the DOM and browser mock, then execute popup.js.
 * Returns references to the classes that are now in the global scope.
 */
function loadPopupEnv(browserMock) {
	document.documentElement.innerHTML = getPopupHtml();
	global.browser = browserMock;
	global.prompt = jest.fn();

	// Execute popup.js and expose class declarations globally.
	// Class declarations are block-scoped even in the global eval scope,
	// so we append explicit assignments to make them accessible from tests.
	const code = getPopupCode();
	const expose = `
globalThis.PopupApp = PopupApp;
globalThis.WorkspaceList = WorkspaceList;
globalThis.ContextMenu = ContextMenu;
globalThis.DragAndDropManager = DragAndDropManager;
globalThis.StatusBar = StatusBar;
globalThis.ThemeManager = ThemeManager;
globalThis.STATUS_DISPLAY_TIME = STATUS_DISPLAY_TIME;
globalThis.ITEMS_GAP = ITEMS_GAP;
globalThis.POINTER_DRAG_THRESHOLD = POINTER_DRAG_THRESHOLD;
globalThis.CONTEXT_MENU_MARGIN = CONTEXT_MENU_MARGIN;
`;
	(0, eval)(code + expose);
}

describe("popup.js", () => {
	let browserMock;

	beforeEach(() => {
		browserMock = createBrowserMock();
		document.documentElement.innerHTML = "";
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
		delete global.browser;
		delete global.prompt;
	});

	// ═══════════════════════════════════════════════════════════════
	// 2.5 StatusBar
	// ═══════════════════════════════════════════════════════════════
	describe("StatusBar", () => {
		let statusBar;

		beforeEach(() => {
			loadPopupEnv(browserMock);
			// StatusBar is now in global scope from eval
			statusBar = new StatusBar("status");
		});

		test("sets status element text", () => {
			statusBar.show("Hello", false);
			expect(document.getElementById("status").textContent).toBe("Hello");
		});

		test("applies error class when isError is true", () => {
			statusBar.show("Oops", true);
			expect(document.getElementById("status").className).toBe("error");
		});

		test("applies success class when isError is false", () => {
			statusBar.show("Done", false);
			expect(document.getElementById("status").className).toBe("success");
		});

		test("clears message after STATUS_DISPLAY_TIME", () => {
			statusBar.show("Temp", false);
			jest.advanceTimersByTime(3000);
			expect(document.getElementById("status").textContent).toBe("");
		});

		test("resets previous timeout on rapid calls", () => {
			statusBar.show("First", false);
			statusBar.show("Second", true);
			jest.advanceTimersByTime(3000);
			const el = document.getElementById("status");
			expect(el.textContent).toBe("");
		});
	});

	// ═══════════════════════════════════════════════════════════════
	// 2.6 ThemeManager
	// ═══════════════════════════════════════════════════════════════
	describe("ThemeManager", () => {
		let themeManager;

		beforeEach(() => {
			loadPopupEnv(browserMock);
			themeManager = new ThemeManager();
		});

		test("setInitialStyle calls browser.theme.getCurrent", async () => {
			browserMock.theme.getCurrent.mockResolvedValue({
				colors: { popup: "#fff", popup_text: "#000" },
			});
			await themeManager.setInitialStyle();
			expect(browserMock.theme.getCurrent).toHaveBeenCalled();
		});

		test("applyThemeStyle sets CSS variables", () => {
			themeManager.applyThemeStyle({
				colors: { popup: "#123456", popup_text: "#abcdef" },
			});
			const style = document.documentElement.style;
			expect(style.getPropertyValue("--Menu")).toBe("#123456");
			expect(style.getPropertyValue("--MenuText")).toBe("#abcdef");
		});

		test("applyThemeStyle does nothing when theme has no colors", () => {
			// Should not throw
			expect(() => themeManager.applyThemeStyle({})).not.toThrow();
			expect(() => themeManager.applyThemeStyle(null)).not.toThrow();
		});

		test("listenForThemeUpdates registers listener", () => {
			themeManager.listenForThemeUpdates();
			expect(browserMock.theme.onUpdated.addListener).toHaveBeenCalled();
		});
	});

	// ═══════════════════════════════════════════════════════════════
	// 2.3 ContextMenu
	// ═══════════════════════════════════════════════════════════════
	describe("ContextMenu", () => {
		let contextMenu;
		let statusBar;

		beforeEach(() => {
			loadPopupEnv(browserMock);
			statusBar = new StatusBar("status");
			contextMenu = new ContextMenu({ statusBar });
		});

		test("create() adds menu element to DOM with Rename and Unsave", () => {
			contextMenu.create();
			const el = document.getElementById("context-menu");
			expect(el).toBeTruthy();
			expect(el.children.length).toBe(2);
			expect(el.children[0].textContent).toBe("Rename");
			expect(el.children[1].textContent).toBe("Unsave");
		});

		test("show() displays the menu and stores workspace ID", () => {
			contextMenu.create();
			contextMenu.show(
				{ clientX: 50, clientY: 50, preventDefault: () => {} },
				42,
			);
			const el = document.getElementById("context-menu");
			expect(el.style.display).toBe("block");
			expect(contextMenu.contextMenuOpenForWorkspaceId).toBe(42);
		});

		test("hide() hides the menu and clears workspace ID", () => {
			contextMenu.create();
			contextMenu.show(
				{ clientX: 50, clientY: 50, preventDefault: () => {} },
				42,
			);
			contextMenu.hide();
			const el = document.getElementById("context-menu");
			expect(el.style.display).toBe("none");
			expect(contextMenu.contextMenuOpenForWorkspaceId).toBeNull();
		});

		test("isOpenForWorkspace returns true when menu matches", () => {
			contextMenu.create();
			contextMenu.show(
				{ clientX: 50, clientY: 50, preventDefault: () => {} },
				42,
			);
			expect(contextMenu.isOpenForWorkspace(42)).toBe(true);
		});

		test("isOpenForWorkspace returns false when hidden", () => {
			contextMenu.create();
			expect(contextMenu.isOpenForWorkspace(42)).toBe(false);
		});

		test("isOpenForWorkspace returns false for different ID", () => {
			contextMenu.create();
			contextMenu.show(
				{ clientX: 50, clientY: 50, preventDefault: () => {} },
				42,
			);
			expect(contextMenu.isOpenForWorkspace(99)).toBe(false);
		});

		test("isOpenForOtherWorkspace returns true for different ID", () => {
			contextMenu.create();
			contextMenu.show(
				{ clientX: 50, clientY: 50, preventDefault: () => {} },
				42,
			);
			expect(contextMenu.isOpenForOtherWorkspace(99)).toBe(true);
		});

		test("isOpenForOtherWorkspace returns false when hidden", () => {
			contextMenu.create();
			expect(contextMenu.isOpenForOtherWorkspace(99)).toBe(false);
		});

		test("isOpenForOtherWorkspace returns false for same ID", () => {
			contextMenu.create();
			contextMenu.show(
				{ clientX: 50, clientY: 50, preventDefault: () => {} },
				42,
			);
			expect(contextMenu.isOpenForOtherWorkspace(42)).toBe(false);
		});

		test("onRenameClick sends renameWorkspace message", () => {
			const sendMsg = jest.fn();
			contextMenu.setSendMessageHandler(sendMsg);
			contextMenu.create();
			contextMenu.show(
				{ clientX: 50, clientY: 50, preventDefault: () => {} },
				42,
			);
			global.prompt.mockReturnValue("New Name");
			contextMenu.onRenameClick();
			expect(sendMsg).toHaveBeenCalledWith({
				action: "renameWorkspace",
				workspaceId: 42,
				newTitle: "New Name",
			});
		});

		test("onRenameClick does nothing when prompt is cancelled", () => {
			const sendMsg = jest.fn();
			contextMenu.setSendMessageHandler(sendMsg);
			contextMenu.create();
			contextMenu.show(
				{ clientX: 50, clientY: 50, preventDefault: () => {} },
				42,
			);
			global.prompt.mockReturnValue(null);
			contextMenu.onRenameClick();
			expect(sendMsg).not.toHaveBeenCalled();
		});

		test("onRenameClick does nothing for empty string", () => {
			const sendMsg = jest.fn();
			contextMenu.setSendMessageHandler(sendMsg);
			contextMenu.create();
			contextMenu.show(
				{ clientX: 50, clientY: 50, preventDefault: () => {} },
				42,
			);
			global.prompt.mockReturnValue("   ");
			contextMenu.onRenameClick();
			expect(sendMsg).not.toHaveBeenCalled();
		});

		test("onUnsaveClick sends unsaveWorkspace message", () => {
			const sendMsg = jest.fn();
			contextMenu.setSendMessageHandler(sendMsg);
			contextMenu.create();
			contextMenu.show(
				{ clientX: 50, clientY: 50, preventDefault: () => {} },
				42,
			);
			contextMenu.onUnsaveClick();
			expect(sendMsg).toHaveBeenCalledWith({
				action: "unsaveWorkspace",
				workspaceId: 42,
			});
		});

		test("show() adjusts position to stay within viewport", () => {
			contextMenu.create();
			// Force the context menu to have dimensions
			Object.defineProperty(contextMenu.contextMenuEl, "offsetWidth", {
				value: 200,
			});
			Object.defineProperty(contextMenu.contextMenuEl, "offsetHeight", {
				value: 100,
			});
			// Simulate showing near bottom-right edge with small viewport
			Object.defineProperty(window, "innerWidth", {
				value: 300,
				writable: true,
			});
			Object.defineProperty(window, "innerHeight", {
				value: 200,
				writable: true,
			});
			contextMenu.show(
				{ clientX: 250, clientY: 180, preventDefault: () => {} },
				1,
			);
			const left = parseInt(contextMenu.contextMenuEl.style.left, 10);
			const top = parseInt(contextMenu.contextMenuEl.style.top, 10);
			// Should be clamped to not exceed viewport - margin
			expect(left).toBeLessThanOrEqual(300 - 200 - 20);
			expect(top).toBeLessThanOrEqual(200 - 100 - 20);
		});
	});

	// ═══════════════════════════════════════════════════════════════
	// 2.4 DragAndDropManager
	// ═══════════════════════════════════════════════════════════════
	describe("DragAndDropManager", () => {
		let dnd;

		beforeEach(() => {
			loadPopupEnv(browserMock);
			dnd = new DragAndDropManager();
		});

		test("setupPointerDnD attaches listener to saved list", () => {
			const list = document.getElementById("saved-list");
			const spy = jest.spyOn(list, "addEventListener");
			dnd.setupPointerDnD();
			expect(spy).toHaveBeenCalledWith(
				"pointerdown",
				expect.any(Function),
			);
		});

		test("disablePageScroll sets overflow hidden", () => {
			dnd.disablePageScroll();
			expect(document.body.style.overflow).toBe("hidden");
			expect(document.body.style.userSelect).toBe("none");
		});

		test("enablePageScroll clears styles", () => {
			dnd.disablePageScroll();
			dnd.enablePageScroll();
			expect(document.body.style.overflow).toBe("");
			expect(document.body.style.userSelect).toBe("");
		});

		test("cleanup resets drag state", () => {
			// Set up a fake draggable item
			const li = document.createElement("li");
			li.className = "saved-item js-item is-draggable";
			document.getElementById("saved-list").appendChild(li);
			dnd.listContainer = document.getElementById("saved-list");
			dnd.draggableItem = li;

			dnd.cleanup();
			expect(dnd.draggableItem).toBeNull();
			expect(document.body.style.overflow).toBe("");
		});

		test("getAllItems returns all .js-item elements", () => {
			const list = document.getElementById("saved-list");
			const li1 = document.createElement("li");
			li1.className = "js-item is-idle";
			const li2 = document.createElement("li");
			li2.className = "js-item is-idle";
			list.appendChild(li1);
			list.appendChild(li2);
			dnd.listContainer = list;
			expect(dnd.getAllItems()).toHaveLength(2);
		});

		test("getIdleItems excludes dragging item", () => {
			const list = document.getElementById("saved-list");
			const li1 = document.createElement("li");
			li1.className = "js-item is-idle";
			const li2 = document.createElement("li");
			li2.className = "js-item is-draggable";
			list.appendChild(li1);
			list.appendChild(li2);
			dnd.listContainer = list;
			expect(dnd.getIdleItems()).toHaveLength(1);
		});

		test("setAboveState sets data-is-above attribute", () => {
			const el = document.createElement("li");
			dnd.setAboveState(el, true);
			expect(el.dataset.isAbove).toBe("true");
			dnd.setAboveState(el, false);
			expect(el.dataset.isAbove).toBeUndefined();
		});

		test("setToggledState sets data-is-toggled attribute", () => {
			const el = document.createElement("li");
			dnd.setToggledState(el, true);
			expect(el.dataset.isToggled).toBe("true");
			dnd.setToggledState(el, false);
			expect(el.dataset.isToggled).toBeUndefined();
		});

		test("setItemTransform applies translateY", () => {
			const el = document.createElement("li");
			dnd.setItemTransform(el, 50);
			expect(el.style.transform).toBe("translateY(50px)");
			dnd.setItemTransform(el, 0);
			expect(el.style.transform).toBe("");
		});

		test("isItemAbove checks data attribute", () => {
			const el = document.createElement("li");
			expect(dnd.isItemAbove(el)).toBe(false);
			el.setAttribute("data-is-above", "true");
			expect(dnd.isItemAbove(el)).toBe(true);
		});

		test("isItemToggled checks data attribute", () => {
			const el = document.createElement("li");
			expect(dnd.isItemToggled(el)).toBe(false);
			el.setAttribute("data-is-toggled", "true");
			expect(dnd.isItemToggled(el)).toBe(true);
		});

		test("initDraggableItem switches CSS classes", () => {
			const li = document.createElement("li");
			li.className = "js-item is-idle";
			dnd.draggableItem = li;
			dnd.initDraggableItem();
			expect(li.classList.contains("is-draggable")).toBe(true);
			expect(li.classList.contains("is-idle")).toBe(false);
		});

		test("unsetDraggableItem resets to idle", () => {
			const li = document.createElement("li");
			li.className = "js-item is-draggable";
			li.style.transform = "translate(10px, 20px)";
			dnd.draggableItem = li;
			dnd.unsetDraggableItem();
			expect(li.classList.contains("is-idle")).toBe(true);
			expect(li.classList.contains("is-draggable")).toBe(false);
			expect(li.style.transform).toBe("");
			expect(dnd.draggableItem).toBeNull();
		});

		test("applyNewItemsOrder reorders DOM children", () => {
			const list = document.getElementById("saved-list");
			dnd.listContainer = list;

			const li1 = document.createElement("li");
			li1.className = "js-item is-idle";
			li1.textContent = "A";
			const li2 = document.createElement("li");
			li2.className = "js-item is-draggable";
			li2.textContent = "B";
			const li3 = document.createElement("li");
			li3.className = "js-item is-idle";
			li3.textContent = "C";

			list.appendChild(li1);
			list.appendChild(li2);
			list.appendChild(li3);

			dnd.draggableItem = li2;
			// Toggle li3 to simulate it moving up (li3 is below, toggled=moved)
			li3.setAttribute("data-is-toggled", "true");
			// li3 is not above, so newIndex = index - 1

			dnd.applyNewItemsOrder();

			const children = Array.from(list.children);
			// li2 (dragged) should fill the gap
			expect(children).toHaveLength(3);
		});

		test("addListItemEvents attaches click handler", () => {
			const li = document.createElement("li");
			li.className = "js-item is-idle";
			const onClick = jest.fn();
			dnd.addListItemEvents(li, { onClick });
			li.click();
			expect(onClick).toHaveBeenCalled();
		});

		test("addListItemEvents attaches button click handler", () => {
			const li = document.createElement("li");
			li.innerHTML = '<button class="save-btn">Save</button>';
			const onButtonClick = jest.fn();
			dnd.addListItemEvents(li, {
				buttonSelector: ".save-btn",
				onButtonClick,
			});
			li.querySelector(".save-btn").click();
			expect(onButtonClick).toHaveBeenCalled();
		});

		test("addListItemEvents makes item draggable when onDragStart provided", () => {
			const li = document.createElement("li");
			const onDragStart = jest.fn();
			dnd.addListItemEvents(li, { onDragStart });
			expect(li.getAttribute("draggable")).toBe("true");
		});

		test("initItemsState marks items above dragging item", () => {
			const list = document.getElementById("saved-list");
			dnd.listContainer = list;

			const li1 = document.createElement("li");
			li1.className = "js-item is-idle";
			const li2 = document.createElement("li");
			li2.className = "js-item is-draggable";
			const li3 = document.createElement("li");
			li3.className = "js-item is-idle";

			list.appendChild(li1);
			list.appendChild(li2);
			list.appendChild(li3);

			dnd.draggableItem = li2;
			dnd.initItemsState();

			expect(li1.dataset.isAbove).toBe("true");
			expect(li3.dataset.isAbove).toBeUndefined();
		});

		test("unsetItemState clears all idle item state", () => {
			const list = document.getElementById("saved-list");
			dnd.listContainer = list;

			const li1 = document.createElement("li");
			li1.className = "js-item is-idle";
			li1.dataset.isAbove = "true";
			li1.dataset.isToggled = "true";
			li1.style.transform = "translateY(50px)";
			list.appendChild(li1);

			dnd.unsetItemState();
			expect(li1.dataset.isAbove).toBeUndefined();
			expect(li1.dataset.isToggled).toBeUndefined();
			expect(li1.style.transform).toBe("");
		});
	});

	// ═══════════════════════════════════════════════════════════════
	// 2.2 WorkspaceList
	// ═══════════════════════════════════════════════════════════════
	describe("WorkspaceList", () => {
		let workspaceList;
		let dndManager;
		let statusBar;
		let contextMenu;

		beforeEach(() => {
			loadPopupEnv(browserMock);
			statusBar = new StatusBar("status");
			dndManager = new DragAndDropManager();
			contextMenu = new ContextMenu({ statusBar });
			contextMenu.create();
			workspaceList = new WorkspaceList({
				dragAndDropManager: dndManager,
				statusBar,
				contextMenu,
			});
			workspaceList.setSendMessageHandler(jest.fn());
		});

		describe("updateSavedList()", () => {
			test("renders one item per saved workspace", () => {
				const saved = [
					{ id: 1, title: "WS1", tabs: ["a"], order: 0 },
					{ id: 2, title: "WS2", tabs: ["b"], order: 1 },
				];
				workspaceList.updateSavedList(saved, 0);
				const items = document.querySelectorAll(
					"#saved-list .saved-item",
				);
				expect(items.length).toBe(2);
			});

			test("renders empty message when no workspaces", () => {
				workspaceList.updateSavedList([], 0);
				const list = document.getElementById("saved-list");
				expect(list.innerHTML).toContain("empty-message");
			});

			test("highlights workspace matching currentWindowId", () => {
				const saved = [
					{
						id: 1,
						title: "WS1",
						tabs: ["a"],
						windowId: 10,
						order: 0,
					},
				];
				workspaceList.updateSavedList(saved, 10);
				const item = document.querySelector("#saved-list .saved-item");
				expect(item.classList.contains("highlight")).toBe(true);
			});

			test("does not highlight when windowId doesn't match", () => {
				const saved = [
					{
						id: 1,
						title: "WS1",
						tabs: ["a"],
						windowId: 10,
						order: 0,
					},
				];
				workspaceList.updateSavedList(saved, 99);
				const item = document.querySelector("#saved-list .saved-item");
				expect(item.classList.contains("highlight")).toBe(false);
			});
		});

		describe("createSavedListItem()", () => {
			test("creates li with correct data-wsid", () => {
				const li = workspaceList.createSavedListItem(
					{ id: 42, title: "Test", tabs: ["a", "b"] },
					0,
				);
				expect(li.dataset.wsid).toBe("42");
			});

			test("shows workspace title", () => {
				const li = workspaceList.createSavedListItem(
					{ id: 1, title: "My WS", tabs: [] },
					0,
				);
				expect(li.querySelector(".label").textContent).toBe("My WS");
			});

			test("shows tab count", () => {
				const li = workspaceList.createSavedListItem(
					{ id: 1, title: "T", tabs: ["a", "b", "c"] },
					0,
				);
				expect(li.querySelector(".subtitle").textContent).toBe(
					"3 Tabs",
				);
			});

			test("shows singular tab count", () => {
				const li = workspaceList.createSavedListItem(
					{ id: 1, title: "T", tabs: ["a"] },
					0,
				);
				expect(li.querySelector(".subtitle").textContent).toBe("1 Tab");
			});

			test("fallback title when workspace has no title", () => {
				const li = workspaceList.createSavedListItem(
					{ id: 1, title: "", tabs: [] },
					0,
				);
				expect(li.querySelector(".label").textContent).toBe(
					"(No Title)",
				);
			});

			test("has edit button with correct data-wsid", () => {
				const li = workspaceList.createSavedListItem(
					{ id: 7, title: "T", tabs: [] },
					0,
				);
				const btn = li.querySelector(".edit-btn");
				expect(btn).toBeTruthy();
				expect(btn.dataset.wsid).toBe("7");
			});

			test("returns empty li for null workspace", () => {
				const li = workspaceList.createSavedListItem(null, 0);
				expect(li.tagName).toBe("LI");
				expect(li.children.length).toBe(0);
			});
		});

		describe("updateUnsavedList()", () => {
			test("renders one item per unsaved window", () => {
				const unsaved = [
					{
						windowId: 10,
						title: "Win1",
						tabs: [{ url: "a" }],
					},
					{
						windowId: 20,
						title: "Win2",
						tabs: [{ url: "b" }],
					},
				];
				workspaceList.updateUnsavedList(unsaved, 0);
				const items = document.querySelectorAll(
					"#unsaved-list .unsaved-item",
				);
				expect(items.length).toBe(2);
			});

			test("renders nothing for empty unsaved", () => {
				workspaceList.updateUnsavedList([], 0);
				const list = document.getElementById("unsaved-list");
				expect(list.children.length).toBe(0);
			});

			test("adds <hr> separator when unsaved items exist", () => {
				const unsaved = [{windowId: 10, title: "Win1", tabs: []}];
				workspaceList.updateUnsavedList(unsaved, 0);
				const hr = document.querySelector("hr");
				expect(hr).toBeTruthy();
			});

			test("removes <hr> separator when unsaved is empty", () => {
				// First add
				workspaceList.updateUnsavedList(
					[{ windowId: 10, title: "W", tabs: [] }],
					0,
				);
				// Then clear
				workspaceList.updateUnsavedList([], 0);
				const hr = document.querySelector("hr");
				expect(hr).toBeFalsy();
			});
		});

		describe("createUnsavedListItem()", () => {
			test("creates li with correct data-wid", () => {
				const li = workspaceList.createUnsavedListItem(
					{ windowId: 55, title: "Win", tabs: [] },
					0,
				);
				expect(li.dataset.wid).toBe("55");
			});

			test("shows window title", () => {
				const li = workspaceList.createUnsavedListItem(
					{ windowId: 1, title: "My Win", tabs: [] },
					0,
				);
				expect(li.querySelector(".label").textContent).toBe("My Win");
			});

			test("highlights current window", () => {
				const li = workspaceList.createUnsavedListItem(
					{ windowId: 10, title: "W", tabs: [] },
					10,
				);
				expect(li.classList.contains("highlight")).toBe(true);
			});

			test("has save button", () => {
				const li = workspaceList.createUnsavedListItem(
					{ windowId: 10, title: "W", tabs: [] },
					0,
				);
				expect(li.querySelector(".save-btn")).toBeTruthy();
			});

			test("returns empty li for null window", () => {
				const li = workspaceList.createUnsavedListItem(null, 0);
				expect(li.tagName).toBe("LI");
				expect(li.children.length).toBe(0);
			});
		});

		describe("handleDragStartUnsaved()", () => {
			test("sets drag data when event has dataTransfer", () => {
				const li = document.createElement("li");
				li.dataset.wid = "42";
				const setData = jest.fn();
				const e = {
					dataTransfer: {
						setData,
						effectAllowed: "",
					},
					currentTarget: li,
				};
				workspaceList.handleDragStartUnsaved(e);
				expect(setData).toHaveBeenCalledWith("unsavedWindowId", "42");
			});

			test("does nothing when event lacks dataTransfer", () => {
				expect(() =>
					workspaceList.handleDragStartUnsaved({}),
				).not.toThrow();
			});
		});

		describe("setFavicon()", () => {
			test("queries active tab for the window", () => {
				browserMock.tabs.query.mockResolvedValue([
					{
						active: true,
						favIconUrl: "https://example.com/fav.ico",
					},
				]);
				const li = document.createElement("li");
				li.innerHTML = '<img class="favicon" src="">';
				workspaceList.setFavicon(li, 10, "default.svg");
				expect(browserMock.tabs.query).toHaveBeenCalledWith({
					windowId: 10,
					active: true,
				});
			});

			test("sets fallback when windowId is null", () => {
				const li = document.createElement("li");
				li.innerHTML = '<img class="favicon" src="">';
				workspaceList.setFavicon(li, null, "fallback.svg");
				expect(li.querySelector(".favicon").src).toContain(
					"fallback.svg",
				);
			});
		});
	});

	// ═══════════════════════════════════════════════════════════════
	// 2.1 PopupApp
	// ═══════════════════════════════════════════════════════════════
	describe("PopupApp", () => {
		let app;

		beforeEach(() => {
			browserMock.windows.getLastFocused.mockResolvedValue({
				id: 1,
			});
			browserMock.runtime.sendMessage.mockResolvedValue({
				success: true,
				saved: [],
				unsaved: [],
			});
			browserMock.theme.getCurrent.mockResolvedValue({
				colors: { popup: "#fff", popup_text: "#000" },
			});
			loadPopupEnv(browserMock);
			app = createPopupApp();
		});

		test("init creates context menu", async () => {
			await app.init();
			expect(document.getElementById("context-menu")).toBeTruthy();
		});

		test("init calls loadState", async () => {
			const spy = jest.spyOn(app, "loadState");
			await app.init();
			expect(spy).toHaveBeenCalled();
		});

		test("init attaches click listener that hides context menu", async () => {
			await app.init();
			const menu = document.getElementById("context-menu");
			app.contextMenu.show(
				{ clientX: 10, clientY: 10, preventDefault: () => {} },
				1,
			);
			expect(menu.style.display).toBe("block");
			document.dispatchEvent(new Event("click", { bubbles: true }));
			expect(menu.style.display).toBe("none");
		});

		test("loadState sends getState message to background", async () => {
			await app.loadState();
			expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith({
				action: "getState",
			});
		});

		test("loadState shows error when background returns error", async () => {
			browserMock.runtime.sendMessage.mockResolvedValue({
				success: false,
				error: "oops",
			});
			browserMock.windows.getLastFocused.mockResolvedValue({
				id: 1,
			});
			await app.loadState();
			const status = document.getElementById("status");
			expect(status.textContent).toContain("oops");
		});

		test("sendMessage sends message and reloads state", async () => {
			browserMock.runtime.sendMessage.mockResolvedValue({
				success: true,
				message: "done",
			});
			const loadSpy = jest.spyOn(app, "loadState").mockResolvedValue();
			await app.sendMessage({ action: "saveWindow", windowId: 10 });
			expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith({
				action: "saveWindow",
				windowId: 10,
			});
			expect(loadSpy).toHaveBeenCalled();
		});

		test("sendMessage shows error on failure", async () => {
			browserMock.runtime.sendMessage.mockResolvedValue({
				success: false,
				error: "fail",
			});
			jest.spyOn(app, "loadState").mockResolvedValue();
			await app.sendMessage({ action: "bogus" });
			const status = document.getElementById("status");
			expect(status.className).toBe("error");
		});

		test("sendMessage rejects invalid message", async () => {
			await app.sendMessage(null);
			const status = document.getElementById("status");
			expect(status.textContent).toContain("Invalid");
		});

		test("sendMessage handles runtime.sendMessage rejection", async () => {
			browserMock.runtime.sendMessage.mockRejectedValue(
				new Error("extension disconnected"),
			);
			jest.spyOn(app, "loadState").mockResolvedValue();
			await app.sendMessage({action: "test"});
			const status = document.getElementById("status");
			expect(status.className).toBe("error");
			expect(status.textContent).toContain("extension disconnected");
		});

		test("loadState handles missing currentWindow id", async () => {
			browserMock.windows.getLastFocused.mockResolvedValue({});
			await app.loadState();
			const status = document.getElementById("status");
			expect(status.textContent).toContain("Failed to retrieve window");
		});

		test("loadState handles getLastFocused rejection", async () => {
			browserMock.windows.getLastFocused.mockRejectedValue(
				new Error("no window"),
			);
			await app.loadState();
			const status = document.getElementById("status");
			expect(status.className).toBe("error");
		});

		test("persistSavedOrder handles missing saved-list element", () => {
			document.getElementById("saved-list").remove();
			app.persistSavedOrder();
			const status = document.getElementById("status");
			expect(status.textContent).toContain("Failed to persist order");
		});

		test("persistSavedOrder reads wsid from DOM and sends updateOrder", async () => {
			// Set up some saved items in the list
			const list = document.getElementById("saved-list");
			list.innerHTML = "";
			const li1 = document.createElement("li");
			li1.className = "saved-item";
			li1.dataset.wsid = "3";
			const li2 = document.createElement("li");
			li2.className = "saved-item";
			li2.dataset.wsid = "1";
			list.appendChild(li1);
			list.appendChild(li2);

			const sendSpy = jest.spyOn(app, "sendMessage").mockResolvedValue();
			app.persistSavedOrder();
			expect(sendSpy).toHaveBeenCalledWith({
				action: "updateOrder",
				newOrder: [3, 1],
			});
		});
	});

	// ═══════════════════════════════════════════════════════════════
	// 2.7 createPopupApp
	// ═══════════════════════════════════════════════════════════════
	describe("createPopupApp()", () => {
		beforeEach(() => {
			loadPopupEnv(browserMock);
		});

		test("returns a PopupApp instance", () => {
			const app = createPopupApp();
			expect(app).toBeInstanceOf(PopupApp);
		});

		test("wires sendMessage to WorkspaceList", () => {
			const app = createPopupApp();
			expect(app.workspaceList.sendMessage).toBeDefined();
			expect(typeof app.workspaceList.sendMessage).toBe("function");
		});

		test("wires sendMessage to ContextMenu", () => {
			const app = createPopupApp();
			expect(app.contextMenu.sendMessage).toBeDefined();
			expect(typeof app.contextMenu.sendMessage).toBe("function");
		});

		test("wires persistSavedOrder to DragAndDropManager", () => {
			const app = createPopupApp();
			expect(
				app.workspaceList.dragAndDropManager.persistSavedOrder,
			).toBeDefined();
		});
	});

	// ═══════════════════════════════════════════════════════════════
	// Document-level context menu prevention
	// ═══════════════════════════════════════════════════════════════
	describe("document contextmenu prevention", () => {
		test("prevents default browser context menu", () => {
			loadPopupEnv(browserMock);
			const event = new Event("contextmenu", {
				bubbles: true,
				cancelable: true,
			});
			const prevented = !document.dispatchEvent(event);
			expect(prevented).toBe(true);
		});
	});
});
