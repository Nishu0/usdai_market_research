"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Area, AreaChart, Bar, BarChart, XAxis, YAxis, CartesianGrid, Pie, PieChart, Cell } from "recharts";

interface MarketData {
  snapshot: {
    totalSupplyFormatted: string;
    totalBorrowFormatted: string;
    snapshotBlock: number;
    timestamp: string;
  } | null;
  stats: {
    totalUsers: number;
    activeSuppliers: number;
    activeBorrowers: number;
    totalSupplyFormatted: string;
    totalBorrowFormatted: string;
  };
}

interface Activity {
  id: string;
  type: string;
  amountFormatted: string;
  userAddress: string;
  transactionHash: string;
  timestamp: string;
}

interface ActivitiesData {
  chartData: { timestamp: string; supply: number; borrow: number }[];
  summary: {
    totalSupplyEvents: number;
    totalWithdrawEvents: number;
    totalBorrowEvents: number;
    totalRepayEvents: number;
  };
  activities: Activity[];
}

interface PositionsData {
  topSuppliers: {
    userAddress: string;
    netSupplyFormatted: string;
  }[];
  topBorrowers: {
    userAddress: string;
    netBorrowFormatted: string;
  }[];
  supplyDistribution: { address: string; fullAddress: string; value: number }[];
  borrowDistribution: { address: string; fullAddress: string; value: number }[];
}

const areaChartConfig: ChartConfig = {
  supply: {
    label: "Collateral (PT-USDAI)",
    color: "hsl(142, 76%, 36%)",
  },
  borrow: {
    label: "Borrowed (USDC)",
    color: "hsl(346, 87%, 43%)",
  },
};

const pieColors = [
  "hsl(221, 83%, 53%)",
  "hsl(142, 76%, 36%)",
  "hsl(38, 92%, 50%)",
  "hsl(346, 87%, 43%)",
  "hsl(262, 83%, 58%)",
  "hsl(199, 89%, 48%)",
  "hsl(24, 95%, 53%)",
  "hsl(173, 80%, 40%)",
  "hsl(291, 64%, 42%)",
  "hsl(47, 100%, 50%)",
];

const ITEMS_PER_PAGE = 5;

// Format number to K, M, B
function formatNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(2) + 'B';
  }
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(2) + 'K';
  }
  return num.toFixed(2);
}

// Format with currency
function formatCurrency(num: number, prefix = ''): string {
  return prefix + formatNumber(num);
}

// Pagination component
function Pagination({ 
  currentPage, 
  totalPages, 
  onPageChange 
}: { 
  currentPage: number; 
  totalPages: number; 
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2 mt-4">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-3 py-1 text-sm rounded-md border border-slate-600 text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        ←
      </button>
      <span className="text-sm text-slate-400">
        {currentPage} / {totalPages}
      </span>
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="px-3 py-1 text-sm rounded-md border border-slate-600 text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        →
      </button>
    </div>
  );
}

// Address Combobox Filter
function AddressFilter({
  addresses,
  value,
  onChange,
}: {
  addresses: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center justify-between w-full px-3 py-2 text-sm rounded-md border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700">
          {value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "All Addresses"}
          <span className="ml-2">▼</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0 bg-slate-800 border-slate-600" align="start">
        <Command className="bg-slate-800">
          <CommandInput placeholder="Search address..." className="text-slate-300" />
          <CommandList>
            <CommandEmpty className="text-slate-400 py-2 text-center text-sm">No address found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="text-slate-300 hover:bg-slate-700 cursor-pointer"
              >
                All Addresses
              </CommandItem>
              {addresses.map((addr) => (
                <CommandItem
                  key={addr}
                  onSelect={() => {
                    onChange(addr);
                    setOpen(false);
                  }}
                  className="text-slate-300 hover:bg-slate-700 cursor-pointer font-mono text-xs"
                >
                  {addr.slice(0, 10)}...{addr.slice(-8)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function Dashboard() {
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [activitiesData, setActivitiesData] = useState<ActivitiesData | null>(null);
  const [positionsData, setPositionsData] = useState<PositionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination states
  const [supplierPage, setSupplierPage] = useState(1);
  const [borrowerPage, setBorrowerPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);

  // Filter states
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [addressFilter, setAddressFilter] = useState<string>("");

  useEffect(() => {
    async function fetchData() {
      try {
        const [marketRes, activitiesRes, positionsRes] = await Promise.all([
          fetch("/api/market"),
          fetch("/api/activities"),
          fetch("/api/positions"),
        ]);

        if (!marketRes.ok || !activitiesRes.ok || !positionsRes.ok) {
          throw new Error("Failed to fetch data");
        }

        const [market, activities, positions] = await Promise.all([
          marketRes.json(),
          activitiesRes.json(),
          positionsRes.json(),
        ]);

        setMarketData(market);
        setActivitiesData(activities);
        setPositionsData(positions);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Get unique addresses for filter
  const uniqueAddresses = useMemo(() => {
    if (!activitiesData) return [];
    const addresses = new Set(activitiesData.activities.map(a => a.userAddress));
    return Array.from(addresses).sort();
  }, [activitiesData]);

  // Filtered activities
  const filteredActivities = useMemo(() => {
    if (!activitiesData) return [];
    
    let filtered = [...activitiesData.activities];
    
    if (typeFilter !== "all") {
      filtered = filtered.filter(a => a.type === typeFilter);
    }
    
    if (addressFilter) {
      filtered = filtered.filter(a => a.userAddress === addressFilter);
    }
    
    return filtered.reverse();
  }, [activitiesData, typeFilter, addressFilter]);

  // Reset pagination when filters change
  useEffect(() => {
    setActivityPage(1);
  }, [typeFilter, addressFilter]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-emerald-500 border-r-transparent"></div>
          <p className="mt-4 text-lg text-slate-300">Loading market data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-900 via-slate-800 to-slate-900">
        <Card className="w-96 border-red-500/50 bg-slate-800/50">
          <CardHeader>
            <CardTitle className="text-red-400">Error</CardTitle>
            <CardDescription className="text-slate-400">{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const formatAddress = (address: string) => `${address.slice(0, 4)}...${address.slice(-4)}`;
  const getArbiscanAddressUrl = (address: string) => `https://arbiscan.io/address/${address}`;

  // Pagination calculations
  const totalSupplierPages = Math.ceil((positionsData?.topSuppliers.length || 0) / ITEMS_PER_PAGE);
  const totalBorrowerPages = Math.ceil((positionsData?.topBorrowers.length || 0) / ITEMS_PER_PAGE);
  const totalActivityPages = Math.max(1, Math.ceil(filteredActivities.length / ITEMS_PER_PAGE));

  const paginatedSuppliers = positionsData?.topSuppliers.slice(
    (supplierPage - 1) * ITEMS_PER_PAGE,
    supplierPage * ITEMS_PER_PAGE
  ) || [];

  const paginatedBorrowers = positionsData?.topBorrowers.slice(
    (borrowerPage - 1) * ITEMS_PER_PAGE,
    borrowerPage * ITEMS_PER_PAGE
  ) || [];

  const paginatedActivities = filteredActivities.slice(
    (activityPage - 1) * ITEMS_PER_PAGE,
    activityPage * ITEMS_PER_PAGE
  );

  // Format pie chart data with better labels
  const supplyPieData = positionsData?.supplyDistribution.map(d => ({
    ...d,
    address: `${d.fullAddress.slice(0, 4)}...${d.fullAddress.slice(-4)}`,
  })) || [];

  const borrowPieData = positionsData?.borrowDistribution.map(d => ({
    ...d,
    address: `${d.fullAddress.slice(0, 4)}...${d.fullAddress.slice(-4)}`,
  })) || [];

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Morpho Blue Market
            </h1>
            <p className="text-slate-400">PT-USDAI-19FEB2026 / USDC</p>
          </div>
          <Badge variant="outline" className="border-emerald-500/50 text-emerald-400">
            Arbitrum
          </Badge>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400">Total Collateral</CardDescription>
              <CardTitle className="text-2xl font-bold text-emerald-400">
                {formatNumber(Number(marketData?.stats.totalSupplyFormatted || 0))} 
                <span className="ml-1 text-sm text-slate-400">PT-USDAI</span>
              </CardTitle>
            </CardHeader>
          </Card>
          
          <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400">Total Borrowed</CardDescription>
              <CardTitle className="text-2xl font-bold text-rose-400">
                {formatCurrency(Number(marketData?.stats.totalBorrowFormatted || 0), '$')}
                <span className="ml-1 text-sm text-slate-400">USDC</span>
              </CardTitle>
            </CardHeader>
          </Card>
          
          <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400">Active Suppliers</CardDescription>
              <CardTitle className="text-2xl font-bold text-blue-400">
                {marketData?.stats.activeSuppliers || 0}
              </CardTitle>
            </CardHeader>
          </Card>
          
          <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400">Active Borrowers</CardDescription>
              <CardTitle className="text-2xl font-bold text-amber-400">
                {marketData?.stats.activeBorrowers || 0}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Main Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Liquidity Over Time */}
          <Card className="col-span-2 border-slate-700 bg-slate-800/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white">Market Activity Over Time</CardTitle>
              <CardDescription className="text-slate-400">
                Cumulative collateral supplied and amount borrowed
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={areaChartConfig} className="h-80 w-full">
                <AreaChart
                  data={activitiesData?.chartData || []}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="supplyGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="borrowGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(346, 87%, 43%)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(346, 87%, 43%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(215, 20%, 25%)" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={formatDate}
                    stroke="hsl(215, 20%, 45%)"
                    tick={{ fill: "hsl(215, 20%, 65%)" }}
                  />
                  <YAxis 
                    stroke="hsl(215, 20%, 45%)" 
                    tick={{ fill: "hsl(215, 20%, 65%)" }}
                    tickFormatter={(value) => formatNumber(value)}
                  />
                  <ChartTooltip 
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 shadow-lg">
                            <p className="text-slate-400 text-xs mb-1">{formatDate(label)}</p>
                            <p className="text-emerald-400">Supply: {formatNumber(payload[0]?.value as number)}</p>
                            <p className="text-rose-400">Borrow: {formatNumber(payload[1]?.value as number)}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Area
                    type="monotone"
                    dataKey="supply"
                    stroke="hsl(142, 76%, 36%)"
                    fillOpacity={1}
                    fill="url(#supplyGradient)"
                    name="Collateral"
                  />
                  <Area
                    type="monotone"
                    dataKey="borrow"
                    stroke="hsl(346, 87%, 43%)"
                    fillOpacity={1}
                    fill="url(#borrowGradient)"
                    name="Borrowed"
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Supply Distribution */}
          <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white">Top Suppliers</CardTitle>
              <CardDescription className="text-slate-400">
                Collateral distribution by address
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={{}} className="h-72 w-full">
                <PieChart>
                  <Pie
                    data={supplyPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="address"
                    label={({ address, value }) => `${address}  ${formatNumber(value)}`}
                    labelLine={{ stroke: "hsl(215, 20%, 45%)" }}
                  >
                    {supplyPieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 shadow-lg">
                            <p className="text-slate-300 font-mono text-sm">{data.fullAddress}</p>
                            <p className="text-emerald-400 font-semibold">{formatNumber(data.value)} PT-USDAI</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Borrow Distribution */}
          <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white">Top Borrowers</CardTitle>
              <CardDescription className="text-slate-400">
                Borrowed amount distribution by address
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={{}} className="h-72 w-full">
                <PieChart>
                  <Pie
                    data={borrowPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="address"
                    label={({ address, value }) => `${address}  ${formatCurrency(value, '$')}`}
                    labelLine={{ stroke: "hsl(215, 20%, 45%)" }}
                  >
                    {borrowPieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 shadow-lg">
                            <p className="text-slate-300 font-mono text-sm">{data.fullAddress}</p>
                            <p className="text-rose-400 font-semibold">{formatCurrency(data.value, '$')} USDC</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Event Summary */}
        <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-white">Event Summary</CardTitle>
            <CardDescription className="text-slate-400">
              Total events by type
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="h-48 w-full">
              <BarChart
                data={[
                  { type: "Supply", count: activitiesData?.summary.totalSupplyEvents || 0, fill: "hsl(142, 76%, 36%)" },
                  { type: "Withdraw", count: activitiesData?.summary.totalWithdrawEvents || 0, fill: "hsl(38, 92%, 50%)" },
                  { type: "Borrow", count: activitiesData?.summary.totalBorrowEvents || 0, fill: "hsl(346, 87%, 43%)" },
                  { type: "Repay", count: activitiesData?.summary.totalRepayEvents || 0, fill: "hsl(199, 89%, 48%)" },
                ]}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(215, 20%, 25%)" />
                <XAxis dataKey="type" stroke="hsl(215, 20%, 45%)" tick={{ fill: "hsl(215, 20%, 65%)" }} />
                <YAxis stroke="hsl(215, 20%, 45%)" tick={{ fill: "hsl(215, 20%, 65%)" }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Tables */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Top Suppliers Table */}
          <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white">Top Suppliers</CardTitle>
              <CardDescription className="text-slate-400">
                {positionsData?.topSuppliers.length || 0} total suppliers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400">Address</TableHead>
                    <TableHead className="text-right text-slate-400">Collateral</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedSuppliers.map((supplier, i) => (
                    <TableRow key={i} className="border-slate-700">
                      <TableCell>
                        <a
                          href={getArbiscanAddressUrl(supplier.userAddress)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-sm text-blue-400 hover:underline"
                        >
                          {formatAddress(supplier.userAddress)}
                        </a>
                      </TableCell>
                      <TableCell className="text-right text-emerald-400">
                        {formatNumber(Number(supplier.netSupplyFormatted))} PT-USDAI
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {totalSupplierPages > 1 && (
                <Pagination
                  currentPage={supplierPage}
                  totalPages={totalSupplierPages}
                  onPageChange={setSupplierPage}
                />
              )}
            </CardContent>
          </Card>

          {/* Top Borrowers Table */}
          <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white">Top Borrowers</CardTitle>
              <CardDescription className="text-slate-400">
                {positionsData?.topBorrowers.length || 0} total borrowers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400">Address</TableHead>
                    <TableHead className="text-right text-slate-400">Borrowed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedBorrowers.map((borrower, i) => (
                    <TableRow key={i} className="border-slate-700">
                      <TableCell>
                        <a
                          href={getArbiscanAddressUrl(borrower.userAddress)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-sm text-blue-400 hover:underline"
                        >
                          {formatAddress(borrower.userAddress)}
                        </a>
                      </TableCell>
                      <TableCell className="text-right text-rose-400">
                        {formatCurrency(Number(borrower.netBorrowFormatted), '$')} USDC
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {totalBorrowerPages > 1 && (
                <Pagination
                  currentPage={borrowerPage}
                  totalPages={totalBorrowerPages}
                  onPageChange={setBorrowerPage}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="text-white">Recent Activity</CardTitle>
                <CardDescription className="text-slate-400">
                  {filteredActivities.length} transactions
                  {(typeFilter !== "all" || addressFilter) && " (filtered)"}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-32 bg-slate-800 border-slate-600 text-slate-300 h-9">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    <SelectItem value="all" className="text-slate-300">All Types</SelectItem>
                    <SelectItem value="supply" className="text-emerald-400">Supply</SelectItem>
                    <SelectItem value="withdraw" className="text-amber-400">Withdraw</SelectItem>
                    <SelectItem value="borrow" className="text-rose-400">Borrow</SelectItem>
                    <SelectItem value="repay" className="text-blue-400">Repay</SelectItem>
                  </SelectContent>
                </Select>
                <div className="w-44">
                  <AddressFilter
                    addresses={uniqueAddresses}
                    value={addressFilter}
                    onChange={setAddressFilter}
                  />
                </div>
                {(typeFilter !== "all" || addressFilter) && (
                  <button
                    onClick={() => {
                      setTypeFilter("all");
                      setAddressFilter("");
                    }}
                    className="px-3 py-1.5 text-sm rounded-md border border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-slate-300"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            {(typeFilter !== "all" || addressFilter) && (
              <div className="mt-3 flex gap-2 flex-wrap">
                {typeFilter !== "all" && (
                  <Badge variant="secondary" className="bg-slate-700 text-slate-300">
                    Type: {typeFilter}
                    <button onClick={() => setTypeFilter("all")} className="ml-2 hover:text-white">×</button>
                  </Badge>
                )}
                {addressFilter && (
                  <Badge variant="secondary" className="bg-slate-700 text-slate-300 font-mono">
                    Address: {formatAddress(addressFilter)}
                    <button onClick={() => setAddressFilter("")} className="ml-2 hover:text-white">×</button>
                  </Badge>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="text-slate-400">Type</TableHead>
                  <TableHead className="text-slate-400">Address</TableHead>
                  <TableHead className="text-slate-400">Amount</TableHead>
                  <TableHead className="text-slate-400">Transaction</TableHead>
                  <TableHead className="text-right text-slate-400">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedActivities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-slate-400 py-8">
                      No transactions found with current filters
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedActivities.map((activity) => (
                    <TableRow key={activity.id} className="border-slate-700">
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            activity.type === "supply"
                              ? "border-emerald-500/50 text-emerald-400"
                              : activity.type === "borrow"
                              ? "border-rose-500/50 text-rose-400"
                              : activity.type === "withdraw"
                              ? "border-amber-500/50 text-amber-400"
                              : "border-blue-500/50 text-blue-400"
                          }
                        >
                          {activity.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <a
                          href={getArbiscanAddressUrl(activity.userAddress)}
            target="_blank"
            rel="noopener noreferrer"
                          className="font-mono text-sm text-blue-400 hover:underline"
                        >
                          {formatAddress(activity.userAddress)}
                        </a>
                      </TableCell>
                      <TableCell className="text-slate-300">
                        {formatNumber(Number(activity.amountFormatted))}
                      </TableCell>
                      <TableCell>
                        <a
                          href={`https://arbiscan.io/tx/${activity.transactionHash}`}
            target="_blank"
            rel="noopener noreferrer"
                          className="font-mono text-sm text-blue-400 hover:underline"
                        >
                          {activity.transactionHash.slice(0, 10)}...
                        </a>
                      </TableCell>
                      <TableCell className="text-right text-slate-400">
                        {new Date(activity.timestamp).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {totalActivityPages > 1 && (
              <Pagination
                currentPage={activityPage}
                totalPages={totalActivityPages}
                onPageChange={setActivityPage}
              />
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-sm text-slate-500">
          <p>Data synced from Morpho Blue on Arbitrum</p>
          {marketData?.snapshot && (
            <p>Last updated: Block {marketData.snapshot.snapshotBlock}</p>
          )}
        </div>
      </div>
    </div>
  );
}
