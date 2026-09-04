declare namespace chrome {
  namespace tabs {
    interface Tab { id?: number; title?: string; url?: string; active?: boolean }
    function query(queryInfo: { active?: boolean; currentWindow?: boolean; url?: string | string[] }): Promise<Tab[]>;
    function get(tabId: number): Promise<Tab>;
    function sendMessage(tabId: number, message: unknown): Promise<unknown>;
    const onActivated: { addListener(callback: (activeInfo: { tabId: number; windowId: number }) => void): void };
    const onUpdated: { addListener(callback: (tabId: number, changeInfo: { status?: string; url?: string }, tab: Tab) => void): void };
  }
  namespace scripting {
    interface InjectionResult<T> { result?: T }
    interface RegisteredContentScript { id: string; matches?: string[]; js?: string[]; runAt?: string; persistAcrossSessions?: boolean }
    function executeScript<T>(details: { target: { tabId: number }; func: () => T }): Promise<InjectionResult<Awaited<T>>[]>;
    function executeScript(details: { target: { tabId: number }; files: string[] }): Promise<InjectionResult<unknown>[]>;
    function getRegisteredContentScripts(filter?: { ids?: string[] }): Promise<RegisteredContentScript[]>;
    function registerContentScripts(scripts: RegisteredContentScript[]): Promise<void>;
    function unregisterContentScripts(filter?: { ids?: string[] }): Promise<void>;
  }
  namespace storage {
    interface StorageArea {
      get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    }
    const local: StorageArea;
    const session: StorageArea;
  }
  namespace permissions {
    interface Permissions { origins?: string[] }
    function contains(permissions: Permissions): Promise<boolean>;
    function request(permissions: Permissions): Promise<boolean>;
    function remove(permissions: Permissions): Promise<boolean>;
  }
  namespace runtime {
    interface MessageSender { tab?: tabs.Tab }
    const onMessage: { addListener(callback: (message: unknown, sender: MessageSender, sendResponse: (response: unknown) => void) => boolean | void): void };
    function sendMessage(message: unknown): Promise<unknown>;
    const lastError: { message?: string } | undefined;
  }
  namespace action {
    function setBadgeText(details: { text: string; tabId?: number }): Promise<void>;
    function setBadgeBackgroundColor(details: { color: string; tabId?: number }): Promise<void>;
  }
}
