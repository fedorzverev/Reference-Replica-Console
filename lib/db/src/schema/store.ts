import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export interface OrderLine {
  productId: number;
  name: string;
  price: number;
  quantity: number;
}

export const productsTable = pgTable("store_products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  brand: text("brand").notNull(),
  category: text("category").notNull(),
  price: integer("price").notNull(),
  oldPrice: integer("old_price"),
  imageUrl: text("image_url").notNull(),
  description: text("description").notNull().default(""),
  stock: integer("stock").notNull().default(0),
  badge: text("badge"),
  isNew: boolean("is_new").notNull().default(false),
  featured: boolean("featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const customersTable = pgTable("store_customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull(),
  // Авторизация: пароль (scrypt hash), способ входа, OAuth-провайдеры
  passwordHash: text("password_hash"),
  authProvider: text("auth_provider").notNull().default("email"), // email | phone | google | apple
  googleId: text("google_id").unique(),
  appleId: text("apple_id").unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  phoneVerified: boolean("phone_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const ordersTable = pgTable("store_orders", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customersTable.id),
  address: text("address").notNull(),
  total: integer("total").notNull(),
  status: text("status").notNull().default("new"),
  items: jsonb("items").$type<OrderLine[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const questionsTable = pgTable("store_questions", {
  id: serial("id").primaryKey(),
  // Автор может быть гостем (без аккаунта) — тогда customerId пуст
  customerId: integer("customer_id").references(() => customersTable.id),
  authorName: text("author_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  subject: text("subject").notNull().default("question"), // question | feedback | complaint
  message: text("message").notNull(),
  status: text("status").notNull().default("new"), // new | answered | closed
  answer: text("answer"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCustomerSchema = createInsertSchema(customersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertQuestionSchema = createInsertSchema(questionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Question = typeof questionsTable.$inferSelect;
