/**
 * Tests for background.js
 *
 * Strategy: Execute background.js inside a VM context with a mocked `browser` global.
 * This avoids needing to refactor the source to use CommonJS exports.
 */
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const {createBrowserMock, installBrowserMock} = require("./setup");

// Helper: Execute background.js in a fresh context and return the context object.
// `let` variables (pendingUpdates, updateTimer, windowLastActive) don't become
// properties on the VM sandbox, so we append accessor functions that live in the
// same script scope and *can* reach them.
function loadBackground(browserMock) {
	const code = fs.readFileSync(
		path.join(__dirname, "..", "background.js"),
		"utf-8",
	);

	const accessors = `
function __getPendingUpdates() { return pendingUpdates; }
function __getUpdateTimer()    { return updateTimer; }
function __getWindowLastActive(){ return windowLastActive; }
function __setWindowLastActive(v){ windowLastActive = v; }
`;

	const context = vm.createContext({
		browser: browserMock,
		console: {
			log: jest.fn(),
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
		},
		setTimeout: global.setTimeout,
		clearTimeout: global.clearTimeout,
		Date,
		Number,
		Object,
		Array,
		Math,
		parseInt,
		Promise,
		Set,
		Error,
	});
	vm.runInContext(code + accessors, context);
	return context;
}

describe("background.js", () => {
	let browserMock;
	let ctx;

	beforeEach(() => {
		jest.useFakeTimers();
		browserMock = createBrowserMock();
		ctx = loadBackground(browserMock);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	// ─── 1.1 getWorkspaces ──────────────────────────────────────────
	describe("getWorkspaces()", () => {
		test("returns defaults when storage is empty", async () => {
			browserMock.storage.local.get.mockResolvedValue({});
			const result = await ctx.getWorkspaces();
			expect(result).toEqual({workspaces: {}, nextId: 1});
		});

		test("returns stored data when it exists", async () => {
			const stored = {
				workspaces: {1: {id: 1, tabs: []}},
				nextId: 5,
			};
			browserMock.storage.local.get.mockResolvedValue(stored);
			const result = await ctx.getWorkspaces();
			expect(result).toEqual(stored);
		});

		test("returns defaults and logs error when storage rejects", async () => {
			browserMock.storage.local.get.mockRejectedValue(new Error("fail"));
			const result = await ctx.getWorkspaces();
			expect(result).toEqual({workspaces: {}, nextId: 1});
			expect(ctx.console.error).toHaveBeenCalled();
		});
	});

	// ─── 1.2 setWorkspaces ──────────────────────────────────────────
	describe("setWorkspaces()", () => {
		test("calls browser.storage.local.set with correct keys", async () => {
			const ws = {1: {id: 1}};
			await ctx.setWorkspaces(ws, 2);
			expect(browserMock.storage.local.set).toHaveBeenCalledWith({
				workspaces: ws,
				nextId: 2,
			});
		});

		test("logs error when storage write rejects", async () => {
			browserMock.storage.local.set.mockRejectedValue(
				new Error("write fail"),
			);
			await ctx.setWorkspaces({}, 1);
			expect(ctx.console.error).toHaveBeenCalled();
		});
	});

	// ─── 1.3 unsetWindowIdForClosedWorkspaces ───────────────────────
	describe("unsetWindowIdForClosedWorkspaces()", () => {
		test("clears windowId on matching workspace", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {
					1: {id: 1, windowId: 10},
				},
				nextId: 2,
			});
			await ctx.unsetWindowIdForClosedWorkspaces(10);
			const setCall = browserMock.storage.local.set.mock.calls[0][0];
			expect(setCall.workspaces[1].windowId).toBeNull();
		});

		test("does nothing when no workspace matches", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {
					1: {id: 1, windowId: 10},
				},
				nextId: 2,
			});
			await ctx.unsetWindowIdForClosedWorkspaces(999);
			expect(browserMock.storage.local.set).not.toHaveBeenCalled();
		});

		test("only clears the matching workspace, leaves others intact", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {
					1: {id: 1, windowId: 10},
					2: {id: 2, windowId: 20},
				},
				nextId: 3,
			});
			await ctx.unsetWindowIdForClosedWorkspaces(10);
			const setCall = browserMock.storage.local.set.mock.calls[0][0];
			expect(setCall.workspaces[1].windowId).toBeNull();
			expect(setCall.workspaces[2].windowId).toBe(20);
		});

		test("persists changes via setWorkspaces", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {1: {id: 1, windowId: 10}},
				nextId: 2,
			});
			await ctx.unsetWindowIdForClosedWorkspaces(10);
			expect(browserMock.storage.local.set).toHaveBeenCalledTimes(1);
		});
	});

	// ─── 1.4 queryGroupRanges ───────────────────────────────────────
	describe("queryGroupRanges()", () => {
		test("returns group range descriptors", async () => {
			browserMock.tabGroups.query.mockResolvedValue([
				{
					id: 1,
					title: "Group1",
					color: "blue",
					collapsed: false,
				},
			]);
			const tabs = [
				{groupId: 1, index: 0},
				{groupId: 1, index: 1},
				{groupId: -1, index: 2},
			];
			const result = await ctx.queryGroupRanges(10, tabs);
			expect(result).toEqual([
				{
					start: 0,
					end: 1,
					title: "Group1",
					color: "blue",
					collapsed: false,
				},
			]);
		});

		test("returns empty array when no tab groups exist", async () => {
			browserMock.tabGroups.query.mockResolvedValue([]);
			const result = await ctx.queryGroupRanges(10, [
				{groupId: -1, index: 0},
			]);
			expect(result).toEqual([]);
		});

		test("returns empty array when tabGroups API is unavailable", async () => {
			// Remove tabGroups from the context browser mock
			const noGroupMock = createBrowserMock();
			delete noGroupMock.tabGroups;
			const ctx2 = loadBackground(noGroupMock);
			const result = await ctx2.queryGroupRanges(10, []);
			expect(result).toEqual([]);
		});

		test("handles multiple non-contiguous groups", async () => {
			browserMock.tabGroups.query.mockResolvedValue([
				{id: 1, title: "A", color: "red", collapsed: false},
				{id: 2, title: "B", color: "green", collapsed: true},
			]);
			const tabs = [
				{groupId: 1, index: 0},
				{groupId: 1, index: 1},
				{groupId: -1, index: 2},
				{groupId: 2, index: 3},
				{groupId: 2, index: 4},
			];
			const result = await ctx.queryGroupRanges(10, tabs);
			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({
				start: 0,
				end: 1,
				title: "A",
				color: "red",
				collapsed: false,
			});
			expect(result[1]).toEqual({
				start: 3,
				end: 4,
				title: "B",
				color: "green",
				collapsed: true,
			});
		});

		test("logs warning when tabGroups.query rejects", async () => {
			browserMock.tabGroups.query.mockRejectedValue(new Error("nope"));
			const result = await ctx.queryGroupRanges(10, []);
			expect(result).toEqual([]);
			expect(ctx.console.warn).toHaveBeenCalled();
		});
	});

	// ─── 1.5 sanitizeUrls ──────────────────────────────────────────
	describe("sanitizeUrls()", () => {
		test("allows http:// URLs", () => {
			expect(ctx.sanitizeUrls(["http://example.com"])).toEqual([
				"http://example.com",
			]);
		});

		test("allows https:// URLs", () => {
			expect(ctx.sanitizeUrls(["https://example.com"])).toEqual([
				"https://example.com",
			]);
		});

		test("allows about:blank", () => {
			expect(ctx.sanitizeUrls(["about:blank"])).toEqual(["about:blank"]);
		});

		test("blocks chrome:// URLs and replaces with about:blank", () => {
			expect(ctx.sanitizeUrls(["chrome://settings"])).toEqual([
				"about:blank",
			]);
		});

		test("blocks moz-extension:// URLs", () => {
			expect(ctx.sanitizeUrls(["moz-extension://foo"])).toEqual([
				"about:blank",
			]);
		});

		test("blocks file:// URLs", () => {
			expect(ctx.sanitizeUrls(["file:///etc/passwd"])).toEqual([
				"about:blank",
			]);
		});

		test("blocks javascript: URLs", () => {
			expect(ctx.sanitizeUrls(["javascript:alert(1)"])).toEqual([
				"about:blank",
			]);
		});

		test("blocks data: URLs", () => {
			expect(ctx.sanitizeUrls(["data:text/html,<h1>Hi</h1>"])).toEqual([
				"about:blank",
			]);
		});

		test("returns all about:blank when all URLs are blocked", () => {
			const result = ctx.sanitizeUrls([
				"chrome://x",
				"file:///y",
				"data:z",
			]);
			expect(result).toEqual([
				"about:blank",
				"about:blank",
				"about:blank",
			]);
		});

		test("logs warning for each blocked URL", () => {
			ctx.sanitizeUrls(["chrome://a", "file://b"]);
			expect(ctx.console.warn).toHaveBeenCalledTimes(2);
		});

		test("handles empty input array", () => {
			expect(ctx.sanitizeUrls([])).toEqual([]);
		});
	});

	// ─── 1.6 scheduleWorkspaceUpdate ────────────────────────────────
	describe("scheduleWorkspaceUpdate()", () => {
		test("adds windowId to pendingUpdates", () => {
			ctx.scheduleWorkspaceUpdate(10);
			expect(ctx.__getPendingUpdates().has(10)).toBe(true);
		});

		test("multiple calls accumulate different IDs", () => {
			ctx.scheduleWorkspaceUpdate(10);
			ctx.scheduleWorkspaceUpdate(20);
			expect(ctx.__getPendingUpdates().has(10)).toBe(true);
			expect(ctx.__getPendingUpdates().has(20)).toBe(true);
		});

		test("resets timer on repeated calls (debounce)", () => {
			ctx.scheduleWorkspaceUpdate(10);
			const timer1 = ctx.__getUpdateTimer();
			ctx.scheduleWorkspaceUpdate(20);
			const timer2 = ctx.__getUpdateTimer();
			// Timer should have been replaced
			expect(timer2).not.toBe(timer1);
		});

		test("ignores invalid windowId", () => {
			ctx.scheduleWorkspaceUpdate(-1);
			expect(ctx.__getPendingUpdates().size).toBe(0);
			ctx.scheduleWorkspaceUpdate("not-a-number");
			expect(ctx.__getPendingUpdates().size).toBe(0);
		});

		test("timer fires processPendingUpdates after debounce delay", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {},
				nextId: 1,
			});
			ctx.scheduleWorkspaceUpdate(10);
			await jest.advanceTimersByTimeAsync(800);
			// pendingUpdates should have been cleared by processPendingUpdates
			expect(ctx.__getPendingUpdates().size).toBe(0);
		});
	});

	// ─── 1.7 processPendingUpdates ──────────────────────────────────
	describe("processPendingUpdates()", () => {
		test("clears pendingUpdates after processing", async () => {
			ctx.__getPendingUpdates().add(10);
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {},
				nextId: 1,
			});
			await ctx.processPendingUpdates();
			expect(ctx.__getPendingUpdates().size).toBe(0);
		});

		test("calls setWorkspaces once after processing all updates", async () => {
			ctx.__getPendingUpdates().add(10);
			ctx.__getPendingUpdates().add(20);
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {
					1: {id: 1, windowId: 10, tabs: []},
					2: {id: 2, windowId: 20, tabs: []},
				},
				nextId: 3,
			});
			browserMock.tabs.query.mockResolvedValue([
				{url: "https://a.com", title: "A", active: true, index: 0},
			]);
			browserMock.tabGroups.query.mockResolvedValue([]);
			await ctx.processPendingUpdates();
			expect(browserMock.storage.local.set).toHaveBeenCalledTimes(1);
		});

		test("skips windows without matching workspace", async () => {
			ctx.__getPendingUpdates().add(999);
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {
					1: {id: 1, windowId: 10, tabs: []},
				},
				nextId: 2,
			});
			browserMock.tabs.query.mockResolvedValue([
				{url: "https://a.com", title: "A", active: true, index: 0},
			]);
			browserMock.tabGroups.query.mockResolvedValue([]);
			await ctx.processPendingUpdates();
			// Storage should still be called (it always persists at the end)
			const ws =
				browserMock.storage.local.set.mock.calls[0][0].workspaces;
			// The workspace for window 10 should be untouched
			expect(ws[1].tabs).toEqual([]);
		});

		test("handles errors from tabs.query gracefully", async () => {
			ctx.__getPendingUpdates().add(10);
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {1: {id: 1, windowId: 10, tabs: []}},
				nextId: 2,
			});
			browserMock.tabs.query.mockRejectedValue(new Error("tabs fail"));
			await ctx.processPendingUpdates();
			expect(ctx.console.error).toHaveBeenCalled();
		});

		test("still clears pendingUpdates when setWorkspaces fails", async () => {
			ctx.__getPendingUpdates().add(10);
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {1: {id: 1, windowId: 10, tabs: []}},
				nextId: 2,
			});
			browserMock.tabs.query.mockResolvedValue([
				{url: "https://a.com", title: "A", active: true, index: 0},
			]);
			browserMock.tabGroups.query.mockResolvedValue([]);
			browserMock.storage.local.set.mockRejectedValue(new Error("write fail"));
			await ctx.processPendingUpdates();
			// pendingUpdates is cleared even if storage write fails
			expect(ctx.__getPendingUpdates().size).toBe(0);
			expect(ctx.console.error).toHaveBeenCalled();
		});

		test("does nothing meaningful when pendingUpdates is empty", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {},
				nextId: 1,
			});
			await ctx.processPendingUpdates();
			expect(browserMock.tabs.query).not.toHaveBeenCalled();
		});
	});

	// ─── 1.8 updateWorkspaceForWindow ───────────────────────────────
	describe("updateWorkspaceForWindow()", () => {
		test("updates workspace tabs and title", async () => {
			const workspaces = {
				1: {id: 1, windowId: 10, tabs: [], title: ""},
			};
			const tabs = [
				{
					url: "https://a.com",
					title: "PageA",
					active: true,
					index: 0,
				},
				{
					url: "https://b.com",
					title: "PageB",
					active: false,
					index: 1,
				},
			];
			browserMock.tabGroups.query.mockResolvedValue([]);
			await ctx.updateWorkspaceForWindow(workspaces, 10, tabs);
			expect(workspaces[1].tabs).toEqual([
				"https://a.com",
				"https://b.com",
			]);
			expect(workspaces[1].title).toBe("PageA");
		});

		test("updates groupRanges via queryGroupRanges", async () => {
			const workspaces = {
				1: {id: 1, windowId: 10, tabs: [], groupRanges: []},
			};
			browserMock.tabGroups.query.mockResolvedValue([
				{id: 1, title: "G", color: "blue", collapsed: false},
			]);
			const tabs = [
				{
					url: "https://a.com",
					title: "A",
					active: true,
					index: 0,
					groupId: 1,
				},
			];
			await ctx.updateWorkspaceForWindow(workspaces, 10, tabs);
			expect(workspaces[1].groupRanges).toHaveLength(1);
		});

		test("does not overwrite customTitle", async () => {
			const workspaces = {
				1: {
					id: 1,
					windowId: 10,
					tabs: [],
					title: "Old",
					customTitle: "My Title",
				},
			};
			browserMock.tabGroups.query.mockResolvedValue([]);
			const tabs = [
				{
					url: "https://a.com",
					title: "New",
					active: true,
					index: 0,
				},
			];
			await ctx.updateWorkspaceForWindow(workspaces, 10, tabs);
			expect(workspaces[1].title).toBe("Old");
		});

		test("resumes auto-title when customTitle is cleared to empty string", async () => {
			const workspaces = {
				1: {
					id: 1,
					windowId: 10,
					tabs: [],
					title: "Old",
					customTitle: "",
				},
			};
			browserMock.tabGroups.query.mockResolvedValue([]);
			const tabs = [
				{
					url: "https://a.com",
					title: "New Active Tab",
					active: true,
					index: 0,
				},
			];
			await ctx.updateWorkspaceForWindow(workspaces, 10, tabs);
			expect(workspaces[1].title).toBe("New Active Tab");
		});

		test("returns early on empty tabs", async () => {
			const workspaces = {
				1: {id: 1, windowId: 10, tabs: ["old"]},
			};
			await ctx.updateWorkspaceForWindow(workspaces, 10, []);
			expect(workspaces[1].tabs).toEqual(["old"]);
		});
	});

	// ─── 1.9 handleGetState ─────────────────────────────────────────
	describe("handleGetState()", () => {
		test("returns saved workspaces and unsaved windows", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {
					1: {id: 1, windowId: 10, tabs: ["https://a.com"]},
				},
				nextId: 2,
			});
			browserMock.windows.getAll.mockResolvedValue([
				{
					id: 10,
					tabs: [
						{
							active: true,
							title: "A",
							url: "https://a.com",
						},
					],
				},
				{
					id: 20,
					tabs: [
						{
							active: true,
							title: "B",
							url: "https://b.com",
						},
					],
				},
			]);
			const sendResponse = jest.fn();
			await ctx.handleGetState(sendResponse);
			const resp = sendResponse.mock.calls[0][0];
			expect(resp.success).toBe(true);
			expect(resp.saved).toHaveLength(1);
			expect(resp.unsaved).toHaveLength(1);
			expect(resp.unsaved[0].windowId).toBe(20);
		});

		test("sorts unsaved by most recent activity", async () => {
			ctx.__setWindowLastActive({20: 100, 30: 200});
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {},
				nextId: 1,
			});
			browserMock.windows.getAll.mockResolvedValue([
				{
					id: 20,
					tabs: [{active: true, title: "Old"}],
				},
				{
					id: 30,
					tabs: [{active: true, title: "New"}],
				},
			]);
			const sendResponse = jest.fn();
			await ctx.handleGetState(sendResponse);
			const resp = sendResponse.mock.calls[0][0];
			expect(resp.unsaved[0].windowId).toBe(30);
			expect(resp.unsaved[1].windowId).toBe(20);
		});

		test("returns defaults when getWorkspaces fails (internal catch)", async () => {
			browserMock.storage.local.get.mockRejectedValue(new Error("fail"));
			const sendResponse = jest.fn();
			browserMock.windows.getAll.mockResolvedValue([]);
			await ctx.handleGetState(sendResponse);
			const resp = sendResponse.mock.calls[0][0];
			// getWorkspaces catches internally and returns defaults, so getState succeeds
			expect(resp.success).toBe(true);
			expect(resp.saved).toEqual([]);
			expect(resp.unsaved).toEqual([]);
		});

		test("sends error when windows.getAll fails", async () => {
			browserMock.storage.local.get.mockResolvedValue({workspaces: {}, nextId: 1});
			browserMock.windows.getAll.mockRejectedValue(new Error("windows fail"));
			const sendResponse = jest.fn();
			await ctx.handleGetState(sendResponse);
			const resp = sendResponse.mock.calls[0][0];
			expect(resp.success).toBe(false);
			expect(resp.error).toBe("windows fail");
		});
	});

	// ─── 1.10 handleSaveWindow ──────────────────────────────────────
	describe("handleSaveWindow()", () => {
		test("creates a new workspace entry from window tabs", async () => {
			browserMock.tabs.query.mockResolvedValue([
				{
					url: "https://a.com",
					title: "A",
					active: true,
					index: 0,
				},
			]);
			browserMock.tabGroups.query.mockResolvedValue([]);
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {},
				nextId: 1,
			});
			const sendResponse = jest.fn();
			await ctx.handleSaveWindow(10, sendResponse);
			const resp = sendResponse.mock.calls[0][0];
			expect(resp.success).toBe(true);
			expect(resp.workspace.id).toBe(1);
			expect(resp.workspace.windowId).toBe(10);
			expect(resp.workspace.tabs).toEqual(["https://a.com"]);
		});

		test("increments nextId after creating workspace", async () => {
			browserMock.tabs.query.mockResolvedValue([
				{
					url: "https://a.com",
					title: "A",
					active: true,
					index: 0,
				},
			]);
			browserMock.tabGroups.query.mockResolvedValue([]);
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {},
				nextId: 5,
			});
			const sendResponse = jest.fn();
			await ctx.handleSaveWindow(10, sendResponse);
			const setCall = browserMock.storage.local.set.mock.calls[0][0];
			expect(setCall.nextId).toBe(6);
		});

		test("sends error when window has no tabs", async () => {
			browserMock.tabs.query.mockResolvedValue([]);
			const sendResponse = jest.fn();
			await ctx.handleSaveWindow(10, sendResponse);
			expect(sendResponse.mock.calls[0][0].success).toBe(false);
		});

		test("saves groupRanges with the workspace", async () => {
			browserMock.tabs.query.mockResolvedValue([
				{
					url: "https://a.com",
					title: "A",
					active: true,
					index: 0,
					groupId: 1,
				},
			]);
			browserMock.tabGroups.query.mockResolvedValue([
				{id: 1, title: "G", color: "red", collapsed: false},
			]);
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {},
				nextId: 1,
			});
			const sendResponse = jest.fn();
			await ctx.handleSaveWindow(10, sendResponse);
			const ws = sendResponse.mock.calls[0][0].workspace;
			expect(ws.groupRanges).toHaveLength(1);
		});
	});

	// ─── 1.11 handleOpenWorkspace ───────────────────────────────────
	describe("handleOpenWorkspace()", () => {
		test("focuses existing window when workspace is open", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {
					1: {
						id: 1,
						windowId: 10,
						tabs: ["https://a.com"],
					},
				},
				nextId: 2,
			});
			const sendResponse = jest.fn();
			await ctx.handleOpenWorkspace(1, sendResponse);
			expect(browserMock.windows.update).toHaveBeenCalledWith(10, {
				focused: true,
			});
			expect(sendResponse.mock.calls[0][0].success).toBe(true);
		});

		test("creates new window when workspace window is closed", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {
					1: {
						id: 1,
						windowId: null,
						tabs: ["https://a.com"],
						groupRanges: [],
					},
				},
				nextId: 2,
			});
			browserMock.windows.create.mockResolvedValue({id: 100});
			browserMock.tabs.query.mockResolvedValue([
				{id: 1, url: "https://a.com", index: 0},
			]);
			const sendResponse = jest.fn();
			const promise = ctx.handleOpenWorkspace(1, sendResponse);
			await jest.advanceTimersByTimeAsync(3000);
			await promise;
			expect(browserMock.windows.create).toHaveBeenCalled();
			expect(sendResponse.mock.calls[0][0].success).toBe(true);
		});

		test("sends error for unknown workspace ID", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {},
				nextId: 1,
			});
			const sendResponse = jest.fn();
			await ctx.handleOpenWorkspace(999, sendResponse);
			expect(sendResponse.mock.calls[0][0].success).toBe(false);
		});

		test("sanitizes URLs before opening", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {
					1: {
						id: 1,
						windowId: null,
						tabs: ["https://good.com", "chrome://settings"],
						groupRanges: [],
					},
				},
				nextId: 2,
			});
			browserMock.windows.create.mockResolvedValue({id: 100});
			browserMock.tabs.query.mockResolvedValue([
				{id: 1, url: "https://good.com", index: 0},
				{id: 2, url: "about:blank", index: 1},
			]);
			const sendResponse = jest.fn();
			const promise = ctx.handleOpenWorkspace(1, sendResponse);
			await jest.advanceTimersByTimeAsync(3000);
			await promise;
			const createCall = browserMock.windows.create.mock.calls[0][0];
			expect(createCall.url).toContain("about:blank");
			expect(createCall.url).toContain("https://good.com");
		});

		test("creates new window when focus fails", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {
					1: {
						id: 1,
						windowId: 10,
						tabs: ["https://a.com"],
						groupRanges: [],
					},
				},
				nextId: 2,
			});
			browserMock.windows.update.mockRejectedValueOnce(
				new Error("window gone"),
			);
			browserMock.windows.create.mockResolvedValue({id: 100});
			browserMock.tabs.query.mockResolvedValue([
				{id: 1, url: "https://a.com", index: 0},
			]);
			const sendResponse = jest.fn();
			const promise = ctx.handleOpenWorkspace(1, sendResponse);
			await jest.advanceTimersByTimeAsync(3000);
			await promise;
			expect(browserMock.windows.create).toHaveBeenCalled();
		});

		test("handles workspace with undefined tabs gracefully", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {
					1: {
						id: 1,
						windowId: null,
						groupRanges: [],
					},
				},
				nextId: 2,
			});
			browserMock.windows.create.mockResolvedValue({id: 100});
			browserMock.tabs.query.mockResolvedValue([]);
			const sendResponse = jest.fn();
			const promise = ctx.handleOpenWorkspace(1, sendResponse);
			await jest.advanceTimersByTimeAsync(3000);
			await promise;
			expect(sendResponse.mock.calls[0][0].success).toBe(true);
			expect(browserMock.windows.create).toHaveBeenCalledWith({url: []});
		});
	});

	// ─── 1.12 handleUnsaveWorkspace ─────────────────────────────────
	describe("handleUnsaveWorkspace()", () => {
		test("removes workspace from storage", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {
					1: {id: 1},
					2: {id: 2},
				},
				nextId: 3,
			});
			const sendResponse = jest.fn();
			await ctx.handleUnsaveWorkspace(1, sendResponse);
			const setCall = browserMock.storage.local.set.mock.calls[0][0];
			expect(setCall.workspaces[1]).toBeUndefined();
			expect(setCall.workspaces[2]).toBeDefined();
		});

		test("sends success response", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {1: {id: 1}},
				nextId: 2,
			});
			const sendResponse = jest.fn();
			await ctx.handleUnsaveWorkspace(1, sendResponse);
			expect(sendResponse.mock.calls[0][0].success).toBe(true);
		});

		test("sends error when workspace not found", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {},
				nextId: 1,
			});
			const sendResponse = jest.fn();
			await ctx.handleUnsaveWorkspace(999, sendResponse);
			expect(sendResponse.mock.calls[0][0].success).toBe(false);
		});
	});

	// ─── 1.13 handleRenameWorkspace ─────────────────────────────────
	describe("handleRenameWorkspace()", () => {
		test("sets customTitle on workspace", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {1: {id: 1, windowId: null}},
				nextId: 2,
			});
			const sendResponse = jest.fn();
			await ctx.handleRenameWorkspace(1, "New Name", sendResponse);
			const setCall = browserMock.storage.local.set.mock.calls[0][0];
			expect(setCall.workspaces[1].customTitle).toBe("New Name");
			expect(setCall.workspaces[1].title).toBe("New Name");
		});

		test("updates window title preface when workspace is open", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {1: {id: 1, windowId: 10}},
				nextId: 2,
			});
			const sendResponse = jest.fn();
			await ctx.handleRenameWorkspace(1, "MyWs", sendResponse);
			expect(browserMock.windows.update).toHaveBeenCalledWith(10, {
				titlePreface: "MyWs - ",
			});
		});

		test("sends error when workspace not found", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {},
				nextId: 1,
			});
			const sendResponse = jest.fn();
			await ctx.handleRenameWorkspace(999, "X", sendResponse);
			expect(sendResponse.mock.calls[0][0].success).toBe(false);
		});

		test("handles empty string title and sets both fields", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {1: {id: 1, windowId: null}},
				nextId: 2,
			});
			const sendResponse = jest.fn();
			await ctx.handleRenameWorkspace(1, "", sendResponse);
			const ws =
				browserMock.storage.local.set.mock.calls[0][0].workspaces[1];
			expect(ws.customTitle).toBe("");
			expect(ws.title).toBe("");
		});
	});

	// ─── 1.14 handleUpdateOrder ─────────────────────────────────────
	describe("handleUpdateOrder()", () => {
		test("assigns order property based on array index", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {
					1: {id: 1},
					2: {id: 2},
					3: {id: 3},
				},
				nextId: 4,
			});
			const sendResponse = jest.fn();
			await ctx.handleUpdateOrder([3, 1, 2], sendResponse);
			const ws =
				browserMock.storage.local.set.mock.calls[0][0].workspaces;
			expect(ws[3].order).toBe(0);
			expect(ws[1].order).toBe(1);
			expect(ws[2].order).toBe(2);
		});

		test("assigns sequential order to workspaces not in newOrder", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {
					1: {id: 1},
					2: {id: 2},
					3: {id: 3},
				},
				nextId: 4,
			});
			const sendResponse = jest.fn();
			await ctx.handleUpdateOrder([1], sendResponse);
			const ws =
				browserMock.storage.local.set.mock.calls[0][0].workspaces;
			expect(ws[1].order).toBe(0);
			// 2 and 3 get sequential orders starting at 1
			expect(ws[2].order).toBeGreaterThanOrEqual(1);
			expect(ws[3].order).toBeGreaterThanOrEqual(1);
		});

		test("sends success response", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {},
				nextId: 1,
			});
			const sendResponse = jest.fn();
			await ctx.handleUpdateOrder([], sendResponse);
			expect(sendResponse.mock.calls[0][0].success).toBe(true);
		});
	});

	// ─── 1.15 focusWindow ───────────────────────────────────────────
	describe("focusWindow()", () => {
		test("calls windows.update with focused:true", async () => {
			const sendResponse = jest.fn();
			await ctx.focusWindow(10, sendResponse);
			expect(browserMock.windows.update).toHaveBeenCalledWith(10, {
				focused: true,
			});
			expect(sendResponse.mock.calls[0][0].success).toBe(true);
		});

		test("sends error when window doesn't exist", async () => {
			browserMock.windows.update.mockRejectedValue(
				new Error("no such window"),
			);
			const sendResponse = jest.fn();
			await ctx.focusWindow(999, sendResponse);
			expect(sendResponse.mock.calls[0][0].success).toBe(false);
		});
	});

	// ─── 1.16 handleExportWorkspaces ────────────────────────────────
	describe("handleExportWorkspaces()", () => {
		test("returns workspaces and nextId", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {1: {id: 1}},
				nextId: 2,
			});
			const sendResponse = jest.fn();
			await ctx.handleExportWorkspaces(sendResponse);
			const resp = sendResponse.mock.calls[0][0];
			expect(resp.success).toBe(true);
			expect(resp.data.workspaces).toEqual({1: {id: 1}});
			expect(resp.data.nextId).toBe(2);
		});

		test("returns empty object when no workspaces", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {},
				nextId: 1,
			});
			const sendResponse = jest.fn();
			await ctx.handleExportWorkspaces(sendResponse);
			const resp = sendResponse.mock.calls[0][0];
			expect(resp.data.workspaces).toEqual({});
		});
	});

	// ─── 1.17 handleImportWorkspace ─────────────────────────────────
	describe("handleImportWorkspace()", () => {
		test("accepts valid import data", async () => {
			const msg = {
				data: {
					workspaces: {
						1: {
							id: 1,
							tabs: ["https://a.com"],
						},
					},
					nextId: 2,
				},
			};
			const sendResponse = jest.fn();
			await ctx.handleImportWorkspace(msg, sendResponse);
			expect(sendResponse.mock.calls[0][0].success).toBe(true);
			expect(browserMock.storage.local.set).toHaveBeenCalled();
		});

		test("sanitizes URLs during import", async () => {
			const msg = {
				data: {
					workspaces: {
						1: {
							id: 1,
							tabs: ["https://good.com", "javascript:alert(1)"],
						},
					},
					nextId: 2,
				},
			};
			const sendResponse = jest.fn();
			await ctx.handleImportWorkspace(msg, sendResponse);
			const ws =
				browserMock.storage.local.set.mock.calls[0][0].workspaces;
			expect(ws[1].tabs).toEqual(["https://good.com", "about:blank"]);
		});

		test("rejects missing workspaces key", async () => {
			const msg = {data: {nextId: 1}};
			const sendResponse = jest.fn();
			await ctx.handleImportWorkspace(msg, sendResponse);
			expect(sendResponse.mock.calls[0][0].success).toBe(false);
		});

		test("rejects missing nextId", async () => {
			const msg = {data: {workspaces: {}}};
			const sendResponse = jest.fn();
			await ctx.handleImportWorkspace(msg, sendResponse);
			expect(sendResponse.mock.calls[0][0].success).toBe(false);
		});

		test("rejects invalid nextId", async () => {
			const msg = {data: {workspaces: {}, nextId: -1}};
			const sendResponse = jest.fn();
			await ctx.handleImportWorkspace(msg, sendResponse);
			expect(sendResponse.mock.calls[0][0].success).toBe(false);
		});

		test("rejects null data", async () => {
			const msg = {data: null};
			const sendResponse = jest.fn();
			await ctx.handleImportWorkspace(msg, sendResponse);
			expect(sendResponse.mock.calls[0][0].success).toBe(false);
		});
	});

	// ─── 1.18 Message Router ────────────────────────────────────────
	describe("Message Router", () => {
		test("routes getState and calls handleGetState", async () => {
			browserMock.storage.local.get.mockResolvedValue({workspaces: {}, nextId: 1});
			browserMock.windows.getAll.mockResolvedValue([]);
			const listener = browserMock.runtime.onMessage._listeners[0];
			const sendResponse = jest.fn();
			const result = listener({action: "getState"}, {}, sendResponse);
			expect(result).toBe(true);
			await jest.advanceTimersByTimeAsync(0);
			expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({success: true, saved: expect.any(Array)}));
		});

		test("routes saveWindow and calls handleSaveWindow", async () => {
			browserMock.tabs.query.mockResolvedValue([]);
			const listener = browserMock.runtime.onMessage._listeners[0];
			const sendResponse = jest.fn();
			const result = listener({action: "saveWindow", windowId: 10}, {}, sendResponse);
			expect(result).toBe(true);
			await jest.advanceTimersByTimeAsync(0);
			expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({success: false}));
		});

		test("routes openWorkspace and calls handleOpenWorkspace", async () => {
			browserMock.storage.local.get.mockResolvedValue({workspaces: {}, nextId: 1});
			const listener = browserMock.runtime.onMessage._listeners[0];
			const sendResponse = jest.fn();
			const result = listener({action: "openWorkspace", workspaceId: 999}, {}, sendResponse);
			expect(result).toBe(true);
			await jest.advanceTimersByTimeAsync(0);
			expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({success: false, error: "Workspace not found."}));
		});

		test("routes focusWindow and calls focusWindow handler", async () => {
			const listener = browserMock.runtime.onMessage._listeners[0];
			const sendResponse = jest.fn();
			const result = listener({action: "focusWindow", windowId: 10}, {}, sendResponse);
			expect(result).toBe(true);
			await jest.advanceTimersByTimeAsync(0);
			expect(browserMock.windows.update).toHaveBeenCalledWith(10, {focused: true});
			expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({success: true}));
		});

		test("routes unsaveWorkspace and calls handleUnsaveWorkspace", async () => {
			browserMock.storage.local.get.mockResolvedValue({workspaces: {}, nextId: 1});
			const listener = browserMock.runtime.onMessage._listeners[0];
			const sendResponse = jest.fn();
			const result = listener({action: "unsaveWorkspace", workspaceId: 1}, {}, sendResponse);
			expect(result).toBe(true);
			await jest.advanceTimersByTimeAsync(0);
			expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({success: false}));
		});

		test("routes renameWorkspace and calls handleRenameWorkspace", async () => {
			browserMock.storage.local.get.mockResolvedValue({workspaces: {1: {id: 1, windowId: null}}, nextId: 2});
			const listener = browserMock.runtime.onMessage._listeners[0];
			const sendResponse = jest.fn();
			const result = listener({action: "renameWorkspace", workspaceId: 1, newTitle: "X"}, {}, sendResponse);
			expect(result).toBe(true);
			await jest.advanceTimersByTimeAsync(0);
			expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({success: true}));
			const ws = browserMock.storage.local.set.mock.calls[0][0].workspaces;
			expect(ws[1].customTitle).toBe("X");
		});

		test("routes updateOrder and calls handleUpdateOrder", async () => {
			browserMock.storage.local.get.mockResolvedValue({workspaces: {1: {id: 1}, 2: {id: 2}}, nextId: 3});
			const listener = browserMock.runtime.onMessage._listeners[0];
			const sendResponse = jest.fn();
			const result = listener({action: "updateOrder", newOrder: [2, 1]}, {}, sendResponse);
			expect(result).toBe(true);
			await jest.advanceTimersByTimeAsync(0);
			expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({success: true}));
			const ws = browserMock.storage.local.set.mock.calls[0][0].workspaces;
			expect(ws[2].order).toBe(0);
			expect(ws[1].order).toBe(1);
		});

		test("routes exportWorkspaces and calls handleExportWorkspaces", async () => {
			browserMock.storage.local.get.mockResolvedValue({workspaces: {1: {id: 1}}, nextId: 2});
			const listener = browserMock.runtime.onMessage._listeners[0];
			const sendResponse = jest.fn();
			const result = listener({action: "exportWorkspaces"}, {}, sendResponse);
			expect(result).toBe(true);
			await jest.advanceTimersByTimeAsync(0);
			expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({success: true, data: expect.objectContaining({workspaces: {1: {id: 1}}})}));
		});

		test("routes importWorkspaces and calls handleImportWorkspace", async () => {
			const listener = browserMock.runtime.onMessage._listeners[0];
			const sendResponse = jest.fn();
			const result = listener({action: "importWorkspaces", data: {workspaces: {}, nextId: 1}}, {}, sendResponse);
			expect(result).toBe(true);
			await jest.advanceTimersByTimeAsync(0);
			expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({success: true}));
			expect(browserMock.storage.local.set).toHaveBeenCalled();
		});

		test("logs warning for unknown action", () => {
			const listener = browserMock.runtime.onMessage._listeners[0];
			const sendResponse = jest.fn();
			listener({action: "bogus"}, {}, sendResponse);
			expect(ctx.console.warn).toHaveBeenCalled();
			expect(sendResponse.mock.calls[0][0].success).toBe(false);
		});

		test("returns true for async handling", () => {
			const listener = browserMock.runtime.onMessage._listeners[0];
			const result = listener({action: "getState"}, {}, jest.fn());
			expect(result).toBe(true);
		});
	});

	// ─── 1.19 registerTabListeners ──────────────────────────────────
	describe("registerTabListeners()", () => {
		test("registers listeners for all tab events", () => {
			expect(browserMock.tabs.onCreated.addListener).toHaveBeenCalled();
			expect(browserMock.tabs.onRemoved.addListener).toHaveBeenCalled();
			expect(browserMock.tabs.onUpdated.addListener).toHaveBeenCalled();
			expect(browserMock.tabs.onMoved.addListener).toHaveBeenCalled();
			expect(browserMock.tabs.onAttached.addListener).toHaveBeenCalled();
			expect(browserMock.tabs.onDetached.addListener).toHaveBeenCalled();
			expect(browserMock.tabs.onActivated.addListener).toHaveBeenCalled();
		});

		test("onCreated schedules update with correct windowId", () => {
			const listener = browserMock.tabs.onCreated._listeners[0];
			listener({windowId: 42});
			expect(ctx.__getPendingUpdates().has(42)).toBe(true);
		});

		test("onRemoved schedules update with correct windowId", () => {
			const listener = browserMock.tabs.onRemoved._listeners[0];
			listener(1, {windowId: 42});
			expect(ctx.__getPendingUpdates().has(42)).toBe(true);
		});

		test("onUpdated only schedules when title changes", () => {
			const listener = browserMock.tabs.onUpdated._listeners[0];
			listener(1, {}, {windowId: 42});
			expect(ctx.__getPendingUpdates().has(42)).toBe(false);
			listener(1, {title: "New"}, {windowId: 42});
			expect(ctx.__getPendingUpdates().has(42)).toBe(true);
		});

		test("onAttached schedules for newWindowId", () => {
			const listener = browserMock.tabs.onAttached._listeners[0];
			listener(1, {newWindowId: 55});
			expect(ctx.__getPendingUpdates().has(55)).toBe(true);
		});

		test("onDetached schedules for oldWindowId", () => {
			const listener = browserMock.tabs.onDetached._listeners[0];
			listener(1, {oldWindowId: 66});
			expect(ctx.__getPendingUpdates().has(66)).toBe(true);
		});
	});

	// ─── 1.20 registerWindowListeners ───────────────────────────────
	describe("registerWindowListeners()", () => {
		test("onRemoved calls unsetWindowIdForClosedWorkspaces", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {1: {id: 1, windowId: 42}},
				nextId: 2,
			});
			const listener = browserMock.windows.onRemoved._listeners[0];
			listener(42);
			// The listener fires unsetWindowIdForClosedWorkspaces without await,
			// so we flush the microtask queue for the async work to complete.
			await jest.advanceTimersByTimeAsync(0);
			const setCall = browserMock.storage.local.set.mock.calls[0][0];
			expect(setCall.workspaces[1].windowId).toBeNull();
		});

		test("onFocusChanged updates windowLastActive", () => {
			const listener = browserMock.windows.onFocusChanged._listeners[0];
			listener(42);
			expect(ctx.__getWindowLastActive()[42]).toBeDefined();
			expect(typeof ctx.__getWindowLastActive()[42]).toBe("number");
		});

		test("onFocusChanged ignores WINDOW_ID_NONE (negative)", () => {
			const listener = browserMock.windows.onFocusChanged._listeners[0];
			const before = {...ctx.__getWindowLastActive()};
			listener(-1);
			expect(ctx.__getWindowLastActive()[-1]).toBeUndefined();
		});
	});

	// ─── 1.21 registerTabGroupListeners ─────────────────────────────
	describe("registerTabGroupListeners()", () => {
		test("registers listeners when tabGroups is available", () => {
			expect(
				browserMock.tabGroups.onCreated.addListener,
			).toHaveBeenCalled();
			expect(
				browserMock.tabGroups.onUpdated.addListener,
			).toHaveBeenCalled();
			expect(
				browserMock.tabGroups.onMoved.addListener,
			).toHaveBeenCalled();
			expect(
				browserMock.tabGroups.onRemoved.addListener,
			).toHaveBeenCalled();
		});

		test("does nothing when tabGroups is unavailable", () => {
			const noGroupMock = createBrowserMock();
			delete noGroupMock.tabGroups;
			// Should not throw
			expect(() => loadBackground(noGroupMock)).not.toThrow();
		});

		test("onCreated schedules update", () => {
			const listener = browserMock.tabGroups.onCreated._listeners[0];
			listener({windowId: 77});
			expect(ctx.__getPendingUpdates().has(77)).toBe(true);
		});
	});

	// ─── 1.22 createMainMenu ────────────────────────────────────────
	describe("createMainMenu()", () => {
		test("creates context menu with provided title", () => {
			ctx.createMainMenu("Custom Title");
			expect(browserMock.contextMenus.create).toHaveBeenCalledWith(
				expect.objectContaining({title: "Custom Title"}),
			);
		});

		test("uses default title when none provided", () => {
			ctx.createMainMenu();
			expect(browserMock.contextMenus.create).toHaveBeenCalledWith(
				expect.objectContaining({
					title: "Move tab to another Window",
				}),
			);
		});
	});

	// ─── 1.25 setWindowTitlePrefaceForWorkspace ─────────────────────
	describe("setWindowTitlePrefaceForWorkspace()", () => {
		test("sets titlePreface when customTitle exists", async () => {
			await ctx.setWindowTitlePrefaceForWorkspace(
				{id: 1, customTitle: "My Workspace"},
				10,
			);
			expect(browserMock.windows.update).toHaveBeenCalledWith(10, {
				titlePreface: "My Workspace - ",
			});
		});

		test("does not set titlePreface when customTitle is empty", async () => {
			await ctx.setWindowTitlePrefaceForWorkspace(
				{id: 1, customTitle: ""},
				10,
			);
			expect(browserMock.windows.update).not.toHaveBeenCalled();
		});

		test("does not set titlePreface when customTitle is missing", async () => {
			await ctx.setWindowTitlePrefaceForWorkspace({id: 1}, 10);
			expect(browserMock.windows.update).not.toHaveBeenCalled();
		});

		test("handles window update failure gracefully", async () => {
			browserMock.windows.update.mockRejectedValue(
				new Error("window gone"),
			);
			await ctx.setWindowTitlePrefaceForWorkspace(
				{id: 1, customTitle: "Ws"},
				10,
			);
			expect(ctx.console.warn).toHaveBeenCalled();
		});
	});

	// ─── Additional edge cases ──────────────────────────────────────

	describe("sanitizeUrls() – additional edge cases", () => {
		test("blocks about:config", () => {
			expect(ctx.sanitizeUrls(["about:config"])).toEqual(["about:blank"]);
		});

		test("blocks about:addons", () => {
			expect(ctx.sanitizeUrls(["about:addons"])).toEqual(["about:blank"]);
		});

		test("blocks ftp:// URLs", () => {
			expect(ctx.sanitizeUrls(["ftp://files.example.com"])).toEqual([
				"about:blank",
			]);
		});

		test("handles mixed allowed and blocked URLs", () => {
			const result = ctx.sanitizeUrls([
				"https://good.com",
				"javascript:void(0)",
				"about:blank",
				"chrome://extensions",
				"http://also-good.com",
			]);
			expect(result).toEqual([
				"https://good.com",
				"about:blank",
				"about:blank",
				"about:blank",
				"http://also-good.com",
			]);
		});
	});

	describe("handleImportWorkspace() – additional edge cases", () => {
		test("rejects nextId of 0", async () => {
			const msg = {data: {workspaces: {}, nextId: 0}};
			const sendResponse = jest.fn();
			await ctx.handleImportWorkspace(msg, sendResponse);
			expect(sendResponse.mock.calls[0][0].success).toBe(false);
		});

		test("rejects workspaces as an array", async () => {
			const msg = {data: {workspaces: [], nextId: 1}};
			const sendResponse = jest.fn();
			await ctx.handleImportWorkspace(msg, sendResponse);
			expect(sendResponse.mock.calls[0][0].success).toBe(false);
		});

		test("rejects string as data", async () => {
			const msg = {data: "not an object"};
			const sendResponse = jest.fn();
			await ctx.handleImportWorkspace(msg, sendResponse);
			expect(sendResponse.mock.calls[0][0].success).toBe(false);
		});

		test("handles workspace with missing tabs array gracefully", async () => {
			const msg = {
				data: {
					workspaces: {1: {id: 1}},
					nextId: 2,
				},
			};
			const sendResponse = jest.fn();
			await ctx.handleImportWorkspace(msg, sendResponse);
			// Should succeed — tabs is not an Array so sanitizeUrls is skipped
			expect(sendResponse.mock.calls[0][0].success).toBe(true);
		});
	});

	describe("updateWorkspaceForWindow() – additional edge cases", () => {
		test("uses last tab as fallback when no tab is active", async () => {
			const workspaces = {
				1: {id: 1, windowId: 10, tabs: [], title: ""},
			};
			const tabs = [
				{url: "https://a.com", title: "First", active: false, index: 0},
				{url: "https://b.com", title: "Last", active: false, index: 1},
			];
			browserMock.tabGroups.query.mockResolvedValue([]);
			await ctx.updateWorkspaceForWindow(workspaces, 10, tabs);
			expect(workspaces[1].title).toBe("Last");
		});

		test("does not update workspaces for a different windowId", async () => {
			const workspaces = {
				1: {id: 1, windowId: 10, tabs: ["old"], title: "Old"},
			};
			const tabs = [
				{url: "https://new.com", title: "New", active: true, index: 0},
			];
			browserMock.tabGroups.query.mockResolvedValue([]);
			await ctx.updateWorkspaceForWindow(workspaces, 99, tabs);
			expect(workspaces[1].tabs).toEqual(["old"]);
			expect(workspaces[1].title).toBe("Old");
		});
	});

	describe("handleGetState() – additional edge cases", () => {
		test("handles window with no active tab", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {},
				nextId: 1,
			});
			browserMock.windows.getAll.mockResolvedValue([
				{
					id: 20,
					tabs: [
						{active: false, title: "Tab1", url: "https://a.com"},
					],
				},
			]);
			const sendResponse = jest.fn();
			await ctx.handleGetState(sendResponse);
			const resp = sendResponse.mock.calls[0][0];
			expect(resp.success).toBe(true);
			// Falls back to first tab
			expect(resp.unsaved[0].title).toBe("Tab1");
		});

		test("handles window with empty tabs array", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {},
				nextId: 1,
			});
			browserMock.windows.getAll.mockResolvedValue([{id: 20, tabs: []}]);
			const sendResponse = jest.fn();
			await ctx.handleGetState(sendResponse);
			const resp = sendResponse.mock.calls[0][0];
			expect(resp.success).toBe(true);
			expect(resp.unsaved[0].title).toBe("(No Tabs)");
		});
	});

	describe("handleRenameWorkspace() – additional edge cases", () => {
		test("empty title with open window does not set titlePreface", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {1: {id: 1, windowId: 10}},
				nextId: 2,
			});
			const sendResponse = jest.fn();
			await ctx.handleRenameWorkspace(1, "", sendResponse);
			// setWindowTitlePrefaceForWorkspace checks customTitle.trim() !== ""
			// Empty string should not trigger windows.update for titlePreface
			expect(browserMock.windows.update).not.toHaveBeenCalled();
		});

		test("whitespace-only title with open window does not set titlePreface", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {1: {id: 1, windowId: 10}},
				nextId: 2,
			});
			const sendResponse = jest.fn();
			await ctx.handleRenameWorkspace(1, "   ", sendResponse);
			expect(browserMock.windows.update).not.toHaveBeenCalled();
		});
	});

	describe("handleOpenWorkspace() – tab group restoration", () => {
		test("restores tab groups when opening workspace", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {
					1: {
						id: 1,
						windowId: null,
						tabs: [
							"https://a.com",
							"https://b.com",
							"https://c.com",
						],
						groupRanges: [
							{
								start: 0,
								end: 1,
								title: "Group1",
								color: "blue",
								collapsed: false,
							},
						],
					},
				},
				nextId: 2,
			});
			browserMock.windows.create.mockResolvedValue({id: 200});
			browserMock.tabs.query.mockResolvedValue([
				{id: 1, url: "https://a.com", index: 0},
				{id: 2, url: "https://b.com", index: 1},
				{id: 3, url: "https://c.com", index: 2},
			]);
			browserMock.tabs.group.mockResolvedValue(42);
			const sendResponse = jest.fn();
			const promise = ctx.handleOpenWorkspace(1, sendResponse);
			await jest.advanceTimersByTimeAsync(3000);
			await promise;
			expect(browserMock.tabs.group).toHaveBeenCalledWith({
				tabIds: [1, 2],
			});
			expect(browserMock.tabGroups.update).toHaveBeenCalledWith(42, {
				title: "Group1",
				color: "blue",
				collapsed: false,
			});
		});

		test("skips group with only one tab", async () => {
			browserMock.storage.local.get.mockResolvedValue({
				workspaces: {
					1: {
						id: 1,
						windowId: null,
						tabs: ["https://a.com"],
						groupRanges: [
							{
								start: 0,
								end: 0,
								title: "Solo",
								color: "red",
								collapsed: false,
							},
						],
					},
				},
				nextId: 2,
			});
			browserMock.windows.create.mockResolvedValue({id: 200});
			browserMock.tabs.query.mockResolvedValue([
				{id: 1, url: "https://a.com", index: 0},
			]);
			const sendResponse = jest.fn();
			const promise = ctx.handleOpenWorkspace(1, sendResponse);
			await jest.advanceTimersByTimeAsync(3000);
			await promise;
			expect(browserMock.tabs.group).not.toHaveBeenCalled();
		});
	});

	describe("contextMenus.onShown handler", () => {
		test("rebuilds menu with other windows as submenus", async () => {
			const onShownListener =
				browserMock.contextMenus.onShown._listeners[0];
			browserMock.tabs.query.mockResolvedValue([
				{id: 1, highlighted: true},
			]);
			browserMock.windows.getAll.mockResolvedValue([
				{id: 10, tabs: [{active: true, title: "Current"}]},
				{id: 20, tabs: [{active: true, title: "Other Win"}]},
			]);
			const info = {};
			const tab = {id: 1, windowId: 10};
			await onShownListener(info, tab);
			expect(browserMock.contextMenus.removeAll).toHaveBeenCalled();
			expect(browserMock.contextMenus.refresh).toHaveBeenCalled();
			// Should create main menu + 1 submenu for the other window
			const createCalls = browserMock.contextMenus.create.mock.calls;
			expect(createCalls.length).toBeGreaterThanOrEqual(2);
			const submenuCall = createCalls.find(
				(c) => c[0].id === "move-to-20",
			);
			expect(submenuCall).toBeDefined();
			expect(submenuCall[0].title).toContain("Other Win");
		});

		test("updates label for multiple highlighted tabs", async () => {
			const onShownListener =
				browserMock.contextMenus.onShown._listeners[0];
			browserMock.tabs.query.mockResolvedValue([
				{id: 1, highlighted: true},
				{id: 2, highlighted: true},
				{id: 3, highlighted: true},
			]);
			browserMock.windows.getAll.mockResolvedValue([{id: 10, tabs: []}]);
			await onShownListener({}, {id: 1, windowId: 10});
			const mainMenuCall =
				browserMock.contextMenus.create.mock.calls.find(
					(c) => c[0].id === "move-tabs",
				);
			expect(mainMenuCall[0].title).toContain("3 Tabs");
		});
	});

	describe("contextMenus.onClicked handler", () => {
		test("moves highlighted tabs to destination window", async () => {
			const onClickedListener =
				browserMock.contextMenus.onClicked._listeners[0];
			browserMock.tabs.query.mockResolvedValue([
				{id: 1, highlighted: true},
				{id: 2, highlighted: true},
			]);
			await onClickedListener(
				{menuItemId: "move-to-20"},
				{id: 1, windowId: 10},
			);
			expect(browserMock.tabs.move).toHaveBeenCalledWith([1, 2], {
				windowId: 20,
				index: -1,
			});
		});

		test("ignores non-move menu items", async () => {
			const onClickedListener =
				browserMock.contextMenus.onClicked._listeners[0];
			await onClickedListener(
				{menuItemId: "something-else"},
				{id: 1, windowId: 10},
			);
			expect(browserMock.tabs.move).not.toHaveBeenCalled();
		});

		test("does nothing when tab is null", async () => {
			const onClickedListener =
				browserMock.contextMenus.onClicked._listeners[0];
			await onClickedListener({menuItemId: "move-to-20"}, null);
			expect(browserMock.tabs.move).not.toHaveBeenCalled();
		});

		test("falls back to clicked tab when not in highlighted set", async () => {
			const onClickedListener =
				browserMock.contextMenus.onClicked._listeners[0];
			browserMock.tabs.query.mockResolvedValue([
				{id: 5, highlighted: true},
			]);
			const clickedTab = {id: 3, windowId: 10};
			await onClickedListener({menuItemId: "move-to-20"}, clickedTab);
			expect(browserMock.tabs.move).toHaveBeenCalledWith([3], {
				windowId: 20,
				index: -1,
			});
		});
	});
});
