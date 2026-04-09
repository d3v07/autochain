"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useChat } from "@/lib/chat-context";
import { ThinkingIndicator } from "@/components/thinking-indicator";
import { Sparkles, Search, Plus, Minus } from "lucide-react";

interface Product {
  id: number;
  sku: string;
  name: string;
  description: string;
  category: string;
  unitPrice: number;
  quantityAvailable: number | null;
  quantityReserved: number | null;
}

interface CartItem {
  product: Product;
  quantity: number;
}

const CATEGORIES = [
  "all",
  "windows",
  "doors",
  "hardware",
  "glass",
  "weatherstripping",
  "frames",
  "accessories",
];

export default function ProductsPage() {
  const { token } = useAuth();
  const { openChat } = useChat();
  const [products, setProducts] = useState<Product[]>([]);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [aiSearch, setAiSearch] = useState(false);
  const [cart, setCart] = useState<CartItem[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = localStorage.getItem("evo_cart");
    return stored ? JSON.parse(stored) : [];
  });
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [message, setMessage] = useState("");

  const fetchProducts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (category !== "all") params.set("category", category);
    if (search) params.set("search", search);
    params.set("limit", "100");

    const res = await api<{ data: Product[] }>(`/api/products?${params}`, {
      token,
    });
    setProducts(res.data);
    setLoading(false);
  }, [token, category, search]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    localStorage.setItem("evo_cart", JSON.stringify(cart));
  }, [cart]);

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  function updateQuantity(productId: number, quantity: number) {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((item) => item.product.id !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item,
      ),
    );
  }

  async function placeOrder() {
    if (!token || cart.length === 0) return;
    setOrdering(true);
    setMessage("");

    try {
      const res = await api<{ data: { orderNumber: string } }>("/api/orders", {
        method: "POST",
        token,
        body: {
          lines: cart.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
          })),
        },
      });
      setCart([]);
      localStorage.removeItem("evo_cart");
      setMessage(`Order ${res.data.orderNumber} created successfully!`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to place order");
    } finally {
      setOrdering(false);
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && aiSearch && search.trim()) {
      e.preventDefault();
      openChat(`Find products: ${search}`);
    }
  }

  const cartTotal = cart.reduce(
    (sum, item) => sum + item.product.unitPrice * item.quantity,
    0,
  );

  function stockLabel(qty: number | null) {
    if (qty === null) return { text: "Unknown", cls: "text-muted" };
    if (qty > 50) return { text: "In Stock", cls: "text-green-700" };
    if (qty > 0) return { text: "Low Stock", cls: "text-warning" };
    return { text: "Out of Stock", cls: "text-danger" };
  }

  return (
    <div className="flex gap-6">
      {/* Product List */}
      <div className="flex-1 min-w-0">
        <h1 className="text-xl font-bold text-foreground">Product Catalog</h1>

        {/* AI-Enhanced Search */}
        <div className="mt-4 flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder={
                aiSearch
                  ? 'Try "energy efficient windows under $300"'
                  : "Search products..."
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className={`w-full rounded border bg-surface pl-9 pr-10 py-1.5 text-sm focus:outline-none focus:ring-1 ${
                aiSearch
                  ? "border-ai focus:border-ai focus:ring-ai"
                  : "border-border focus:border-accent focus:ring-accent"
              }`}
            />
            <button
              onClick={() => setAiSearch(!aiSearch)}
              title={
                aiSearch ? "Switch to standard search" : "Switch to AI search"
              }
              className={`absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 transition-colors ${
                aiSearch
                  ? "text-ai bg-ai-light"
                  : "text-muted hover:text-ai-foreground"
              }`}
            >
              <Sparkles className="h-4 w-4" />
            </button>
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded border border-border bg-surface px-3 py-1.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c === "all"
                  ? "All Categories"
                  : c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* AI Suggested Products */}
        {!loading && products.length > 0 && (
          <div className="mt-4 rounded border-l-2 border-ai bg-ai-light/20 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="h-3.5 w-3.5 text-ai" />
              <span className="text-xs font-semibold text-ai-foreground uppercase tracking-wide">
                Suggested for you
              </span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {products.slice(0, 4).map((p) => (
                <div
                  key={p.id}
                  className="flex-shrink-0 w-44 rounded border border-border bg-surface p-3"
                >
                  <p className="text-xs font-mono text-muted">{p.sku}</p>
                  <p className="mt-1 text-sm font-medium truncate">{p.name}</p>
                  <p className="mt-1 text-sm font-mono text-foreground">
                    ${p.unitPrice.toFixed(2)}
                  </p>
                  <button
                    onClick={() => addToCart(p)}
                    className="mt-2 w-full rounded border border-ai/30 px-2 py-1 text-xs text-ai-foreground hover:bg-ai-light transition-colors"
                  >
                    Add to cart
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Products Table */}
        <div className="mt-4 rounded border border-border bg-surface">
          {loading ? (
            <div className="px-4 py-6">
              <ThinkingIndicator className="justify-center" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted uppercase tracking-wide">
                  <th className="px-4 py-2">SKU</th>
                  <th className="px-4 py-2">Product</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2 text-right">Price</th>
                  <th className="px-4 py-2">Stock</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const stock = stockLabel(p.quantityAvailable);
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-2 font-mono text-xs text-muted">
                        {p.sku}
                      </td>
                      <td className="px-4 py-2">
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-muted">{p.description}</p>
                      </td>
                      <td className="px-4 py-2 capitalize">{p.category}</td>
                      <td className="px-4 py-2 text-right font-mono">
                        ${p.unitPrice.toFixed(2)}
                      </td>
                      <td
                        className={`px-4 py-2 text-xs font-medium ${stock.cls}`}
                      >
                        {stock.text}
                      </td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => addToCart(p)}
                          className="rounded bg-accent px-2 py-1 text-xs text-white hover:bg-accent-hover"
                        >
                          Add
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Cart Sidebar */}
      <div className="w-72 shrink-0">
        <div className="sticky top-6 rounded border border-border bg-surface p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Cart ({cart.length})
          </h2>

          {message && (
            <div className="mt-2 rounded bg-accent-light px-2 py-1 text-xs text-accent">
              {message}
            </div>
          )}

          {cart.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Cart is empty</p>
          ) : (
            <>
              <div className="mt-3 space-y-2">
                {cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">
                        {item.product.name}
                      </p>
                      <p className="text-xs text-muted">
                        ${item.product.unitPrice.toFixed(2)} ea
                      </p>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() =>
                          updateQuantity(item.product.id, item.quantity - 1)
                        }
                        className="rounded border border-border p-0.5 hover:bg-background"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-8 text-center text-xs">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          updateQuantity(item.product.id, item.quantity + 1)
                        }
                        className="rounded border border-border p-0.5 hover:bg-background"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 border-t border-border pt-3">
                <div className="flex justify-between text-sm font-semibold">
                  <span>Total</span>
                  <span className="font-mono">
                    $
                    {cartTotal.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <button
                  onClick={placeOrder}
                  disabled={ordering}
                  className="mt-3 w-full rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {ordering ? (
                    <ThinkingIndicator
                      tone="light"
                      className="justify-center"
                    />
                  ) : (
                    "Place Order"
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
