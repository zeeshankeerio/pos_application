// This dummy route file ensures API routes aren't statically generated
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// Simple response to ensure this route works
export async function GET() {
  return Response.json({ status: 'API is running' });
} 