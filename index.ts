// Fetch all suppliers and borrowers for a Morpho Blue market and store in DB
import 'dotenv/config';
import { ethers, EventLog, Log } from 'ethers';
import { PrismaClient } from './generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

// PT-USDAI-19FEB2026-USDC market
const MARKET_ID = '0x8147c63f3f6f5a0825c84bf2cb11443c72b609fa39cf9a362e3d4dc2c5ca76c4';
const MORPHO_ADDRESS = '0x6c247b1F6182318877311737BaC0844bAa518F5e';

// Decimals for the tokens
const COLLATERAL_DECIMALS = 18; // PT-USDAI
const LOAN_DECIMALS = 6; // USDC

const provider = new ethers.JsonRpcProvider('https://arb-mainnet.g.alchemy.com/v2/jZBi5iikKGNsm8Dll-CsR');

// Set up Prisma with pg adapter
const pool = new pg.Pool({ 
  connectionString: process.env.DB_URL,
  ssl: { rejectUnauthorized: false },  // Allow self-signed certificates
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Morpho ABI for relevant events
const MORPHO_ABI = [
  'event SupplyCollateral(bytes32 indexed id, address indexed caller, address indexed onBehalf, uint256 assets)',
  'event Supply(bytes32 indexed id, address indexed caller, address indexed onBehalf, uint256 assets, uint256 shares)',
  'event WithdrawCollateral(bytes32 indexed id, address caller, address indexed onBehalf, address indexed receiver, uint256 assets)',
  'event Withdraw(bytes32 indexed id, address caller, address indexed onBehalf, address indexed receiver, uint256 assets, uint256 shares)',
  'event Borrow(bytes32 indexed id, address caller, address indexed onBehalf, address indexed receiver, uint256 assets, uint256 shares)',
  'event Repay(bytes32 indexed id, address indexed caller, address indexed onBehalf, uint256 assets, uint256 shares)'
];

const morphoContract = new ethers.Contract(MORPHO_ADDRESS, MORPHO_ABI, provider);

interface ActivityEvent {
  type: 'supply' | 'withdraw' | 'borrow' | 'repay';
  amount: bigint;
  amountFormatted: string;
  userAddress: string;
  transactionHash: string;
  blockNumber: number;
  shares?: bigint;
}

// JSON-serializable version of activity
interface ActivityForJson {
  type: string;
  amount: string;
  amountFormatted: string;
  userAddress: string;
  transactionHash: string;
  blockNumber: number;
  timestamp: string;
  marketId: string;
  shares?: string;
}

// Save data to JSON file
function saveToJson(filename: string, data: any) {
  const outputDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const filepath = path.join(outputDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`  Saved to ${filepath}`);
}

// Fetch logs in batches with retry logic
async function fetchLogsInBatches(
  filter: ethers.ContractEventName,
  fromBlock: number,
  toBlock: number,
  batchSize: number = 50000
): Promise<(EventLog | Log)[]> {
  const allLogs: (EventLog | Log)[] = [];
  
  for (let start = fromBlock; start <= toBlock; start += batchSize) {
    const end = Math.min(start + batchSize - 1, toBlock);
    process.stdout.write(`  Fetching blocks ${start} to ${end}...`);
    
    try {
      const logs = await morphoContract.queryFilter(filter, start, end);
      allLogs.push(...logs);
      console.log(` found ${logs.length} events`);
    } catch (error: any) {
      console.log(' retrying with smaller batch...');
      if (error.message?.includes('block range') || error.code === 'SERVER_ERROR') {
        const smallerBatch = Math.floor(batchSize / 5);
        if (smallerBatch >= 1000) {
          const subLogs = await fetchLogsInBatches(filter, start, end, smallerBatch);
          allLogs.push(...subLogs);
        }
      } else {
        throw error;
      }
    }
    
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
  }
  
  return allLogs;
}

async function getBlockTimestamp(blockNumber: number): Promise<Date> {
  const block = await provider.getBlock(blockNumber);
  return new Date((block?.timestamp || 0) * 1000);
}

// Cache for block timestamps
const timestampCache = new Map<number, Date>();

async function getBlockTimestampCached(blockNumber: number): Promise<Date> {
  if (timestampCache.has(blockNumber)) {
    return timestampCache.get(blockNumber)!;
  }
  const timestamp = await getBlockTimestamp(blockNumber);
  timestampCache.set(blockNumber, timestamp);
  return timestamp;
}

async function processAndStoreEvents() {
  const currentBlock = await provider.getBlockNumber();
  // Morpho Blue on Arbitrum deployed around Dec 2024 - block ~300M
  // This market (PT-USDAI) is even more recent - around block 380M+
  const fromBlock = 400000000;
  
  console.log(`Current block: ${currentBlock}`);
  console.log(`Scanning from block ${fromBlock} to ${currentBlock}\n`);

  const allActivities: ActivityEvent[] = [];
  
  // Fetch Supply Collateral events
  console.log('Fetching supply collateral events...');
  const supplyFilter = morphoContract.filters.SupplyCollateral(MARKET_ID);
  const supplyEvents = await fetchLogsInBatches(supplyFilter, fromBlock, currentBlock);
  console.log(`  Total: ${supplyEvents.length} supply events\n`);
  
  for (const event of supplyEvents) {
    if (!(event instanceof EventLog)) continue;
    const { onBehalf, assets } = event.args;
    allActivities.push({
      type: 'supply',
      amount: BigInt(assets.toString()),
      amountFormatted: ethers.formatUnits(assets, COLLATERAL_DECIMALS),
      userAddress: onBehalf,
      transactionHash: event.transactionHash,
      blockNumber: event.blockNumber
    });
  }

  // Fetch Withdraw Collateral events
  console.log('Fetching withdraw collateral events...');
  const withdrawFilter = morphoContract.filters.WithdrawCollateral(MARKET_ID);
  const withdrawEvents = await fetchLogsInBatches(withdrawFilter, fromBlock, currentBlock);
  console.log(`  Total: ${withdrawEvents.length} withdraw events\n`);
  
  for (const event of withdrawEvents) {
    if (!(event instanceof EventLog)) continue;
    const { onBehalf, assets } = event.args;
    allActivities.push({
      type: 'withdraw',
      amount: BigInt(assets.toString()),
      amountFormatted: ethers.formatUnits(assets, COLLATERAL_DECIMALS),
      userAddress: onBehalf,
      transactionHash: event.transactionHash,
      blockNumber: event.blockNumber
    });
  }

  // Fetch Borrow events
  console.log('Fetching borrow events...');
  const borrowFilter = morphoContract.filters.Borrow(MARKET_ID);
  const borrowEvents = await fetchLogsInBatches(borrowFilter, fromBlock, currentBlock);
  console.log(`  Total: ${borrowEvents.length} borrow events\n`);
  
  for (const event of borrowEvents) {
    if (!(event instanceof EventLog)) continue;
    const { onBehalf, assets, shares } = event.args;
    allActivities.push({
      type: 'borrow',
      amount: BigInt(assets.toString()),
      amountFormatted: ethers.formatUnits(assets, LOAN_DECIMALS),
      userAddress: onBehalf,
      transactionHash: event.transactionHash,
      blockNumber: event.blockNumber,
      shares: BigInt(shares.toString())
    });
  }

  // Fetch Repay events
  console.log('Fetching repay events...');
  const repayFilter = morphoContract.filters.Repay(MARKET_ID);
  const repayEvents = await fetchLogsInBatches(repayFilter, fromBlock, currentBlock);
  console.log(`  Total: ${repayEvents.length} repay events\n`);
  
  for (const event of repayEvents) {
    if (!(event instanceof EventLog)) continue;
    const { onBehalf, assets } = event.args;
    allActivities.push({
      type: 'repay',
      amount: BigInt(assets.toString()),
      amountFormatted: ethers.formatUnits(assets, LOAN_DECIMALS),
      userAddress: onBehalf,
      transactionHash: event.transactionHash,
      blockNumber: event.blockNumber
    });
  }

  console.log(`\nTotal activities to store: ${allActivities.length}`);
  
  // Get unique block numbers for timestamp fetching
  const uniqueBlocks = [...new Set(allActivities.map(a => a.blockNumber))].sort((a, b) => a - b);
  console.log(`Fetching timestamps for ${uniqueBlocks.length} unique blocks...`);
  
  // Batch fetch timestamps
  for (let i = 0; i < uniqueBlocks.length; i += 10) {
    const batch = uniqueBlocks.slice(i, i + 10);
    await Promise.all(batch.map(b => getBlockTimestampCached(b)));
    process.stdout.write(`  Fetched ${Math.min(i + 10, uniqueBlocks.length)}/${uniqueBlocks.length} timestamps\r`);
  }
  console.log('\n');

  // Prepare JSON-serializable activities with timestamps
  const activitiesForJson: ActivityForJson[] = [];
  for (const activity of allActivities) {
    const timestamp = await getBlockTimestampCached(activity.blockNumber);
    activitiesForJson.push({
      type: activity.type,
      amount: activity.amount.toString(),
      amountFormatted: activity.amountFormatted,
      userAddress: activity.userAddress,
      transactionHash: activity.transactionHash,
      blockNumber: activity.blockNumber,
      timestamp: timestamp.toISOString(),
      marketId: MARKET_ID,
      shares: activity.shares?.toString()
    });
  }

  // Calculate user positions
  console.log('Calculating user positions...');
  const userPositions = new Map<string, {
    totalSupplied: bigint;
    totalWithdrawn: bigint;
    totalBorrowed: bigint;
    totalRepaid: bigint;
    borrowShares: bigint;
  }>();

  for (const activity of allActivities) {
    if (!userPositions.has(activity.userAddress)) {
      userPositions.set(activity.userAddress, {
        totalSupplied: 0n,
        totalWithdrawn: 0n,
        totalBorrowed: 0n,
        totalRepaid: 0n,
        borrowShares: 0n
      });
    }
    
    const pos = userPositions.get(activity.userAddress)!;
    
    switch (activity.type) {
      case 'supply':
        pos.totalSupplied += activity.amount;
        break;
      case 'withdraw':
        pos.totalWithdrawn += activity.amount;
        break;
      case 'borrow':
        pos.totalBorrowed += activity.amount;
        pos.borrowShares += activity.shares || 0n;
        break;
      case 'repay':
        pos.totalRepaid += activity.amount;
        break;
    }
  }

  // Prepare user positions for JSON
  const userPositionsForJson = [...userPositions.entries()].map(([userAddress, pos]) => ({
    userAddress,
    marketId: MARKET_ID,
    totalSupplied: pos.totalSupplied.toString(),
    totalWithdrawn: pos.totalWithdrawn.toString(),
    netSupply: (pos.totalSupplied - pos.totalWithdrawn).toString(),
    totalBorrowed: pos.totalBorrowed.toString(),
    totalRepaid: pos.totalRepaid.toString(),
    netBorrow: (pos.totalBorrowed - pos.totalRepaid).toString(),
    borrowShares: pos.borrowShares.toString()
  }));

  // Calculate totals
  let totalSupply = 0n;
  let totalBorrow = 0n;
  
  for (const pos of userPositions.values()) {
    const netSupply = pos.totalSupplied - pos.totalWithdrawn;
    const netBorrow = pos.totalBorrowed - pos.totalRepaid;
    if (netSupply > 0n) totalSupply += netSupply;
    if (netBorrow > 0n) totalBorrow += netBorrow;
  }

  const marketSnapshot = {
    marketId: MARKET_ID,
    totalSupply: totalSupply.toString(),
    totalSupplyFormatted: ethers.formatUnits(totalSupply, COLLATERAL_DECIMALS),
    totalBorrow: totalBorrow.toString(),
    totalBorrowFormatted: ethers.formatUnits(totalBorrow, LOAN_DECIMALS),
    snapshotBlock: currentBlock,
    timestamp: new Date().toISOString()
  };

  // Always save to JSON as backup
  console.log('Saving data to JSON files (backup)...');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  saveToJson(`activities_${timestamp}.json`, activitiesForJson);
  saveToJson(`user_positions_${timestamp}.json`, userPositionsForJson);
  saveToJson(`market_snapshot_${timestamp}.json`, marketSnapshot);
  
  // Also save a "latest" version for easy access
  saveToJson('activities_latest.json', activitiesForJson);
  saveToJson('user_positions_latest.json', userPositionsForJson);
  saveToJson('market_snapshot_latest.json', marketSnapshot);

  // Try to store in database
  let dbSuccess = false;
  console.log('\nStoring activities in database...');
  
  try {
    let stored = 0;
    let skipped = 0;
    
    for (const activity of activitiesForJson) {
      try {
        await prisma.marketActivity.upsert({
          where: {
            transactionHash_type_userAddress: {
              transactionHash: activity.transactionHash,
              type: activity.type,
              userAddress: activity.userAddress
            }
          },
          update: {},
          create: {
            type: activity.type,
            amount: activity.amount,
            amountFormatted: activity.amountFormatted,
            userAddress: activity.userAddress,
            transactionHash: activity.transactionHash,
            blockNumber: activity.blockNumber,
            timestamp: new Date(activity.timestamp),
            marketId: MARKET_ID
          }
        });
        stored++;
      } catch (error) {
        skipped++;
      }
      
      if ((stored + skipped) % 100 === 0) {
        process.stdout.write(`  Processed ${stored + skipped}/${activitiesForJson.length} (stored: ${stored}, skipped: ${skipped})\r`);
      }
    }
    console.log(`\n  Stored: ${stored}, Skipped (duplicates): ${skipped}`);

    // Store user positions
    console.log('Storing user positions in database...');
    for (const pos of userPositionsForJson) {
      await prisma.userPosition.upsert({
        where: { userAddress: pos.userAddress },
        update: {
          totalSupplied: pos.totalSupplied,
          totalWithdrawn: pos.totalWithdrawn,
          netSupply: pos.netSupply,
          totalBorrowed: pos.totalBorrowed,
          totalRepaid: pos.totalRepaid,
          netBorrow: pos.netBorrow,
          borrowShares: pos.borrowShares
        },
        create: {
          userAddress: pos.userAddress,
          marketId: MARKET_ID,
          totalSupplied: pos.totalSupplied,
          totalWithdrawn: pos.totalWithdrawn,
          netSupply: pos.netSupply,
          totalBorrowed: pos.totalBorrowed,
          totalRepaid: pos.totalRepaid,
          netBorrow: pos.netBorrow,
          borrowShares: pos.borrowShares
        }
      });
    }

    // Store market snapshot
    await prisma.marketSnapshot.create({
      data: {
        marketId: MARKET_ID,
        totalSupply: marketSnapshot.totalSupply,
        totalBorrow: marketSnapshot.totalBorrow,
        snapshotBlock: currentBlock,
        timestamp: new Date()
      }
    });

    dbSuccess = true;
    console.log('  Database storage completed successfully!');
    
    const activityCount = await prisma.marketActivity.count();
    const positionCount = await prisma.userPosition.count();
    console.log(`  Total Activities in DB: ${activityCount}`);
    console.log(`  Total User Positions in DB: ${positionCount}`);
    
  } catch (error: any) {
    console.error('\n  Database storage failed:', error.message);
    console.log('  Data has been saved to JSON files in the output/ directory');
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('MARKET SUMMARY');
  console.log('='.repeat(60));
  
  const suppliers = [...userPositions.entries()].filter(([_, p]) => p.totalSupplied - p.totalWithdrawn > 0n);
  const borrowers = [...userPositions.entries()].filter(([_, p]) => p.totalBorrowed - p.totalRepaid > 0n);
  
  console.log(`\nTotal Unique Users: ${userPositions.size}`);
  console.log(`Active Suppliers: ${suppliers.length}`);
  console.log(`Active Borrowers: ${borrowers.length}`);
  
  console.log(`\nTotal Collateral Supplied: ${ethers.formatUnits(totalSupply, COLLATERAL_DECIMALS)} PT-USDAI`);
  console.log(`Total Borrowed: ${ethers.formatUnits(totalBorrow, LOAN_DECIMALS)} USDC`);
  
  console.log('\n' + '='.repeat(60));
  console.log('TOP SUPPLIERS (by collateral)');
  console.log('='.repeat(60));
  
  suppliers
    .sort((a, b) => Number((b[1].totalSupplied - b[1].totalWithdrawn) - (a[1].totalSupplied - a[1].totalWithdrawn)))
    .slice(0, 10)
    .forEach(([addr, pos], i) => {
      const net = pos.totalSupplied - pos.totalWithdrawn;
      console.log(`${i + 1}. ${addr}`);
      console.log(`   Collateral: ${ethers.formatUnits(net, COLLATERAL_DECIMALS)} PT-USDAI`);
    });

  console.log('\n' + '='.repeat(60));
  console.log('TOP BORROWERS');
  console.log('='.repeat(60));
  
  borrowers
    .sort((a, b) => Number((b[1].totalBorrowed - b[1].totalRepaid) - (a[1].totalBorrowed - a[1].totalRepaid)))
    .slice(0, 10)
    .forEach(([addr, pos], i) => {
      const net = pos.totalBorrowed - pos.totalRepaid;
      console.log(`${i + 1}. ${addr}`);
      console.log(`   Borrowed: ${ethers.formatUnits(net, LOAN_DECIMALS)} USDC`);
    });

  console.log('\n' + '='.repeat(60));
  console.log('DATA STORAGE SUMMARY');
  console.log('='.repeat(60));
  console.log(`Database: ${dbSuccess ? '✅ Success' : '❌ Failed (see JSON files)'}`);
  console.log(`JSON Files: ✅ Saved to output/ directory`);
  console.log('\nData is ready for graph plotting!');
}

async function main() {
  try {
    await processAndStoreEvents();
  } catch (error) {
    console.error('Error:', error);
  } finally {
    try {
      await prisma.$disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
    await pool.end();
  }
}

main();
