"use client";

import React, { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";

import { DataTable } from "./data-table";
import { DyeingFormDialog } from "./dyeing-form-dialog";
import { DyeingAnalytics } from "./dyeing-analytics";
import { columns } from "./columns";

export default function DyeingPage() {
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const handleDyeingProcessCreated = () => {
        // Increment refresh trigger to force data reload
        setRefreshTrigger(prev => prev + 1);
    };

    return (
        <div className="flex flex-col">
            <div className="flex-1 space-y-4 p-8 pt-6">
                <div className="flex items-center justify-between">
                    <Heading
                        title="Thread Dyeing"
                        description="Manage thread dyeing and view fabric inventory metrics"
                    />
                    <DyeingFormDialog 
                        triggerButton={
                            <Button className="flex items-center gap-2">
                                <Plus className="h-4 w-4" /> Dye New Thread
                            </Button>
                        }
                        onDyeingProcessCreated={handleDyeingProcessCreated}
                    />
                </div>
                
                <DyeingAnalytics refreshTrigger={refreshTrigger} />
                
                <DataTable 
                    columns={columns} 
                    key={`dyeing-table-${refreshTrigger}`}
                />
            </div>
        </div>
    );
}
