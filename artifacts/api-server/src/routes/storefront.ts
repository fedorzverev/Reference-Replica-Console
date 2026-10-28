import { and, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import {
  AuthProvidersResponse,
  AuthSessionResponse,
  CreateStoreOrderBody,
  CreateStoreOrderResponse,
  CreateStoreQuestionBody,
  CreateStoreQuestionResponse,
  CustomerProfile,
  GetStoreAccountOrdersResponse,
  ListStoreProductsQueryParams,
  ListStoreProductsResponse,
  LoginByPasswordBody,
  OAuthLoginBody,
  PhoneCodeSentResponse,
  RegisterByEmailBody,
  RequestPhoneCodeBody,
  StoreLoginBody,
  UpdateCustomerProfileBody,
  VerifyPhoneCodeBody,
} from "@workspace/api-zod";
import {
  customersTable,
  db,
  ordersTable,
  productsTable,
  questionsTable,
  type OrderLine,
} from "@workspace/db";
import {
  checkCode,
  clearSessionCookie,
  createSessionToken,
  hashPassword,
  isOAuthConfigured,
  issueCode,
  sessionCustomerId,
  setSessionCookie,
  verifyAppleIdToken,
  verifyGoogleIdToken,
  verifyPassword,
  type ProviderIdentity,
} from "../lib/auth";

const router: IRouter = Router();

const digitsOnly = (value: string) => value.replace(/\D/g, "");

async function buildCustomerProfile(customerId: number) {
  const [row] = await db
    .select({
      id: customersTable.id,
      name: customersTable.name,
      email: customersTable.email,
      phone: customersTable.phone,
      createdAt: customersTable.createdAt,
      ordersCount: sql<number>`count(${ordersTable.id})::int`,
      spent: sql<number>`coalesce(sum(${ordersTable.total}), 0)::int`,
      lastOrderAt: sql<Date | null>`max(${ordersTable.createdAt})`,
    })
    .from(customersTable)
    .leftJoin(ordersTable, eq(ordersTable.customerId, customersTable.id))
    .where(eq(customersTable.id, customerId))
    .groupBy(customersTable.id);
  if (!row) return null;
  return CustomerProfile.parse(row);
}

router.post("/store/login", async (req, res): Promise<void> => {
  const parsed = StoreLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Укажите e-mail и телефон" });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const [customer] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.email, email));
  if (!customer || digitsOnly(customer.phone) !== digitsOnly(parsed.data.phone)) {
    res.status(401).json({
      error: "Аккаунт не найден. Зарегистрируйтесь или оформите заказ — и кабинет будет доступен по e-mail и телефону.",
    });
    return;
  }
  const profile = await buildCustomerProfile(customer.id);
  setSessionCookie(res, customer.id);
  res.json({ customer: profile, token: createSessionToken(customer.id) });
});

// ---------- Регистрация по e-mail + телефону (с паролем) ----------
router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterByEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Заполните имя, e-mail, телефон и пароль (мин. 6 символов)" });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const phone = parsed.data.phone.trim();
  const [existing] = await db
    .select({ id: customersTable.id })
    .from(customersTable)
    .where(eq(customersTable.email, email));
  if (existing) {
    res.status(409).json({ error: "Пользователь с таким e-mail уже зарегистрирован. Попробуйте войти." });
    return;
  }
  const [created] = await db
    .insert(customersTable)
    .values({
      name: parsed.data.name.trim(),
      email,
      phone,
      passwordHash: hashPassword(parsed.data.password),
      authProvider: "email",
    })
    .returning();
  const profile = await buildCustomerProfile(created.id);
  const token = createSessionToken(created.id);
  setSessionCookie(res, created.id);
  res.status(201).json(AuthSessionResponse.parse({ customer: profile, token }));
});

// ---------- Вход по e-mail/телефону + пароль ----------
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginByPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Укажите e-mail или телефон и пароль" });
    return;
  }
  const identifier = parsed.data.identifier.trim().toLowerCase();
  const candidates = identifier.includes("@")
    ? await db.select().from(customersTable).where(eq(customersTable.email, identifier))
    : await db.select().from(customersTable).where(eq(customersTable.phone, parsed.data.identifier.trim()));
  const user = candidates[0];
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    res.status(401).json({ error: "Неверный e-mail/телефон или пароль" });
    return;
  }
  const profile = await buildCustomerProfile(user.id);
  const token = createSessionToken(user.id);
  setSessionCookie(res, user.id);
  res.json(AuthSessionResponse.parse({ customer: profile, token }));
});

// ---------- Вход по SMS-коду: запрос кода на телефон ----------
router.post("/auth/phone/request-code", async (req, res): Promise<void> => {
  const parsed = RequestPhoneCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Укажите телефон" });
    return;
  }
  const phone = parsed.data.phone.trim();
  const code = issueCode(`phone:${digitsOnly(phone)}`);
  // TODO: подключить SMS-провайдер. Пока код возвращается в ответе для разработки.
  console.info("[auth] SMS-код сгенерирован для телефона");
  res.json(PhoneCodeSentResponse.parse({ sent: true, devCode: process.env.NODE_ENV === "production" ? undefined : code }));
});

// ---------- Вход по SMS-коду: подтверждение ----------
router.post("/auth/phone/verify", async (req, res): Promise<void> => {
  const parsed = VerifyPhoneCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Введите 6-значный код из SMS" });
    return;
  }
  const phone = parsed.data.phone.trim();
  if (!checkCode(`phone:${digitsOnly(phone)}`, parsed.data.code)) {
    res.status(401).json({ error: "Код недействителен или истёк. Запросите новый." });
    return;
  }
  let [customer] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.phone, phone));
  if (!customer) {
    [customer] = await db
      .insert(customersTable)
      .values({
        name: `Гость ${digitsOnly(phone).slice(-4)}`,
        email: `${digitsOnly(phone)}@phone.local`,
        phone,
        authProvider: "phone",
        phoneVerified: true,
      })
      .returning();
  } else {
    await db
      .update(customersTable)
      .set({ phoneVerified: true, updatedAt: new Date() })
      .where(eq(customersTable.id, customer.id));
  }
  const profile = await buildCustomerProfile(customer.id);
  const token = createSessionToken(customer.id);
  setSessionCookie(res, customer.id);
  res.json(AuthSessionResponse.parse({ customer: profile, token }));
});

// ---------- OAuth (Google / Apple) ----------
async function loginWithProvider(res: Response, identity: ProviderIdentity, provider: "google" | "apple") {
  const column = provider === "google" ? customersTable.googleId : customersTable.appleId;
  let [customer] = await db.select().from(customersTable).where(eq(column, identity.providerSub));
  if (!customer && identity.email) {
    const [byEmail] = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.email, identity.email.toLowerCase()));
    if (byEmail) {
      customer = byEmail;
      await db
        .update(customersTable)
        .set(provider === "google" ? { googleId: identity.providerSub } : { appleId: identity.providerSub })
        .where(eq(customersTable.id, byEmail.id));
    }
  }
  if (!customer) {
    const email = identity.email ?? `${provider}_${identity.providerSub}@oauth.local`;
    [customer] = await db
      .insert(customersTable)
      .values({
        name: identity.name ?? (provider === "google" ? "Google пользователь" : "Apple пользователь"),
        email: email.toLowerCase(),
        phone: "",
        authProvider: provider,
        googleId: provider === "google" ? identity.providerSub : null,
        appleId: provider === "apple" ? identity.providerSub : null,
        emailVerified: identity.emailVerified,
      })
      .returning();
  }
  const profile = await buildCustomerProfile(customer.id);
  const token = createSessionToken(customer.id);
  setSessionCookie(res, customer.id);
  return AuthSessionResponse.parse({ customer: profile, token });
}

router.post("/auth/google", async (req, res): Promise<void> => {
  const parsed = OAuthLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Отсутствует Google id_token" });
    return;
  }
  try {
    const identity = await verifyGoogleIdToken(parsed.data.idToken);
    res.json(await loginWithProvider(res, identity, "google"));
  } catch (error) {
    res.status(401).json({ error: error instanceof Error ? error.message : "Не удалось подтвердить аккаунт Google" });
  }
});

router.post("/auth/apple", async (req, res): Promise<void> => {
  const parsed = OAuthLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Отсутствует Apple identity token" });
    return;
  }
  try {
    const identity = await verifyAppleIdToken(parsed.data.idToken);
    res.json(await loginWithProvider(res, identity, "apple"));
  } catch (error) {
    res.status(401).json({ error: error instanceof Error ? error.message : "Не удалось подтвердить аккаунт Apple" });
  }
});

router.get("/auth/providers", (_req, res): void => {
  res.json(
    AuthProvidersResponse.parse({
      googleConfigured: isOAuthConfigured("google"),
      appleConfigured: isOAuthConfigured("apple"),
      googleClientId: process.env.GOOGLE_CLIENT_ID,
      appleClientId: process.env.APPLE_CLIENT_ID,
    }),
  );
});

// ---------- Текущая сессия / выход ----------
router.get("/auth/me", async (req, res): Promise<void> => {
  const customerId = sessionCustomerId(req);
  if (!customerId) {
    res.status(401).json({ error: "Не авторизованы" });
    return;
  }
  const profile = await buildCustomerProfile(customerId);
  if (!profile) {
    clearSessionCookie(res);
    res.status(401).json({ error: "Аккаунт не найден" });
    return;
  }
  res.json({ customer: profile });
});

router.post("/auth/logout", (_req, res): void => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/store/account/:customerId/orders", async (req, res): Promise<void> => {
  const customerId = Number(req.params.customerId);
  if (!Number.isInteger(customerId) || customerId < 1) {
    res.status(400).json({ error: "Некорректный идентификатор клиента" });
    return;
  }
  const orders = await db
    .select({
      id: ordersTable.id,
      address: ordersTable.address,
      total: ordersTable.total,
      status: ordersTable.status,
      items: ordersTable.items,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .where(eq(ordersTable.customerId, customerId))
    .orderBy(desc(ordersTable.createdAt));
  res.json(GetStoreAccountOrdersResponse.parse(orders));
});

router.patch("/store/account/:customerId", async (req, res): Promise<void> => {
  const customerId = Number(req.params.customerId);
  if (!Number.isInteger(customerId) || customerId < 1) {
    res.status(400).json({ error: "Некорректный идентификатор клиента" });
    return;
  }
  const parsed = UpdateCustomerProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Заполните имя и телефон" });
    return;
  }
  const [updated] = await db
    .update(customersTable)
    .set({
      name: parsed.data.name.trim(),
      phone: parsed.data.phone.trim(),
      updatedAt: new Date(),
    })
    .where(eq(customersTable.id, customerId))
    .returning({ id: customersTable.id });
  if (!updated) {
    res.status(404).json({ error: "Клиент не найден" });
    return;
  }
  const profile = await buildCustomerProfile(updated.id);
  res.json({ customer: profile });
});

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

// ---------------------------------------------------------------------------
// Вопросы покупателей: форма на витрине -> попадают в админ-панель
// ---------------------------------------------------------------------------

router.post("/store/questions", async (req, res): Promise<void> => {
  const parsed = CreateStoreQuestionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Если автор залогинен — привязываем вопрос к его аккаунту
  const customerId = sessionCustomerId(req) ?? null;
  try {
    const [question] = await db
      .insert(questionsTable)
      .values({
        customerId,
        authorName: parsed.data.authorName.trim(),
        email: parsed.data.email.trim().toLowerCase(),
        phone: parsed.data.phone?.trim() || null,
        subject: parsed.data.subject,
        message: parsed.data.message.trim(),
        status: "new",
      })
      .returning();
    if (!question) {
      res.status(500).json({ error: "Не удалось отправить вопрос" });
      return;
    }
    req.log.info({ questionId: question.id }, "New customer question received");
    res.status(201).json(CreateStoreQuestionResponse.parse(question));
  } catch (error) {
    req.log.error({ err: error }, "Could not create question");
    res.status(500).json({ error: "Не удалось отправить вопрос" });
  }
});

// Список своих вопросов + ответов администратора
router.get("/store/questions/mine", async (req, res): Promise<void> => {
  const customerId = sessionCustomerId(req);
  if (!customerId) {
    res.status(401).json({ error: "Требуется вход в аккаунт" });
    return;
  }
  const rows = await db
    .select()
    .from(questionsTable)
    .where(eq(questionsTable.customerId, customerId))
    .orderBy(desc(questionsTable.createdAt));
  res.json(rows);
});

export default router;
