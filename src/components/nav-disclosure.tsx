"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { ContentNavItem } from "@/lib/content-page";

/**
 * Nút mở menu con trong navbar (kiểu "Tổng quan doanh nghiệp ⌄").
 *
 * Mở bằng click hoặc bàn phím — KHÔNG mở bằng hover, vì hover không dùng được
 * trên màn hình cảm ứng và cũng không thao tác được bằng bàn phím. Menu đóng
 * khi: bấm Escape (và trả focus về nút), bấm ra ngoài, hoặc bấm vào một liên kết
 * bên trong (điều hướng client-side không unmount component nên phải tự đóng).
 */
export function NavDisclosure({
  label,
  visibleLabel,
  items,
}: {
  /** Nhãn đầy đủ, dùng làm tên cho trình đọc màn hình. */
  label: string;
  /** Nhãn ngắn hiển thị trên nút; phải là một phần của `label` (WCAG 2.5.3). */
  visibleLabel: string;
  items: readonly ContentNavItem[];
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleMouseDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={label}
        className="inline-flex min-h-11 min-w-11 items-center gap-1 rounded-md px-2"
        onClick={() => setOpen((previous) => !previous)}
        ref={buttonRef}
        type="button"
      >
        {visibleLabel}
        <svg
          aria-hidden
          className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <ul
          className="absolute right-0 z-50 mt-1 min-w-56 overflow-hidden rounded-lg border bg-[color:var(--paper)] py-1 shadow-lg md:left-0 md:right-auto"
          id={panelId}
          style={{ borderColor: "var(--line)" }}
        >
          {items.map((item) => (
            <li key={item.href}>
              <Link
                className="flex min-h-11 items-center px-3 text-sm hover:bg-[color:color-mix(in_srgb,var(--evergreen)_8%,transparent)]"
                href={item.href}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
