import { PrismaClient } from "@prisma/client";

// Single shared instance — avoids connection exhaustion
const prisma = new PrismaClient();

export default prisma;