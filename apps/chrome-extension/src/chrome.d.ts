declare namespace chrome {
  namespace tabs {
    interface Tab { id?: number; title?: string; url?: string; active?: boolean }
    function query(queryInfo: { active?: boolean; currentWindow?: boolean }): Promise<Tab[]>;
  }
  namespace scripting {
    interface InjectionResult<T> { result?: T }
    function executeScript<T>(details: { target: { tabId: number }; func: () => T }): Promise<InjectionResult<Awaited<T>>[]>;
  }
  namespace storage {
    interface StorageArea {
      get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    }
    const local: StorageArea;
  }
  namespace contextMenus {
    interface OnClickData { menuItemId: string | number; selectionText?: string; pageUrl?: string }
    function create(properties: { id: string; title: string; contexts: string[] }): void;
    const onClicked: { addListener(callback: (info: OnClickData, tab?: tabs.Tab) => void): void };
  }
  namespace runtime {
    const onInstalled: { addListener(callback: () => void): void };
    const lastError: { message?: string } | undefined;
  }
  namespace action {
    function openPopup(): Promise<void>;
  }
}
