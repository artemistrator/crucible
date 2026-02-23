"use client";

import { useEffect, useState } from "react";
import { Wallet, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TokenUsage {
  id: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  actionType: string;
  createdAt: string;
}

interface BillingStats {
  totalCost: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  byActionType: Array<{
    actionType: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
  }>;
  byModel: Array<{
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
  }>;
  recentUsages: TokenUsage[];
}

interface BillingDashboardProps {
  projectId: string;
}

export default function BillingDashboard({ projectId }: BillingDashboardProps) {
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    async function fetchBilling() {
      try {
        const response = await fetch(`/api/projects/${projectId}/billing`);
        if (!response.ok) {
          throw new Error("Failed to fetch billing data");
        }
        const data = await response.json();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchBilling();
  }, [projectId]);

  if (loading) {
    return (
      <Card className="mb-6 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-slate-400 dark:text-slate-300" />
          <span className="text-sm text-slate-500 dark:text-slate-300">
            Loading billing data...
          </span>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="mb-6 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm text-red-500">Error: {error}</p>
      </Card>
    );
  }

  if (!stats) {
    return null;
  }

  const formatCurrency = (value: number) => `$${value.toFixed(4)}`;
  const formatTokens = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return value.toString();
  };

  return (
    <Card className="mb-6 bg-white dark:border-slate-700 dark:bg-slate-900">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Wallet className="h-4 w-4 text-slate-500 dark:text-slate-300" />
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                variant="outline"
                className="font-medium border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              >
                Total: {formatCurrency(stats.totalCost)}
              </Badge>
              <Badge
                variant="secondary"
                className="font-medium bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
              >
                Tokens: {formatTokens(stats.totalTokens)}
              </Badge>

            </div>
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              {isOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent className="px-4 pb-4">
          <Tabs defaultValue="models" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="models">By Model</TabsTrigger>
              <TabsTrigger value="actions">By Action</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="models" className="mt-4">
              {stats.byModel.length > 0 ? (
                <ScrollArea className="h-[200px] rounded-md border">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-medium">Model</TableHead>
                        <TableHead className="text-right font-medium">Tokens</TableHead>
                        <TableHead className="text-right font-medium">Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.byModel.map((stat) => (
                        <TableRow key={stat.model}>
                          <TableCell className="font-medium">{stat.model}</TableCell>
                          <TableCell className="text-right">
                            {formatTokens(stat.totalTokens)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(stat.cost)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : (
                <p className="text-sm text-slate-500 py-4 text-center">
                  No model usage data
                </p>
              )}
            </TabsContent>

            <TabsContent value="actions" className="mt-4">
              {stats.byActionType.length > 0 ? (
                <ScrollArea className="h-[200px] rounded-md border">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-medium">Action</TableHead>
                        <TableHead className="text-right font-medium">Tokens</TableHead>
                        <TableHead className="text-right font-medium">Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.byActionType.map((stat) => (
                        <TableRow key={stat.actionType}>
                          <TableCell className="font-medium">{stat.actionType}</TableCell>
                          <TableCell className="text-right">
                            {formatTokens(stat.totalTokens)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(stat.cost)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : (
                <p className="text-sm text-slate-500 py-4 text-center">
                  No action type data
                </p>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              {stats.recentUsages.length > 0 ? (
                <ScrollArea className="h-[200px] rounded-md border">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-medium">Date</TableHead>
                        <TableHead className="font-medium">Action</TableHead>
                        <TableHead className="font-medium">Model</TableHead>
                        <TableHead className="text-right font-medium">Tokens</TableHead>
                        <TableHead className="text-right font-medium">Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.recentUsages.map((usage) => (
                        <TableRow key={usage.id}>
                          <TableCell className="whitespace-nowrap">
                            {new Date(usage.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="font-medium">{usage.actionType}</TableCell>
                          <TableCell>{usage.model}</TableCell>
                          <TableCell className="text-right">
                            {formatTokens(usage.promptTokens + usage.completionTokens)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(usage.cost)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : (
                <p className="text-sm text-slate-500 py-4 text-center">
                  No recent usage data
                </p>
              )}
            </TabsContent>
          </Tabs>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
