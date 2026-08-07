"use client";

import { createContext, useContext, useMemo, useRef, useState } from "react";

type OrderActionGroupValue = {
  isLocked: boolean;
  claim: () => boolean;
  release: () => void;
};

const OrderActionGroupContext = createContext<OrderActionGroupValue | null>(null);

export function OrderActionGroup({ children }: { children: React.ReactNode }) {
  const lock = useRef(false);
  const [isLocked, setIsLocked] = useState(false);
  const value = useMemo<OrderActionGroupValue>(
    () => ({
      isLocked,
      claim: () => {
        if (lock.current) return false;
        lock.current = true;
        setIsLocked(true);
        return true;
      },
      release: () => {
        lock.current = false;
        setIsLocked(false);
      },
    }),
    [isLocked],
  );

  return (
    <OrderActionGroupContext.Provider value={value}>
      {children}
    </OrderActionGroupContext.Provider>
  );
}

export function useOrderActionGroup() {
  return useContext(OrderActionGroupContext);
}
