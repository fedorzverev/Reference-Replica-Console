import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

const requireStoreAdmin: RequestHandler = async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Войдите в аккаунт администратора" });
    return;
  }

  const adminEmail = process.env.STORE_ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) {
    res.status(503).json({ error: "Доступ администратора не настроен" });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const isAdmin = user.emailAddresses.some(
      ({ emailAddress }) => emailAddress.toLowerCase() === adminEmail,
    );

    if (!isAdmin) {
      res.status(403).json({ error: "Недостаточно прав для этого раздела" });
      return;
    }

    next();
  } catch (error) {
    req.log.error({ err: error }, "Unable to verify store administrator");
    res.status(503).json({ error: "Не удалось проверить права доступа" });
  }
};

export default requireStoreAdmin;
