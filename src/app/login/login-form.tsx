"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

/**
 * Chỉ chấp nhận đường dẫn nội bộ (bắt đầu bằng "/" và không phải "//"),
 * tránh open-redirect nếu tham số `redirect` bị chỉnh sửa thủ công.
 */
function safeRedirectTarget(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/admin";
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTarget = safeRedirectTarget(searchParams.get("redirect"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    await signIn.email(
      { email, password },
      {
        onSuccess: () => {
          // Full reload để layout server (`requireAdmin`) đọc session mới nhất.
          window.location.href = redirectTarget;
        },
        onError: () => {
          setError("Email hoặc mật khẩu không đúng.");
          setIsSubmitting(false);
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4 text-left">
      <div className="space-y-1.5">
        <label
          htmlFor="email"
          className="text-sm font-medium"
          style={{ color: "var(--ink)" }}
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
          style={{
            borderColor: "var(--line)",
            backgroundColor: "var(--paper)",
            color: "var(--ink)",
          }}
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="text-sm font-medium"
          style={{ color: "var(--ink)" }}
        >
          Mật khẩu
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
          style={{
            borderColor: "var(--line)",
            backgroundColor: "var(--paper)",
            color: "var(--ink)",
          }}
        />
      </div>

      {error && (
        <p className="text-sm" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Đang đăng nhập…" : "Đăng nhập"}
      </Button>
    </form>
  );
}
