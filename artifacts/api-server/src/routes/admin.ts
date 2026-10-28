import { and, count, desc, eq, gte, max, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateAdminProductBody,
  CreateAdminProductResponse,
  DeleteAdminProductParams,
  DeleteAdminQuestionParams,
  GetAdminDashboardResponse,
  ListAdminCustomersResponse,
  ListAdminOrdersQueryParams,
  ListAdminOrdersResponse,
  ListAdminProductsResponse,
  ListStoreQuestionsQueryParams,
  ListStoreQuestionsResponse,
  UpdateAdminCustomerBody,
  UpdateAdminCustomerParams,
  UpdateAdminCustomerResponse,
  UpdateAdminOrderBody,
  UpdateAdminOrderParams,
  UpdateAdminOrderResponse,
  UpdateAdminProductBody,
  UpdateAdminProductParams,
  UpdateAdminProductResponse,
  UpdateAdminQuestionBody,
  UpdateAdminQuestionParams,
  UpdateAdminQuestionResponse,
} from "@workspace/api-zod";
import {
  customersTable,
  db,
  ordersTable,
  productsTable,
  questionsTable,
} from "@workspace/db";
import requireStoreAdmin from "../middlewares/requireStoreAdmin";

const router: IRouter = Router();
router.use("/admin", requireStoreAdmin);

router.get("/admin/dashboard", async (_req, res): Promise<void> => {
  const [orderStats] = await db
    .select({
      ordersCount: count(),
      newOrdersCount: sql<number>`count(*) filter (where ${ordersTable.status} = 'new')`,
      totalRevenue: sql<number>`coalesce(sum(case when ${ordersTable.status} <> 'cancelled' then ${ordersTable.total} else 0 end), 0)`,
    })
    .from(ordersTable);
  const [customerStats] = await db
    .select({ customersCount: count() })
    .from(customersTable);
  const [productStats] = await db
    .select({ productsCount: count() })
    .from(productsTable);
  const recentRows = await db
    .select({ order: ordersTable, customer: customersTable })
    .from(ordersTable)
    .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .orderBy(desc(ordersTable.createdAt))
    .limit(5);
  const recentOrders = recentRows.map(({ order, customer }) => ({
    id: order.id,
    customerName: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: order.address,
    total: order.total,
    status: order.status,
    items: order.items,
    createdAt: order.createdAt,
  }));

  res.json(
    GetAdminDashboardResponse.parse({
      totalRevenue: Number(orderStats?.totalRevenue ?? 0),
      ordersCount: Number(orderStats?.ordersCount ?? 0),
      customersCount: Number(customerStats?.customersCount ?? 0),
      productsCount: Number(productStats?.productsCount ?? 0),
      newOrdersCount: Number(orderStats?.newOrdersCount ?? 0),
      recentOrders,
    }),
  );
});

router.get("/admin/products", async (_req, res): Promise<void> => {
  const products = await db
    .select()
    .from(productsTable)
    .orderBy(productsTable.id);
  res.json(ListAdminProductsResponse.parse(products));
});

router.post("/admin/products", async (req, res): Promise<void> => {
  const parsed = CreateAdminProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [product] = await db
    .insert(productsTable)
    .values(parsed.data)
    .returning();
  if (!product) {
    res.status(500).json({ error: "Не удалось создать товар" });
    return;
  }
  res.status(201).json(CreateAdminProductResponse.parse(product));
});

router.patch("/admin/products/:id", async (req, res): Promise<void> => {
  const params = UpdateAdminProductParams.safeParse(req.params);
  const parsed = UpdateAdminProductBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [product] = await db
    .update(productsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(productsTable.id, params.data.id))
    .returning();
  if (!product) {
    res.status(404).json({ error: "Товар не найден" });
    return;
  }
  res.json(UpdateAdminProductResponse.parse(product));
});

router.delete("/admin/products/:id", async (req, res): Promise<void> => {
  const params = DeleteAdminProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [product] = await db
    .delete(productsTable)
    .where(eq(productsTable.id, params.data.id))
    .returning({ id: productsTable.id });
  if (!product) {
    res.status(404).json({ error: "Товар не найден" });
    return;
  }
  res.sendStatus(204);
});

router.get("/admin/orders", async (req, res): Promise<void> => {
  const query = ListAdminOrdersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const rows = await db
    .select({ order: ordersTable, customer: customersTable })
    .from(ordersTable)
    .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .where(
      query.data.status
        ? eq(ordersTable.status, query.data.status)
        : undefined,
    )
    .orderBy(desc(ordersTable.createdAt));
  const orders = rows.map(({ order, customer }) => ({
    id: order.id,
    customerName: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: order.address,
    total: order.total,
    status: order.status,
    items: order.items,
    createdAt: order.createdAt,
  }));
  res.json(ListAdminOrdersResponse.parse(orders));
});

router.patch("/admin/orders/:id", async (req, res): Promise<void> => {
  const params = UpdateAdminOrderParams.safeParse(req.params);
  const parsed = UpdateAdminOrderBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, params.data.id));
      if (!existing) {
        return null;
      }

      if (existing.status !== parsed.data.status) {
        for (const item of existing.items) {
          if (parsed.data.status === "cancelled" && existing.status !== "cancelled") {
            await tx
              .update(productsTable)
              .set({ stock: sql`${productsTable.stock} + ${item.quantity}` })
              .where(eq(productsTable.id, item.productId));
          } else if (existing.status === "cancelled" && parsed.data.status !== "cancelled") {
            const [restocked] = await tx
              .update(productsTable)
              .set({ stock: sql`${productsTable.stock} - ${item.quantity}` })
              .where(
                and(
                  eq(productsTable.id, item.productId),
                  gte(productsTable.stock, item.quantity),
                ),
              )
              .returning({ id: productsTable.id });
            if (!restocked) {
              throw new Error("INSUFFICIENT_STOCK");
            }
          }
        }
      }

      const [updated] = await tx
        .update(ordersTable)
        .set({ status: parsed.data.status, updatedAt: new Date() })
        .where(eq(ordersTable.id, params.data.id))
        .returning();
      if (!updated) {
        return null;
      }
      const [customer] = await tx
        .select()
        .from(customersTable)
        .where(eq(customersTable.id, updated.customerId));
      return customer ? { order: updated, customer } : null;
    });

    if (!result) {
      res.status(404).json({ error: "Заказ не найден" });
      return;
    }
    res.json(
      UpdateAdminOrderResponse.parse({
        id: result.order.id,
        customerName: result.customer.name,
        email: result.customer.email,
        phone: result.customer.phone,
        address: result.order.address,
        total: result.order.total,
        status: result.order.status,
        items: result.order.items,
        createdAt: result.order.createdAt,
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
      res.status(400).json({
        error: "Нельзя восстановить заказ: товара недостаточно на складе",
      });
      return;
    }
    req.log.error({ err: error }, "Could not update order status");
    res.status(500).json({ error: "Не удалось обновить заказ" });
  }
});

router.get("/admin/customers", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: customersTable.id,
      name: customersTable.name,
      email: customersTable.email,
      phone: customersTable.phone,
      createdAt: customersTable.createdAt,
      ordersCount: sql<number>`count(${ordersTable.id})`,
      spent: sql<number>`coalesce(sum(case when ${ordersTable.status} <> 'cancelled' then ${ordersTable.total} else 0 end), 0)`,
      lastOrderAt: max(ordersTable.createdAt),
    })
    .from(customersTable)
    .leftJoin(ordersTable, eq(ordersTable.customerId, customersTable.id))
    .groupBy(customersTable.id)
    .orderBy(desc(customersTable.createdAt));
  res.json(
    ListAdminCustomersResponse.parse(
      rows.map((customer) => ({
        ...customer,
        ordersCount: Number(customer.ordersCount),
        spent: Number(customer.spent),
      })),
    ),
  );
});

router.patch("/admin/customers/:id", async (req, res): Promise<void> => {
  const params = UpdateAdminCustomerParams.safeParse(req.params);
  const parsed = UpdateAdminCustomerBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [customer] = await db
    .update(customersTable)
    .set({
      name: parsed.data.name.trim(),
      email: parsed.data.email.trim().toLowerCase(),
      phone: parsed.data.phone.trim(),
      updatedAt: new Date(),
    })
    .where(eq(customersTable.id, params.data.id))
    .returning();
  if (!customer) {
    res.status(404).json({ error: "Покупатель не найден" });
    return;
  }

  const [stats] = await db
    .select({
      ordersCount: count(ordersTable.id),
      spent: sql<number>`coalesce(sum(case when ${ordersTable.status} <> 'cancelled' then ${ordersTable.total} else 0 end), 0)`,
      lastOrderAt: max(ordersTable.createdAt),
    })
    .from(ordersTable)
    .where(eq(ordersTable.customerId, customer.id));
  res.json(
    UpdateAdminCustomerResponse.parse({
      ...customer,
      ordersCount: Number(stats?.ordersCount ?? 0),
      spent: Number(stats?.spent ?? 0),
      lastOrderAt: stats?.lastOrderAt ?? null,
    }),
  );
});

// ---------------------------------------------------------------------------
// Вопросы покупателей в админ-панели
// ---------------------------------------------------------------------------

router.get("/admin/questions", async (req, res): Promise<void> => {
  const query = ListStoreQuestionsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(questionsTable)
    .where(query.data.status ? eq(questionsTable.status, query.data.status) : undefined)
    .orderBy(desc(questionsTable.createdAt));
  res.json(ListStoreQuestionsResponse.parse(rows));
});

router.patch("/admin/questions/:id", async (req, res): Promise<void> => {
  const params = UpdateAdminQuestionParams.safeParse(req.params);
  const parsed = UpdateAdminQuestionBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.status === undefined && parsed.data.answer === undefined) {
    res.status(400).json({ error: "Нечего обновлять" });
    return;
  }
  const [question] = await db
    .update(questionsTable)
    .set({
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.answer !== undefined ? { answer: parsed.data.answer.trim(), status: "answered" as const } : {}),
      updatedAt: new Date(),
    })
    .where(eq(questionsTable.id, params.data.id))
    .returning();
  if (!question) {
    res.status(404).json({ error: "Вопрос не найден" });
    return;
  }
  res.json(UpdateAdminQuestionResponse.parse(question));
});

router.delete("/admin/questions/:id", async (req, res): Promise<void> => {
  const params = DeleteAdminQuestionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(questionsTable)
    .where(eq(questionsTable.id, params.data.id))
    .returning({ id: questionsTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Вопрос не найден" });
    return;
  }
  res.sendStatus(204);
});

export default router;
