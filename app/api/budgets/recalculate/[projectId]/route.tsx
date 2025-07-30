import { withPermissions } from "@/lib/permission";
import { PermissionType } from "@/app/generated/prisma";
import { BudgetCalculator } from "@/lib/budget-calculator";

export default withPermissions(PermissionType.VIEW_REPORTS, async (req, res, user, projectId) => {
  if (req.method === 'POST') {
    try {
      const spent = await BudgetCalculator.updateProjectSpent(projectId);
      res.status(200).json({ success: true, spent });
    } catch (error) {
      console.error('Error recalculating budget:', error);
      res.status(500).json({ error: 'Failed to recalculate budget' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
});