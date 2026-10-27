import { and, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateStoreOrderBody,
  CreateStoreOrderResponse,
  ListStoreProductsQueryParams,
  ListStoreProductsResponse,
} from "@workspace/api-zod";
import {
  customersTable,
  db,
  ordersTable,
  productsTable,
  type OrderLine,
} from "@workspace/db";

const router: IRouter = Router();

router.get("/store/products", async (req, res): Promise<void> => {
  const query = ListStoreProductsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const search = query.data.search?.trim();
  const filters = and(
    query.data.category
      ? eq(productsTable.category, query.data.category)
      : undefined,
    search
      ? or(
          ilike(productsTable.name, `%${search}%`),
          ilike(productsTable.brand, `%${search}%`),
        )
      : undefined,
  );

  const products = await db
    .select()
    .from(productsTable)
    .where(filters)
    .orderBy(productsTable.id);

  res.json(ListStoreProductsResponse.parse(products));
});

router.post("/store/orders", async (req, res): Promise<void> => {
  const parsed = CreateStoreOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const requestedItems = new Map<number, number>();
  for (const item of parsed.data.items) {
    if (item.productId < 1) {
      res.status(400).json({ error: "Выберите товары для заказа" });
      return;
    }
    requestedItems.set(
      item.productId,
      (requestedItems.get(item.productId) ?? 0) + item.quantity,
    );
  }

  try {
    const order = await db.transaction(async (tx) => {
      const productIds = [...requestedItems.keys()];
      const products = await tx
        .select()
        .from(productsTable)
        .where(inArray(productsTable.id, productIds));
      if (products.length !== productIds.length) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      const lines: OrderLine[] = productIds.map((id) => {
        const product = products.find((candidate) => candidate.id === id);
        if (!product) {
          throw new Error("PRODUCT_NOT_FOUND");
        }
        return {
          productId: id,
          name: product.name,
          price: product.price,
          quantity: requestedItems.get(id) ?? 0,
        };
      });
      const total = lines.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      );

      for (const item of lines) {
        const [updated] = await tx
          .update(productsTable)
          .set({ stock: sql`${productsTable.stock} - ${item.quantity}` })
          .where(
            and(
              eq(productsTable.id, item.productId),
              gte(productsTable.stock, item.quantity),
            ),
          )
          .returning({ id: productsTable.id });
        if (!updated) {
          throw new Error("INSUFFICIENT_STOCK");
        }
      }

      const [customer] = await tx
        .insert(customersTable)
        .values({
          name: parsed.data.customerName.trim(),
          email: parsed.data.email.trim().toLowerCase(),
          phone: parsed.data.phone.trim(),
        })
        .onConflictDoUpdate({
          target: customersTable.email,
          set: {
            name: parsed.data.customerName.trim(),
            phone: parsed.data.phone.trim(),
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!customer) {
        throw new Error("CUSTOMER_SAVE_FAILED");
      }

      const [created] = await tx
        .insert(ordersTable)
        .values({
          customerId: customer.id,
          address: parsed.data.address.trim(),
          total,
          status: "new",
          items: lines,
        })
        .returning();

      if (!created) {
        throw new Error("ORDER_SAVE_FAILED");
      }
      return { ...created, customer };
    });

    res
      .status(201)
      .json(
        CreateStoreOrderResponse.parse({
          id: order.id,
          customerName: order.customer.name,
          email: order.customer.email,
          phone: order.customer.phone,
          address: order.address,
          total: order.total,
          status: order.status,
          items: order.items,
          createdAt: order.createdAt,
        }),
      );
  } catch (error) {
    if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") {
      res.status(400).json({ error: "Один из товаров больше недоступен" });
      return;
    }
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
      res.status(400).json({ error: "Недостаточно товара на складе" });
      return;
    }
    req.log.error({ err: error }, "Could not create store order");
    res.status(500).json({ error: "Не удалось оформить заказ" });
  }
});

export default router;
