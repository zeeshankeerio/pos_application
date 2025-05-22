'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export default function LedgerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Ledger error:', error);
  }, [error]);

  return (
    <div className="container mx-auto p-6">
      <div className="max-w-4xl mx-auto">
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle className="text-lg font-semibold mb-2">Error Loading Ledger</AlertTitle>
          <AlertDescription>
            <div className="space-y-4">
              <p>
                {process.env.NODE_ENV === 'production'
                  ? 'An error occurred while loading the ledger data. This could be due to database connection issues or server problems.'
                  : `Error: ${error.message}`
                }
              </p>
              
              {process.env.NODE_ENV !== 'production' && error.stack && (
                <div className="text-xs overflow-auto bg-destructive/5 p-2 rounded">
                  <pre>{error.stack}</pre>
                </div>
              )}
              
              <div className="flex gap-4 pt-2">
                <Button onClick={reset} variant="default">
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Try Again
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={() => window.location.href = '/dashboard'}
                >
                  Return to Dashboard
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
} 