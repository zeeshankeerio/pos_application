import { NextRequest, NextResponse } from "next/server";

import {
    ColorStatus,
    InventoryTransactionType,
    Prisma,
    ProductType,
} from "@prisma/client";

import { db } from "@/lib/db";

// Explicitly mark this route as dynamic and disable static generation
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// Use Prisma's types for update operations
type DyeingProcessUpdateInput = Prisma.DyeingProcessUpdateInput;

/**
 * GET /api/dyeing/process/[id]
 * Fetch a specific dyeing process by ID with related data
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: number }> },
) {
    try {
        const { id } = await params;

        if (isNaN(id)) {
            return NextResponse.json(
                { error: "Invalid dyeing process ID" },
                { status: 400 },
            );
        }

        const dyeingProcess = await db.dyeingProcess.findUnique({
            where: { id: Number(id) },
            include: {
                threadPurchase: true,
                inventoryTransaction: true,
                fabricProduction: true,
            },
        });

        if (!dyeingProcess) {
            return NextResponse.json(
                { error: "Dyeing process not found" },
                { status: 404 },
            );
        }

        // Format response data
        const formattedDyeingProcess = {
            ...dyeingProcess,
            dyeDate: dyeingProcess.dyeDate.toISOString(),
            completionDate: dyeingProcess.completionDate
                ? dyeingProcess.completionDate.toISOString()
                : null,
            laborCost: dyeingProcess.laborCost
                ? Number(dyeingProcess.laborCost)
                : null,
            dyeMaterialCost: dyeingProcess.dyeMaterialCost
                ? Number(dyeingProcess.dyeMaterialCost)
                : null,
            totalCost: dyeingProcess.totalCost
                ? Number(dyeingProcess.totalCost)
                : null,
            threadPurchase: {
                ...dyeingProcess.threadPurchase,
                orderDate: dyeingProcess.threadPurchase.orderDate.toISOString(),
                deliveryDate: dyeingProcess.threadPurchase.deliveryDate
                    ? dyeingProcess.threadPurchase.deliveryDate.toISOString()
                    : null,
                receivedAt: dyeingProcess.threadPurchase.receivedAt
                    ? dyeingProcess.threadPurchase.receivedAt.toISOString()
                    : null,
                unitPrice: Number(dyeingProcess.threadPurchase.unitPrice),
                totalCost: Number(dyeingProcess.threadPurchase.totalCost),
            },
            inventoryEntries: dyeingProcess.inventoryTransaction.map((entry) => ({
                ...entry,
                transactionDate: entry.transactionDate.toISOString(),
                createdAt: entry.createdAt.toISOString(),
                updatedAt: entry.updatedAt.toISOString(),
                unitCost: entry.unitCost ? Number(entry.unitCost) : null,
                totalCost: entry.totalCost ? Number(entry.totalCost) : null,
            })),
            fabricProductions: dyeingProcess.fabricProduction.map(
                (production) => ({
                    ...production,
                    productionDate: production.productionDate.toISOString(),
                    completionDate: production.completionDate
                        ? production.completionDate.toISOString()
                        : null,
                    productionCost: Number(production.productionCost),
                    laborCost: production.laborCost
                        ? Number(production.laborCost)
                        : null,
                    totalCost: Number(production.totalCost),
                }),
            ),
            hasInventoryEntries: dyeingProcess.inventoryTransaction.length > 0,
            hasFabricProductions: dyeingProcess.fabricProduction.length > 0,
        };

        return NextResponse.json(formattedDyeingProcess);
    } catch (error) {
        console.error("Error fetching dyeing process:", error);
        return NextResponse.json(
            {
                error: "Failed to fetch dyeing process",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
        );
    }
}

/**
 * PATCH /api/dyeing/process/[id]
 * Update a dyeing process
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: number }> },
) {
    try {
        const { id } = await params;

        if (isNaN(id)) {
            return NextResponse.json(
                { error: "Invalid dyeing process ID" },
                { status: 400 },
            );
        }

        const body = await request.json();

        // Check if the dyeing process exists
        const existingProcess = await db.dyeingProcess.findUnique({
            where: { id: Number(id) },
            include: {
                threadPurchase: true,
                inventoryTransaction: true,
            },
        });

        if (!existingProcess) {
            return NextResponse.json(
                { error: "Dyeing process not found" },
                { status: 404 },
            );
        }

        // Prepare update data
        const updateData: DyeingProcessUpdateInput = {};

        // Handle dates
        if (body.dyeDate) {
            updateData.dyeDate = new Date(body.dyeDate);
        }

        if (body.completionDate) {
            updateData.completionDate = new Date(body.completionDate);
        } else if (body.completionDate === null) {
            updateData.completionDate = null;
        }

        // Handle dyeParameters if provided
        if (body.dyeParameters) {
            let dyeParams = body.dyeParameters;
            if (typeof dyeParams === "string") {
                try {
                    dyeParams = JSON.parse(dyeParams);
                } catch (error) {
                    console.error("Error parsing dyeParameters:", error);
                    return NextResponse.json(
                        { error: "Invalid dyeParameters format" },
                        { status: 400 },
                    );
                }
            }
            updateData.dyeParameters = dyeParams;
        }

        // Handle other fields
        if (body.colorCode !== undefined) updateData.colorCode = body.colorCode;
        if (body.colorName !== undefined) updateData.colorName = body.colorName;
        if (body.dyeQuantity !== undefined)
            updateData.dyeQuantity = body.dyeQuantity;
        if (body.outputQuantity !== undefined)
            updateData.outputQuantity = body.outputQuantity;
        if (body.resultStatus !== undefined)
            updateData.resultStatus = body.resultStatus;
        if (body.remarks !== undefined) updateData.remarks = body.remarks;

        // Handle cost fields
        if (body.laborCost !== undefined) updateData.laborCost = body.laborCost;
        if (body.dyeMaterialCost !== undefined)
            updateData.dyeMaterialCost = body.dyeMaterialCost;

        // Calculate total cost
        if (
            body.laborCost !== undefined ||
            body.dyeMaterialCost !== undefined
        ) {
            const laborCost =
                body.laborCost !== undefined
                    ? parseFloat(body.laborCost)
                    : existingProcess.laborCost
                      ? Number(existingProcess.laborCost)
                      : 0;

            const materialCost =
                body.dyeMaterialCost !== undefined
                    ? parseFloat(body.dyeMaterialCost)
                    : existingProcess.dyeMaterialCost
                      ? Number(existingProcess.dyeMaterialCost)
                      : 0;

            updateData.totalCost = laborCost + materialCost;
        } else if (body.totalCost !== undefined) {
            updateData.totalCost = parseFloat(body.totalCost);
        }

        // Update the dyeing process
        const updatedProcess = await db.dyeingProcess.update({
            where: { id: Number(id) },
            data: updateData,
            include: {
                threadPurchase: true,
                inventoryTransaction: true,
                fabricProduction: true,
            },
        });

        // If process is completed and we need to add to inventory
        if (
            body.addToInventory &&
            updateData.resultStatus === "COMPLETED" &&
            existingProcess.resultStatus !== "COMPLETED" &&
            existingProcess.inventoryTransaction.length === 0
        ) {
            try {
                // Add to inventory logic...
                const itemCode = `DT-${id}-${Date.now().toString().slice(-6)}`;

                // Check if thread type exists
                let threadType = await db.threadType.findFirst({
                    where: {
                        name: {
                            equals: updatedProcess.threadPurchase.threadType,
                            mode: "insensitive",
                        },
                    },
                });

                if (!threadType) {
                    threadType = await db.threadType.create({
                        data: {
                            name: updatedProcess.threadPurchase.threadType,
                            units: updatedProcess.threadPurchase.unitOfMeasure || "meters",
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        },
                    });
                }

                // Create inventory item
                const inventoryItem = await db.inventory.create({
                    data: {
                        itemCode,
                        description: `Dyed ${updatedProcess.threadPurchase.threadType} (${updatedProcess.colorName || "Unknown"})`,
                        productType: ProductType.THREAD,
                        threadTypeId: threadType.id,
                        currentQuantity: updatedProcess.outputQuantity,
                        unitOfMeasure: updatedProcess.threadPurchase.unitOfMeasure || "meters",
                        minStockLevel: 100, // Default value
                        costPerUnit: updatedProcess.totalCost
                            ? Number(updatedProcess.totalCost) / updatedProcess.outputQuantity
                            : Number(updatedProcess.threadPurchase.unitPrice),
                        salePrice: updatedProcess.totalCost
                            ? (Number(updatedProcess.totalCost) / updatedProcess.outputQuantity) * 1.2
                            : Number(updatedProcess.threadPurchase.unitPrice) * 1.2,
                        location: "Dye Facility",
                        notes: `Dyed from Thread Purchase #${updatedProcess.threadPurchaseId}`,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    },
                });

                // Create inventory transaction
                await db.inventoryTransaction.create({
                    data: {
                        inventoryId: inventoryItem.id,
                        transactionType: InventoryTransactionType.PRODUCTION,
                        quantity: updatedProcess.outputQuantity,
                        remainingQuantity: updatedProcess.outputQuantity,
                        unitCost: updatedProcess.totalCost
                            ? Number(updatedProcess.totalCost) / updatedProcess.outputQuantity
                            : null,
                        totalCost: updatedProcess.totalCost
                            ? Number(updatedProcess.totalCost)
                            : null,
                        referenceType: "DyeingProcess",
                        referenceId: updatedProcess.id,
                        dyeingProcessId: updatedProcess.id,
                        notes: `Thread dyeing process completed`,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    },
                });

                // Update thread purchase to be COLORED
                await db.threadPurchase.update({
                    where: { id: updatedProcess.threadPurchaseId },
                    data: { colorStatus: ColorStatus.COLORED },
                });
            } catch (inventoryError) {
                console.error("Error adding to inventory:", inventoryError);
                // Continue even if inventory creation fails
            }
        }

        // Fetch the final process with latest data
        const finalProcess = await db.dyeingProcess.findUnique({
            where: { id: Number(id) },
            include: {
                threadPurchase: true,
                inventoryTransaction: true,
                fabricProduction: true,
            },
        });

        if (!finalProcess) {
            throw new Error("Failed to retrieve updated dyeing process");
        }

        // Format the response
        const formattedProcess = {
            ...finalProcess,
            dyeDate: finalProcess.dyeDate.toISOString(),
            completionDate: finalProcess.completionDate
                ? finalProcess.completionDate.toISOString()
                : null,
            laborCost: finalProcess.laborCost
                ? Number(finalProcess.laborCost)
                : null,
            dyeMaterialCost: finalProcess.dyeMaterialCost
                ? Number(finalProcess.dyeMaterialCost)
                : null,
            totalCost: finalProcess.totalCost
                ? Number(finalProcess.totalCost)
                : null,
            threadPurchase: {
                ...finalProcess.threadPurchase,
                orderDate: finalProcess.threadPurchase.orderDate.toISOString(),
                deliveryDate: finalProcess.threadPurchase.deliveryDate
                    ? finalProcess.threadPurchase.deliveryDate.toISOString()
                    : null,
                receivedAt: finalProcess.threadPurchase.receivedAt
                    ? finalProcess.threadPurchase.receivedAt.toISOString()
                    : null,
                unitPrice: Number(finalProcess.threadPurchase.unitPrice),
                totalCost: Number(finalProcess.threadPurchase.totalCost),
            },
            inventoryEntries: finalProcess.inventoryTransaction.map((entry) => ({
                ...entry,
                transactionDate: entry.transactionDate.toISOString(),
                createdAt: entry.createdAt.toISOString(),
                updatedAt: entry.updatedAt.toISOString(),
                unitCost: entry.unitCost ? Number(entry.unitCost) : null,
                totalCost: entry.totalCost ? Number(entry.totalCost) : null,
            })),
            fabricProductions: finalProcess.fabricProduction.map(
                (production) => ({
                    ...production,
                    productionDate: production.productionDate.toISOString(),
                    completionDate: production.completionDate
                        ? production.completionDate.toISOString()
                        : null,
                    productionCost: Number(production.productionCost),
                    laborCost: production.laborCost
                        ? Number(production.laborCost)
                        : null,
                    totalCost: Number(production.totalCost),
                }),
            ),
            hasInventoryEntries: finalProcess.inventoryTransaction.length > 0,
            hasFabricProductions: finalProcess.fabricProduction.length > 0,
        };

        return NextResponse.json({
            success: true,
            data: formattedProcess,
        });
    } catch (error) {
        console.error("Error updating dyeing process:", error);

        if (
            error instanceof Error &&
            error.message.includes("Record to update not found")
        ) {
            return NextResponse.json(
                { error: "Dyeing process not found" },
                { status: 404 },
            );
        }

        return NextResponse.json(
            {
                error: "Failed to update dyeing process",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
        );
    }
}

/**
 * DELETE /api/dyeing/process/[id]
 * Delete a dyeing process
 */
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: number }> },
) {
    try {
        const { id } = await params;

        if (isNaN(id)) {
            return NextResponse.json(
                { error: "Invalid dyeing process ID" },
                { status: 400 },
            );
        }

        // Check if the process exists and has dependencies
        const process = await db.dyeingProcess.findUnique({
            where: { id: Number(id) },
            include: {
                fabricProduction: { take: 1 },
            },
        });

        if (!process) {
            return NextResponse.json(
                { error: "Dyeing process not found" },
                { status: 404 },
            );
        }

        // Check if there are related fabric productions
        if (process.fabricProduction.length > 0) {
            return NextResponse.json(
                {
                    error: "Cannot delete dyeing process that has fabric productions",
                },
                { status: 400 },
            );
        }

        // Delete inventory entries
        await db.inventoryTransaction.deleteMany({
            where: { dyeingProcessId: id },
        });

        // Delete the dyeing process
        await db.dyeingProcess.delete({
            where: { id: Number(id) },
        });

        return NextResponse.json({
            success: true,
            message: "Dyeing process deleted successfully",
        });
    } catch (error) {
        console.error("Error deleting dyeing process:", error);
        return NextResponse.json(
            {
                error: "Failed to delete dyeing process",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
        );
    }
}
