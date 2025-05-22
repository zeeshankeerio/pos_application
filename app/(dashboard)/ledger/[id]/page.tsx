"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import React from "react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  CalendarDays,
  ChevronLeft,
  CircleDollarSign,
  FileEdit,
  FilePenLine,
  Loader2,
  Tags,
  Wallet,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LedgerEntryRow } from "@/app/lib/types";
import { formatCurrency } from "../columns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Use a Record type to specify the index signature
const statusColorMap: Record<string, string> = {
  PENDING: "bg-yellow-500/20 text-yellow-600 hover:bg-yellow-500/30",
  PARTIAL: "bg-blue-500/20 text-blue-600 hover:bg-blue-500/30",
  COMPLETED: "bg-green-500/20 text-green-600 hover:bg-green-500/30",
  CANCELLED: "bg-red-500/20 text-red-600 hover:bg-red-500/30",
  PAID: "bg-green-500/20 text-green-600 hover:bg-green-500/30",
  CLEARED: "bg-green-500/20 text-green-600 hover:bg-green-500/30",
  BOUNCED: "bg-red-500/20 text-red-600 hover:bg-red-500/30",
  REPLACED: "bg-purple-500/20 text-purple-600 hover:bg-purple-500/30"
};

// Type badge color mapping with index signature
const typeColorMap: Record<string, string> = {
  PAYABLE: "bg-orange-500/20 text-orange-600 hover:bg-orange-500/30",
  RECEIVABLE: "bg-emerald-500/20 text-emerald-600 hover:bg-emerald-500/30",
  BILL: "bg-slate-500/20 text-slate-600 hover:bg-slate-500/30",
  TRANSACTION: "bg-blue-500/20 text-blue-600 hover:bg-blue-500/30",
  CHEQUE: "bg-purple-500/20 text-purple-600 hover:bg-purple-500/30",
  INVENTORY: "bg-teal-500/20 text-teal-600 hover:bg-teal-500/30",
  BANK: "bg-indigo-500/20 text-indigo-600 hover:bg-indigo-500/30"
};

const paymentModeLabels = {
  CASH: "Cash",
  CHEQUE: "Cheque",
  ONLINE: "Online Transfer",
};

interface Transaction {
  id: number;
  ledgerEntryId: number;
  transactionDate: string;
  amount: string;
  paymentMode: "CASH" | "CHEQUE" | "ONLINE";
  chequeNumber?: string;
  bankName?: string;
  referenceNumber?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Add helper function to format transaction details
const formatTransactionType = (paymentMode: string) => {
  switch(paymentMode) {
    case "CASH": return "Cash Payment";
    case "CHEQUE": return "Cheque Payment";
    case "ONLINE": return "Online Transfer";
    default: return paymentMode;
  }
};

// Helper function to extract manual vendor/customer name from notes
const extractPartyNameFromNotes = (notes: string | null | undefined): string | null => {
  if (!notes) return null;
  
  // First try to extract vendor name
  if (notes.includes('Vendor:')) {
    const match = notes.match(/Vendor:\s*([^-\n]+)/);
    if (match && match[1]) return match[1].trim();
  }
  
  // Then try to extract customer name
  if (notes.includes('Customer:')) {
    const match = notes.match(/Customer:\s*([^-\n]+)/);
    if (match && match[1]) return match[1].trim();
  }
  
  return null;
};

export default function LedgerEntryPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  
  const [entry, setEntry] = useState<LedgerEntryRow | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);

  // Fetch the ledger entry
  const fetchLedgerEntry = async () => {
    if (!id) return;
    
    setIsLoading(true);
    try {
      console.log(`[Ledger] Fetching entry details for ID: ${id}`);
      
      const response = await fetch(`/api/ledger/${id}`, {
        cache: 'no-store', // Don't cache this request
        headers: {
          'x-request-time': Date.now().toString() // Add cache-busting header
        }
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          toast.error("Ledger entry not found");
          router.push("/ledger");
          return;
        }
        
        // Try to get more error details from response
        let errorDetails = "";
        try {
          const errorData = await response.json();
          console.error("[Ledger] API error response:", errorData);
          errorDetails = errorData.error || errorData.message || "";
        } catch (parseError) {
          console.error("[Ledger] Failed to parse error response:", parseError);
        }
        
        throw new Error(`Failed to fetch ledger entry: ${errorDetails || response.statusText || response.status}`);
      }
      
      const data = await response.json();
      setEntry(data.entry);
      setTransactions(data.entry.transactions || []);
    } catch (error) {
      console.error("Error fetching ledger entry:", error);
      
      const errorMessage = error instanceof Error ? error.message : "Failed to load ledger entry details";
      toast.error(errorMessage, {
        id: "ledger-entry-fetch-error", // Prevent duplicate toasts
        duration: 5000
      });
      
      // Show a sample entry if in development mode
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Ledger] Using sample entry data in development mode');
        setEntry({
          id: id,
          entryType: "PAYABLE",
          description: "Sample Entry (Connection Issue)",
          party: "Sample Vendor",
          reference: "SAMPLE-REF",
          transactionType: "PURCHASE",
          entryDate: new Date().toISOString(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          amount: "15000",
          remainingAmount: "10000",
          status: "PARTIAL"
        });
        
        setTransactions([
          {
            id: 1,
            ledgerEntryId: parseInt(id as string),
            transactionDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
            amount: "5000",
            paymentMode: "CASH",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Cancel the entry
  const handleCancelEntry = async () => {
    if (!entry || !id) return;
    
    setIsCancelling(true);
    try {
      const response = await fetch(`/api/ledger/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "CANCELLED",
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to cancel entry");
      }
      
      const data = await response.json();
      setEntry(data.entry);
      toast.success("Ledger entry cancelled successfully");
    } catch (error) {
      console.error("Error cancelling entry:", error);
      toast.error("Failed to cancel entry");
    } finally {
      setIsCancelling(false);
    }
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

  // Handle entry not found
  if (!entry) {
    return (
      <div className="container py-10">
        <Alert variant="destructive">
          <X className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Ledger entry not found or has been deleted.
          </AlertDescription>
        </Alert>
        <div className="mt-4 flex justify-center">
          <Button asChild>
            <Link href="/ledger">Return to Ledger</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Improve the payment button to be more prominent and display proper text based on entry type
  const renderPaymentButton = () => {
    // Don't show payment button for entries that are completed or cancelled
    if (entry.status === "COMPLETED" || entry.status === "CANCELLED") {
      return null;
    }
    
    // Don't show payment button for entries without remaining amount
    if (parseFloat(entry.remainingAmount) <= 0) {
      return null;
    }

    const isPayable = entry.entryType === "PAYABLE" || entry.entryType === "BILL" && entry.transactionType === "PURCHASE";
    const isReceivable = entry.entryType === "RECEIVABLE" || entry.entryType === "BILL" && entry.transactionType === "SALE";
    
    const buttonText = isPayable ? "Record Payment" : 
                       isReceivable ? "Record Receipt" : 
                       "Record Transaction";
    
    return (
      <Button asChild className="w-full">
        <Link href={`/ledger/${entry.id}/payment`}>
          <Wallet className="mr-2 h-4 w-4" />
          {buttonText}
        </Link>
      </Button>
    );
  };

  return (
    <div className="container max-w-5xl py-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            asChild
          >
            <Link href="/ledger">
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {entry.entryType === "PAYABLE" ? "Payable" : "Receivable"} Details
            </h1>
            <p className="text-muted-foreground">
              {entry.description}
              {entry.reference && ` • Ref: ${entry.reference}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {renderPaymentButton()}
          
          <Button variant="outline" asChild>
            <Link href={`/ledger/${entry.id}/edit`}>
              <FileEdit className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
          
          {entry.status !== "COMPLETED" && entry.status !== "CANCELLED" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-destructive">
                  <X className="mr-2 h-4 w-4" />
                  Cancel Entry
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will mark the entry as cancelled. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleCancelEntry}
                    disabled={isCancelling}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isCancelling ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Cancelling...
                      </>
                    ) : (
                      "Yes, Cancel Entry"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Separator />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
              Financial Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Type</p>
                <Badge variant="outline" className={typeColorMap[entry.entryType]}>
                  {entry.entryType}
                </Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Status</p>
                <Badge variant="outline" className={statusColorMap[entry.status]}>
                  {entry.status}
                </Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Amount</p>
                <p className="text-lg font-semibold">{formatCurrency(entry.amount)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Remaining</p>
                <p className="text-lg font-semibold">{formatCurrency(entry.remainingAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Tags className="h-4 w-4 text-muted-foreground" />
              Additional Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <p className="text-sm font-medium text-muted-foreground">
                  {entry.entryType === "PAYABLE" ? "Vendor" : "Customer"}
                </p>
                <p className="font-medium">
                  {entry.vendor
                    ? entry.vendor.name
                    : entry.customer
                    ? entry.customer.name
                    : entry.manualPartyName
                    || extractPartyNameFromNotes(entry.notes)
                    || "N/A"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Entry Date</p>
                <p className="font-medium">
                  {format(new Date(entry.entryDate), "PPP")}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Due Date</p>
                <p className="font-medium">
                  {entry.dueDate
                    ? format(new Date(entry.dueDate), "PPP")
                    : "Not specified"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {entry.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FilePenLine className="h-4 w-4 text-muted-foreground" />
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line">{entry.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Transactions Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">
            {entry.entryType === "PAYABLE" ? "Payments" : "Receipts"}
          </h2>
          {entry.status !== "COMPLETED" && entry.status !== "CANCELLED" && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/ledger/${entry.id}/payment`}>
                <Wallet className="mr-2 h-4 w-4" />
                Add {entry.entryType === "PAYABLE" ? "Payment" : "Receipt"}
              </Link>
            </Button>
          )}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FilePenLine className="h-4 w-4 text-muted-foreground" />
              Transactions History
            </CardTitle>
          </CardHeader>
          <CardContent>
        {transactions.length > 0 ? (
              <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>
                          <div className="font-medium">
                            {format(new Date(transaction.transactionDate), "MMM d, yyyy")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(transaction.transactionDate), "h:mm a")}
                          </div>
                    </TableCell>
                    <TableCell>
                          <div className="font-medium">
                            {formatCurrency(transaction.amount)}
                      </div>
                    </TableCell>
                    <TableCell>
                          <div className="flex items-center gap-1">
                            {formatTransactionType(transaction.paymentMode)}
                            {transaction.paymentMode === "CHEQUE" && (
                              <span className="text-xs text-muted-foreground ml-1">
                                (#{transaction.chequeNumber})
                              </span>
                            )}
                          </div>
                          {transaction.bankName && (
                            <div className="text-xs text-muted-foreground">
                              {transaction.bankName}
                            </div>
                          )}
                    </TableCell>
                    <TableCell>
                          {transaction.referenceNumber ? (
                            <span>{transaction.referenceNumber}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">No Reference</span>
                          )}
                          {transaction.notes && (
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {transaction.notes}
                            </div>
                          )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
              <div className="text-center p-4 border rounded-md bg-muted/50">
                <p className="text-muted-foreground">No transactions recorded yet.</p>
              </div>
              )}
            </CardContent>
          </Card>
      </div>

      <div className="text-sm text-muted-foreground flex items-center gap-1">
        <CalendarDays className="h-3.5 w-3.5" />
        <span>
          {entry.createdAt ? `Entry created on ${format(new Date(entry.createdAt), "PPP")}` : 'Entry created'}
          {entry.createdAt && entry.updatedAt && entry.createdAt !== entry.updatedAt && 
            ` • Last updated on ${format(new Date(entry.updatedAt), "PPP")}`}
        </span>
      </div>
    </div>
  );
} 