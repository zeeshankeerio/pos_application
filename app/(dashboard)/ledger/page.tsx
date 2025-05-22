"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { 
  AlertTriangle,
  Building,
  FileText,
  Loader2, 
  Package,
  Truck,
  RefreshCcw,
  PlusCircle,
  Receipt,
  ArrowDownUp,
  AlertCircle,
  Info,
  Clock
} from "lucide-react";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DataTable } from "./data-table";
import { columns, formatCurrency } from "./columns";
import { LedgerEntryRow } from "@/app/lib/types";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RefreshIndicator } from "./components/refresh-indicator";

export default function LedgerPage() {
  return <ClientLedger />;
}

function ClientLedger() {
  const [entries, setEntries] = useState<LedgerEntryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState<DateRange | undefined>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // First day of current month
    to: new Date(),
  });
  const [tab, setTab] = useState("all");
  const [khataId, setKhataId] = useState<string>("1"); // Default to first khata
  const [databaseMissing, setDatabaseMissing] = useState(false);
  const [khatas, setKhatas] = useState<{ id: number; name: string; description?: string }[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true); // Auto-refresh flag
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [stats, setStats] = useState({
    totalBills: 0,
    totalPendingBills: 0,
    totalTransactions: 0,
    totalCheques: 0,
    totalPendingCheques: 0,
    totalInventory: 0,
    totalReceivables: 0,
    totalPayables: 0,
    totalBankBalance: 0,
    totalOverdueCount: 0,
    totalOverdueAmount: 0,
    totalInventoryValue: 0,
    billsTotal: 0,
    paidBills: 0,
    pendingCheques: 0,
    inventoryItems: 0,
    bankAccounts: 0,
    totalCashInHand: 0,
    totalRecentTransactions: 0
  });
  
  const searchParams = useSearchParams();
  const typeParam = searchParams?.get("type") || null;
  
  // Set initial tab based on URL parameter
  useEffect(() => {
    if (typeParam === "bill" || typeParam === "transaction" || typeParam === "cheque" || typeParam === "inventory") {
      setTab(typeParam);
    }
  }, [typeParam]);

  // Fetch khatas on initial load
  useEffect(() => {
    const fetchKhatas = async () => {
      try {
        console.log('[Ledger] Fetching khatas...');
        const response = await fetch('/api/ledger/khata', {
          cache: 'no-store', // Don't cache this request
          headers: {
            'x-request-time': Date.now().toString() // Add cache-busting header
          }
        });
        
        if (!response.ok) {
          console.error(`[Ledger] Failed to fetch khatas: ${response.status} ${response.statusText}`);
          // Don't set error, just use default khata
          setKhatas([{ id: 1, name: 'Default Khata' }]);
          return;
        }
        
        const data = await response.json();
        console.log('[Ledger] Khatas response:', data);
        
        if (data.databaseError) {
          console.warn('[Ledger] Database error detected, using provided default khatas');
        }
        
        if (data.khatas && data.khatas.length > 0) {
          setKhatas(data.khatas);
          // Check if there's a khataId in URL params
          const queryKhataId = searchParams?.get('khataId') || null;
          if (queryKhataId) {
            setKhataId(queryKhataId);
          } else if (data.khatas[0]?.id) {
            // Set first khata as default if none specified in URL
            setKhataId(data.khatas[0].id.toString());
          }
        } else {
          // If no khatas returned, set default
          console.warn('[Ledger] No khatas returned, using default');
          setKhatas([{ id: 1, name: 'Default Khata' }]);
        }
      } catch (error) {
        console.error('[Ledger] Error fetching khatas:', error);
        // Don't set error, just use default khata
        setKhatas([{ id: 1, name: 'Default Khata' }]);
      }
    };
    
    fetchKhatas();
  }, [searchParams]);

  // Auto-refresh data every 30 seconds if enabled
  useEffect(() => {
    let refreshTimer: NodeJS.Timeout;
    
    if (autoRefresh) {
      refreshTimer = setInterval(() => {
        console.log('[Ledger] Auto-refreshing data...');
        // Don't show loading state during auto-refresh to avoid UI flicker
        const quietRefresh = async () => {
          try {
            // Create a URLSearchParams object for proper URL construction
            const params = new URLSearchParams();
            
            // Add filters based on the selected tab
            if (tab !== 'all') {
              params.append("type", tab.toUpperCase());
            }
            
            // Add khata filter
            if (khataId) {
              params.append("khataId", khataId);
            }
            
            // Add date filters if set
            if (date?.from) {
              params.append("startDate", date.from.toISOString());
            }
            
            if (date?.to) {
              params.append("endDate", date.to.toISOString());
            }
            
            // Add cache-busting timestamp parameter
            params.append("_t", Date.now().toString());
            
            // Construct the URL with the search params
            const url = `/api/ledger?${params.toString()}`;
            
            console.log(`[Ledger] Auto-refresh with params: ${params.toString()}`);
            const response = await fetch(url, {
              // Disable caching to always get fresh data
              cache: 'no-store',
              headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              if (data.entries && Array.isArray(data.entries)) {
                setEntries(data.entries || []);
                if (data.summary) {
                  setStats({
                    // Update stats from the response
                    totalBills: data.summary.billsTotal || 0,
                    // ...other stats
                    totalPendingBills: (data.summary.billsTotal || 0) - (data.summary.paidBills || 0),
                    totalTransactions: data.summary.transactionsTotal || 0,
                    totalCheques: data.summary.chequesTotal || 0,
                    totalPendingCheques: data.summary.pendingCheques || 0,
                    totalInventory: data.summary.inventoryItems || 0,
                    totalReceivables: data.summary.totalReceivables || 0,
                    totalPayables: data.summary.totalPayables || 0,
                    totalBankBalance: data.summary.totalBankBalance || 0,
                    totalOverdueCount: data.summary.overdueBills || 0,
                    totalOverdueAmount: data.summary.overdueAmount || 0,
                    totalInventoryValue: data.summary.totalInventoryValue || 0,
                    billsTotal: data.summary.billsTotal || 0,
                    paidBills: data.summary.paidBills || 0,
                    pendingCheques: data.summary.pendingCheques || 0,
                    inventoryItems: data.summary.inventoryItems || 0,
                    bankAccounts: data.summary.bankAccounts || 0,
                    totalCashInHand: data.summary.totalCashInHand || 0,
                    totalRecentTransactions: data.summary.totalRecentTransactions || 0
                  });
                }
              }
              // Update last refreshed timestamp
              setLastRefreshed(new Date());
            }
          } catch (error) {
            console.error("[Ledger] Auto-refresh error:", error);
            // Don't show error toast during auto-refresh to avoid spamming the user
          }
        };
        
        // Execute the quiet refresh
        quietRefresh();
      }, 30000); // 30 seconds
    }
    
    return () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
    };
  }, [autoRefresh, tab, khataId, date]);
  
  // Show a toast notification when auto-refresh is toggled
  useEffect(() => {
    if (autoRefresh) {
      toast.success('Auto-refresh enabled', {
        description: 'Ledger data will update automatically',
        duration: 2000,
      });
    } else if (autoRefresh === false) { // Not the initial render
      toast.info('Auto-refresh disabled', {
        description: 'Ledger data will only update manually',
        duration: 2000,
      });
    }
  }, [autoRefresh]);

  // Load ledger entries
  const fetchLedgerEntries = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setDatabaseMissing(false);
    try {
      // Create a URLSearchParams object for proper URL construction
      const params = new URLSearchParams();
      
      // Add filters based on the selected tab
      if (tab !== 'all') {
        params.append("type", tab.toUpperCase());
      }
      
      // Add khata filter
      if (khataId) {
        params.append("khataId", khataId);
      }
      
      // Add date filters if set
      if (date?.from) {
        params.append("startDate", date.from.toISOString());
      }
      
      if (date?.to) {
        params.append("endDate", date.to.toISOString());
      }
      
      // Add default sorting
      params.append("orderBy", "entryDate");
      params.append("order", "desc");
      
      // Add cache-busting timestamp parameter
      params.append("_t", Date.now().toString());
      
      // Construct the URL with the search params
      const url = `/api/ledger?${params.toString()}`;
      
      console.log(`[Ledger] Fetching data with params: ${params.toString()}`);
      const response = await fetch(url, {
        // Disable caching to always get fresh data
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        next: { revalidate: 0 } // Don't revalidate cache - always fetch fresh data
      });
      
      if (!response.ok) {
        // Attempt to get error details but continue even if it fails
        try {
          const errorData = await response.json();
          console.error("[Ledger] API error details:", errorData);
          
          // If data is available but there was a database error, show a warning
          if (errorData.entries && errorData.databaseError) {
            toast.warning("Using sample data - database connection issues. Contact administrator.");
            setDatabaseMissing(true);
            setEntries(errorData.entries || []);
            setStats({
              totalBills: errorData.summary?.billsTotal || 0,
              totalPendingBills: (errorData.summary?.billsTotal || 0) - (errorData.summary?.paidBills || 0),
              totalTransactions: errorData.summary?.transactionsTotal || 0,
              totalCheques: errorData.summary?.chequesTotal || 0,
              totalPendingCheques: errorData.summary?.pendingCheques || 0,
              totalInventory: errorData.summary?.inventoryItems || 0,
              totalReceivables: errorData.summary?.totalReceivables || 0,
              totalPayables: errorData.summary?.totalPayables || 0,
              totalBankBalance: errorData.summary?.totalBankBalance || 0,
              totalOverdueCount: errorData.summary?.overdueBills || 0,
              totalOverdueAmount: errorData.summary?.overdueAmount || 0,
              totalInventoryValue: errorData.summary?.totalInventoryValue || 0,
              billsTotal: errorData.summary?.billsTotal || 0,
              paidBills: errorData.summary?.paidBills || 0,
              pendingCheques: errorData.summary?.pendingCheques || 0,
              inventoryItems: errorData.summary?.inventoryItems || 0,
              bankAccounts: errorData.summary?.bankAccounts || 0,
              totalCashInHand: errorData.summary?.totalCashInHand || 0,
              totalRecentTransactions: errorData.summary?.totalRecentTransactions || 0
            });
            setIsLoading(false);
            return;
          }
          
          // If it's a database schema issue, provide more helpful message
          if (errorData.details?.code === 'P2021') {
            setDatabaseMissing(true);
            throw new Error("Database schema issue: The ledger tables haven't been created yet. Please run database migrations.");
          }
        } catch (parseError) {
          // Unable to parse error response, continue with generic error
          console.error("[Ledger] Failed to parse error response:", parseError);
        }
        throw new Error(`Failed to fetch ledger entries (${response.status})`);
      }
      
      const data = await response.json();
      setEntries(data.entries || []);
      
      // If the API returns summary statistics, use them instead of calculating client-side
      if (data.summary) {
        setStats({
          totalBills: data.summary.billsTotal || 0,
          totalPendingBills: (data.summary.billsTotal || 0) - (data.summary.paidBills || 0),
          totalTransactions: data.summary.transactionsTotal || 0,
          totalCheques: data.summary.chequesTotal || 0,
          totalPendingCheques: data.summary.pendingCheques || 0,
          totalInventory: data.summary.inventoryItems || 0,
          totalReceivables: data.summary.totalReceivables || 0,
          totalPayables: data.summary.totalPayables || 0,
          totalBankBalance: data.summary.totalBankBalance || 0,
          totalOverdueCount: data.summary.overdueBills || 0,
          totalOverdueAmount: data.summary.overdueAmount || 0,
          totalInventoryValue: data.summary.totalInventoryValue || 0,
          billsTotal: data.summary.billsTotal || 0,
          paidBills: data.summary.paidBills || 0,
          pendingCheques: data.summary.pendingCheques || 0,
          inventoryItems: data.summary.inventoryItems || 0,
          bankAccounts: data.summary.bankAccounts || 0,
          totalCashInHand: data.summary.totalCashInHand || 0,
          totalRecentTransactions: data.summary.totalRecentTransactions || 0
        });
      } else {
        // Calculate stats from entries if no summary provided
        const calculatedStats = calculateLocalStats(data.entries || []);
        setStats(calculatedStats);
      }
    } catch (error) {
      console.error("[Ledger] Error fetching entries:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to load ledger entries";
      setError(errorMessage);
      toast.error(errorMessage, {
        id: "ledger-fetch-error", // Prevent duplicate toasts
        duration: 5000
      });
      
      // If there's a database schema issue, show placeholder data in development
      if ((errorMessage.includes("database") || errorMessage.includes("connection")) && 
          process.env.NODE_ENV !== 'production') {
        setDatabaseMissing(true);
        // Set some sample data for testing UI
        setEntries([
          {
            id: "sample-1",
            entryType: "BILL",
            description: "Thread Purchase",
            party: "Textile Suppliers Ltd",
            reference: "BILL-12345",
            transactionType: "PURCHASE",
            entryDate: new Date().toISOString(),
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            amount: "25000",
            remainingAmount: "25000",
            status: "PENDING"
          },
          {
            id: "sample-2",
            entryType: "TRANSACTION",
            description: "Bank Deposit",
            party: "Bank Account",
            reference: "TRX-6789",
            transactionType: "BANK_DEPOSIT",
            entryDate: new Date().toISOString(),
            amount: "50000",
            remainingAmount: "0",
            status: "COMPLETED"
          },
          {
            id: "sample-3",
            entryType: "CHEQUE",
            description: "Supplier Payment",
            party: "Thread Company",
            reference: "CHQ-4567",
            transactionType: "CHEQUE_PAYMENT",
            entryDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
            dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
            amount: "12000",
            remainingAmount: "12000",
            status: "PENDING"
          },
          {
            id: "sample-4",
            entryType: "INVENTORY",
            description: "Grey Cloth Stock",
            party: "Warehouse",
            reference: "INV-8901",
            transactionType: "INVENTORY_ADJUSTMENT",
            entryDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
            amount: "1000",
            remainingAmount: "1000",
            status: "COMPLETED"
          },
          {
            id: "sample-5",
            entryType: "BILL",
            description: "Cloth Sale",
            party: "Fashion Retailer",
            reference: "BILL-5678",
            transactionType: "SALE",
            entryDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
            dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
            amount: "35000",
            remainingAmount: "25000",
            status: "PARTIAL"
          },
          {
            id: "sample-6",
            entryType: "BANK",
            description: "Current Account",
            party: "National Bank",
            reference: "ACC-001",
            transactionType: "BANK_DEPOSIT",
            entryDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            amount: "120000",
            remainingAmount: "120000",
            status: "COMPLETED"
          }
        ]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [date, tab, khataId]);

  // Load data on initial render and when filters change
  useEffect(() => {
    fetchLedgerEntries();
  }, [date, tab, khataId, fetchLedgerEntries]);

  // Helper function to calculate stats from entries
  const calculateLocalStats = (entries: LedgerEntryRow[]) => {
    const stats = {
      totalBills: 0,
      totalPendingBills: 0,
      totalTransactions: 0,
      totalCheques: 0,
      totalPendingCheques: 0,
      totalInventory: 0,
      totalReceivables: 0,
      totalPayables: 0,
      totalBankBalance: 0,
      totalOverdueCount: 0,
      totalOverdueAmount: 0,
      totalInventoryValue: 0,
      billsTotal: 0,
      paidBills: 0,
      pendingCheques: 0,
      inventoryItems: 0,
      bankAccounts: 0,
      totalCashInHand: 0,
      totalRecentTransactions: 0
    };

    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    entries.forEach(entry => {
      const amount = parseFloat(entry.remainingAmount || "0");
      const totalAmount = parseFloat(entry.amount || "0");
      
      // PAYABLE and RECEIVABLE entries
      if (entry.entryType === "PAYABLE") {
        stats.totalPayables += amount;
      } else if (entry.entryType === "RECEIVABLE") {
        stats.totalReceivables += amount;
      }
      
      // Handle other types
      else if (entry.entryType === "BILL") {
        stats.billsTotal++;
        stats.totalBills++;
        
        if (entry.status === "PENDING" || entry.status === "PARTIAL") {
          stats.totalPendingBills++;
        }
        
        if (entry.status === "COMPLETED" || entry.status === "PAID") {
          stats.paidBills++;
        }
        
        if (entry.transactionType === "SALE") {
          stats.totalReceivables += amount;
        } else if (entry.transactionType === "PURCHASE") {
          stats.totalPayables += amount;
        }
        
        if (entry.dueDate && new Date(entry.dueDate) < today && 
            entry.status !== "COMPLETED" && entry.status !== "CANCELLED") {
          stats.totalOverdueCount++;
          stats.totalOverdueAmount += amount;
        }
      }
      else if (entry.entryType === "TRANSACTION") {
        stats.totalTransactions++;
        
        // Count recent transactions (last 7 days)
        if (new Date(entry.entryDate) >= sevenDaysAgo) {
          stats.totalRecentTransactions++;
        }
        
        // Calculate cash in hand from transactions
        if (entry.transactionType === "CASH_RECEIPT") {
          stats.totalCashInHand += totalAmount;
        } else if (entry.transactionType === "CASH_PAYMENT") {
          stats.totalCashInHand -= totalAmount;
        }
      }
      else if (entry.entryType === "CHEQUE") {
        stats.totalCheques++;
        if (entry.status === "PENDING") {
          stats.totalPendingCheques++;
          stats.pendingCheques++;
        }
      }
      else if (entry.entryType === "INVENTORY") {
        stats.totalInventory++;
        stats.inventoryItems++;
        stats.totalInventoryValue += parseFloat(entry.amount || "0");
      }
      else if (entry.entryType === "BANK") {
        stats.bankAccounts++;
        stats.totalBankBalance += parseFloat(entry.amount || "0");
      }
    });
    
    return stats;
  };

  // Add the toggle auto-refresh function
  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
  };

  return (
    <div className="container max-w-7xl mx-auto space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0 md:space-x-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ledger System</h1>
          <p className="text-muted-foreground mt-1">
            Manage bills, transactions, bank accounts, cheques and inventory in one place
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Khata selection dropdown */}
          <Select value={khataId} onValueChange={setKhataId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select Khata" />
            </SelectTrigger>
            <SelectContent>
              {khatas.map((khata) => (
                <SelectItem key={khata.id} value={khata.id.toString()}>
                  {khata.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <DateRangePicker
            date={date}
            onDateChange={setDate}
            align="end"
            calendarClassName="z-[999]"
          />
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="icon" 
              onClick={fetchLedgerEntries}
              disabled={isLoading}
              title="Refresh data"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
            </Button>
            
            <Button
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
              onClick={toggleAutoRefresh}
              className="gap-2 text-xs h-10"
              title={autoRefresh ? "Auto-refresh enabled" : "Auto-refresh disabled"}
            >
              <Clock className="h-4 w-4" />
              {autoRefresh ? "Auto" : "Manual"}
            </Button>
          </div>
          
          <Button asChild>
            <Link href="/ledger/new?type=bill">
              <FileText className="mr-2 h-4 w-4" />
              New Bill
            </Link>
          </Button>
          
          <Button asChild variant="outline">
            <Link href="/ledger/new?type=transaction">
              <ArrowDownUp className="mr-2 h-4 w-4" />
              New Transaction
            </Link>
          </Button>

          <Button asChild variant="outline">
            <Link href="/ledger/new?type=bank">
              <Building className="mr-2 h-4 w-4" />
              Bank Account
            </Link>
          </Button>
        </div>
      </div>

      <Separator className="my-6" />

      {/* Show when data was last refreshed */}
      <div className="flex items-center justify-between mb-4">
        <RefreshIndicator lastRefreshed={lastRefreshed} autoRefresh={autoRefresh} />
        
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={fetchLedgerEntries}
          className="text-xs">
          Refresh now
        </Button>
      </div>

      {/* Show error message if needed */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error}
            {process.env.NODE_ENV !== 'production' && (
              <div className="mt-2 text-xs opacity-80">
                Try running: <code className="bg-muted px-1 py-0.5 rounded">npx prisma db push --schema=./prisma/schema-ledger.prisma</code>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}
      
      {/* Database missing message */}
      {databaseMissing && (
        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertTitle>Using Sample Data</AlertTitle>
          <AlertDescription>
            {process.env.NODE_ENV === 'production' 
              ? 'Database connection issues detected. The system is displaying sample data. Please contact your administrator.' 
              : 'The ledger database tables haven\'t been created yet or there\'s a connection issue. Run database migrations or check your connection settings. Currently showing placeholder data for development.'}
            {process.env.NODE_ENV !== 'production' && (
              <div className="mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs"
                  onClick={() => {
                    window.open('https://www.prisma.io/docs/orm/prisma-client/deployment', '_blank');
                  }}
                >
                  <Info className="h-3 w-3" />
                  <span>Setup Documentation</span>
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Show summary cards */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {/* Bills Summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bills</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.billsTotal}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalPendingBills} pending / {stats.paidBills} paid
            </p>
            {stats.totalOverdueCount > 0 && (
              <div className="mt-1 flex items-center text-xs text-amber-500">
                <AlertTriangle className="mr-1 h-3 w-3" />
                <span>{stats.totalOverdueCount} overdue ({formatCurrency(stats.totalOverdueAmount)})</span>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Transactions Summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
            <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTransactions}</div>
            <p className="text-xs text-muted-foreground">
              Recent financial activities
            </p>
            <div className="mt-1 flex items-center text-xs text-green-500">
              <Info className="mr-1 h-3 w-3" />
              <span>{stats.totalRecentTransactions} transactions in last 7 days</span>
            </div>
          </CardContent>
        </Card>
        
        {/* Cash in Hand */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cash in Hand</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalCashInHand)}</div>
            <p className="text-xs text-muted-foreground">
              Available cash balance
            </p>
          </CardContent>
        </Card>
        
        {/* Cheques Summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cheques</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCheques}</div>
            <p className="text-xs text-muted-foreground">
              {stats.pendingCheques} pending to clear
            </p>
          </CardContent>
        </Card>
        
        {/* Inventory Summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inventory</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.inventoryItems}</div>
            <p className="text-xs text-muted-foreground">
              Worth {formatCurrency(stats.totalInventoryValue)}
            </p>
          </CardContent>
        </Card>
        
        {/* Receivables Summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receivables</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalReceivables)}</div>
            <p className="text-xs text-muted-foreground">
              Amount to be received
            </p>
          </CardContent>
        </Card>
        
        {/* Payables Summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Payables</CardTitle>
            <PlusCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalPayables)}</div>
            <p className="text-xs text-muted-foreground">
              Amount to be paid
            </p>
          </CardContent>
        </Card>
        
        {/* Bank Balance Summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bank Balance</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalBankBalance)}</div>
            <p className="text-xs text-muted-foreground">
              In {stats.bankAccounts} accounts
            </p>
          </CardContent>
        </Card>
      </div>
      
      <Tabs
        defaultValue="all"
        value={tab}
        onValueChange={setTab}
        className="mt-8"
      >
        <TabsList className="grid grid-cols-6 max-w-[960px]">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="bill">Bills</TabsTrigger>
          <TabsTrigger value="transaction">Transactions</TabsTrigger>
          <TabsTrigger value="cheque">Cheques</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="bank">Bank</TabsTrigger>
        </TabsList>
        
        <TabsContent value="all" className="mt-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-medium">All Ledger Entries</h3>
            <div className="flex items-center gap-2">
              <Button 
                asChild 
                variant="outline" 
                size="sm"
              >
                <Link href="/ledger/new?type=bill">
                  <FileText className="mr-1 h-4 w-4" />
                  <span>New Bill</span>
                </Link>
              </Button>
              <Button 
                asChild 
                variant="outline" 
                size="sm"
              >
                <Link href="/ledger/new?type=cheque">
                  <Receipt className="mr-1 h-4 w-4" />
                  <span>New Cheque</span>
                </Link>
              </Button>
            </div>
          </div>
          <DataTable 
            columns={columns} 
            data={entries} 
            isLoading={isLoading}
          />
        </TabsContent>
        
        <TabsContent value="bill" className="mt-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-medium">Bills & Invoices</h3>
            <Button asChild>
              <Link href="/ledger/new?type=bill">
                <FileText className="mr-2 h-4 w-4" />
                <span>New Bill</span>
              </Link>
            </Button>
          </div>
          <DataTable 
            columns={columns} 
            data={entries.filter(e => e.entryType === "BILL")} 
            isLoading={isLoading}
          />
        </TabsContent>
        
        <TabsContent value="transaction" className="mt-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-medium">Recent Financial Activities</h3>
            <Button asChild>
              <Link href="/ledger/new?type=transaction">
                <ArrowDownUp className="mr-2 h-4 w-4" />
                <span>New Transaction</span>
              </Link>
            </Button>
          </div>
          <DataTable 
            columns={columns} 
            data={entries.filter(e => e.entryType === "TRANSACTION")} 
            isLoading={isLoading}
          />
        </TabsContent>
        
        <TabsContent value="cheque" className="mt-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-medium">Cheques Pending to Clear</h3>
            <Button asChild>
              <Link href="/ledger/new?type=cheque">
                <Receipt className="mr-2 h-4 w-4" />
                <span>New Cheque</span>
              </Link>
            </Button>
          </div>
          <DataTable 
            columns={columns} 
            data={entries.filter(e => e.entryType === "CHEQUE")} 
            isLoading={isLoading}
          />
        </TabsContent>
        
        <TabsContent value="inventory" className="mt-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-medium">Inventory Items</h3>
            <Button asChild>
              <Link href="/ledger/new?type=inventory">
                <Package className="mr-2 h-4 w-4" />
                <span>Add Inventory</span>
              </Link>
            </Button>
          </div>
          <DataTable 
            columns={columns} 
            data={entries.filter(e => e.entryType === "INVENTORY")} 
            isLoading={isLoading}
          />
        </TabsContent>
        
        <TabsContent value="bank" className="mt-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-medium">Bank Accounts</h3>
            <Button asChild>
              <Link href="/ledger/new?type=bank">
                <Building className="mr-2 h-4 w-4" />
                <span>Add Bank Account</span>
              </Link>
            </Button>
          </div>
          <DataTable 
            columns={columns} 
            data={entries.filter(e => e.entryType === "BANK")} 
            isLoading={isLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
} 