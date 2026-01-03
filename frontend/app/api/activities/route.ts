import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Get all activities ordered by timestamp
    const activities = await prisma.marketActivity.findMany({
      orderBy: { timestamp: 'asc' },
    });

    // Format activities for the frontend
    const formattedActivities = activities.map(a => ({
      id: a.id,
      type: a.type,
      amount: a.amount,
      amountFormatted: a.amountFormatted,
      userAddress: a.userAddress,
      transactionHash: a.transactionHash,
      blockNumber: a.blockNumber,
      timestamp: a.timestamp.toISOString(),
      marketId: a.marketId,
    }));

    // Group by type for chart data
    const supplyEvents = activities.filter(a => a.type === 'supply');
    const withdrawEvents = activities.filter(a => a.type === 'withdraw');
    const borrowEvents = activities.filter(a => a.type === 'borrow');
    const repayEvents = activities.filter(a => a.type === 'repay');

    // Calculate cumulative supply over time
    const cumulativeData: { timestamp: string; supply: number; borrow: number }[] = [];
    let runningSupply = 0;
    let runningBorrow = 0;

    // Sort all activities by time
    const sortedActivities = [...activities].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    for (const activity of sortedActivities) {
      const amount = Number(activity.amountFormatted);
      
      switch (activity.type) {
        case 'supply':
          runningSupply += amount;
          break;
        case 'withdraw':
          runningSupply -= amount;
          break;
        case 'borrow':
          runningBorrow += amount;
          break;
        case 'repay':
          runningBorrow -= amount;
          break;
      }

      cumulativeData.push({
        timestamp: activity.timestamp.toISOString(),
        supply: runningSupply,
        borrow: runningBorrow,
      });
    }

    // Sample data for chart (take every Nth point to reduce data size)
    const sampleSize = Math.max(1, Math.floor(cumulativeData.length / 50));
    const sampledData = cumulativeData.filter((_, i) => i % sampleSize === 0 || i === cumulativeData.length - 1);

    return NextResponse.json({
      activities: formattedActivities,
      chartData: sampledData,
      summary: {
        totalSupplyEvents: supplyEvents.length,
        totalWithdrawEvents: withdrawEvents.length,
        totalBorrowEvents: borrowEvents.length,
        totalRepayEvents: repayEvents.length,
      },
    });
  } catch (error) {
    console.error('Error fetching activities:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

