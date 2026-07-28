import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <section className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-2xl border p-6 text-center shadow-sm" style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)" }}>
        <h1 className="text-2xl font-bold" style={{ color: "var(--evergreen)" }}>
          Đăng nhập quản trị
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          Khu vực này chỉ dành cho chủ cửa hàng và nhân viên leafshoes.
        </p>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </section>
  );
}
