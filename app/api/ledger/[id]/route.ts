import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Decimal } from "@/types/prismaTypes";
import { LedgerEntryType, LedgerEntryStatus } from "@/app/lib/types";
import { ledgerDb } from "@/app/lib/ledger-db";

// Set up response headers for consistent API responses
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Define interface for transaction
interface Transaction {
  id: number;
  amount: Decimal;
  transactionDate: Date;
  chequeNumber?: string | null;
  bankName?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
  description: string;
  transactionType: string;
}

// Define interface for updateData - simplified to avoid type conflicts
interface UpdateData {
  description?: string;
  reference?: string | null;
  notes?: string | null;
  dueDate?: Date | null;
  entryDate?: Date;
  amount?: number;
  remainingAmount?: number;
  // We'll handle entryType and status directly when preparing data for Prisma
  vendor?: { connect: { id: number } } | { disconnect: boolean };
  customer?: { connect: { id: number } } | { disconnect: boolean };
}

// GET /api/ledger/:id - Get a specific ledger entry with transactions
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    
    // If it's a composite ID (type:id), extract the parts
    let entryId = id;
    let entryType = null;
    
    if (id.includes(':')) {
      const parts = id.split(':');
      entryType = parts[0];
      entryId = parts[1];
    }
    
    // Connect to the database
    await ledgerDb.$connect();
    
    // Fetch the entry based on its type
    let entry;
    let transactions = [];
    
    // If it's a bill
    if (entryType === 'bill' || !entryType) {
      // Try to find a bill with this ID
      const bill = await ledgerDb.bill.findUnique({
        where: { id: parseInt(entryId) },
        include: {
          party: true,
          transactions: {
            orderBy: { transactionDate: 'desc' }
          }
        }
      });
      
      if (bill) {
        // Format as a ledger entry
        entry = {
          id: `bill:${bill.id}`,
          entryType: 'BILL',
          description: `Bill #${bill.billNumber}`,
          party: bill.party?.name || 'Unknown',
          partyId: bill.partyId,
          reference: bill.billNumber,
          transactionType: bill.billType,
          entryDate: bill.billDate.toISOString(),
          dueDate: bill.dueDate?.toISOString() || null,
          amount: bill.amount.toString(),
          remainingAmount: (bill.amount - bill.paidAmount).toString(),
          status: bill.status,
          transactions: bill.transactions.map((t: {
            id: number;
            amount: any;
            transactionDate: Date;
            description: string;
            transactionType: string;
          }) => ({
            id: t.id,
            amount: t.amount.toString(),
            transactionDate: t.transactionDate.toISOString(),
            description: t.description,
            transactionType: t.transactionType
          }))
        };
        
        transactions = bill.transactions;
      }
    }
    
    // If no entry was found
    if (!entry) {
      return NextResponse.json(
        { error: "Ledger entry not found" },
        { status: 404 }
      );
    }
    
    // Return the entry
    return NextResponse.json({ entry, transactions });
  } catch (error: any) {
    console.error("Error fetching ledger entry:", error);
    return NextResponse.json(
      { error: "Failed to fetch ledger entry", details: error.message },
      { status: 500 }
    );
  } finally {
    await ledgerDb.$disconnect();
  }
}

// PATCH /api/ledger/:id - Update a ledger entry
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const data = await request.json();
    
    // If it's a composite ID (type:id), extract the parts
    let entryId = id;
    let entryType = null;
    
    if (id.includes(':')) {
      const parts = id.split(':');
      entryType = parts[0];
      entryId = parts[1];
    }
    
    // Connect to the database
    await ledgerDb.$connect();
    
    let updatedEntry;
    
    // If it's a bill
    if (entryType === 'bill' || !entryType) {
      // Try to update a bill with this ID
      updatedEntry = await ledgerDb.bill.update({
        where: { id: parseInt(entryId) },
        data: {
          status: data.status,
          updatedAt: new Date()
        },
        include: {
          party: true
        }
      });
      
      if (updatedEntry) {
        // Format as a ledger entry
        updatedEntry = {
          id: `bill:${updatedEntry.id}`,
          entryType: 'BILL',
          description: `Bill #${updatedEntry.billNumber}`,
          party: updatedEntry.party?.name || 'Unknown',
          partyId: updatedEntry.partyId,
          reference: updatedEntry.billNumber,
          transactionType: updatedEntry.billType,
          entryDate: updatedEntry.billDate.toISOString(),
          dueDate: updatedEntry.dueDate?.toISOString() || null,
          amount: updatedEntry.amount.toString(),
          remainingAmount: (updatedEntry.amount - updatedEntry.paidAmount).toString(),
          status: updatedEntry.status
        };
      }
    }
    
    // If no entry was updated
    if (!updatedEntry) {
      return NextResponse.json(
        { error: "Ledger entry not found or could not be updated" },
        { status: 404 }
      );
    }
    
    // Return the updated entry
    return NextResponse.json({ entry: updatedEntry });
  } catch (error: any) {
    console.error("Error updating ledger entry:", error);
    return NextResponse.json(
      { error: "Failed to update ledger entry", details: error.message },
      { status: 500 }
    );
  } finally {
    await ledgerDb.$disconnect();
  }
}

// DELETE /api/ledger/:id - Delete a ledger entry
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get id from params
    const id = params.id;
    
    // Check if it's a valid ID
    const numId = parseInt(id);
    if (isNaN(numId)) {
      return NextResponse.json(
        { error: "Invalid ID format" },
        { status: 400 }
      );
    }
    
    // Check if the entry exists and has no transactions
    const entry = await db.ledgerEntry.findUnique({
      where: { id: numId },
      include: {
        transactions: {
          select: { id: true },
        },
      },
    });

    if (!entry) {
      return NextResponse.json(
        { error: "Ledger entry not found" },
        { status: 404 }
      );
    }

    if (entry.transactions.length > 0) {
      return NextResponse.json(
        {
          error: "Cannot delete an entry with transactions. Cancel it instead.",
        },
        { status: 400 }
      );
    }

    // Delete the entry
    await db.ledgerEntry.delete({
      where: { id: numId },
    });

    return NextResponse.json({ success: true }, { headers });
  } catch (error) {
    console.error("Error deleting ledger entry:", error);
    return NextResponse.json(
      {
        error: "Failed to delete ledger entry",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
} 