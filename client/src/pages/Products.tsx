import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Products() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const { data: products, isLoading } = trpc.products.list.useQuery();

  const filteredProducts = products?.filter((product: any) =>
    product.nickname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.epaNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.manufacturer?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getSignalWordColor = (labelSignalWord: string | null) => {
    if (!labelSignalWord) return "secondary";
    switch (labelSignalWord.toLowerCase()) {
      case "danger":
        return "destructive";
      case "warning":
        return "default";
      case "caution":
        return "secondary";
      default:
        return "secondary";
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">EPA Products</h1>
          <p className="text-muted-foreground">
            Manage all uploaded EPA product labels and compliance data
          </p>
        </div>
        <Button onClick={() => setLocation("/product-lookup")}>
          <Plus className="mr-2 h-4 w-4" />
          Upload Product
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Product Library</CardTitle>
          <CardDescription>
            {products?.length || 0} products in your library
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by product name, EPA reg #, or active ingredient..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading products...
            </div>
          ) : filteredProducts && filteredProducts.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product Name</TableHead>
                    <TableHead>EPA Reg #</TableHead>
                    <TableHead>Manufacturer</TableHead>
                    <TableHead>Signal Word</TableHead>
                    <TableHead>REI (hours)</TableHead>
                    <TableHead>PHI (days)</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product: any) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">
                        {product.nickname || "—"}
                      </TableCell>
                      <TableCell>
                        {product.epaNumber || "—"}
                      </TableCell>
                      <TableCell>
                        {product.manufacturer || "—"}
                      </TableCell>
                      <TableCell>
                        {product.labelSignalWord ? (
                          <Badge variant={getSignalWordColor(product.labelSignalWord)}>
                            {product.labelSignalWord}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {product.hoursReentry || "—"}
                      </TableCell>
                      <TableCell>
                        {product.daysPreharvest || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {product.screenshotUrl && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => window.open(product.screenshotUrl!, "_blank")}
                              title="View Label"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 space-y-4">
              <div className="text-muted-foreground">
                {searchTerm
                  ? "No products found matching your search"
                  : "No products uploaded yet"}
              </div>
              {!searchTerm && (
                <Button onClick={() => setLocation("/product-lookup")}>
                  <Plus className="mr-2 h-4 w-4" />
                  Upload Your First Product
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>


    </div>
  );
}
