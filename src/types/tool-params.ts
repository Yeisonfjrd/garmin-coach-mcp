/**
 * @fileoverview Typed parameter interfaces for all MCP tools
 *
 * This file contains comprehensive TypeScript interfaces for tool parameters,
 * providing type safety, validation constraints, and detailed documentation
 * for all MCP tool methods in the Garmin Connect integration.
 *
 * Organization:
 * - Common parameter interfaces (reusable across tools)
 * - Basic health & activity tools
 * - Aggregation tools (volume tracking)
 * - Training stress tools
 * - Workout tools (creation and scheduling)
 *
 * Naming convention: {ToolMethodName}Params
 * Example: getSleepData -> GetSleepDataParams
 *
 * @module types/tool-params
 */

// ============================================================================
// Common Parameter Interfaces
// ============================================================================

/**
 * Common date parameter in YYYY-MM-DD format
 * @pattern ^\\d{4}-\\d{2}-\\d{2}$
 * @example "2025-10-13"
 */
export interface DateParam {
  /**
   * Date in YYYY-MM-DD format
   * @default Today's date
   * @pattern ^\\d{4}-\\d{2}-\\d{2}$
   */
  date?: string;
}

/**
 * Common summary mode parameter
 * @deprecated Use includeSummaryOnly instead
 */
export interface SummaryParam {
  /**
   * Return only summary data instead of detailed breakdown
   * @default false
   * @deprecated Use includeSummaryOnly instead for consistency
   */
  summary?: boolean;

  /**
   * Return only summary data instead of detailed breakdown
   * @default false
   */
  includeSummaryOnly?: boolean;
}

/**
 * Common activity filtering parameters
 */
export interface ActivityFilterParams {
  /**
   * Filter by specific activity types
   * @example ["running", "cycling"]
   */
  activityTypes?: string[];

  /**
   * Maximum number of activities to process
   * @default 1000
   * @minimum 1
   * @maximum 2000
   */
  maxActivities?: number;
}

/**
 * Common pagination parameters
 */
export interface PaginationParams {
  /**
   * Starting index for pagination
   * @default 0
   * @minimum 0
   */
  start?: number;

  /**
   * Maximum number of items to return
   * @minimum 1
   */
  limit?: number;
}

// ============================================================================
// Basic Health & Activity Tools
// ============================================================================

/**
 * Parameters for getDailyOverview tool
 */
export type GetDailyOverviewParams = DateParam;

/**
 * Parameters for getSleepData tool
 */
export interface GetSleepDataParams extends DateParam, SummaryParam {
  /**
   * Specific fields to include in the response
   * @example ["dailySleepDTO", "wellnessEpochSummaryDTO"]
   */
  fields?: string[];
}

/**
 * Parameters for getHealthMetrics tool
 */
export interface GetHealthMetricsParams extends DateParam {
  /**
   * Specific metrics to include
   * @default ["steps", "weight", "heart_rate", "stress", "body_battery", "hydration"]
   * @example ["steps", "heart_rate"]
   */
  metrics?: Array<"steps" | "weight" | "heart_rate" | "stress" | "body_battery" | "hydration">;
}

/**
 * Parameters for getHeartRateData tool
 */
export interface GetHeartRateDataParams extends DateParam, SummaryParam {}

/**
 * Parameters for getWeightData tool
 */
export type GetWeightDataParams = DateParam;

/**
 * Parameters for getHydrationData tool
 */
export type GetHydrationDataParams = DateParam;

/**
 * Parameters for getActivities tool
 */
export interface GetActivitiesParams extends PaginationParams, SummaryParam {
  /**
   * Maximum number of activities to return
   * @default 20
   * @minimum 1
   * @maximum 50
   */
  limit?: number;
}

/**
 * Parameters for getActivityDetails tool
 */
export interface GetActivityDetailsParams {
  /**
   * The unique ID of the activity to retrieve
   */
  activityId: number;
}

// ============================================================================
// Aggregation Tools (Volume Tracking)
// ============================================================================

/**
 * Common parameters for volume aggregation
 */
export interface VolumeAggregationParams extends ActivityFilterParams {
  /**
   * Include breakdown by activity type
   * @default true
   */
  includeActivityBreakdown?: boolean;
}

/**
 * Parameters for getWeeklyVolume tool
 */
export interface GetWeeklyVolumeParams extends VolumeAggregationParams {
  /**
   * Year for the week
   * @default Current year
   * @minimum 2000
   * @maximum 2100
   */
  year?: number;

  /**
   * ISO week number
   * @default Current week
   * @minimum 1
   * @maximum 53
   */
  week?: number;

  /**
   * Include comparison with previous week
   * @default false
   */
  includeTrends?: boolean;
}

// ============================================================================
// Training Stress Tools
// ============================================================================

/**
 * Common parameters for TSS calculations
 */
export interface TSSCalculationParams {
  /**
   * Custom resting heart rate for TSS calculation
   * @default 50
   * @minimum 30
   * @maximum 100
   */
  restingHR?: number;

  /**
   * Custom maximum heart rate for TSS calculation
   * @default 185
   * @minimum 100
   * @maximum 250
   */
  maxHR?: number;

  /**
   * Custom threshold heart rate for TSS calculation
   * @default 90% of maxHR
   * @minimum 100
   * @maximum 250
   */
  thresholdHR?: number;
}

/**
 * Parameters for getTrainingStressBalance tool
 */
export interface GetTrainingStressBalanceParams extends DateParam, TSSCalculationParams, SummaryParam {
  /**
   * Number of days of historical data to analyze
   * @default 90
   * @minimum 7
   * @maximum 365
   */
  days?: number;

  /**
   * Include daily time series data showing TSS, CTL, ATL, TSB progression
   * @default true
   */
  includeTimeSeries?: boolean;
}

// ============================================================================
// Workout Tools
// ============================================================================

/**
 * Duration configuration for workout steps
 */
export interface WorkoutStepDuration {
  /**
   * Duration type
   */
  type: "time" | "distance" | "lap_button";

  /**
   * Duration value (seconds for time, meters for distance)
   * Not required for lap_button
   */
  value?: number;

  /**
   * Distance unit (required for distance type)
   */
  unit?: "m" | "km" | "mile";
}

/**
 * Target configuration for workout steps
 */
export interface WorkoutStepTarget {
  /**
   * Target type
   */
  type: "pace" | "hr_zone" | "no_target";

  /**
   * Minimum pace in min/km (required for pace target)
   */
  minValue?: number;

  /**
   * Maximum pace in min/km (required for pace target)
   */
  maxValue?: number;

  /**
   * HR zone number 1-5 (required for hr_zone target)
   */
  zone?: number;
}

/**
 * Workout step configuration
 */
export interface WorkoutStep {
  /**
   * Step type
   */
  type: "warmup" | "interval" | "recovery" | "cooldown" | "rest" | "repeat";

  /**
   * Duration of the step (not required for repeat blocks)
   */
  duration?: WorkoutStepDuration;

  /**
   * Intensity target (optional)
   */
  target?: WorkoutStepTarget;

  /**
   * Number of repetitions (required for repeat type)
   * @minimum 1
   */
  numberOfRepetitions?: number;

  /**
   * Child steps to repeat (required for repeat type)
   */
  childSteps?: WorkoutStep[];
}

/**
 * Parameters for createRunningWorkout tool
 */
export interface CreateRunningWorkoutParams {
  /**
   * Workout name (required)
   * @minLength 1
   */
  name: string;

  /**
   * Optional workout description
   */
  description?: string;

  /**
   * Array of workout steps (required, at least one step)
   * @minItems 1
   */
  steps: WorkoutStep[];
}

/**
 * Parameters for scheduleWorkout tool
 */
export interface ScheduleWorkoutParams {
  /**
   * ID of the workout to schedule (from create_running_workout response)
   */
  workoutId: number;

  /**
   * Date to schedule workout in YYYY-MM-DD format
   * @pattern ^\\d{4}-\\d{2}-\\d{2}$
   * @example "2025-10-13"
   */
  date: string;
}

/**
 * Parameters for getScheduledWorkouts tool
 */
export interface GetScheduledWorkoutsParams {
  /**
   * Start date in YYYY-MM-DD format
   * @default Current week Monday
   * @pattern ^\\d{4}-\\d{2}-\\d{2}$
   */
  startDate?: string;

  /**
   * End date in YYYY-MM-DD format
   * @default Current week Sunday
   * @pattern ^\\d{4}-\\d{2}-\\d{2}$
   */
  endDate?: string;
}

/**
 * Parameters for deleteWorkout tool
 */
export interface DeleteWorkoutParams {
  /**
   * The workout ID to delete (from create_running_workout response)
   * This permanently removes the workout from your library and all calendar dates
   */
  workoutId: number;
}

/**
 * Parameters for unscheduleWorkout tool
 */
export interface UnscheduleWorkoutParams {
  /**
   * The schedule ID (from get_scheduled_workouts 'scheduleId' field)
   * This removes the workout from the calendar but keeps it in your library
   */
  scheduleId: number;
}

/**
 * Parameters for getWorkoutDetails tool
 */
export interface GetWorkoutDetailsParams {
  /**
   * The unique ID of the workout to retrieve details for
   * (from create_running_workout or get_scheduled_workouts response)
   */
  workoutId: number;
}

// ============================================================================
// Type Guards & Utilities
// ============================================================================

/**
 * Type guard to check if a parameter object has a date field
 */
export function hasDateParam(params: unknown): params is DateParam {
  return typeof params === 'object' && params !== null && 'date' in params;
}

/**
 * Type guard to check if a parameter object has summary parameters
 */
export function hasSummaryParam(params: unknown): params is SummaryParam {
  return (
    typeof params === 'object' &&
    params !== null &&
    ('summary' in params || 'includeSummaryOnly' in params)
  );
}

/**
 * Helper to normalize summary parameter (handles deprecated 'summary' field)
 * @param params - Parameter object with potential summary fields
 * @returns The normalized summary boolean value
 */
export function normalizeSummaryParam(params: SummaryParam): boolean {
  return params.includeSummaryOnly ?? params.summary ?? false;
}
