"use client";

import { createContext, useContext } from "react";
import { Toast } from "@base-ui/react/toast";

type AdminToastOptions = {
  title: string;
  description?: string;
  tone?: "success" | "error";
};

type AdminToastContextValue = {
  show: (options: AdminToastOptions) => void;
};

type ToastManager = ReturnType<typeof Toast.createToastManager>;

type ScopedToastManager = {
  manager: ToastManager;
  subscriptions: Set<symbol>;
  activeSubscription?: symbol;
};

const AdminToastContext = createContext<AdminToastContextValue | null>(null);
const adminToastManagers = new Map<string, ScopedToastManager>();

function getAdminToastManager(scope: string) {
  const existingManager = adminToastManagers.get(scope);

  if (existingManager) return existingManager.manager;

  const scopedManager: ScopedToastManager = {
    manager: Toast.createToastManager(),
    subscriptions: new Set(),
  };
  const subscribe = scopedManager.manager[" subscribe"];

  scopedManager.manager[" subscribe"] = (listener) => {
    const subscription = Symbol(scope);
    const unsubscribe = subscribe((event) => {
      if (scopedManager.activeSubscription === subscription) listener(event);
    });

    scopedManager.subscriptions.add(subscription);
    scopedManager.activeSubscription = subscription;

    return () => {
      unsubscribe();
      scopedManager.subscriptions.delete(subscription);

      if (scopedManager.activeSubscription === subscription) {
        scopedManager.activeSubscription = Array.from(scopedManager.subscriptions).pop();
      }
    };
  };

  adminToastManagers.set(scope, scopedManager);

  return scopedManager.manager;
}

function AdminToastViewport() {
  const { toasts } = Toast.useToastManager();

  return (
    <Toast.Portal>
      <Toast.Viewport className="fixed right-4 bottom-4 z-50 w-[calc(100vw-2rem)] max-w-sm outline-none">
        {toasts.map((toast) => (
          <Toast.Root
            key={toast.id}
            toast={toast}
            className="mb-3 w-full rounded-xl border bg-white shadow-lg data-[type=error]:border-red-300 data-[type=success]:border-emerald-300"
          >
            <Toast.Content className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <Toast.Title className="font-semibold text-[var(--evergreen)]" />
                <Toast.Description className="mt-1 text-sm text-neutral-600" />
              </div>
              <Toast.Close className="min-h-10 min-w-10 rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-100">
                Đóng thông báo
              </Toast.Close>
            </Toast.Content>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

function AdminToastContents({
  children,
  toastManager,
}: {
  children: React.ReactNode;
  toastManager: ToastManager;
}) {
  return (
    <AdminToastContext.Provider
      value={{
        show: ({ title, description, tone = "success" }) => {
          toastManager.add({
            title,
            description,
            type: tone,
            priority: "high",
          });
        },
      }}
    >
      {children}
      <AdminToastViewport />
    </AdminToastContext.Provider>
  );
}

export function AdminToastProvider({
  children,
  scope = "admin",
}: {
  children: React.ReactNode;
  scope?: string;
}) {
  const toastManager = getAdminToastManager(scope);

  return (
    <Toast.Provider toastManager={toastManager}>
      <AdminToastContents toastManager={toastManager}>{children}</AdminToastContents>
    </Toast.Provider>
  );
}

export function useAdminToast() {
  const context = useContext(AdminToastContext);

  if (!context) throw new Error("useAdminToast must be used within AdminToastProvider");

  return context;
}
