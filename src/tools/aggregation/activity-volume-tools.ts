/**
 * @fileoverview Training volume aggregation tools for workload monitoring and periodization planning
 *
 * Provides comprehensive training volume analysis across flexible time periods including weekly,
 * monthly, and custom date ranges. Aggregates duration, distance, elevation, and calories with
 * optional activity-type breakdown. Essential for monitoring training load, tracking volume trends,
 * planning progressive overload, and implementing periodization strategies. Supports trend comparison
 * with previous periods and daily breakdowns for detailed progression analysis.
 *
 * NOTE: No summary mode implemented - data is already aggregated.
 * Use includeActivityBreakdown and includeTrends parameters to control detail level.
 *
 * Tools provided:
 * - getWeeklyVolume: Aggregate training volume for a specific ISO week with optional trends
 *
 * @category Aggregation
 * @see ../../utils/activity-fetcher for efficient batch activity retrieval
 * @see ../analytics/periodization-tools for training phase detection
 * @see ../tracking/training-stress-tools for TSS-based load analysis
 */

import { GarminClient } from '../../client/garmin-client.js';
import {
  WeeklyVolumeResult,
  VolumeMetrics,
  ActivityTypeBreakdown,
  VolumeAggregationOptions,
  ProcessedActivity,
  ToolResult
} from '../../types/garmin-types.js';
import {
  secondsToMinutes,
  metersToKm,
  removeEmptyValues,
  getISOWeek,
  getISOWeekRange,
  formatActivityType
} from '../../utils/data-transforms.js';
import { logger } from '../../utils/logger.js';
import { BaseAdvancedTool } from '../base/BaseAdvancedTool.js';
import {
  GetWeeklyVolumeParams
} from '../../types/tool-params.js';

export class ActivityVolumeTools extends BaseAdvancedTool {
  constructor(garminClient: GarminClient) {
    super(garminClient);
  }

  /**
   * Aggregate weekly training volume to track training load patterns
   *
   * Calculates total training volume for a specific week including duration, distance,
   * elevation, and calories. Essential for monitoring training consistency, identifying
   * volume trends, and planning progressive overload. Supports activity-type breakdown
   * for multi-sport athletes.
   *
   * @param params - Weekly volume retrieval parameters
   * @param params.year - Target year (defaults to current year)
   * @param params.week - ISO week number 1-53 (defaults to current week)
   * @param params.includeActivityBreakdown - Include per-activity-type breakdown (default: true)
   * @param params.includeTrends - Include comparison with previous week (default: false)
   * @param params.maxActivities - Maximum activities to process (default: 1000)
   * @param params.activityTypes - Filter by specific activity types (e.g., ['running', 'cycling'])
   * @returns MCP tool result with weekly volume metrics or error message
   * @throws Error if date range is invalid or Garmin API is unavailable
   *
   * @example
   * // Get current week's volume with trends
   * const result = await volumeTools.getWeeklyVolume({
   *   includeTrends: true
   * });
   *
   * @example
   * // Get specific week for single sport
   * const result = await volumeTools.getWeeklyVolume({
   *   year: 2025,
   *   week: 42,
   *   activityTypes: ['running']
   * });
   *
   */
  async getWeeklyVolume(params: GetWeeklyVolumeParams): Promise<ToolResult> {
    const year = params?.year || new Date().getFullYear();
    const week = params?.week || getISOWeek(new Date()).week;
    const options: VolumeAggregationOptions = {
      includeActivityBreakdown: params?.includeActivityBreakdown !== false,
      includeTrends: params?.includeTrends === true,
      maxActivities: params?.maxActivities || 1000,
      activityTypes: params?.activityTypes
    };

    try {
      // Get week date range
      const { start, end } = getISOWeekRange(year, week);

      // Get activities for the week
      const activities = await this.activityFetcher.getActivitiesInRange(start, end, options);

      // Calculate metrics
      const metrics = this.calculateVolumeMetrics(activities);
      const byActivityType = this.calculateActivityTypeBreakdown(activities);

      // Prepare result
      const result: WeeklyVolumeResult = {
        year,
        week,
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
        metrics,
        byActivityType: options.includeActivityBreakdown ? byActivityType : {}
      };

      // Add trends if requested
      if (options.includeTrends) {
        const previousWeek = week === 1 ? 52 : week - 1;
        const previousYear = week === 1 ? year - 1 : year;
        result.trends = await this.calculateWeeklyTrends(year, week, previousYear, previousWeek, options);
      }

      const cleanedData = removeEmptyValues(result);

      // Validate response size
      if (!this.validateResponseSize(cleanedData)) {
        return this.createSizeErrorResponse('Weekly volume data too large', {
          year,
          week,
          totalActivities: activities.length,
          totalDuration: secondsToMinutes(metrics.duration),
          totalDistance: metersToKm(metrics.distance)
        });
      }

      return this.createSuccessResponse(cleanedData);

    } catch (error) {
      return this.createErrorResponse(`Failed to get weekly volume: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }


  /**
   * Calculate breakdown by activity type
   */
  private calculateActivityTypeBreakdown(activities: ProcessedActivity[]): ActivityTypeBreakdown {
    const breakdown: ActivityTypeBreakdown = {};

    for (const activity of activities) {
      const type = formatActivityType(activity.activityType);

      if (!breakdown[type]) {
        breakdown[type] = {
          duration: 0,
          distance: 0,
          activityCount: 0,
          calories: 0,
          elevationGain: 0
        };
      }

      breakdown[type].duration += activity.duration || 0;
      breakdown[type].distance += activity.distance || 0;
      breakdown[type].activityCount += 1;
      breakdown[type].calories += activity.calories || 0;
      breakdown[type].elevationGain += activity.elevationGain || 0;
    }

    return breakdown;
  }


  /**
   * Calculate percentage change between two values
   */
  private calculatePercentChange(oldValue: number, newValue: number): number {
    if (oldValue === 0) return newValue > 0 ? 100 : 0;
    return Math.round(((newValue - oldValue) / oldValue) * 100 * 100) / 100;
  }

  /**
   * Calculate volume metrics from activities
   */
  private calculateVolumeMetrics(activities: ProcessedActivity[]): VolumeMetrics {
    return activities.reduce((metrics, activity) => ({
      duration: metrics.duration + (activity.duration || 0),
      distance: metrics.distance + (activity.distance || 0),
      activityCount: metrics.activityCount + 1,
      calories: metrics.calories + (activity.calories || 0),
      elevationGain: metrics.elevationGain + (activity.elevationGain || 0)
    }), {
      duration: 0,
      distance: 0,
      activityCount: 0,
      calories: 0,
      elevationGain: 0
    });
  }

  /**
   * Calculate weekly trends
   */
  private async calculateWeeklyTrends(
    currentYear: number,
    currentWeek: number,
    previousYear: number,
    previousWeek: number,
    options: VolumeAggregationOptions
  ) {
    try {
      const { start: prevStart, end: prevEnd } = getISOWeekRange(previousYear, previousWeek);
      const prevActivities = await this.activityFetcher.getActivitiesInRange(prevStart, prevEnd, options);
      const prevMetrics = this.calculateVolumeMetrics(prevActivities);

      const { start: currStart, end: currEnd } = getISOWeekRange(currentYear, currentWeek);
      const currActivities = await this.activityFetcher.getActivitiesInRange(currStart, currEnd, options);
      const currMetrics = this.calculateVolumeMetrics(currActivities);

      return {
        durationChangePercent: this.calculatePercentChange(prevMetrics.duration, currMetrics.duration),
        distanceChangePercent: this.calculatePercentChange(prevMetrics.distance, currMetrics.distance),
        activityCountChange: currMetrics.activityCount - prevMetrics.activityCount
      };
    } catch (error) {
      logger.error('Error calculating weekly trends:', error);
      return undefined;
    }
  }
}