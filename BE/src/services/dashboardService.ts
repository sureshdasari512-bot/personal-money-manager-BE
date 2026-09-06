import * as dashboardRepository from '../repositories/dashboardRepository.js';
import type { DashboardSummary } from '../types/index.js';

/**
 * Builds the Phase 3 dashboard summary for the authenticated user.
 *
 * @param userId - Authenticated user
 * @returns Aggregated dashboard totals
 */
export async function getDashboard(userId: string): Promise<DashboardSummary> {
  return dashboardRepository.getDashboardSummary(userId);
}
