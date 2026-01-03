import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const positions = await prisma.userPosition.findMany();

    // Format positions
    const formattedPositions = positions.map(p => ({
      id: p.id,
      userAddress: p.userAddress,
      marketId: p.marketId,
      totalSupplied: p.totalSupplied,
      totalWithdrawn: p.totalWithdrawn,
      netSupply: p.netSupply,
      netSupplyFormatted: (Number(p.netSupply) / 1e18).toFixed(4),
      totalBorrowed: p.totalBorrowed,
      totalRepaid: p.totalRepaid,
      netBorrow: p.netBorrow,
      netBorrowFormatted: (Number(p.netBorrow) / 1e6).toFixed(2),
      borrowShares: p.borrowShares,
    }));

    // Top suppliers
    const topSuppliers = formattedPositions
      .filter(p => BigInt(p.netSupply) > 0n)
      .sort((a, b) => Number(BigInt(b.netSupply) - BigInt(a.netSupply)))
      .slice(0, 10);

    // Top borrowers
    const topBorrowers = formattedPositions
      .filter(p => BigInt(p.netBorrow) > 0n)
      .sort((a, b) => Number(BigInt(b.netBorrow) - BigInt(a.netBorrow)))
      .slice(0, 10);

    // Distribution data for pie chart
    const supplyDistribution = topSuppliers.map(s => ({
      address: `${s.userAddress.slice(0, 6)}...${s.userAddress.slice(-4)}`,
      fullAddress: s.userAddress,
      value: Number(s.netSupplyFormatted),
    }));

    const borrowDistribution = topBorrowers.map(b => ({
      address: `${b.userAddress.slice(0, 6)}...${b.userAddress.slice(-4)}`,
      fullAddress: b.userAddress,
      value: Number(b.netBorrowFormatted),
    }));

    return NextResponse.json({
      positions: formattedPositions,
      topSuppliers,
      topBorrowers,
      supplyDistribution,
      borrowDistribution,
    });
  } catch (error) {
    console.error('Error fetching positions:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

