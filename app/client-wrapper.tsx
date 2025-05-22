"use client";

import { AuthWrapper } from "@/components/auth/auth-wrapper";
import { ThemeWrapper } from "@/components/auth/theme-wrapper";

export default function ClientWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthWrapper>
      <ThemeWrapper>{children}</ThemeWrapper>
    </AuthWrapper>
  );
} 