"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
    return (
        <div className="flex h-screen w-screen items-center justify-center bg-background p-4">
            <Card className="max-w-md">
                <CardHeader>
                    <CardTitle className="text-2xl">Raheel Fabrics - Inventory Management</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center space-y-4">
                    <p className="text-center text-muted-foreground">
                        Welcome to the inventory management system. Please proceed to the dashboard.
                    </p>
                    <div className="flex justify-center gap-4">
                        <Link href="/sign-in">
                            <Button variant="outline">Sign In</Button>
                        </Link>
                        <Link href="/dashboard/">
                            <Button>Go to Dashboard</Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
