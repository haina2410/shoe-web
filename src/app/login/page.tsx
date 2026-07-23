import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <section className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-2xl font-bold" style={{ color: "var(--evergreen)" }}>
        Đăng nhập
      </h1>
      <p className="mt-2 text-neutral-600">
        Đăng nhập để vào khu quản trị leafshoes.
      </p>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </section>
  );
}
