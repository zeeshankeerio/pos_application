"use client";

import React, { useEffect, useState, useCallback } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import {
    ChequeStatus,
    ColorStatus,
    PaymentMode,
    PaymentStatus,
    ProductType,
} from "@prisma/client";
import { format } from "date-fns";
import { CalendarIcon, Loader2, Plus, Trash2, ShoppingCart } from "lucide-react";
import { Resolver, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-unused-vars */

// Function to safely convert string to number
const safeParseFloat = (value: string | undefined): number => {
    if (!value) return 0;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
};

// Function to safely convert string to integer
const safeParseInt = (value: string | undefined): number => {
    if (!value) return 0;
    const parsed = parseInt(value);
    return isNaN(parsed) ? 0 : parsed;
};

// Format currency helper
const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "PKR",
        minimumFractionDigits: 0,
    }).format(value);
};

// Define schema for the form with validations
const formSchema = z
    .object({
        customerName: z.string().min(2, {
            message: "Customer name must be at least 2 characters.",
        }),
        customerId: z.string().optional(),
        // Form now manages products separately in cart
        // Product selection fields for current item (not saved in form)
        productType: z.nativeEnum(ProductType),
        productId: z.string().optional(),
        sourceProductId: z.string().optional(),
        inventoryItemId: z.string().optional(),
        quantitySold: z
            .string()
            .optional()
            .refine((val) => !val || (!isNaN(Number(val)) && Number(val) > 0), {
                message: "Quantity must be a positive number.",
            }),
        salePrice: z
            .string()
            .optional()
            .refine((val) => !val || (!isNaN(Number(val)) && Number(val) > 0), {
                message: "Price must be a positive number.",
            }),
        itemDiscount: z
            .string()
            .optional()
            .refine(
                (val) => !val || (!isNaN(Number(val)) && Number(val) >= 0),
                {
                    message:
                        "Discount must be a non-negative number if provided.",
                },
            ),
        itemTax: z
            .string()
            .optional()
            .refine(
                (val) => !val || (!isNaN(Number(val)) && Number(val) >= 0),
                {
                    message: "Tax must be a non-negative number if provided.",
                },
            ),
        // Order level fields
        discount: z
            .string()
            .optional()
            .refine(
                (val) => !val || (!isNaN(Number(val)) && Number(val) >= 0),
                {
                    message:
                        "Discount must be a non-negative number if provided.",
                },
            ),
        tax: z
            .string()
            .optional()
            .refine(
                (val) => !val || (!isNaN(Number(val)) && Number(val) >= 0),
                {
                    message: "Tax must be a non-negative number if provided.",
                },
            ),
        totalSale: z.number().default(0),
        orderDate: z.date(),
        deliveryDate: z.date().optional(),
        deliveryAddress: z.string().optional(),
        remarks: z.string().optional(),
        paymentMode: z.nativeEnum(PaymentMode).optional(),
        chequeStatus: z.nativeEnum(ChequeStatus).optional(),
        paymentStatus: z.nativeEnum(PaymentStatus),
        orderNumber: z.string().optional(),
        updateInventory: z.boolean().default(true),
        chequeNumber: z.string().optional(),
        bank: z.string().optional(),
        branch: z.string().optional(),
        paymentAmount: z
            .string()
            .optional()
            .refine(
                (val) => !val || (!isNaN(Number(val)) && Number(val) >= 0),
                {
                    message:
                        "Payment amount must be a non-negative number if provided.",
                },
            ),
    })
    .refine(
        (data) => {
            // Check if cheque details are required
            if (data.paymentMode === PaymentMode.CHEQUE) {
                return !!data.chequeNumber && !!data.bank;
            }
            return true;
        },
        {
            message:
                "Cheque number and bank are required when payment mode is CHEQUE",
            path: ["chequeNumber"], // Focus on the first field that needs attention
        },
    )
    .refine(
        (data) => {
            // Check if payment amount is provided when payment status is PAID or PARTIAL
            if (
                data.paymentStatus === "PAID" ||
                data.paymentStatus === "PARTIAL"
            ) {
                return !!data.paymentAmount && Number(data.paymentAmount) > 0;
            }
            return true;
        },
        {
            message:
                "Payment amount is required when payment status is PAID or PARTIAL",
            path: ["paymentAmount"],
        },
    );

// Define type explicitly using the schema
type FormValues = z.infer<typeof formSchema>;

// Interface for cart items
interface CartItem {
    productId: number;
    productType: ProductType;
    name: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    tax: number;
    subtotal: number;
    inventoryItemId?: number;
    threadPurchaseId?: number;
    fabricProductionId?: number;
    availableQuantity: number;
}

// Interface for sales submission data
interface SalesSubmissionData {
    customerName: string;
    customerId?: number;
    orderDate: Date;
    deliveryDate?: Date;
    deliveryAddress?: string;
    remarks?: string;
    paymentMode?: PaymentMode;
    chequeStatus?: ChequeStatus;
    paymentStatus: PaymentStatus;
    orderNumber?: string;
    updateInventory: boolean;
    chequeNumber?: string;
    bank?: string;
    branch?: string;
    paymentAmount?: number;
    discount: number;
    tax: number;
    totalSale: number;
    items: {
        productType: ProductType;
        productId: number;
        threadPurchaseId?: number | null;
        fabricProductionId?: number | null;
        quantitySold: number;
        unitPrice: number;
        discount: number;
        tax: number;
        subtotal: number;
        inventoryItemId?: number;
    }[];
}

// Props for SalesFormDialog component
interface SalesFormDialogProps {
    triggerButton?: React.ReactNode;
    onSaleCreated?: () => void;
}

// Type for vendors from API
interface Vendor {
    id: number;
    name: string;
}

// Type for thread items from API
interface ThreadApiItem {
    id: number;
    threadType: string;
    colorStatus: string;
    color: string | null;
    quantity: number;
    vendorId?: number;
    vendorName?: string;
    unitPrice?: number;
    inventoryItemId?: number;
    availableInInventory?: boolean;
    inventory?: {
        id: number;
        itemCode: string;
        currentQuantity: number;
        costPerUnit: number;
        salePrice: number;
    } | null;
    threadPurchaseId?: number;
}

// Type for fabric items from API
interface FabricApiItem {
    id: number;
    fabricType: string;
    dimensions?: string;
    quantity: number;
    calculatedCost?: number;
    inventoryItemId?: number;
    availableInInventory?: boolean;
    inventory?: {
        id: number;
        itemCode: string;
        currentQuantity: number;
        costPerUnit: number;
        salePrice: number;
    } | null;
    fabricProductionId?: number;
}

// Type for products used in UI
interface ProductItem {
    id: number;
    type: string;
    name: string;
    vendorId?: number;
    vendorName?: string;
    available: number;
    unitPrice?: number;
    inventoryItemId?: number;
    availableInInventory?: boolean;
    inventoryItem?: {
        id: number;
        itemCode: string;
        currentQuantity: number;
        costPerUnit: number;
        salePrice: number;
    } | null;
    threadPurchaseId?: number;
    fabricProductionId?: number;
}

// Available products mapping
interface ProductOptions {
    thread: ProductItem[];
    fabric: ProductItem[];
}

// Add this type definition near the top of the file:
interface ApiError extends Error {
    name: string;
    message: string;
    stack?: string;
}

// Add TypeScript interface for inventory item
interface InventoryItem {
    id: number;
    productType: string;
    currentQuantity: number;
    threadType?: { name: string };
    fabricType?: { name: string };
    description?: string;
    itemCode: string;
    salePrice: number | string;
    costPerUnit: number | string;
}

// Add these interfaces near the top with the other interfaces
interface ThreadPurchaseItem {
    id: number;
    threadType: string;
    colorStatus: ColorStatus;
    color: string | null;
    quantity: number;
    vendorId: number;
    vendor?: {
        name: string;
    };
    unitPrice: number | string;
}

interface FabricProductionItem {
    id: number;
    fabricType: string;
    dimensions?: string;
    quantityProduced: number;
    totalCost: number | string;
}

// Add this to the interfaces section near the top of the file
interface InventoryTransaction {
    id: number;
    transactionType: string;
    fabricProductionId?: number | null;
    threadPurchaseId?: number | null;
    fabricProduction?: {
        id: number;
    } | null;
    quantity: number;
}

interface FabricProductionData {
    id: number;
    fabricType: string;
    fabricTypeId?: number;
}

interface InventoryDataWithTransactions extends InventoryItem {
    transactions: InventoryTransaction[];
    fabricTypeId?: number;
    fabricType?: {
        id: number;
        name: string;
    };
}

// Add this function to check if inventory quantity is greater than available
const isQuantityTooLarge = (quantityStr: string | undefined, maxQuantity: number): boolean => {
    if (!quantityStr) return false;
    const quantity = safeParseInt(quantityStr);
    return quantity > maxQuantity;
};

export function SalesFormDialog({
    triggerButton,
    onSaleCreated,
}: SalesFormDialogProps) {
    // Track dialog state
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [productOptions, setProductOptions] = useState<ProductOptions>({
        thread: [],
        fabric: [],
    });
    const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(
        null,
    );
    const [availableQuantity, setAvailableQuantity] = useState<number | null>(
        null,
    );
    const [calculatedTotal, setCalculatedTotal] = useState<number>(0);
    
    // New state for cart items
    const [cartItems, setCartItems] = useState<CartItem[]>([]);
    const [currentItemSubtotal, setCurrentItemSubtotal] = useState<number>(0);
    const [addingToCart, setAddingToCart] = useState(false);

    // Initialize form with default values and resolver
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema) as Resolver<FormValues>,
        defaultValues: {
            orderNumber: "",
            customerName: "",
            customerId: "",
            productType: "THREAD" as const,
            productId: "",
            sourceProductId: "",
            inventoryItemId: "",
            quantitySold: "",
            salePrice: "",
            itemDiscount: "",
            itemTax: "",
            discount: "",
            tax: "",
            totalSale: 0,
            orderDate: new Date(),
            deliveryDate: undefined,
            deliveryAddress: "",
            remarks: "",
            paymentMode: "CASH" as const,
            chequeNumber: "",
            bank: "",
            branch: "",
            paymentAmount: "0",
            paymentStatus: "PENDING" as const,
            updateInventory: true,
        },
    });

    // Get current values from form
    const currentProductType = form.watch("productType") as ProductType;
    const quantitySold = form.watch("quantitySold");
    const salePrice = form.watch("salePrice");
    const itemDiscount = form.watch("itemDiscount");
    const itemTax = form.watch("itemTax");

    // Calculate current item subtotal
    useEffect(() => {
        try {
            const quantity = safeParseInt(quantitySold); // Use integer for quantity
            const price = safeParseFloat(salePrice || "0");
            const discountValue = safeParseFloat(itemDiscount || "0");
            const taxValue = safeParseFloat(itemTax || "0");

            if (!quantity || !price) {
                setCurrentItemSubtotal(0);
                return;
            }

            // Calculate base amount
            const baseAmount = quantity * price;
            
            // Verify discount doesn't exceed base amount
            const validDiscount = Math.min(discountValue, baseAmount);
            
            // Apply discount
            let subtotal = baseAmount - validDiscount;
            
            // Apply tax
            if (taxValue > 0) {
                subtotal += taxValue;
            }

            // Round to 2 decimal places consistently to avoid floating point issues
            subtotal = parseFloat((Math.round((subtotal + Number.EPSILON) * 100) / 100).toFixed(2));

            setCurrentItemSubtotal(subtotal);
        } catch (error) {
            console.error("Error calculating item subtotal:", error);
            setCurrentItemSubtotal(0);
        }
    }, [quantitySold, salePrice, itemDiscount, itemTax]);

    // Enhanced calculateOrderTotals function with better precision for multiple products
    const calculateOrderTotals = useCallback(() => {
        if (cartItems.length === 0) {
            setCalculatedTotal(0);
            form.setValue("totalSale", 0);
            return;
        }

        // First calculate the sum of all item subtotals with proper precision handling
        let itemsTotal = cartItems.reduce((sum, item) => {
            // Parse the subtotal to ensure we're dealing with clean numbers
            const itemSubtotal = parseFloat(parseFloat(item.subtotal.toString()).toFixed(2));
            return sum + (isNaN(itemSubtotal) ? 0 : itemSubtotal);
        }, 0);
        
        // Round the items total to 2 decimal places
        itemsTotal = parseFloat(itemsTotal.toFixed(2));
        
        // Get order-level adjustments
        const orderDiscount = safeParseFloat(form.getValues("discount") || "0");
        const orderTax = safeParseFloat(form.getValues("tax") || "0");

        // Apply order-level discount first (never go below zero)
        let total = Math.max(0, itemsTotal - orderDiscount);
        
        // Then apply order-level tax
        if (orderTax > 0) {
            total += orderTax;
        }

        // Fix JavaScript floating point issues for money values
        // Add a small epsilon and round to 2 decimal places
        total = parseFloat((Math.round((total + Number.EPSILON) * 100) / 100).toFixed(2));
        
        // IMPORTANT: If we have items but total is zero or negative, set a minimum value
        // This fixes the "total must be greater than zero" issue
        if (cartItems.length > 0 && total <= 0) {
            total = 0.01; // Minimum value to avoid validation errors
        }

        // Update the total in both local state and form state
        setCalculatedTotal(total);
        form.setValue("totalSale", total);

        // Update payment amount based on payment status
        const paymentStatus = form.getValues("paymentStatus");
        const currentPaymentAmount = safeParseFloat(form.getValues("paymentAmount") || "0");
        
        if (paymentStatus === "PAID") {
            // For PAID status, always match the total exactly
            form.setValue("paymentAmount", total.toFixed(2));
        } else if (paymentStatus === "PARTIAL") {
            // For partial payment, ensure it doesn't exceed total
            if (currentPaymentAmount > total) {
                form.setValue("paymentAmount", total.toFixed(2));
            }
        } else if (paymentStatus === "PENDING") {
            // For pending, ensure payment amount is 0
            if (currentPaymentAmount > 0) {
                form.setValue("paymentAmount", "0");
            }
        }
    }, [cartItems, form]);

    // Extract the watch values for discount and tax to fix dependency issues
    const watchDiscount = form.watch("discount");
    const watchTax = form.watch("tax");

    // Recalculate totals when cart or order discounts/taxes change
    useEffect(() => {
        calculateOrderTotals();
    }, [cartItems, watchDiscount, watchTax, calculateOrderTotals]);

    // Add validation for quantity when the selected product or quantity changes
    useEffect(() => {
        // If we have a selected product with available quantity and a quantity entered
        if (selectedProduct && selectedProduct.available > 0 && quantitySold) {
            const qtyValue = safeParseInt(quantitySold);
            // If quantity entered is more than available, show an error
            if (qtyValue > selectedProduct.available) {
                form.setError("quantitySold", {
                    type: "manual",
                    message: `Maximum available quantity is ${selectedProduct.available}`,
                });
            } else {
                // Clear the error if quantity is valid
                form.clearErrors("quantitySold");
            }
        }
    }, [selectedProduct, quantitySold, form]);

    // Get current form values for watching and calculations
    const currentValues = form.watch();

    // Auto-calculate total sale when quantity or price changes
    useEffect(() => {
        try {
            const quantity = currentValues.quantitySold
                ? parseFloat(currentValues.quantitySold)
                : 0;
            const price = currentValues.salePrice
                ? parseFloat(currentValues.salePrice)
                : 0;
            const discountValue = currentValues.discount
                ? parseFloat(currentValues.discount)
                : 0;
            const taxValue = currentValues.tax
                ? parseFloat(currentValues.tax)
                : 0;

            let subtotal = quantity * price;
            if (discountValue > 0) {
                subtotal -= discountValue;
            }
            if (taxValue > 0) {
                subtotal += taxValue;
            }

            setCalculatedTotal(subtotal);
            form.setValue("totalSale", subtotal);
        } catch (error) {
            console.error("Error calculating total:", error);
            setCalculatedTotal(0);
            form.setValue("totalSale", 0);
        }
    }, [
        currentValues.quantitySold,
        currentValues.salePrice,
        currentValues.discount,
        currentValues.tax,
        form,
    ]);

    // Fetch vendors on mount
    useEffect(() => {
        async function fetchVendors() {
            try {
                const response = await fetch("/api/vendors");
                const data = await response.json();
                if (Array.isArray(data)) {
                    setVendors(
                        data.map((vendor: Vendor) => ({
                            id: vendor.id,
                            name: vendor.name,
                        })),
                    );
                } else if (data && Array.isArray(data.vendors)) {
                    // Handle case where data is wrapped in an object
                    setVendors(
                        data.vendors.map((vendor: Vendor) => ({
                            id: vendor.id,
                            name: vendor.name,
                        })),
                    );
                } else {
                    // Handle unexpected data format
                    console.error("Unexpected vendors data format:", data);
                    setVendors([]);
                }
            } catch (error) {
                console.error("Error fetching vendors:", error);
                setVendors([]);
            }
        }

        if (open) {
            fetchVendors();
        }
    }, [open]);

    // Fetch available products when product type changes or form opens
    useEffect(() => {
        async function fetchProducts() {
            setLoadingProducts(true);

            try {
                // Initialize arrays to store product data
                let threadData: ThreadApiItem[] = [];
                let fabricData: FabricApiItem[] = [];

                // Common fetch options
                const fetchOptions = {
                    headers: { "Cache-Control": "no-cache" },
                };

                // Get the current product type from form
                const currentProductType = form.getValues("productType");

                // Direct inventory API approach - get thread inventory items
                if (currentProductType === "THREAD" || open) {
                    try {
                        // Fetch thread purchases that are available for sale
                        const threadResponse = await fetch(
                            "/api/inventory?type=THREAD&inStock=true&distinct=true",
                            fetchOptions,
                        );
                        if (threadResponse.ok) {
                            const threadResult = await threadResponse.json();

                            if (
                                Array.isArray(threadResult) &&
                                threadResult.length > 0
                            ) {
                                console.log(
                                    `Thread API returned ${threadResult.length} thread items`,
                                );

                                // Process thread purchases data
                                threadData = threadResult.map(
                                    (thread: ThreadPurchaseItem) => ({
                                        id: thread.id,
                                        threadType: thread.threadType,
                                        colorStatus: thread.colorStatus,
                                        color: thread.color,
                                        quantity: thread.quantity,
                                        vendorId: thread.vendorId,
                                        vendorName: thread.vendor?.name,
                                        unitPrice:
                                            typeof thread.unitPrice === "number"
                                                ? thread.unitPrice
                                                : typeof thread.unitPrice ===
                                                    "string"
                                                  ? parseFloat(thread.unitPrice)
                                                  : 0,
                                        threadPurchaseId: thread.id, // This is crucial - store the actual ThreadPurchase ID
                                    }),
                                );
                            }
                        }

                        // Also fetch inventory items
                        const response = await fetch(
                            "/api/inventory?type=THREAD&inStock=true&distinct=true",
                            fetchOptions,
                        );
                        if (response.ok) {
                            const result = await response.json();

                            if (
                                Array.isArray(result.items) &&
                                result.items.length > 0
                            ) {
                                console.log(
                                    `Inventory API returned ${result.items.length} thread items`,
                                );

                                // Map inventory items and merge with thread purchase data if possible
                                const inventoryThreadData = result.items
                                    .filter(
                                        (item: InventoryItem) =>
                                            item.productType === "THREAD" &&
                                            item.currentQuantity > 0,
                                    )
                                    .map((item: InventoryItem) => {
                                        // Try to find corresponding thread purchase data
                                        const threadMatch = threadData.find(
                                            (t) =>
                                                t.threadType ===
                                                (item.threadType?.name ||
                                                    item.description ||
                                                    item.itemCode),
                                        );

                                        return {
                                            id: threadMatch?.id || item.id,
                                            threadType:
                                                item.threadType?.name ||
                                                item.description ||
                                                item.itemCode,
                                            colorStatus: "RAW", // Default value
                                            color: null,
                                            quantity: item.currentQuantity,
                                            inventoryItemId: item.id,
                                            availableInInventory: true,
                                            unitPrice:
                                                typeof item.salePrice ===
                                                "number"
                                                    ? item.salePrice
                                                    : typeof item.salePrice ===
                                                        "string"
                                                      ? parseFloat(
                                                            item.salePrice,
                                                        )
                                                      : 0,
                                            inventory: {
                                                id: item.id,
                                                itemCode: item.itemCode,
                                                currentQuantity:
                                                    item.currentQuantity,
                                                costPerUnit:
                                                    typeof item.costPerUnit ===
                                                    "number"
                                                        ? item.costPerUnit
                                                        : typeof item.costPerUnit ===
                                                            "string"
                                                          ? parseFloat(
                                                                item.costPerUnit,
                                                            )
                                                          : 0,
                                                salePrice:
                                                    typeof item.salePrice ===
                                                    "number"
                                                        ? item.salePrice
                                                        : typeof item.salePrice ===
                                                            "string"
                                                          ? parseFloat(
                                                                item.salePrice,
                                                            )
                                                          : 0,
                                            },
                                            threadPurchaseId: threadMatch?.id, // Use thread purchase ID if available
                                        };
                                    });

                                // Merge inventory thread data with existing thread data
                                if (inventoryThreadData.length > 0) {
                                    threadData = [
                                        ...threadData,
                                        ...inventoryThreadData.filter(
                                            (it: ThreadApiItem) =>
                                                !threadData.some(
                                                    (t) => t.id === it.id,
                                                ),
                                        ),
                                    ];
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("Thread data fetching failed:", e);
                    }
                }

                // Get fabric items - ensure this runs for FABRIC type or on initial open
                if (currentProductType === "FABRIC" || open) {
                    try {
                        // First fetch fabric production records
                        const fabricProdResponse = await fetch(
                            "/api/inventory?type=FABRIC&inStock=true&distinct=true",
                            fetchOptions,
                        );
                        if (fabricProdResponse.ok) {
                            const fabricResult =
                                await fabricProdResponse.json();

                            if (
                                fabricResult &&
                                Array.isArray(fabricResult.data) &&
                                fabricResult.data.length > 0
                            ) {
                                console.log(
                                    `Fabric production API returned ${fabricResult.data.length} fabric items`,
                                );

                                // Process fabric production data
                                fabricData = fabricResult.data.map(
                                    (fabric: FabricProductionItem) => ({
                                        id: fabric.id,
                                        fabricType: fabric.fabricType,
                                        dimensions: fabric.dimensions || "",
                                        quantity: fabric.quantityProduced,
                                        calculatedCost:
                                            typeof fabric.totalCost === "number"
                                                ? fabric.totalCost /
                                                  fabric.quantityProduced
                                                : parseFloat(
                                                      String(fabric.totalCost),
                                                  ) / fabric.quantityProduced,
                                        fabricProductionId: fabric.id, // This is crucial - store the actual FabricProduction ID
                                    }),
                                );
                            }
                        }

                        // Also fetch from inventory
                        const response = await fetch(
                            "/api/inventory?type=FABRIC&inStock=true&distinct=true",
                            fetchOptions,
                        );

                        if (response.ok) {
                            const result = await response.json();

                            if (
                                Array.isArray(result.items) &&
                                result.items.length > 0
                            ) {
                                console.log(
                                    `Inventory API returned ${result.items.length} fabric items`,
                                );

                                // Map inventory items and merge with fabric production data if possible
                                const inventoryFabricData = result.items
                                    .filter(
                                        (item: InventoryItem) =>
                                            item.productType === "FABRIC" &&
                                            item.currentQuantity > 0,
                                    )
                                    .map((item: InventoryItem) => {
                                        // Try to find corresponding fabric production data
                                        const fabricMatch = fabricData.find(
                                            (f) =>
                                                f.fabricType ===
                                                (item.fabricType?.name ||
                                                    item.description ||
                                                    item.itemCode),
                                        );

                                        return {
                                            id: fabricMatch?.id || item.id,
                                            fabricType:
                                                item.fabricType?.name ||
                                                item.description ||
                                                item.itemCode,
                                            dimensions: "",
                                            quantity: item.currentQuantity,
                                            inventoryItemId: item.id,
                                            availableInInventory: true,
                                            calculatedCost:
                                                typeof item.salePrice ===
                                                "number"
                                                    ? item.salePrice
                                                    : typeof item.salePrice ===
                                                        "string"
                                                      ? parseFloat(
                                                            item.salePrice,
                                                        )
                                                      : 0,
                                            inventory: {
                                                id: item.id,
                                                itemCode: item.itemCode,
                                                currentQuantity:
                                                    item.currentQuantity,
                                                costPerUnit:
                                                    typeof item.costPerUnit ===
                                                    "number"
                                                        ? item.costPerUnit
                                                        : typeof item.costPerUnit ===
                                                            "string"
                                                          ? parseFloat(
                                                                item.costPerUnit,
                                                            )
                                                          : 0,
                                                salePrice:
                                                    typeof item.salePrice ===
                                                    "number"
                                                        ? item.salePrice
                                                        : typeof item.salePrice ===
                                                            "string"
                                                          ? parseFloat(
                                                                item.salePrice,
                                                            )
                                                          : 0,
                                            },
                                            fabricProductionId: fabricMatch?.id, // Use fabric production ID if available
                                        };
                                    });

                                // Merge inventory fabric data with existing fabric data
                                if (inventoryFabricData.length > 0) {
                                    fabricData = [
                                        ...fabricData,
                                        ...inventoryFabricData.filter(
                                            (it: FabricApiItem) =>
                                                !fabricData.some(
                                                    (f) => f.id === it.id,
                                                ),
                                        ),
                                    ];
                                }
                            }
                        }
                    } catch (e) {
                        console.error("Fabric data fetching failed:", e);
                        toast.error("Failed to load fabric inventory data");
                    }
                }

                // Map API data to ProductItems for display with stronger null checks
                const threadItems: ProductItem[] = threadData.map((item) => ({
                    id: item.id || 0,
                    type: "THREAD",
                    name: `${item.threadType || "Thread"} - ${item.colorStatus === "COLORED" && item.color ? item.color : "Raw"}`,
                    vendorId: item.vendorId || undefined,
                    vendorName: item.vendorName || undefined,
                    available: item.quantity || 0,
                    unitPrice: item.unitPrice || 0,
                    inventoryItemId: item.inventoryItemId || undefined,
                    availableInInventory: !!item.inventoryItemId,
                    inventoryItem: item.inventory || null,
                    threadPurchaseId: item.threadPurchaseId || item.id, // Fallback to item.id if threadPurchaseId not set
                }));

                const fabricItems: ProductItem[] = fabricData.map((item) => ({
                    id: item.id || 0,
                    type: "FABRIC",
                    name: `${item.fabricType || "Fabric"}${item.dimensions ? ` - ${item.dimensions}` : ""}`,
                    available: item.quantity || 0,
                    unitPrice: item.calculatedCost || 0,
                    inventoryItemId: item.inventoryItemId || undefined,
                    availableInInventory: !!item.inventoryItemId,
                    inventoryItem: item.inventory || null,
                    fabricProductionId: item.fabricProductionId || item.id, // Fallback to item.id if fabricProductionId not set
                }));

                console.log(
                    `Setting products: ${threadItems.length} thread items, ${fabricItems.length} fabric items`,
                );

                // Set the products state with the mapped data
                setProductOptions({
                    thread: threadItems,
                    fabric: fabricItems,
                });

                console.log(
                    `Loaded ${threadItems.length} thread products and ${fabricItems.length} fabric products`,
                );
            } catch (error) {
                console.error("Error fetching products:", error);
                toast.error("Failed to load product data. Please try again.");
            } finally {
                setLoadingProducts(false);
            }
        }

        // Fetch products when component mounts or product type changes
        if (open) {
            fetchProducts();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, form, toast, currentValues.productType]);

    // Update form when a product is selected
    useEffect(() => {
        if (selectedProduct) {
            // Auto-fill unit price if available
            if (selectedProduct.unitPrice) {
                form.setValue(
                    "salePrice",
                    selectedProduct.unitPrice.toString(),
                );
            }

            // Set the inventory item ID if available
            if (selectedProduct.inventoryItemId) {
                form.setValue(
                    "inventoryItemId",
                    selectedProduct.inventoryItemId.toString(),
                );
            } else {
                form.setValue("inventoryItemId", "");
            }
        }
    }, [selectedProduct, form]);

    // Validate payment fields when payment status changes
    useEffect(() => {
        const paymentStatus = form.watch("paymentStatus");
        const paymentMode = form.watch("paymentMode");
        const paymentAmount = form.watch("paymentAmount");
        
        // When status changes to PAID, update amount to full total
        if (paymentStatus === "PAID") {
            // Only set if not already set by user
            if (!paymentAmount || parseFloat(paymentAmount) === 0) {
                form.setValue("paymentAmount", calculatedTotal.toString());
            }
            
            // Ensure payment mode is set
            if (!paymentMode) {
                form.setValue("paymentMode", "CASH");
            }
        } 
        // For PARTIAL, offer a default 50% if not set
        else if (paymentStatus === "PARTIAL") {
            if (!paymentAmount || parseFloat(paymentAmount) === 0) {
                const halfTotal = Math.round((calculatedTotal * 0.5) * 100) / 100;
                form.setValue("paymentAmount", halfTotal.toString());
            }
            
            // Ensure payment mode is set
            if (!paymentMode) {
                form.setValue("paymentMode", "CASH");
            }
        }
        // For PENDING, reset payment amount 
        else if (paymentStatus === "PENDING") {
            form.setValue("paymentAmount", "0");
        }
    }, [form.watch("paymentStatus"), calculatedTotal, form]);

    // Update the payment amount for validation when total changes
    useEffect(() => {
        const paymentStatus = form.watch("paymentStatus"); 
        const paymentAmount = safeParseFloat(form.watch("paymentAmount"));
        
        // Only auto-adjust if payment status is PAID
        if (paymentStatus === "PAID" && paymentAmount !== calculatedTotal) {
            form.setValue("paymentAmount", calculatedTotal.toString());
        }
        
        // Validate that payment amount doesn't exceed total
        if (paymentAmount > calculatedTotal) {
            form.setValue("paymentAmount", calculatedTotal.toString());
        }
    }, [calculatedTotal, form]);

    // Wait for component to be ready before allowing submission
    const [isReady, setIsReady] = useState(false);
    useEffect(() => {
        // Mark the form as ready after initial load
        setIsReady(true);
    }, []);

    // Add new function to format all currency amounts consistently
    const formatAmount = (value: number | string): string => {
        if (typeof value === 'string') {
            value = parseFloat(value) || 0;
        }
        // Add a small epsilon to prevent floating point issues
        return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
    };

    // Enhance the onSubmit function to handle the case better
    const onSubmit = async (data: FormValues) => {
        setLoading(true);
        
        try {
            // Basic validations
            if (cartItems.length === 0) {
                toast.error("Please add at least one product to the cart");
                setLoading(false);
                return;
            }

            // Validate customer name
            if (!data.customerName.trim()) {
                toast.error("Customer name is required");
                form.setError("customerName", { 
                    type: "manual", 
                    message: "Customer name is required" 
                });
                setLoading(false);
                return;
            }
            
            // Force recalculation of total
            calculateOrderTotals();
            
            // Get the latest calculated total
            let finalTotal = calculatedTotal;
            
            // Extra safeguard for zero total with items in cart
            if (finalTotal <= 0 && cartItems.length > 0) {
                // Check if any item has a valid subtotal
                const hasValidItems = cartItems.some(item => parseFloat(item.subtotal.toString()) > 0);
                
                if (hasValidItems) {
                    // Recalculate total manually from item subtotals
                    const manualTotal = cartItems.reduce((sum, item) => {
                        return sum + parseFloat(parseFloat(item.subtotal.toString()).toFixed(2));
                    }, 0);
                    
                    // Ensure we have a positive value
                    finalTotal = Math.max(0.01, manualTotal);
                    setCalculatedTotal(finalTotal);
                    form.setValue("totalSale", finalTotal);
                } else {
                    toast.error("Total sale amount must be greater than zero");
                    setLoading(false);
                    return;
                }
            }
            
            // Format the final total safely for consistency
            finalTotal = parseFloat(finalTotal.toFixed(2));

            // Validate payment information
            if ((data.paymentStatus === "PAID" || data.paymentStatus === "PARTIAL")) {
                const paymentAmount = safeParseFloat(data.paymentAmount || "0");
                
                if (!paymentAmount || paymentAmount <= 0) {
                    toast.error(`Payment amount is required for ${data.paymentStatus.toLowerCase()} status`);
                    form.setError("paymentAmount", { 
                        type: "manual", 
                        message: "Payment amount is required" 
                    });
                    setLoading(false);
                    return;
                }
                
                // For PAID status, ensure the amount matches the total
                if (data.paymentStatus === "PAID") {
                    // Allow a small threshold for floating point imprecision
                    if (Math.abs(paymentAmount - finalTotal) > 0.01) {
                        form.setValue("paymentAmount", finalTotal.toFixed(2));
                    }
                }
                
                // Ensure payment doesn't exceed the total (with small threshold)
                if (paymentAmount > finalTotal + 0.01) {
                    toast.error("Payment amount cannot exceed total sale amount");
                    form.setValue("paymentAmount", finalTotal.toFixed(2));
                    setLoading(false);
                    return;
                }
            }

            // Check cheque details when payment mode is CHEQUE
            if (data.paymentMode === "CHEQUE") {
                if (!data.chequeNumber) {
                    toast.error("Cheque number is required for cheque payments");
                    form.setError("chequeNumber", { 
                        type: "manual", 
                        message: "Cheque number is required" 
                    });
                    setLoading(false);
                    return;
                }
                
                if (!data.bank) {
                    toast.error("Bank name is required for cheque payments");
                    form.setError("bank", { 
                        type: "manual", 
                        message: "Bank name is required" 
                    });
                    setLoading(false);
                    return;
                }
            }
            
            // Format data for submission
            const submissionData: SalesSubmissionData = {
                customerName: data.customerName.trim(),
                customerId: data.customerId ? parseInt(data.customerId) : undefined,
                orderDate: data.orderDate,
                deliveryDate: data.deliveryDate,
                deliveryAddress: data.deliveryAddress,
                remarks: data.remarks,
                paymentMode: data.paymentMode,
                chequeStatus: data.paymentMode === "CHEQUE" ? data.chequeStatus : undefined,
                paymentStatus: data.paymentStatus,
                orderNumber: data.orderNumber ? data.orderNumber.trim() : "",
                updateInventory: data.updateInventory,
                chequeNumber: data.paymentMode === "CHEQUE" ? data.chequeNumber : undefined,
                bank: data.paymentMode === "CHEQUE" ? data.bank : undefined,
                branch: data.paymentMode === "CHEQUE" ? data.branch : undefined,
                paymentAmount: (data.paymentStatus === "PAID" || data.paymentStatus === "PARTIAL") && data.paymentAmount ? 
                    parseFloat(parseFloat(data.paymentAmount).toFixed(2)) : undefined,
                discount: safeParseFloat(data.discount || "0"),
                tax: safeParseFloat(data.tax || "0"),
                totalSale: finalTotal,
                items: cartItems.map(item => ({
                    productType: item.productType,
                    productId: item.productId,
                    threadPurchaseId: item.productType === ProductType.THREAD ? item.threadPurchaseId : null,
                    fabricProductionId: item.productType === ProductType.FABRIC ? item.fabricProductionId : null,
                    quantitySold: item.quantity,
                    unitPrice: parseFloat(parseFloat(item.unitPrice.toString()).toFixed(2)),
                    discount: parseFloat(parseFloat(item.discount.toString()).toFixed(2)),
                    tax: parseFloat(parseFloat(item.tax.toString()).toFixed(2)),
                    subtotal: parseFloat(parseFloat(item.subtotal.toString()).toFixed(2)),
                    inventoryItemId: item.inventoryItemId
                }))
            };

            // Log submission data
            console.log("Submitting sales data:", JSON.stringify(submissionData, null, 2));

            // Submit the data
            const response = await fetch("/api/sales/submit", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(submissionData),
            });

            if (!response.ok) {
                const responseText = await response.text();
                
                try {
                    // Check if the response is HTML (indicating a server error page)
                    if (responseText.includes('<!DOCTYPE html>') || responseText.includes('<html>')) {
                        toast.error("Server error: The server returned an HTML error page instead of JSON");
                        console.error("Server returned HTML instead of JSON:", responseText.substring(0, 200) + "...");
                    } else {
                        // Try to parse as JSON
                        const errorData = JSON.parse(responseText);
                        toast.error(errorData.details || errorData.error || "Failed to create sale");
                    }
                } catch (parseError) {
                    toast.error(`Failed to create sale: ${responseText || "Server error"}`);
                }
                
                setLoading(false);
                return;
            }

            // Handle successful response
            let responseData;
            try {
                const responseText = await response.text();
                if (responseText.includes('<!DOCTYPE html>') || responseText.includes('<html>')) {
                    toast.error("Server error: The server returned an HTML error page");
                    console.error("Server returned HTML instead of JSON:", responseText.substring(0, 200) + "...");
                    setLoading(false);
                    return;
                }
                responseData = JSON.parse(responseText);
            } catch (parseError) {
                toast.error("Error parsing server response");
                console.error("Response parse error:", parseError);
                setLoading(false);
                return;
            }

            // Success!
            if (responseData?.success) {
                // Reset form
                form.reset();
                setSelectedProduct(null);
                setCartItems([]);
                setCalculatedTotal(0);

                // Show success message
                toast.success(`Sale Created: Order #${responseData.salesOrder.orderNumber}`);
                setOpen(false);

                // Call callback if provided
                if (onSaleCreated) {
                    onSaleCreated();
                }
            } else {
                throw new Error(responseData.error || "Unknown error occurred");
            }
        } catch (error) {
            console.error("Error creating sale:", error);
            toast.error(error instanceof Error ? `Failed to create sale: ${error.message}` : "Failed to create sale");
        } finally {
            setLoading(false);
        }
    };

    // Enhance the handleProductSelect function with better validation
    const handleProductSelect = (productId: string) => {
        const productType = form.getValues("productType");
        const productList =
            productType === "THREAD"
                ? productOptions.thread
                : productOptions.fabric;

        // Convert productId to number for comparison
        const numericProductId = parseInt(productId);
        
        // Clear any existing errors first
        form.clearErrors("quantitySold");
        form.clearErrors("salePrice");
        form.clearErrors("itemDiscount");
        form.clearErrors("itemTax");

        console.log(
            `Selecting product with ID ${productId} from ${productType} products`,
        );

        const product = productList.find((p) => p.id === numericProductId);

        if (product) {
            console.log(`Found product:`, product);
            setSelectedProduct(product);

            // Set the sale price based on the product's price
            if (product.unitPrice) {
                // Round to 2 decimal places for consistency
                const formattedPrice = Math.round(product.unitPrice * 100) / 100;
                form.setValue("salePrice", formattedPrice.toString());
            } else if (
                product.type === "FABRIC" &&
                "calculatedCost" in product
            ) {
                // For fabric, use calculatedCost as a fallback
                const fabricProduct = product as unknown as FabricApiItem;
                if (fabricProduct.calculatedCost) {
                    const formattedPrice = Math.round(fabricProduct.calculatedCost * 100) / 100;
                    form.setValue("salePrice", formattedPrice.toString());
                }
            }

            // Reset discount and tax to zero
            form.setValue("itemDiscount", "0");
            form.setValue("itemTax", "0");

            // Set the inventory item ID if available
            if (product.inventoryItemId) {
                form.setValue(
                    "inventoryItemId",
                    product.inventoryItemId.toString(),
                );
                console.log(
                    `Setting inventoryItemId to ${product.inventoryItemId}`,
                );
            } else if (product.inventoryItem?.id) {
                form.setValue(
                    "inventoryItemId",
                    product.inventoryItem.id.toString(),
                );
                console.log(
                    `Setting inventoryItemId from inventoryItem to ${product.inventoryItem.id}`,
                );
            } else {
                form.setValue("inventoryItemId", "");
                console.log("No inventory ID available for this product");
            }

            // Store the relevant product-specific ID
            if (product.type === "THREAD" && product.threadPurchaseId) {
                form.setValue(
                    "sourceProductId",
                    product.threadPurchaseId.toString(),
                );
            } else if (
                product.type === "FABRIC" &&
                product.fabricProductionId
            ) {
                form.setValue(
                    "sourceProductId",
                    product.fabricProductionId.toString(),
                );
            }

            // Update available quantity information and set default quantity
            if (product.available > 0) {
                // Product is available in inventory
                form.setValue("updateInventory", true);

                // Always start with a quantity of 1 when selecting a new product
                form.setValue("quantitySold", "1");

                // Update the current item subtotal based on the new values
                const price = product.unitPrice || 0;
                const quantity = 1;
                const subtotal = price * quantity;
                setCurrentItemSubtotal(subtotal);
            } else {
                // Not available in inventory
                form.setValue("updateInventory", false);
                form.setValue("quantitySold", "0");
                toast.error("This product has no available quantity");
            }
        } else {
            console.warn(
                `Product with ID ${productId} not found in available ${productType} products`,
            );

            // Clear fields when product not found
            form.setValue("salePrice", "");
            form.setValue("quantitySold", "");
            form.setValue("itemDiscount", "");
            form.setValue("itemTax", "");
            setCurrentItemSubtotal(0);
            setSelectedProduct(null);
            form.setValue("inventoryItemId", "");
            form.setValue("sourceProductId", "");
        }
    };

    // Add a new useEffect for quantity validation when it changes using the helper
    useEffect(() => {
        const subscription = form.watch((value, { name }) => {
            // Check quantity against available stock when it changes
            if (name === "quantitySold" && selectedProduct) {
                if (isQuantityTooLarge(value.quantitySold, selectedProduct.available)) {
                    form.setError("quantitySold", {
                        type: "manual",
                        message: `Maximum available quantity is ${selectedProduct.available}`,
                    });
                }
            }
        });

        return () => subscription.unsubscribe();
    }, [form, selectedProduct]);

    // Improve the addItemToCart function with better calculation precision and duplicate handling
    const addItemToCart = () => {
        setAddingToCart(true);
        try {
            if (!selectedProduct) {
                toast.error("Please select a product");
                return;
            }

            // Validate quantity with better error messages
            const quantity = safeParseInt(form.watch("quantitySold"));
            if (!quantity || quantity <= 0) {
                toast.error("Please enter a valid quantity greater than zero");
                form.setError("quantitySold", { 
                    type: "manual", 
                    message: "Quantity must be greater than zero" 
                });
                return;
            }

            // Check if this product is already in the cart
            const existingProductIndex = cartItems.findIndex(item => 
                item.productType === selectedProduct.type &&
                item.productId === selectedProduct.id
            );

            if (existingProductIndex !== -1) {
                // If product is already in cart, ask user if they want to update quantity instead
                if (confirm(`${selectedProduct.name} is already in the cart. Do you want to update the quantity instead?`)) {
                    // Get current cart items
                    const updatedCartItems = [...cartItems];
                    const existingItem = updatedCartItems[existingProductIndex];
                    
                    // Validate total quantity doesn't exceed available stock
                    const newTotalQuantity = existingItem.quantity + quantity;
                    
                    if (newTotalQuantity > selectedProduct.available) {
                        toast.error(`Cannot exceed available quantity of ${selectedProduct.available}`);
                        form.setError("quantitySold", {
                            type: "manual",
                            message: `Maximum available: ${selectedProduct.available}`
                        });
                        setAddingToCart(false);
                        return;
                    }
                    
                    // Update quantity and recalculate values
                    const price = safeParseFloat(form.watch("salePrice") || "0");
                    const discount = safeParseFloat(form.watch("itemDiscount") || "0");
                    const tax = safeParseFloat(form.watch("itemTax") || "0");
                    
                    const baseAmount = newTotalQuantity * price;
                    const afterDiscount = Math.max(0, baseAmount - discount);
                    const subtotal = afterDiscount + tax;
                    const finalSubtotal = parseFloat((Math.round((subtotal + Number.EPSILON) * 100) / 100).toFixed(2));
                    
                    // Update the item in the cart
                    updatedCartItems[existingProductIndex] = {
                        ...existingItem,
                        quantity: newTotalQuantity,
                        unitPrice: parseFloat(price.toFixed(2)),
                        discount: parseFloat(discount.toFixed(2)),
                        tax: parseFloat(tax.toFixed(2)),
                        subtotal: finalSubtotal
                    };
                    
                    // Update cart and show success message
                    setCartItems(updatedCartItems);
                    toast.success(`Updated ${selectedProduct.name} quantity to ${newTotalQuantity}`);
                    
                    // Reset form fields
                    form.setValue("productId", "");
                    form.setValue("quantitySold", "");
                    form.setValue("salePrice", "");
                    form.setValue("itemDiscount", "");
                    form.setValue("itemTax", "");
                    form.setValue("sourceProductId", "");
                    form.setValue("inventoryItemId", "");
                    setSelectedProduct(null);
                    setCurrentItemSubtotal(0);
                    
                    // Recalculate order totals
                    calculateOrderTotals();
                    setAddingToCart(false);
                    return;
                }
            }

            if (quantity > selectedProduct.available) {
                toast.error(`Cannot exceed available quantity of ${selectedProduct.available}`);
                form.setError("quantitySold", {
                    type: "manual",
                    message: `Maximum available: ${selectedProduct.available}`
                });
                return;
            }

            // Validate price
            const price = safeParseFloat(form.watch("salePrice") || "0");
            if (!price || price <= 0) {
                toast.error("Please enter a valid price greater than zero");
                form.setError("salePrice", { 
                    type: "manual", 
                    message: "Price must be greater than zero" 
                });
                return;
            }

            // Get discount and tax values with validation
            const discount = safeParseFloat(form.watch("itemDiscount") || "0");
            if (discount < 0) {
                toast.error("Discount cannot be negative");
                form.setError("itemDiscount", { 
                    type: "manual", 
                    message: "Discount cannot be negative" 
                });
                return;
            }

            const tax = safeParseFloat(form.watch("itemTax") || "0");
            if (tax < 0) {
                toast.error("Tax cannot be negative");
                form.setError("itemTax", { 
                    type: "manual", 
                    message: "Tax cannot be negative" 
                });
                return;
            }

            // Calculate final subtotal with precise math
            // First calculate the base amount
            const baseAmount = quantity * price;
            
            // Validate discount doesn't exceed base amount
            if (discount > baseAmount) {
                toast.error("Discount cannot exceed the item base amount");
                form.setError("itemDiscount", {
                    type: "manual",
                    message: `Maximum discount: ${formatCurrency(baseAmount)}`
                });
                return;
            }

            // Calculate the amount after discount
            const afterDiscount = Math.max(0, baseAmount - discount);
            
            // Add tax to get final subtotal
            const subtotal = afterDiscount + tax;
            
            // Round to 2 decimal places for consistency
            const finalSubtotal = parseFloat((Math.round((subtotal + Number.EPSILON) * 100) / 100).toFixed(2));

            // Create the cart item with properly calculated values
            const newItem: CartItem = {
                productId: selectedProduct.id,
                productType: selectedProduct.type as ProductType,
                name: selectedProduct.name,
                quantity: quantity,
                unitPrice: parseFloat(price.toFixed(2)),
                discount: parseFloat(discount.toFixed(2)),
                tax: parseFloat(tax.toFixed(2)),
                subtotal: finalSubtotal,
                inventoryItemId: selectedProduct.inventoryItemId,
                threadPurchaseId: selectedProduct.type === "THREAD" ? selectedProduct.threadPurchaseId : undefined,
                fabricProductionId: selectedProduct.type === "FABRIC" ? selectedProduct.fabricProductionId : undefined,
                availableQuantity: selectedProduct.available
            };

            // Add to cart
            setCartItems(prevItems => [...prevItems, newItem]);
            toast.success(`Added ${newItem.name} to cart`);

            // Reset product selection fields
            form.setValue("productId", "");
            form.setValue("quantitySold", "");
            form.setValue("salePrice", "");
            form.setValue("itemDiscount", "");
            form.setValue("itemTax", "");
            form.setValue("sourceProductId", "");
            form.setValue("inventoryItemId", "");
            setSelectedProduct(null);
            setCurrentItemSubtotal(0);
            
            // Recalculate order totals after adding item
            calculateOrderTotals();
        } catch (error) {
            console.error("Error adding item to cart:", error);
            toast.error("Failed to add item to cart");
        } finally {
            setAddingToCart(false);
        }
    };

    // Function to remove item from cart with better state handling
    const removeItemFromCart = (index: number) => {
        // Get the item being removed for the toast message
        const itemToRemove = cartItems[index];
        
        // Create a new array without the removed item
        const updatedCartItems = cartItems.filter((_, i) => i !== index);
        
        // Update the cart items state
        setCartItems(updatedCartItems);
        
        // Show success message with the product name
        toast.success(`Removed ${itemToRemove?.name || 'item'} from cart`);
        
        // If cart is now empty, reset the total
        if (updatedCartItems.length === 0) {
            setCalculatedTotal(0);
            form.setValue("totalSale", 0);
            
            // Also reset payment fields if cart is empty
            if (form.getValues("paymentStatus") === "PAID" || form.getValues("paymentStatus") === "PARTIAL") {
                form.setValue("paymentAmount", "0");
            }
        } else {
            // Recalculate totals after removing item
            calculateOrderTotals();
        }
    };

    // Function to edit an item in the cart
    const editCartItem = (index: number) => {
        const itemToEdit = cartItems[index];
        if (!itemToEdit) return;
        
        // Find the product type in options
        const productList = itemToEdit.productType === "THREAD" 
            ? productOptions.thread 
            : productOptions.fabric;
            
        // Find the product in the list
        const productToEdit = productList.find(p => p.id === itemToEdit.productId);
        
        if (productToEdit) {
            // Set form values from the cart item
            form.setValue("productType", itemToEdit.productType);
            form.setValue("productId", itemToEdit.productId.toString());
            form.setValue("quantitySold", itemToEdit.quantity.toString());
            form.setValue("salePrice", itemToEdit.unitPrice.toString());
            form.setValue("itemDiscount", itemToEdit.discount.toString());
            form.setValue("itemTax", itemToEdit.tax.toString());
            
            // Set inventory ID if available
            if (itemToEdit.inventoryItemId) {
                form.setValue("inventoryItemId", itemToEdit.inventoryItemId.toString());
            }
            
            // Set source product ID based on type
            if (itemToEdit.productType === "THREAD" && itemToEdit.threadPurchaseId) {
                form.setValue("sourceProductId", itemToEdit.threadPurchaseId.toString());
            } else if (itemToEdit.productType === "FABRIC" && itemToEdit.fabricProductionId) {
                form.setValue("sourceProductId", itemToEdit.fabricProductionId.toString());
            }
            
            // Set the selected product
            setSelectedProduct(productToEdit);
            
            // Update the current item subtotal
            setCurrentItemSubtotal(itemToEdit.subtotal);
            
            // Remove the item from cart
            removeItemFromCart(index);
            
            // Scroll to the product selection area
            document.querySelector(".rounded-lg.border.bg-muted\\/20.p-3")?.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center'
            });
            
            toast.info(`Editing ${itemToEdit.name} - make changes and add to cart again`);
        } else {
            toast.error("Could not find product details for editing");
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {triggerButton || <Button variant="default">New Sale</Button>}
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[800px]">
                <DialogHeader className="bg-background sticky top-0 z-10 pt-4 pb-2">
                    <DialogTitle>Record New Sale</DialogTitle>
                    <DialogDescription>
                        Create a new sales order and record payment details
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(onSubmit)}
                        className="space-y-4 pb-4"
                    >
                        {/* Customer Information Section */}
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                {/* Customer Name */}
                                <FormField
                                    control={form.control}
                                    name="customerName"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Customer Name</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="Enter customer name"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Customer ID (optional) */}
                                <FormField
                                    control={form.control}
                                    name="customerId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                Select Existing Customer
                                                (Optional)
                                            </FormLabel>
                                            <Select
                                                onValueChange={field.onChange}
                                                value={field.value}
                                            >
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select customer" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {vendors.map((vendor) => (
                                                        <SelectItem
                                                            key={vendor.id}
                                                            value={vendor.id.toString()}
                                                        >
                                                            {vendor.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormDescription className="text-xs">
                                                If selected, customer name will
                                                be updated.
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            </div>

                        {/* Product Cart Section */}
                        <div className="rounded-lg border p-4">
                            <div className="mb-4 flex items-center justify-between">
                                <h3 className="flex items-center gap-1.5 text-base font-medium">
                                    <ShoppingCart className="h-4 w-4" />
                                    Cart Items ({cartItems.length})
                                </h3>
                                <div className="text-sm">
                                    {cartItems.length === 0 ? (
                                        <span className="text-muted-foreground">No items in cart</span>
                                    ) : (
                                        <span className="font-medium">
                                            Total: {formatCurrency(calculatedTotal)}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Cart Items Section with improved calculation display */}
                            {cartItems.length > 0 && (
                                <div className="mb-4 max-h-[200px] overflow-y-auto rounded border">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/50 text-muted-foreground sticky top-0">
                                            <tr className="border-b">
                                                <th className="px-3 py-2 text-left">Product</th>
                                                <th className="px-3 py-2 text-center">Qty</th>
                                                <th className="px-3 py-2 text-right">Price</th>
                                                <th className="px-3 py-2 text-right">Disc</th>
                                                <th className="px-3 py-2 text-right">Tax</th>
                                                <th className="px-3 py-2 text-right">Subtotal</th>
                                                <th className="px-3 py-2 text-center">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {cartItems.map((item, index) => (
                                                <tr key={index} className={index % 2 === 0 ? "bg-muted/10" : ""}>
                                                    <td className="px-3 py-2">
                                                        <div>
                                                            <div className="font-medium">{item.name}</div>
                                                            <div className="mt-1 flex items-center">
                                                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                                                    item.productType === 'THREAD' 
                                                                        ? 'bg-blue-100 text-blue-800' 
                                                                        : 'bg-green-100 text-green-800'
                                                                }`}>
                                                                    {item.productType}
                                                                </span>
                                                                {item.inventoryItemId && (
                                                                    <span className="ml-1 text-xs text-muted-foreground">
                                                                        (Inventory Item)
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2 text-center">{item.quantity}</td>
                                                    <td className="px-3 py-2 text-right">
                                                        {formatCurrency(item.unitPrice)}
                                                    </td>
                                                    <td className="px-3 py-2 text-right">
                                                        {item.discount > 0 ? formatCurrency(item.discount) : "-"}
                                                    </td>
                                                    <td className="px-3 py-2 text-right">
                                                        {item.tax > 0 ? formatCurrency(item.tax) : "-"}
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-medium">
                                                        {formatCurrency(item.subtotal)}
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        <div className="flex justify-center gap-1">
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => editCartItem(index)}
                                                                title="Edit item"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
                                                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                                                </svg>
                                                                <span className="sr-only">Edit item</span>
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => removeItemFromCart(index)}
                                                                title="Remove item"
                                                            >
                                                                <Trash2 className="h-4 w-4 text-red-500" />
                                                                <span className="sr-only">Remove item</span>
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-muted/30">
                                            <tr>
                                                <td className="px-3 py-2 text-left font-medium">
                                                    Total ({cartItems.length} {cartItems.length === 1 ? 'item' : 'items'})
                                                </td>
                                                <td className="px-3 py-2 text-center font-medium">
                                                    {cartItems.reduce((sum, item) => sum + item.quantity, 0)}
                                                </td>
                                                <td colSpan={3} className="px-3 py-2 text-right font-medium">
                                                    Items Subtotal:
                                                </td>
                                                <td className="px-3 py-2 text-right font-medium">
                                                    {formatCurrency(cartItems.reduce((sum, item) => sum + item.subtotal, 0))}
                                                </td>
                                                <td></td>
                                            </tr>
                                            {cartItems.filter(item => item.productType === 'THREAD').length > 0 && 
                                            cartItems.filter(item => item.productType === 'FABRIC').length > 0 && (
                                                <tr className="text-xs text-muted-foreground">
                                                    <td colSpan={2} className="px-3 py-1 border-t">
                                                        <div className="flex items-center gap-2">
                                                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800">THREAD</span>
                                                            {cartItems.filter(item => item.productType === 'THREAD').length} items, 
                                                            {cartItems.filter(item => item.productType === 'THREAD').reduce((sum, item) => sum + item.quantity, 0)} units
                                                        </div>
                                                    </td>
                                                    <td colSpan={5} className="px-3 py-1 border-t text-right">
                                                        <div className="flex items-center gap-2 justify-end">
                                                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800">FABRIC</span>
                                                            {cartItems.filter(item => item.productType === 'FABRIC').length} items,
                                                            {cartItems.filter(item => item.productType === 'FABRIC').reduce((sum, item) => sum + item.quantity, 0)} units
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </tfoot>
                                    </table>
                                </div>
                            )}

                            {/* Add Product Form */}
                            <div className="rounded-lg border bg-muted/20 p-3">
                                <h4 className="mb-3 text-sm font-medium">Add Product to Cart</h4>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                {/* Product Type */}
                                <FormField
                                    control={form.control}
                                    name="productType"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Product Type</FormLabel>
                                            <Select
                                                onValueChange={(value) => {
                                                    field.onChange(value);
                                                    form.setValue(
                                                        "productId",
                                                        "",
                                                    );
                                                    form.setValue(
                                                        "inventoryItemId",
                                                        "",
                                                    );
                                                    setSelectedProduct(null);
                                                }}
                                                value={field.value}
                                            >
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select product type" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="THREAD">
                                                        Thread
                                                    </SelectItem>
                                                    <SelectItem value="FABRIC">
                                                        Fabric
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Product Selection */}
                                <FormField
                                    control={form.control}
                                    name="productId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                Select Product
                                            </FormLabel>
                                            <Select
                                                onValueChange={(value) => {
                                                    field.onChange(value);
                                                    handleProductSelect(value);
                                                }}
                                                value={field.value}
                                            >
                                                <FormControl>
                                                    <SelectTrigger
                                                        className={
                                                            loadingProducts
                                                                ? "animate-pulse"
                                                                : ""
                                                        }
                                                    >
                                                        <SelectValue
                                                            placeholder={
                                                                loadingProducts
                                                                    ? "Loading products..."
                                                                    : "Select product"
                                                            }
                                                        />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {loadingProducts ? (
                                                        <SelectItem
                                                            disabled
                                                            value="loading"
                                                        >
                                                            Loading products...
                                                        </SelectItem>
                                                        ) : form.watch("productType") ===
                                                      "THREAD" ? (
                                                        productOptions.thread
                                                            .length > 0 ? (
                                                            productOptions.thread.map(
                                                                (product) => (
                                                                    <SelectItem
                                                                        key={
                                                                            product.id
                                                                        }
                                                                        value={product.id.toString()}
                                                                    >
                                                                        {
                                                                            product.name
                                                                        }{" "}
                                                                        (
                                                                        {
                                                                            product.available
                                                                        }{" "}
                                                                        available)
                                                                    </SelectItem>
                                                                ),
                                                            )
                                                        ) : (
                                                            <SelectItem
                                                                disabled
                                                                value="none"
                                                            >
                                                                No thread
                                                                products
                                                                available
                                                            </SelectItem>
                                                        )
                                                        ) : form.watch("productType") ===
                                                      "FABRIC" ? (
                                                        productOptions.fabric
                                                            .length > 0 ? (
                                                            productOptions.fabric.map(
                                                                (product) => (
                                                                    <SelectItem
                                                                        key={
                                                                            product.id
                                                                        }
                                                                        value={product.id.toString()}
                                                                    >
                                                                        {
                                                                            product.name
                                                                        }{" "}
                                                                        (
                                                                        {
                                                                            product.available
                                                                        }{" "}
                                                                        available)
                                                                    </SelectItem>
                                                                ),
                                                            )
                                                        ) : (
                                                            <SelectItem
                                                                disabled
                                                                value="none"
                                                            >
                                                                No fabric
                                                                products
                                                                available
                                                            </SelectItem>
                                                        )
                                                    ) : (
                                                        <SelectItem
                                                            disabled
                                                            value="select-type"
                                                        >
                                                            Please select a
                                                            product type first
                                                        </SelectItem>
                                                    )}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                    {/* Available Quantity Display */}
                                <FormField
                                    control={form.control}
                                    name="inventoryItemId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                Inventory Item
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="No inventory item selected"
                                                    value={field.value}
                                                    readOnly
                                                    className={
                                                        field.value
                                                            ? "bg-muted"
                                                            : ""
                                                    }
                                                />
                                            </FormControl>
                                            <FormDescription className="text-xs">
                                                {selectedProduct?.inventoryItem
                                                    ? `Item: ${selectedProduct.inventoryItem.itemCode} - ${selectedProduct.inventoryItem.currentQuantity} available`
                                                    : "No inventory item selected"}
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                                <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-4">
                                    {/* Quantity */}
                            <FormField
                                control={form.control}
                                name="quantitySold"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Quantity</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="number"
                                                min={1}
                                                max={
                                                    selectedProduct?.available ||
                                                    999999
                                                }
                                                placeholder="0"
                                                {...field}
                                                onChange={(e) => {
                                                    // Enforce the max constraint
                                                    const value = parseInt(
                                                        e.target.value,
                                                    );
                                                    const maxAvailable =
                                                        selectedProduct?.available ||
                                                        999999;
                                                    if (value > maxAvailable) {
                                                        field.onChange(
                                                            maxAvailable.toString(),
                                                        );
                                                        toast.error(
                                                            `Maximum available quantity is ${maxAvailable}`,
                                                        );
                                                    } else {
                                                        field.onChange(
                                                            e.target.value,
                                                        );
                                                    }
                                                }}
                                            />
                                        </FormControl>
                                        {selectedProduct && (
                                            <FormDescription className="text-xs">
                                                Available quantity:{" "}
                                                {selectedProduct?.available ||
                                                    0}
                                            </FormDescription>
                                        )}
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                                    {/* Unit Price */}
                            <FormField
                                control={form.control}
                                name="salePrice"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Unit Price</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="number"
                                                min={0}
                                                step={0.01}
                                                placeholder="0.00"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                                    {/* Item Discount */}
                            <FormField
                                control={form.control}
                                        name="itemDiscount"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Discount</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="number"
                                                min={0}
                                                step={0.01}
                                                placeholder="0.00"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                                    {/* Item Tax */}
                            <FormField
                                control={form.control}
                                        name="itemTax"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Tax</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="number"
                                                min={0}
                                                step={0.01}
                                                placeholder="0.00"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                                <div className="mt-3 flex items-center justify-between">
                                    <div className="text-sm">
                                        Subtotal: {formatCurrency(currentItemSubtotal)}
                                    </div>
                                    <Button 
                                        type="button" 
                                        variant="secondary"
                                        size="sm"
                                        onClick={addItemToCart}
                                        disabled={!selectedProduct || addingToCart}
                                    >
                                        <Plus className="mr-1 h-4 w-4" />
                                        Add to Cart
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Order Details Section */}
                        <div className="mt-6 space-y-4">
                        {/* Order Number */}
                        <FormField
                            control={form.control}
                            name="orderNumber"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        Order Number (Optional)
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="Enter order reference number"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                            {/* Order-Level Discount and Tax */}
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                {/* Discount */}
                                <FormField
                                    control={form.control}
                                    name="discount"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Order Discount</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    step={0.01}
                                                    placeholder="0.00"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormDescription className="text-xs">
                                                Additional discount applied to the entire order
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Tax */}
                                <FormField
                                    control={form.control}
                                    name="tax"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Order Tax</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    step={0.01}
                                                    placeholder="0.00"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormDescription className="text-xs">
                                                Additional tax applied to the entire order
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                        {/* Order Summary Section */}
                        <div className="bg-muted rounded-md p-4">
                            <div className="font-medium">Order Summary</div>
                            <div className="mt-2 space-y-1 text-sm">
                                <div className="flex justify-between">
                                    <span>Items Subtotal:</span>
                                    <span>{formatCurrency(cartItems.reduce((sum, item) => sum + item.subtotal, 0))}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Order Discount:</span>
                                    <span>{safeParseFloat(form.getValues("discount")) > 0 
                                        ? `- ${formatCurrency(safeParseFloat(form.getValues("discount")))}`
                                        : "-"}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Order Tax:</span>
                                    <span>{safeParseFloat(form.getValues("tax")) > 0 
                                        ? `+ ${formatCurrency(safeParseFloat(form.getValues("tax")))}`
                                        : "-"}</span>
                                </div>
                                <div className="border-t pt-1 flex justify-between font-bold">
                                    <span>Total Order Value:</span>
                                    <span>{formatCurrency(calculatedTotal)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Dates and Delivery Section */}
                        <div className="border-t pt-4">
                            <h3 className="mb-4 text-lg font-medium">
                                Dates & Delivery
                            </h3>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                {/* Order Date */}
                                <FormField
                                    control={form.control}
                                    name="orderDate"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Order Date</FormLabel>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <FormControl>
                                                        <Button
                                                            variant={"outline"}
                                                            className={cn(
                                                                "w-full pl-3 text-left font-normal",
                                                                !field.value &&
                                                                    "text-muted-foreground",
                                                            )}
                                                        >
                                                            {field.value ? (
                                                                format(
                                                                    field.value,
                                                                    "PPP",
                                                                )
                                                            ) : (
                                                                <span>
                                                                    Pick a date
                                                                </span>
                                                            )}
                                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                        </Button>
                                                    </FormControl>
                                                </PopoverTrigger>
                                                <PopoverContent
                                                    className="w-auto p-0"
                                                    align="start"
                                                >
                                                    <Calendar
                                                        mode="single"
                                                        selected={field.value}
                                                        onSelect={
                                                            field.onChange
                                                        }
                                                        initialFocus
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Delivery Date */}
                                <FormField
                                    control={form.control}
                                    name="deliveryDate"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                            <FormLabel>
                                                Delivery Date (Optional)
                                            </FormLabel>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <FormControl>
                                                        <Button
                                                            variant={"outline"}
                                                            className={cn(
                                                                "w-full pl-3 text-left font-normal",
                                                                !field.value &&
                                                                    "text-muted-foreground",
                                                            )}
                                                        >
                                                            {field.value ? (
                                                                format(
                                                                    field.value,
                                                                    "PPP",
                                                                )
                                                            ) : (
                                                                <span>
                                                                    Pick a date
                                                                </span>
                                                            )}
                                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                        </Button>
                                                    </FormControl>
                                                </PopoverTrigger>
                                                <PopoverContent
                                                    className="w-auto p-0"
                                                    align="start"
                                                >
                                                    <Calendar
                                                        mode="single"
                                                        selected={
                                                            field.value ||
                                                            undefined
                                                        }
                                                        onSelect={
                                                            field.onChange
                                                        }
                                                        initialFocus
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {/* Delivery Address */}
                            <div className="mt-4">
                                <FormField
                                    control={form.control}
                                    name="deliveryAddress"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                Delivery Address (Optional)
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="Enter delivery address"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {/* Remarks Section */}
                            <div className="mt-4">
                                <FormField
                                    control={form.control}
                                    name="remarks"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Remarks</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    placeholder="Any additional notes about the sale"
                                                    className="h-20 resize-none"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>

                        {/* Payment Information */}
                        <div className="mt-4 space-y-4">
                            <div className="text-md font-medium">
                                Payment Information
                            </div>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                {/* Payment Status */}
                                <FormField
                                    control={form.control}
                                    name="paymentStatus"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                Payment Status
                                            </FormLabel>
                                            <Select
                                                onValueChange={(value) => {
                                                    field.onChange(value);

                                                    // Pre-fill payment amount if status is PAID
                                                    if (value === "PAID") {
                                                        const roundedAmount = Math.round(calculatedTotal * 100) / 100;
                                                        form.setValue(
                                                            "paymentAmount",
                                                            roundedAmount.toString()
                                                        );
                                                    } else if (
                                                        value === "PENDING" ||
                                                        value === "CANCELLED"
                                                    ) {
                                                        form.setValue(
                                                            "paymentAmount",
                                                            "0"
                                                        );
                                                    } else if (
                                                        value === "PARTIAL"
                                                    ) {
                                                        // For partial, set a percentage of the total (50% by default)
                                                        const partialAmount = Math.round((calculatedTotal * 0.5) * 100) / 100;
                                                        form.setValue(
                                                            "paymentAmount",
                                                            partialAmount.toString()
                                                        );
                                                    }
                                                }}
                                                value={field.value}
                                            >
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select payment status" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="PENDING">
                                                        Pending
                                                    </SelectItem>
                                                    <SelectItem value="PARTIAL">
                                                        Partial
                                                    </SelectItem>
                                                    <SelectItem value="PAID">
                                                        Paid
                                                    </SelectItem>
                                                    <SelectItem value="CANCELLED">
                                                        Cancelled
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Payment Mode */}
                                <FormField
                                    control={form.control}
                                    name="paymentMode"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Payment Mode</FormLabel>
                                            <Select
                                                onValueChange={field.onChange}
                                                value={field.value}
                                                disabled={
                                                    form.getValues("paymentStatus") ===
                                                    "PENDING"
                                                }
                                            >
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select payment mode" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="CASH">
                                                        Cash
                                                    </SelectItem>
                                                    <SelectItem value="CHEQUE">
                                                        Cheque
                                                    </SelectItem>
                                                    <SelectItem value="ONLINE">
                                                        Online Transfer
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {/* Payment Amount */}
                            <FormField
                                control={form.control}
                                name="paymentAmount"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Payment Amount</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="number"
                                                placeholder="Enter payment amount"
                                                {...field}
                                                disabled={
                                                    form.getValues("paymentStatus") ===
                                                    "PENDING"
                                                }
                                            />
                                        </FormControl>
                                        <FormDescription className="text-xs">
                                            Enter the amount paid by the
                                            customer
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Conditional Cheque Fields */}
                            {form.watch("paymentMode") === "CHEQUE" && (
                                <div className="bg-muted/20 space-y-4 rounded-md border p-4">
                                    <div className="text-sm font-medium">
                                        Cheque Details
                                    </div>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                        {/* Cheque Number */}
                                        <FormField
                                            control={form.control}
                                            name="chequeNumber"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>
                                                        Cheque Number
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            placeholder="Enter cheque number"
                                                            {...field}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        {/* Bank */}
                                        <FormField
                                            control={form.control}
                                            name="bank"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Bank</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            placeholder="Enter bank name"
                                                            {...field}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        {/* Branch */}
                                        <FormField
                                            control={form.control}
                                            name="branch"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>
                                                        Branch (Optional)
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            placeholder="Enter branch name"
                                                            {...field}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Update Inventory Checkbox */}
                        <FormField
                            control={form.control}
                            name="updateInventory"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-y-0 space-x-3 rounded-md border p-4">
                                    <FormControl>
                                        <Checkbox
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel>
                                            Update Inventory
                                        </FormLabel>
                                        <FormDescription>
                                            When checked, inventory quantity
                                            will be reduced after sale
                                        </FormDescription>
                                    </div>
                                </FormItem>
                            )}
                        />

                        {/* Close the Order Details Section div that was opened earlier */}
                        </div>

                        {/* Form buttons */}
                        <div className="bg-background sticky bottom-0 flex justify-end gap-2 border-t pt-4 pb-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    form.reset();
                                    setCartItems([]);
                                    setSelectedProduct(null);
                                    setCalculatedTotal(0);
                                }}
                            >
                                Reset
                            </Button>
                            <Button type="submit" disabled={loading || cartItems.length === 0}>
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Submitting...
                                    </>
                                ) : (
                                    "Submit"
                                )}
                            </Button>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
