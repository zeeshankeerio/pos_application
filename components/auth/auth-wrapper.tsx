"use client";

import React from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  // Get the public key from environment variable
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  
  // Add error handling if the key is missing
  if (!publishableKey) {
    console.error("Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY environment variable");
    // Return a fallback UI when the key is missing
    return (
      <div className="flex h-screen w-screen items-center justify-center p-4">
        <div className="max-w-md p-6 rounded-lg bg-red-50 text-red-800">
          <h2 className="text-xl font-bold mb-2">Configuration Error</h2>
          <p>Clerk authentication is not properly configured. Please check your environment variables.</p>
        </div>
      </div>
    );
  }
  
  return (
    <ClerkProvider 
      publishableKey={publishableKey}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignInUrl="/dashboard/"
      afterSignUpUrl="/dashboard/"
    >
      {children}
      <Toaster />
    </ClerkProvider>
  );
} 