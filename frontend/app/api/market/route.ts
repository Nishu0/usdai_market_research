import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Get latest market snapshot
    const snapshot = await prisma.marketSnapshot.findFirst({
      orderBy: { timestamp: 'desc' },
    });

    // Get all user positions
    const positions = await prisma.userPosition.findMany();

    // Calculate active suppliers and borrowers
    const activeSuppliers = positions.filter(p => BigInt(p.netSupply) > 0n);
    const activeBorrowers = positions.filter(p => BigInt(p.netBorrow) > 0n);

    // Get total supply and borrow from snapshot
    const totalSupply = snapshot ? BigInt(snapshot.totalSupply) : 0n;
    const totalBorrow = snapshot ? BigInt(snapshot.totalBorrow) : 0n;

    return NextResponse.json({
      snapshot: snapshot ? {
        ...snapshot,
        totalSupplyFormatted: (Number(totalSupply) / 1e18).toFixed(2),
        totalBorrowFormatted: (Number(totalBorrow) / 1e6).toFixed(2),
      } : null,
      stats: {
        totalUsers: positions.length,
        activeSuppliers: activeSuppliers.length,
        activeBorrowers: activeBorrowers.length,
        totalSupply: totalSupply.toString(),
        totalBorrow: totalBorrow.toString(),
        totalSupplyFormatted: (Number(totalSupply) / 1e18).toFixed(2),
        totalBorrowFormatted: (Number(totalBorrow) / 1e6).toFixed(2),
      },
    });
  } catch (error) {
    console.error('Error fetching market data:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

