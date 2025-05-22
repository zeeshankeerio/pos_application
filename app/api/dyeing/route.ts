import { NextRequest, NextResponse } from "next/server";

import { InventoryTransactionType, Prisma, ProductType } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * GET /api/dyeing
 * Fetch all dyeing processes with related data
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);

        // Pagination params
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "10");
        const skip = (page - 1) * limit;

        // Filtering params
        const threadPurchaseId = searchParams.get("threadPurchaseId");
        const status = searchParams.get("status");
        const searchQuery = searchParams.get("query") || "";
        const fromDate = searchParams.get("fromDate");
        const toDate = searchParams.get("toDate");

        // Build where clause
        const where: Prisma.DyeingProcessWhereInput = {};

        if (threadPurchaseId) {
            where.threadPurchaseId = parseInt(threadPurchaseId);
        }

        if (status) {
            where.resultStatus = status;
        }

        if (searchQuery) {
            where.OR = [
                { colorName: { contains: searchQuery, mode: "insensitive" } },
                { colorCode: { contains: searchQuery, mode: "insensitive" } },
                {
                    threadPurchase: {
                        threadType: {
                            contains: searchQuery,
                            mode: "insensitive",
                        },
                    },
                },
            ];
        }

        // Set date filters
        if (fromDate || toDate) {
            where.dyeDate = {};

            if (fromDate) {
                where.dyeDate.gte = new Date(fromDate);
            }

            if (toDate) {
                where.dyeDate.lte = new Date(toDate);
            }
        }

        // Fetch dyeing processes with thread purchase info
        const [dyeingProcesses, totalCount] = await Promise.all([
            db.dyeingProcess.findMany({
                where,
                skip,
                take: limit,
                include: {
                    threadPurchase: true,
                    inventoryEntries: true,
                    fabricProductions: true,
                },
                orderBy: {
                    dyeDate: "desc",
                },
            }),
            db.dyeingProcess.count({ where }),
        ]);

        // Transform the response for the client
        const transformedProcesses = dyeingProcesses.map((process) => {
            // Get color information from dyeParameters if needed
            let color = process.colorName || process.colorCode || null;
            if (!color && process.dyeParameters) {
                let dyeParams: Record<string, unknown> = {};

                // Parse if it's a string
                if (typeof process.dyeParameters === "string") {
                    try {
                        dyeParams = JSON.parse(process.dyeParameters);
                    } catch (e) {
                        console.error("Failed to parse dyeParameters:", e);
                    }
                } else if (typeof process.dyeParameters === "object") {
                    dyeParams = process.dyeParameters as Record<
                        string,
                        unknown
                    >;
                }

                // Get color from dyeing parameters if available
                if (
                    dyeParams &&
                    "color" in dyeParams &&
                    typeof dyeParams.color === "string"
                ) {
                    color = dyeParams.color;
                }
            }

            // Check if has inventory entries
            const inventoryEntries = process.inventoryEntries || [];
            const hasInventoryEntries = inventoryEntries.length > 0;

            // Check if has fabric productions
            const fabricProductions = process.fabricProductions || [];
            const hasFabricProductions = fabricProductions.length > 0;

            return {
                id: process.id,
                threadPurchaseId: process.threadPurchaseId,
                threadPurchase: {
                    id: process.threadPurchase.id,
                    threadType: process.threadPurchase.threadType,
                    colorStatus: process.threadPurchase.colorStatus,
                    color: process.threadPurchase.color,
                    quantity: process.threadPurchase.quantity,
                    unitOfMeasure:
                        process.threadPurchase.unitOfMeasure || "meters",
                },
                dyeDate: process.dyeDate.toISOString(),
                dyeParameters: process.dyeParameters,
                colorCode: process.colorCode,
                colorName: process.colorName || color,
                dyeQuantity: process.dyeQuantity,
                outputQuantity: process.outputQuantity,
                laborCost: process.laborCost ? Number(process.laborCost) : null,
                dyeMaterialCost: process.dyeMaterialCost
                    ? Number(process.dyeMaterialCost)
                    : null,
                totalCost: process.totalCost ? Number(process.totalCost) : null,
                resultStatus: process.resultStatus,
                completionDate: process.completionDate
                    ? process.completionDate.toISOString()
                    : null,
                remarks: process.remarks || null,
                inventoryEntries: inventoryEntries.map((entry) => ({
                    id: entry.id,
                    quantity: entry.quantity,
                    transactionType: entry.transactionType,
                    transactionDate: entry.transactionDate.toISOString(),
                    unitCost: entry.unitCost ? Number(entry.unitCost) : null,
                    totalCost: entry.totalCost ? Number(entry.totalCost) : null,
                })),
                fabricProductions: fabricProductions.map((production) => ({
                    id: production.id,
                    fabricType: production.fabricType,
                    quantityProduced: production.quantityProduced,
                    status: production.status,
                    productionDate: production.productionDate.toISOString(),
                    completionDate: production.completionDate
                        ? production.completionDate.toISOString()
                        : null,
                    productionCost: Number(production.productionCost),
                    totalCost: Number(production.totalCost),
                })),
                inventoryStatus: hasInventoryEntries ? "UPDATED" : "PENDING",
                fabricProductionStatus: hasFabricProductions
                    ? "USED"
                    : "AVAILABLE",
            };
        });

        return NextResponse.json({
            data: transformedProcesses,
            meta: {
                total: totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit),
            },
        });
    } catch (error) {
        console.error("Error fetching dyeing processes:", error);
        return NextResponse.json(
            {
                error: "Failed to fetch dyeing processes",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
        );
    }
}

/**
 * POST /api/dyeing
 * Create a new dyeing process and update inventory
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        // Validate required fields
        const { threadPurchaseId, dyeQuantity, resultStatus, outputQuantity } =
            body;

        if (
            !threadPurchaseId ||
            !dyeQuantity ||
            !resultStatus ||
            !outputQuantity
        ) {
            return NextResponse.json(
                {
                    error: "Missing required fields",
                    required: [
                        "threadPurchaseId",
                        "dyeQuantity",
                        "resultStatus",
                        "outputQuantity",
                    ],
                },
                { status: 400 },
            );
        }

        // Fetch the related thread purchase
        const threadPurchase = await db.threadPurchase.findUnique({
            where: { id: parseInt(threadPurchaseId) },
            include: {
                inventoryEntries: {
                    include: {
                        inventory: true,
                    },
                },
            },
        });

        if (!threadPurchase) {
            return NextResponse.json(
                { error: "Thread purchase not found" },
                { status: 404 },
            );
        }

        // Check if there's already a dyeing process for this thread purchase
        const existingDyeingProcess = await db.dyeingProcess.findFirst({
            where: { threadPurchaseId: parseInt(threadPurchaseId) },
        });

        if (existingDyeingProcess) {
            return NextResponse.json(
                {
                    error: "A dyeing process already exists for this thread purchase",
                },
                { status: 400 },
            );
        }

        // Calculate costs if not provided
        const laborCost = body.laborCost ? parseFloat(body.laborCost) : 0;
        const dyeMaterialCost = body.dyeMaterialCost
            ? parseFloat(body.dyeMaterialCost)
            : 0;
        const totalCost = laborCost + dyeMaterialCost;

        // Use a transaction to ensure data consistency
        const result = await db.$transaction(async (tx) => {
            // Create the dyeing process
            const dyeingProcess = await tx.dyeingProcess.create({
                data: {
                    threadPurchaseId: parseInt(threadPurchaseId),
                    dyeDate: body.dyeDate ? new Date(body.dyeDate) : new Date(),
                    dyeParameters: body.dyeParameters || null,
                    colorCode: body.colorCode || null,
                    colorName: body.colorName || null,
                    dyeQuantity: parseInt(dyeQuantity),
                    laborCost: laborCost,
                    dyeMaterialCost: dyeMaterialCost,
                    totalCost: totalCost,
                    resultStatus,
                    outputQuantity: parseInt(outputQuantity),
                    completionDate: body.completionDate
                        ? new Date(body.completionDate)
                        : null,
                    remarks: body.remarks || null,
                },
                include: {
                    threadPurchase: {
                        include: {
                            vendor: true,
                        },
                    },
                },
            });

            // Update inventory if updateInventory flag is true (default) and the process is completed
            if (
                body.updateInventory !== false &&
                (resultStatus === "COMPLETED" || resultStatus === "SUCCESS")
            ) {
                // Check if there's an existing inventory for the raw thread
                const rawThreadInventory =
                    threadPurchase.inventoryEntries.length > 0
                        ? threadPurchase.inventoryEntries[0].inventory
                        : null;

                if (rawThreadInventory) {
                    // Validate there's enough inventory
                    const quantityUsed = parseInt(dyeQuantity);
                    if (rawThreadInventory.currentQuantity < quantityUsed) {
                        throw new Error(
                            `Not enough thread in inventory. Available: ${rawThreadInventory.currentQuantity}, Required: ${quantityUsed}`,
                        );
                    }

                    // Reduce the quantity of raw thread from inventory
                    const remainingRawQuantity =
                        rawThreadInventory.currentQuantity - quantityUsed;

                    // Update raw thread inventory
                    await tx.inventory.update({
                        where: { id: rawThreadInventory.id },
                        data: {
                            currentQuantity: remainingRawQuantity,
                        },
                    });

                    // Add transaction for raw thread usage
                    await tx.inventoryTransaction.create({
                        data: {
                            inventoryId: rawThreadInventory.id,
                            dyeingProcessId: dyeingProcess.id,
                            transactionType:
                                InventoryTransactionType.ADJUSTMENT,
                            quantity: -quantityUsed,
                            remainingQuantity: remainingRawQuantity,
                            unitCost: rawThreadInventory.costPerUnit,
                            totalCost:
                                Number(rawThreadInventory.costPerUnit) *
                                quantityUsed,
                            transactionDate: new Date(),
                            notes: `Thread used in dyeing process #${dyeingProcess.id}`,
                            referenceType: "DyeingProcess",
                            referenceId: dyeingProcess.id,
                        },
                    });
                } else {
                    console.warn(
                        `No inventory found for thread purchase #${threadPurchase.id}. Cannot update inventory.`,
                    );
                }

                // Create inventory for the dyed thread
                const threadType = threadPurchase.threadType;
                const colorName =
                    dyeingProcess.colorName ||
                    dyeingProcess.colorCode ||
                    "Dyed";

                // Check if thread type exists or create it
                let threadTypeRecord = await tx.threadType.findFirst({
                    where: {
                        name: { equals: threadType, mode: "insensitive" },
                    },
                });

                if (!threadTypeRecord) {
                    threadTypeRecord = await tx.threadType.create({
                        data: {
                            name: threadType,
                            units: threadPurchase.unitOfMeasure,
                            description: `Thread type for ${threadType}`,
                        },
                    });
                }

                // Generate item code for dyed thread
                const itemCode = `DYE-${dyeingProcess.id}-${Date.now().toString().slice(-6)}`;

                // Calculate cost per unit for dyed thread
                const rawThreadCost =
                    Number(threadPurchase.unitPrice) * parseInt(dyeQuantity);
                const processCost = totalCost;
                const totalDyeingCost = rawThreadCost + processCost;
                const outputQty = parseInt(outputQuantity);
                const costPerUnit =
                    outputQty > 0 ? totalDyeingCost / outputQty : 0;

                // Create inventory item for dyed thread
                const dyedThreadInventory = await tx.inventory.create({
                    data: {
                        itemCode,
                        description: `${colorName} ${threadType} Thread (Dyed)`,
                        productType: ProductType.THREAD,
                        threadTypeId: threadTypeRecord.id,
                        currentQuantity: outputQty,
                        unitOfMeasure: threadPurchase.unitOfMeasure,
                        minStockLevel: 10, // Default minimum stock level
                        costPerUnit,
                        salePrice: Number(costPerUnit) * 1.3, // Default markup
                        lastRestocked: new Date(),
                        location: body.location || "Dyeing Department",
                        notes: `Dyed thread from process #${dyeingProcess.id}. Original thread purchase #${threadPurchase.id}`,
                    },
                });

                // Create inventory transaction for dyed thread
                await tx.inventoryTransaction.create({
                    data: {
                        inventoryId: dyedThreadInventory.id,
                        dyeingProcessId: dyeingProcess.id,
                        transactionType: InventoryTransactionType.PRODUCTION,
                        quantity: outputQty,
                        remainingQuantity: outputQty,
                        unitCost: costPerUnit,
                        totalCost: Number(costPerUnit) * outputQty,
                        transactionDate: new Date(),
                        notes: `Dyed thread produced in dyeing process #${dyeingProcess.id}`,
                        referenceType: "DyeingProcess",
                        referenceId: dyeingProcess.id,
                    },
                });
            }

            return dyeingProcess;
        });

        return NextResponse.json(
            {
                success: true,
                data: result,
            },
            { status: 201 },
        );
    } catch (error) {
        console.error("Error creating dyeing process:", error);

        // Handle specific errors
        if (
            error instanceof Error &&
            error.message.includes("Not enough thread in inventory")
        ) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        return NextResponse.json(
            {
                error: "Failed to create dyeing process",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
        );
    }
}

/**
 * PATCH /api/dyeing
 * Update an existing dyeing process and update inventory
 */
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { searchParams } = new URL(req.url);
        const id = Number(searchParams.get("id"));
        // Validate required fields
        if (!id || isNaN(id)) {
            return NextResponse.json(
                { error: "Valid dyeing process ID is required" },
                { status: 400 },
            );
        }

        // Get the existing dyeing process
        const existingProcess = await db.dyeingProcess.findUnique({
            where: { id },
            include: {
                threadPurchase: true,
                inventoryEntries: {
                    include: {
                        inventory: true,
                    },
                },
            },
        });

        if (!existingProcess) {
            return NextResponse.json(
                { error: "Dyeing process not found" },
                { status: 404 },
            );
        }

        // Prepare update data
        const updateData: Prisma.DyeingProcessUpdateInput = {};

        // Only update fields that are provided
        if (body.dyeDate) updateData.dyeDate = new Date(body.dyeDate);
        if (body.dyeParameters) updateData.dyeParameters = body.dyeParameters;
        if (body.colorCode) updateData.colorCode = body.colorCode;
        if (body.colorName) updateData.colorName = body.colorName;
        if (body.dyeQuantity)
            updateData.dyeQuantity = parseInt(body.dyeQuantity);
        if (body.outputQuantity)
            updateData.outputQuantity = parseInt(body.outputQuantity);
        if (body.laborCost) updateData.laborCost = parseFloat(body.laborCost);
        if (body.dyeMaterialCost)
            updateData.dyeMaterialCost = parseFloat(body.dyeMaterialCost);
        if (body.totalCost !== undefined) {
            updateData.totalCost = parseFloat(body.totalCost);
        } else if (body.laborCost || body.dyeMaterialCost) {
            // Calculate total cost if individual costs are updated
            const newLaborCost =
                body.laborCost !== undefined
                    ? parseFloat(body.laborCost)
                    : existingProcess.laborCost
                      ? Number(existingProcess.laborCost)
                      : 0;

            const newMaterialCost =
                body.dyeMaterialCost !== undefined
                    ? parseFloat(body.dyeMaterialCost)
                    : existingProcess.dyeMaterialCost
                      ? Number(existingProcess.dyeMaterialCost)
                      : 0;

            updateData.totalCost = newLaborCost + newMaterialCost;
        }

        if (body.resultStatus) updateData.resultStatus = body.resultStatus;
        if (body.completionDate)
            updateData.completionDate = new Date(body.completionDate);
        if (body.remarks) updateData.remarks = body.remarks;

        // Check if status is being changed to completed
        const statusChanged =
            body.resultStatus &&
            (body.resultStatus === "COMPLETED" ||
                body.resultStatus === "SUCCESS") &&
            existingProcess.resultStatus !== "COMPLETED" &&
            existingProcess.resultStatus !== "SUCCESS";

        const quantityChanged =
            (body.dyeQuantity &&
                parseInt(body.dyeQuantity) !== existingProcess.dyeQuantity) ||
            (body.outputQuantity &&
                parseInt(body.outputQuantity) !==
                    existingProcess.outputQuantity);

        // Update the dyeing process
        const updatedProcess = await db.dyeingProcess.update({
            where: { id },
            data: updateData,
            include: {
                threadPurchase: true,
                inventoryEntries: {
                    include: {
                        inventory: true,
                    },
                },
            },
        });

        // Handle inventory updates if status changed to completed or quantities changed while completed
        const isCompleted =
            updatedProcess.resultStatus === "COMPLETED" ||
            updatedProcess.resultStatus === "SUCCESS";
        const shouldUpdateInventory =
            (statusChanged || (quantityChanged && isCompleted)) &&
            body.updateInventory !== false;

        if (shouldUpdateInventory) {
            try {
                // Use a transaction to ensure all inventory updates are atomic
                await db.$transaction(async (tx) => {
                    // Handle existing inventory entries
                    const hasExistingEntries =
                        updatedProcess.inventoryEntries.length > 0;

                    if (hasExistingEntries) {
                        // Find entries for raw thread (negative quantity) and dyed thread (positive quantity)
                        const rawThreadEntry =
                            updatedProcess.inventoryEntries.find(
                                (e) =>
                                    e.quantity < 0 &&
                                    e.inventory.productType ===
                                        ProductType.THREAD,
                            );

                        const dyedThreadEntry =
                            updatedProcess.inventoryEntries.find(
                                (e) =>
                                    e.quantity > 0 &&
                                    e.inventory.productType ===
                                        ProductType.THREAD,
                            );

                        // Handle changes to raw thread usage
                        if (rawThreadEntry && body.dyeQuantity) {
                            const newUsage = parseInt(body.dyeQuantity);
                            const oldUsage = Math.abs(rawThreadEntry.quantity);
                            const usageDiff = newUsage - oldUsage;

                            if (usageDiff !== 0) {
                                // Update raw thread inventory
                                const rawInventory = rawThreadEntry.inventory;
                                const newQuantity = Math.max(
                                    0,
                                    rawInventory.currentQuantity - usageDiff,
                                );

                                await tx.inventory.update({
                                    where: { id: rawInventory.id },
                                    data: {
                                        currentQuantity: newQuantity,
                                    },
                                });

                                // Create adjustment transaction
                                await tx.inventoryTransaction.create({
                                    data: {
                                        inventoryId: rawInventory.id,
                                        dyeingProcessId: updatedProcess.id,
                                        transactionType:
                                            InventoryTransactionType.ADJUSTMENT,
                                        quantity: -usageDiff,
                                        remainingQuantity: newQuantity,
                                        unitCost: rawInventory.costPerUnit,
                                        totalCost:
                                            Number(rawInventory.costPerUnit) *
                                            usageDiff,
                                        transactionDate: new Date(),
                                        notes: `Adjusted raw thread usage for dyeing process #${updatedProcess.id}`,
                                        referenceType: "DyeingProcess",
                                        referenceId: updatedProcess.id,
                                    },
                                });
                            }
                        }

                        // Handle changes to dyed thread output
                        if (dyedThreadEntry && body.outputQuantity) {
                            const newOutput = parseInt(body.outputQuantity);
                            const oldOutput = dyedThreadEntry.quantity;
                            const outputDiff = newOutput - oldOutput;

                            if (outputDiff !== 0) {
                                // Update dyed thread inventory
                                const dyedInventory = dyedThreadEntry.inventory;
                                const newQuantity = Math.max(
                                    0,
                                    dyedInventory.currentQuantity + outputDiff,
                                );

                                await tx.inventory.update({
                                    where: { id: dyedInventory.id },
                                    data: {
                                        currentQuantity: newQuantity,
                                        lastRestocked:
                                            outputDiff > 0
                                                ? new Date()
                                                : undefined,
                                    },
                                });

                                // Create adjustment transaction
                                await tx.inventoryTransaction.create({
                                    data: {
                                        inventoryId: dyedInventory.id,
                                        dyeingProcessId: updatedProcess.id,
                                        transactionType:
                                            InventoryTransactionType.ADJUSTMENT,
                                        quantity: outputDiff,
                                        remainingQuantity: newQuantity,
                                        unitCost: dyedInventory.costPerUnit,
                                        totalCost:
                                            Number(dyedInventory.costPerUnit) *
                                            outputDiff,
                                        transactionDate: new Date(),
                                        notes: `Adjusted dyed thread output for dyeing process #${updatedProcess.id}`,
                                        referenceType: "DyeingProcess",
                                        referenceId: updatedProcess.id,
                                    },
                                });
                            }
                        }
                    } else if (isCompleted) {
                        // No existing inventory entries, create new ones similarly to POST handler
                        // Check if there's an existing inventory for the raw thread
                        const threadPurchase = updatedProcess.threadPurchase;

                        // Get raw thread inventory
                        const rawThreadInventory =
                            await tx.inventoryTransaction.findFirst({
                                where: {
                                    threadPurchaseId: threadPurchase.id,
                                },
                                include: {
                                    inventory: true,
                                },
                                orderBy: {
                                    createdAt: "desc",
                                },
                            });

                        if (
                            rawThreadInventory &&
                            rawThreadInventory.inventory
                        ) {
                            // Reduce the quantity of raw thread from inventory
                            const quantityUsed = updatedProcess.dyeQuantity;
                            const remainingRawQuantity = Math.max(
                                0,
                                rawThreadInventory.inventory.currentQuantity -
                                    quantityUsed,
                            );

                            // Update raw thread inventory
                            await tx.inventory.update({
                                where: { id: rawThreadInventory.inventory.id },
                                data: {
                                    currentQuantity: remainingRawQuantity,
                                },
                            });

                            // Add transaction for raw thread usage
                            await tx.inventoryTransaction.create({
                                data: {
                                    inventoryId:
                                        rawThreadInventory.inventory.id,
                                    dyeingProcessId: updatedProcess.id,
                                    transactionType:
                                        InventoryTransactionType.ADJUSTMENT,
                                    quantity: -quantityUsed,
                                    remainingQuantity: remainingRawQuantity,
                                    unitCost:
                                        rawThreadInventory.inventory
                                            .costPerUnit,
                                    totalCost:
                                        Number(
                                            rawThreadInventory.inventory
                                                .costPerUnit,
                                        ) * quantityUsed,
                                    transactionDate: new Date(),
                                    notes: `Thread used in dyeing process #${updatedProcess.id}`,
                                    referenceType: "DyeingProcess",
                                    referenceId: updatedProcess.id,
                                },
                            });
                        }

                        // Create inventory for the dyed thread
                        const threadType = threadPurchase.threadType;
                        const colorName =
                            updatedProcess.colorName ||
                            updatedProcess.colorCode ||
                            "Dyed";

                        // Check if thread type exists or create it
                        let threadTypeRecord = await tx.threadType.findFirst({
                            where: {
                                name: {
                                    equals: threadType,
                                    mode: "insensitive",
                                },
                            },
                        });

                        if (!threadTypeRecord) {
                            threadTypeRecord = await tx.threadType.create({
                                data: {
                                    name: threadType,
                                    units: threadPurchase.unitOfMeasure,
                                    description: `Thread type for ${threadType}`,
                                },
                            });
                        }

                        // Generate item code for dyed thread
                        const itemCode = `DYE-${updatedProcess.id}-${Date.now().toString().slice(-6)}`;

                        // Calculate cost per unit for dyed thread
                        const rawThreadCost =
                            Number(threadPurchase.unitPrice) *
                            updatedProcess.dyeQuantity;
                        const processCost = Number(
                            updatedProcess.totalCost || 0,
                        );
                        const totalDyeingCost = rawThreadCost + processCost;
                        const costPerUnit =
                            updatedProcess.outputQuantity > 0
                                ? totalDyeingCost /
                                  updatedProcess.outputQuantity
                                : 0;

                        // Create inventory item for dyed thread
                        const dyedThreadInventory = await tx.inventory.create({
                            data: {
                                itemCode,
                                description: `${colorName} ${threadType} Thread (Dyed)`,
                                productType: ProductType.THREAD,
                                threadTypeId: threadTypeRecord.id,
                                currentQuantity: updatedProcess.outputQuantity,
                                unitOfMeasure: threadPurchase.unitOfMeasure,
                                minStockLevel: 10, // Default minimum stock level
                                costPerUnit,
                                salePrice: Number(costPerUnit) * 1.3, // Default markup
                                lastRestocked: new Date(),
                                location: body.location || "Dyeing Department",
                                notes: `Dyed thread from process #${updatedProcess.id}. Original thread purchase #${threadPurchase.id}`,
                            },
                        });

                        // Create inventory transaction for dyed thread
                        await tx.inventoryTransaction.create({
                            data: {
                                inventoryId: dyedThreadInventory.id,
                                dyeingProcessId: updatedProcess.id,
                                transactionType:
                                    InventoryTransactionType.PRODUCTION,
                                quantity: updatedProcess.outputQuantity,
                                remainingQuantity:
                                    updatedProcess.outputQuantity,
                                unitCost: costPerUnit,
                                totalCost:
                                    costPerUnit * updatedProcess.outputQuantity,
                                transactionDate: new Date(),
                                notes: `Dyed thread produced in dyeing process #${updatedProcess.id}`,
                                referenceType: "DyeingProcess",
                                referenceId: updatedProcess.id,
                            },
                        });
                    }
                });
            } catch (inventoryError) {
                console.error(
                    "Error updating inventory for dyeing process:",
                    inventoryError,
                );
                // Continue with the process, but log the error
            }
        }

        return NextResponse.json({
            success: true,
            data: updatedProcess,
        });
    } catch (error) {
        console.error("Error updating dyeing process:", error);
        return NextResponse.json(
            {
                error: "Failed to update dyeing process",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
        );
    }
}
