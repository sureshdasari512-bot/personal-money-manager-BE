import * as dashboardRepository from '../repositories/dashboardRepository.js';
import type { DashboardSummary } from '../types/index.js';

/**
 * Builds the Phase 3 dashboard for the authenticated user (no email reminders).
 *
 * @param userId - Authenticated user
 * @returns Totals, people with balances, overdue and due-soon items
 */
export async function getDashboard(userId: string): Promise<DashboardSummary> {
  const [totals, people, overdue, upcomingDue] = await Promise.all([
    dashboardRepository.getDashboardTotals(userId),
    dashboardRepository.findPeopleWithBalance(userId),
    dashboardRepository.findOverdueItems(userId),
    dashboardRepository.findUpcomingDueItems(userId),
  ]);

  return {
    ...totals,
    overdueCount: overdue.length,
    upcomingDueCount: upcomingDue.length,
    people,
    overdue,
    upcomingDue,
  };
}
