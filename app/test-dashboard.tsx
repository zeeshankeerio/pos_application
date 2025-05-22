"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TestDashboardPage() {
  const router = useRouter();
  
  useEffect(() => {
    // Force redirect to dashboard with trailing slash
    router.push("/dashboard/");
  }, [router]);
  
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <p className="text-muted-foreground">Redirecting to dashboard...</p>
    </div>
  );
} 