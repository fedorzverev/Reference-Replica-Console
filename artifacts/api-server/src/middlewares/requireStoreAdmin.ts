import type { RequestHandler } from "express";

/**
 * Store admin authorization.
 *
 * The Clerk-based authentication has been removed from this project (no
 * Clerk keys are available), so admin endpoints are open in this local
 * deployment. Replace this middleware with a real auth provider if you
 * re-enable authentication.
 */
const requireStoreAdmin: RequestHandler = (_req, _res, next) => {
  next();
};

export default requireStoreAdmin;
