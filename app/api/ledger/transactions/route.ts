import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PaymentMode } from "@prisma/client";

// Define interface for transaction data
interface TransactionData {
  ledgerEntryId: number;
  amount: number;
  paymentMode: PaymentMode;
  notes: string | null;
  referenceNumber: string | null;
  transactionDate?: Date;
  chequeNumber?: string;
  bankName?: string;
  updatedAt: Date;
}

/**
 * POST /api/ledger/transactions
 * 
 * Records a payment or receipt for a ledger entry.
 * 
 * @body {object} request body
 * @body {number} ledgerEntryId - ID of the ledger entry
 * @body {string} amount - Amount to be paid/received
 * @body {string} paymentMode - Payment method (CASH, CHEQUE, ONLINE)
 * @body {string} [transactionDate] - Date of transaction (defaults to current date)
 * @body {string} [chequeNumber] - Required for CHEQUE payment mode
 * @body {string} [bankName] - Bank name for CHEQUE payment mode
 * @body {string} [referenceNumber] - Optional reference number
 * @body {string} [notes] - Optional notes about the transaction
 * 
 * @returns {object} JSON response
 * @returns {boolean} success - Indicates if the transaction was successful
 * @returns {object} transaction - The created transaction details
 * @returns {object} updatedEntry - The updated ledger entry with new remaining amount
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields and format error responses for better UX
    if (!body.ledgerEntryId) {
      return NextResponse.json(
        { 
          error: "Ledger entry ID is required",
          field: "ledgerEntryId" 
        },
        { status: 400 }
      );
    }

    if (!body.amount || isNaN(parseFloat(body.amount)) || parseFloat(body.amount) <= 0) {
      return NextResponse.json(
        { 
          error: "Valid amount is required", 
          field: "amount",
          message: "Please enter a positive number"
        },
        { status: 400 }
      );
    }

    if (!body.paymentMode) {
      return NextResponse.json(
        { 
          error: "Payment mode is required",
          field: "paymentMode" 
        },
        { status: 400 }
      );
    }
    
    // Validate that paymentMode is a valid enum value
    const validPaymentModes = Object.values(PaymentMode);
    if (!validPaymentModes.includes(body.paymentMode)) {
      return NextResponse.json(
        { 
          error: "Invalid payment mode",
          validPaymentModes
        },
        { status: 400 }
      );
    }

    // Fetch the ledger entry to check the remaining amount
    const ledgerEntry = await db.ledgerEntry.findUnique({
      where: { id: parseInt(body.ledgerEntryId) },
    });

    if (!ledgerEntry) {
      return NextResponse.json(
        { error: "Ledger entry not found" },
        { status: 404 }
      );
    }

    // Check if the transaction amount exceeds the remaining amount
    const transactionAmount = parseFloat(body.amount);
    const remainingAmount = parseFloat(ledgerEntry.remainingAmount.toString());

    if (transactionAmount > remainingAmount) {
      return NextResponse.json(
        { 
          error: "Transaction amount cannot exceed the remaining amount", 
          remainingAmount: remainingAmount.toString()
        },
        { status: 400 }
      );
    }

    // Create the transaction
    const transactionData: TransactionData = {
      ledgerEntryId: parseInt(body.ledgerEntryId),
      amount: transactionAmount,
      paymentMode: body.paymentMode as PaymentMode,
      notes: body.notes?.trim() || null,
      referenceNumber: body.referenceNumber?.trim() || null,
      chequeNumber: undefined,
      bankName: undefined,
      updatedAt: new Date()
    };

    // Add transaction date if provided
    if (body.transactionDate) {
      transactionData.transactionDate = new Date(body.transactionDate);
    }

    // Add cheque details if payment mode is CHEQUE
    if (body.paymentMode === PaymentMode.CHEQUE) {
      if (!body.chequeNumber) {
        return NextResponse.json(
          { error: "Cheque number is required for cheque payments" },
          { status: 400 }
        );
      }
      
      transactionData.chequeNumber = body.chequeNumber.trim();
      transactionData.bankName = body.bankName?.trim() || null;
    }

    // Use transaction to ensure data consistency
    const result = await db.$transaction(async (prisma) => {
      // Create the transaction
      const newTransaction = await prisma.ledgerTransaction.create({
        data: transactionData,
      });

      // Update the ledger entry's remaining amount and status
      const newRemainingAmount = remainingAmount - transactionAmount;
      let newStatus = ledgerEntry.status;

      if (newRemainingAmount <= 0) {
        newStatus = "COMPLETED";
      } else if (newRemainingAmount < parseFloat(ledgerEntry.amount.toString())) {
        newStatus = "PARTIAL";
      }

      const updatedEntry = await prisma.ledgerEntry.update({
        where: { id: ledgerEntry.id },
        data: {
          remainingAmount: newRemainingAmount,
          status: newStatus,
        },
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
            },
          },
          customer: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return {
        transaction: newTransaction,
        updatedEntry: updatedEntry,
      };
    });

    return NextResponse.json(
      {
        success: true,
        transaction: {
          ...result.transaction,
          amount: result.transaction.amount.toString(),
          transactionDate: result.transaction.transactionDate.toISOString(),
          createdAt: result.transaction.createdAt.toISOString(),
          updatedAt: result.transaction.updatedAt.toISOString(),
        },
        updatedEntry: {
          ...result.updatedEntry,
          amount: result.updatedEntry.amount.toString(),
          remainingAmount: result.updatedEntry.remainingAmount.toString(),
          entryDate: result.updatedEntry.entryDate.toISOString(),
          dueDate: result.updatedEntry.dueDate?.toISOString(),
          createdAt: result.updatedEntry.createdAt.toISOString(),
          updatedAt: result.updatedEntry.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating ledger transaction:", error);
    return NextResponse.json(
      {
        error: "Failed to create ledger transaction",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
} 