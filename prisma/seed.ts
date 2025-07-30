// seed.ts
import { PrismaClient, Prisma } from "../app/generated/prisma";
import { hash } from 'bcrypt';
const prisma = new PrismaClient();

async function resetBudgetAndSpendings() {
  await prisma.project.updateMany({
    data: {
      totalBudget: 0,
      q1Budget: 0,
      q2Budget: 0,
      q3Budget: 0,
      q4Budget: 0,
      q1Spent: 0,
      q2Spent: 0,
      q3Spent: 0,
      q4Spent: 0,
    },
  });
}

resetBudgetAndSpendings()
  .then(() => console.log('All project budgets and spendings reset to 0'))
  .catch(console.error)
  .finally(() => prisma.$disconnect());