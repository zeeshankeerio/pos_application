import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { inter } from './fonts';

export const metadata: Metadata = {
    title: "Raheel Fabrics - Inventory Management",
    description: "Inventory Management System",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className={`${inter.variable} font-sans`} suppressHydrationWarning>
                <Providers>
                    {children}
                </Providers>
            </body>
        </html>
    );
}
