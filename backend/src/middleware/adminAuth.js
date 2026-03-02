import { ADMIN_API_KEY } from "../config.js";

/**
 * Middleware that checks for a valid admin API key.
 * Expects header: x-admin-key: <key>
 */
export function requireAdmin(req, res, next) {
  if (!ADMIN_API_KEY) {
    return res.status(503).json({
      error: "Admin endpoints are disabled (no ADMIN_API_KEY configured)",
    });
  }

  const key = req.headers["x-admin-key"];

  if (!key || key !== ADMIN_API_KEY) {
    return res.status(401).json({ error: "Unauthorized — invalid admin key" });
  }

  next();
}