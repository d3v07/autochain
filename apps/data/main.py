from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = ROOT_DIR / "autochain.db"
DB_PATH = Path(os.getenv("DATABASE_URL", str(DEFAULT_DB_PATH))).expanduser()

app = FastAPI(
    title="AutoChain Analytics Service",
    version="0.1.0",
    description="FastAPI analytics endpoints for sales, product, and inventory insights.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_connection() -> sqlite3.Connection:
    if not DB_PATH.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Database not found at '{DB_PATH}'. Set DATABASE_URL to autochain.db path.",
        )

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "database": str(DB_PATH),
    }


@app.get("/api/analytics/sales-summary")
def sales_summary(months: int = Query(default=6, ge=1, le=24)) -> dict[str, Any]:
    conn = get_connection()
    try:
        totals = conn.execute(
            """
            SELECT
              COUNT(*) AS total_orders,
              COALESCE(SUM(total), 0) AS total_revenue,
              COALESCE(AVG(total), 0) AS avg_order_value
            FROM orders
            WHERE status != 'cancelled'
            """
        ).fetchone()

        pending = conn.execute(
            """
            SELECT COUNT(*) AS pending_orders
            FROM orders
            WHERE status IN ('confirmed', 'processing')
            """
        ).fetchone()

        trend_rows = conn.execute(
            """
            SELECT
              substr(created_at, 1, 7) AS month,
              COUNT(*) AS order_count,
              COALESCE(SUM(total), 0) AS revenue
            FROM orders
            WHERE status != 'cancelled'
            GROUP BY substr(created_at, 1, 7)
            ORDER BY month DESC
            LIMIT ?
            """,
            (months,),
        ).fetchall()

        trend = [
            {
                "month": row["month"],
                "order_count": row["order_count"],
                "revenue": row["revenue"],
            }
            for row in reversed(trend_rows)
        ]

        return {
            "success": True,
            "data": {
                "total_orders": totals["total_orders"],
                "total_revenue": totals["total_revenue"],
                "avg_order_value": round(float(totals["avg_order_value"]), 2),
                "pending_orders": pending["pending_orders"],
                "trend": trend,
            },
            "error": None,
        }
    finally:
        conn.close()


@app.get("/api/analytics/top-products")
def top_products(
    limit: int = Query(default=10, ge=1, le=50),
    lookback_days: int = Query(default=90, ge=30, le=365),
) -> dict[str, Any]:
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT
              p.id AS product_id,
              p.sku AS sku,
              p.name AS name,
              COALESCE(SUM(ol.quantity), 0) AS quantity_sold,
              COALESCE(SUM(ol.line_total), 0) AS revenue,
              COUNT(DISTINCT o.id) AS order_count
            FROM order_lines ol
            JOIN orders o ON o.id = ol.order_id
            JOIN products p ON p.id = ol.product_id
            WHERE datetime(o.created_at) >= datetime('now', ?)
              AND o.status != 'cancelled'
            GROUP BY p.id, p.sku, p.name
            ORDER BY quantity_sold DESC
            LIMIT ?
            """,
            (f"-{lookback_days} days", limit),
        ).fetchall()

        products: list[dict[str, Any]] = []
        for row in rows:
            daily = conn.execute(
                """
                SELECT COALESCE(SUM(ol.quantity), 0) AS qty
                FROM order_lines ol
                JOIN orders o ON o.id = ol.order_id
                WHERE ol.product_id = ?
                  AND datetime(o.created_at) >= datetime('now', '-90 days')
                  AND o.status != 'cancelled'
                """,
                (row["product_id"],),
            ).fetchone()

            qty_last_90 = int(daily["qty"])
            avg_daily = qty_last_90 / 90
            forecast_next_30 = round(avg_daily * 30)

            products.append(
                {
                    "product_id": row["product_id"],
                    "sku": row["sku"],
                    "name": row["name"],
                    "quantity_sold": row["quantity_sold"],
                    "revenue": row["revenue"],
                    "order_count": row["order_count"],
                    "avg_daily_demand_90d": round(avg_daily, 2),
                    "forecast_next_30d": forecast_next_30,
                }
            )

        return {
            "success": True,
            "data": {
                "lookback_days": lookback_days,
                "products": products,
            },
            "error": None,
        }
    finally:
        conn.close()


@app.get("/api/analytics/inventory-health")
def inventory_health(low_stock_threshold: int = Query(default=50, ge=1, le=500)) -> dict[str, Any]:
    conn = get_connection()
    try:
        totals = conn.execute(
            """
            SELECT
              COUNT(*) AS total_products,
              COALESCE(SUM(quantity_available), 0) AS total_units_available,
              COALESCE(SUM(quantity_reserved), 0) AS total_units_reserved,
              SUM(CASE WHEN quantity_available = 0 THEN 1 ELSE 0 END) AS out_of_stock,
              SUM(CASE WHEN quantity_available > 0 AND quantity_available <= ? THEN 1 ELSE 0 END) AS low_stock,
              SUM(CASE WHEN quantity_available > ? THEN 1 ELSE 0 END) AS healthy_stock
            FROM inventory
            """,
            (low_stock_threshold, low_stock_threshold),
        ).fetchone()

        alerts = conn.execute(
            """
            SELECT
              p.id AS product_id,
              p.sku AS sku,
              p.name AS name,
              i.quantity_available,
              i.quantity_reserved
            FROM inventory i
            JOIN products p ON p.id = i.product_id
            WHERE i.quantity_available <= ?
            ORDER BY i.quantity_available ASC, p.name ASC
            LIMIT 25
            """,
            (low_stock_threshold,),
        ).fetchall()

        total_products = int(totals["total_products"] or 0)

        def pct(value: int) -> float:
            if total_products == 0:
                return 0.0
            return round((value / total_products) * 100, 2)

        out_of_stock = int(totals["out_of_stock"] or 0)
        low_stock = int(totals["low_stock"] or 0)
        healthy_stock = int(totals["healthy_stock"] or 0)

        return {
            "success": True,
            "data": {
                "threshold": low_stock_threshold,
                "totals": {
                    "total_products": total_products,
                    "total_units_available": totals["total_units_available"],
                    "total_units_reserved": totals["total_units_reserved"],
                    "out_of_stock": out_of_stock,
                    "low_stock": low_stock,
                    "healthy_stock": healthy_stock,
                },
                "distribution": {
                    "out_of_stock_pct": pct(out_of_stock),
                    "low_stock_pct": pct(low_stock),
                    "healthy_stock_pct": pct(healthy_stock),
                },
                "alerts": [dict(row) for row in alerts],
            },
            "error": None,
        }
    finally:
        conn.close()
