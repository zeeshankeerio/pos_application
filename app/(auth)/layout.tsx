import React from "react";
import { AuthWrapper } from "@/components/auth/auth-wrapper";
import { ThemeWrapper } from "@/components/auth/theme-wrapper";

type Props = {
    children: React.ReactNode;
};

const AuthLayout = ({ children }: Props) => {
    return (
        <AuthWrapper>
            <ThemeWrapper>
                <div className="flex h-screen w-screen items-center justify-center">
                    {children}
                </div>
            </ThemeWrapper>
        </AuthWrapper>
    );
};

export default AuthLayout;
