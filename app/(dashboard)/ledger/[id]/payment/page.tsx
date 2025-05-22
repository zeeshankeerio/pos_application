"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import React from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { format } from "date-fns";
import { CalendarIcon, ChevronLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "../../columns";
import { LedgerEntryRow, LedgerEntryType, LedgerEntryStatus } from "@/app/lib/types";

// Payment/Receipt form schema
const formSchema = z.object({
  amount: z.string().refine(
    (val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num > 0;
    },
    { message: "Amount must be a positive number" }
  ),
  transactionDate: z.date({
    required_error: "Transaction date is required",
  }),
  paymentMode: z.enum(["CASH", "CHEQUE", "ONLINE"], {
    required_error: "Payment method is required",
  }),
  chequeNumber: z.string().optional(),
  bankName: z.string().optional(),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
}).refine((data) => {
  // Require cheque number if payment mode is CHEQUE
  if (data.paymentMode === "CHEQUE" && (!data.chequeNumber || data.chequeNumber.trim() === "")) {
    return false;
  }
  return true;
}, {
  message: "Cheque number is required for cheque payments",
  path: ["chequeNumber"],
});

type FormValues = z.infer<typeof formSchema>;

interface TransactionData {
  ledgerEntryId: number;
  amount: string;
  transactionDate: string;
  paymentMode: "CASH" | "CHEQUE" | "ONLINE";
  notes?: string;
  referenceNumber?: string;
  chequeNumber?: string;
  bankName?: string;
}

export default function PaymentFormPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  
  const [entry, setEntry] = useState<LedgerEntryRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [maxAmount, setMaxAmount] = useState<number>(0);

  // Initialize form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: "",
      transactionDate: new Date(),
      paymentMode: "CASH",
      chequeNumber: "",
      bankName: "",
      referenceNumber: "",
      notes: "",
    },
  });

  // Watch payment mode to conditionally show cheque fields
  const paymentMode = form.watch("paymentMode");

  // Fetch the ledger entry
  const fetchLedgerEntry = async () => {
    if (!id) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/ledger/${id}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          toast.error("Ledger entry not found");
          router.push("/ledger");
          return;
        }
        throw new Error("Failed to fetch ledger entry");
      }
      
      const data = await response.json();
      setEntry(data.entry);
      
      // Set max amount to remaining amount
      const remainingAmount = parseFloat(data.entry.remainingAmount);
      setMaxAmount(remainingAmount);
      
      // Pre-fill amount with remaining balance
      form.setValue("amount", remainingAmount.toString());
    } catch (error) {
      console.error("Error fetching ledger entry:", error);
      toast.error("Failed to load ledger entry details");
    } finally {
      setIsLoading(false);
    }
  };

  // Form submission handler
  const onSubmit = async (data: FormValues) => {
    if (!entry) return;
    
    setIsSubmitting(true);
    
    try {
      // Validate amount doesn't exceed remaining amount
      const amount = parseFloat(data.amount);
      if (amount > maxAmount) {
        toast.error(`Amount cannot exceed the remaining balance of ${formatCurrency(maxAmount)}`);
        setIsSubmitting(false);
        return;
      }
      
      // Prepare the data for submission
      const transactionData: TransactionData = {
        ledgerEntryId: typeof entry.id === 'string' ? parseInt(entry.id) : entry.id as number,
        amount: data.amount,
        transactionDate: data.transactionDate.toISOString(),
        paymentMode: data.paymentMode,
        notes: data.notes,
        referenceNumber: data.referenceNumber,
        chequeNumber: undefined,
        bankName: undefined
      };
      
      // Add cheque details if payment mode is CHEQUE
      if (data.paymentMode === "CHEQUE") {
        transactionData.chequeNumber = data.chequeNumber;
        transactionData.bankName = data.bankName;
      }
      
      // Submit the payment/receipt
      const response = await fetch(`/api/ledger/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(transactionData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to record payment");
      }
      
      // Show success message
      toast.success(`${entry.entryType === "PAYABLE" ? "Payment" : "Receipt"} recorded successfully`);
      
      // Navigate back to the entry detail page
      router.push(`/ledger/${entry.id}`);
    } catch (error) {
      console.error("Error recording payment:", error);
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("Failed to record payment");
      }
      setIsSubmitting(false);
    }
  };

  // Handle cancellation
  const handleCancel = () => {
    router.back();
  };

  // Load data on initial render
  useEffect(() => {
    if (id) {
    fetchLedgerEntry();
    }
  }, [id]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="container py-10 flex justify-center items-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading entry details...</p>
        </div>
      </div>
    );
  }

  // Show error if entry not found
  if (!entry) {
    return (
      <div className="container py-10 flex justify-center items-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold mb-2">Entry Not Found</h2>
          <p className="text-muted-foreground mb-4">
            The ledger entry you&apos;re looking for doesn&apos;t exist or has been deleted.
          </p>
          <Button asChild>
            <Link href="/ledger">Return to Ledger</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Prevent accessing the form if entry is completed or cancelled
  if (entry.status === "COMPLETED" || entry.status === "CANCELLED") {
    return (
      <div className="container max-w-5xl py-6 space-y-6">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            asChild
          >
            <Link href={`/ledger/${entry.id}`}>
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            {entry.entryType === "PAYABLE" ? "Record Payment" : "Record Receipt"}
          </h1>
        </div>
        <Separator />
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle>Action Not Allowed</CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              This ledger entry is {entry.status === "COMPLETED" ? "already completed" : "cancelled"} and cannot accept new payments.
            </p>
          </CardContent>
          <CardFooter>
            <Button asChild variant="outline">
              <Link href={`/ledger/${entry.id}`}>Return to Entry Details</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={handleCancel}
            size="icon"
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            {entry.entryType === "PAYABLE" ? "Record Payment" : "Record Receipt"}
          </h1>
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Amount Field */}
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Amount <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        max={maxAmount}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Maximum amount: {formatCurrency(maxAmount)}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Transaction Date */}
              <FormField
                control={form.control}
                name="transactionDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>
                      Transaction Date <span className="text-destructive">*</span>
                    </FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>
                      Date when the payment/receipt occurred
                    </FormDescription>
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
                    <FormLabel>
                      Payment Method <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select payment method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="CASH">Cash</SelectItem>
                        <SelectItem value="CHEQUE">Cheque</SelectItem>
                        <SelectItem value="ONLINE">Online Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Cheque Information (Conditionally) */}
              {paymentMode === "CHEQUE" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-md bg-muted/50">
                  <FormField
                    control={form.control}
                    name="chequeNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Cheque Number <span className="text-destructive">*</span>
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

                  <FormField
                    control={form.control}
                    name="bankName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bank Name</FormLabel>
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
                </div>
              )}

              {/* Reference Number */}
              <FormField
                control={form.control}
                name="referenceNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference Number</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter reference number"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Optional reference for this transaction
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter any additional notes"
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Additional information about this payment
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  type="button"
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {entry.entryType === "PAYABLE" ? "Making Payment..." : "Recording Receipt..."}
                    </>
                  ) : (
                    entry.entryType === "PAYABLE" ? "Make Payment" : "Record Receipt"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Entry Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Description</h3>
                <p className="font-medium">{entry.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Total Amount</h3>
                  <p className="font-medium">{formatCurrency(entry.amount)}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Remaining</h3>
                  <p className="font-medium">{formatCurrency(entry.remainingAmount)}</p>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  {entry.entryType === "PAYABLE" ? "Vendor" : "Customer"}
                </h3>
                <p className="font-medium">
                  {entry.vendor
                    ? entry.vendor.name
                    : entry.customer
                    ? entry.customer.name
                    : "N/A"}
                </p>
              </div>
              {entry.reference && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Reference</h3>
                  <p className="font-medium">{entry.reference}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
} 