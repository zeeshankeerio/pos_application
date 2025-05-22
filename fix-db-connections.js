// Database connection fix script
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function main() {
  console.log('🔧 Database Connection Fix Script 🔧');
  console.log('This script will check connections to both databases and fix common issues');
  
  // Check if .env file exists
  if (!fs.existsSync('.env')) {
    console.log('⚠️ No .env file found, creating one...');
    
    const envContent = `DATABASE_URL=postgresql://postgres.yfxoalablmripacasgct:Jan@2132613@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.yfxoalablmripacasgct:Jan@2132613@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
LEDGER_DATABASE_URL=postgresql://postgres.yfxoalablmripacasgct:Jan@2132613@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&schema=ledger
LEDGER_DIRECT_URL=postgresql://postgres.yfxoalablmripacasgct:Jan@2132613@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?schema=ledger
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_YXJ0aXN0aWMtbGFyay04MS5jbGVyay5hY2NvdW50cy5kZXYk
CLERK_SECRET_KEY=sk_test_6TKkKCFcSqAZuPVFcCp1gOjpy3G2treEgpOr9GfURY
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/`;
    
    fs.writeFileSync('.env', envContent, 'utf8');
    console.log('✅ .env file created successfully');
  }
  
  // Check main database connection
  console.log('\n🔍 Checking main database connection...');
  try {
    const prisma = new PrismaClient();
    const result = await prisma.$queryRaw`SELECT current_timestamp;`;
    console.log('✅ Main database connection successful!', result);
    await prisma.$disconnect();
    
    // Push schema changes
    console.log('\n🔄 Pushing main schema changes...');
    try {
      await execAsync('npx prisma db push --schema=prisma/schema.prisma --accept-data-loss');
      console.log('✅ Main schema pushed successfully');
    } catch (pushError) {
      console.error('❌ Error pushing main schema:', pushError.message);
    }
    
  } catch (err) {
    console.error('❌ Main database connection error:', err.message);
  }
  
  // Check ledger database connection
  console.log('\n🔍 Checking ledger database connection...');
  try {
    // Temporary workaround to use the ledger client directly
    process.env.DATABASE_URL = process.env.LEDGER_DATABASE_URL;
    process.env.DIRECT_URL = process.env.LEDGER_DIRECT_URL;
    
    // Reset Prisma client
    const prismaLedger = new PrismaClient();
    const resultLedger = await prismaLedger.$queryRaw`SELECT current_timestamp;`;
    console.log('✅ Ledger database connection successful!', resultLedger);
    await prismaLedger.$disconnect();
    
    // Push ledger schema changes
    console.log('\n🔄 Pushing ledger schema changes...');
    try {
      await execAsync('npx prisma db push --schema=prisma/schema-ledger.prisma --accept-data-loss');
      console.log('✅ Ledger schema pushed successfully');
    } catch (pushError) {
      console.error('❌ Error pushing ledger schema:', pushError.message);
    }
    
  } catch (err) {
    console.error('❌ Ledger database connection error:', err.message);
  }
  
  // Generate Prisma clients
  console.log('\n🔄 Generating Prisma clients...');
  try {
    await execAsync('npx prisma generate');
    console.log('✅ Main Prisma client generated');
  } catch (genError) {
    console.error('❌ Error generating main client:', genError.message);
  }
  
  try {
    await execAsync('npx prisma generate --schema=prisma/schema-ledger.prisma');
    console.log('✅ Ledger Prisma client generated');
  } catch (genError) {
    console.error('❌ Error generating ledger client:', genError.message);
  }
  
  console.log('\n🎉 Database connection fix completed!');
  console.log('You can now start the application with: npm run dev');
}

main().catch(e => {
  console.error('Script execution error:', e);
  process.exit(1);
}); 