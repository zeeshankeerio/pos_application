"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";

export default function DyeingPage() {
    return (
        <div className="flex flex-col">
            <div className="flex-1 space-y-4 p-8 pt-6">
                <div className="flex items-center justify-between">
                    <Heading
                        title="Thread Dyeing"
                        description="Manage thread dyeing and view fabric inventory metrics"
                    />
                    <Button className="flex items-center gap-2">
                        <Plus className="h-4 w-4" /> Dye New Thread
                    </Button>
                </div>
                
                <div className="p-8 text-center">
                    <p>Thread dyeing functionality is currently being updated.</p>
                </div>
            </div>
        </div>
    );
}
