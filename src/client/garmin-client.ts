import GarminConnectLib from "garmin-connect";
import { GarminClientConfig, DailyStepsData } from '../types/garmin-types.js';
import type { WorkoutPayload, WorkoutResponse, WorkoutScheduleResponse, ScheduledWorkout, SportType, DeleteResponse } from '../types/workout.js';
import { SPORT_TYPE_MAPPING } from '../types/workout.js';
import { DebugLogger } from '../utils/debug-logger.js';

const GarminConnect = GarminConnectLib.GarminConnect;

// Calendar item from Garmin API response
interface ICalendarItem {
  /** The calendar item ID - use this for unschedule operations */
  id: number;
  itemType: string;
  workoutId?: number;
  date: string;
  workoutScheduleId?: number;
  // Nested workout object containing workout details
  workout?: {
    workoutId?: number;
    ownerId?: number;
    workoutName?: string;
    description?: string;
    sportType?: {
      sportTypeId: number;
      sportTypeKey: string;
    };
    estimatedDurationInSecs?: number;
    estimatedDistanceInMeters?: number;
  };
}

// Workout detail response from Garmin API
export interface IWorkoutDetail {
  workoutId: number;
  workoutName: string;
  description?: string;
  sportType: {
    sportTypeId: number;
    sportTypeKey: string;
    displayOrder?: number;
  };
  estimatedDurationInSecs: number;
  estimatedDistanceInMeters: number | null;
  createdDate: string;
  updateDate: string;
  workoutSegments: Array<{
    segmentOrder: number;
    sportType: {
      sportTypeId: number;
      sportTypeKey: string;
    };
    workoutSteps: Array<{
      type: string;
      stepId: number;
      stepOrder: number;
      stepType: {
        stepTypeId: number;
        stepTypeKey: string;
      };
      endCondition: {
        conditionTypeId: number;
        conditionTypeKey: string;
      };
      endConditionValue: number | null;
      targetType: {
        workoutTargetTypeId: number;
        workoutTargetTypeKey: string;
      };
      targetValueOne: number | null;
      targetValueTwo: number | null;
      zoneNumber: number | null;
      numberOfIterations?: number;
      workoutSteps?: unknown[];
    }>;
  }>;
}

// Extended interface for internal Garmin Connect client methods
interface ExtendedGarminClient {
  client: {
    get: (url: string) => Promise<unknown>;
    delete: <T>(url: string) => Promise<T>;
  };
  addWorkout: (payload: WorkoutPayload) => Promise<unknown>;
  deleteWorkout: (workout: { workoutId: string }) => Promise<unknown>;
  getWorkoutDetail: (workout: { workoutId: string }) => Promise<IWorkoutDetail>;
  getUserProfile: () => Promise<{ profileId: number }>;
  post: (url: string, data: unknown) => Promise<unknown>;
}

export class GarminClient {
  private client: InstanceType<typeof GarminConnect> | null = null;
  private config: GarminClientConfig;
  private isAuthenticated = false;
  private debugLogger: DebugLogger;

  constructor(config: GarminClientConfig) {
    this.config = config;
    this.debugLogger = new DebugLogger();
  }

  /**
   * Check if error indicates HTML login page was returned instead of JSON
   *
   * When Garmin API returns HTML (login page) instead of expected JSON,
   * the JSON parser throws various syntax errors. This method detects
   * those error patterns.
   *
   * @param errorMessage - Error message to check
   * @returns true if error indicates HTML login page
   */
  private isHtmlLoginPage(errorMessage: string): boolean {
    const htmlIndicators = [
      'login page',
      'not valid JSON',
      'Unexpected token',
      'Unexpected token \'<\'', // HTML starts with <
      'Unexpected token \'l\'', // "login page" starts with l
      'SyntaxError',
      '<html',
      '<!DOCTYPE',
    ];

    const lowerError = errorMessage.toLowerCase();
    return htmlIndicators.some(indicator =>
      lowerError.includes(indicator.toLowerCase())
    );
  }

  /**
   * Execute operation with stdout suppressed
   *
   * Temporarily redirects process.stdout.write to prevent library output
   * from breaking MCP JSON protocol. MCP uses stdio for communication,
   * so any stdout output that's not valid JSON will cause parse errors.
   *
   * @param operation - Async operation to execute with suppressed stdout
   * @returns Array of captured stdout messages
   */
  private async withSuppressedStdout<T>(operation: () => Promise<T>): Promise<{ result: T; captured: string[] }> {
    const originalWrite = process.stdout.write.bind(process.stdout);
    const outputBuffer: string[] = [];

    // Temporarily replace stdout.write to capture output
    // chunk can be string, Buffer, or Uint8Array per Node.js WriteStream signature
    process.stdout.write = (chunk: string | Buffer | Uint8Array): boolean => {
      outputBuffer.push(chunk.toString());
      return true;
    };

    try {
      const result = await operation();
      return { result, captured: outputBuffer };
    } finally {
      // CRITICAL: Always restore original stdout
      process.stdout.write = originalWrite;
    }
  }

  async initialize(): Promise<InstanceType<typeof GarminConnect>> {
    // Return cached client if already authenticated
    if (this.client && this.isAuthenticated) {
      return this.client;
    }

    // Validate credentials
    if (!this.config.username || !this.config.password) {
      console.error('[GarminClient] ERROR: Missing credentials (GARMIN_USERNAME and GARMIN_PASSWORD required)');
      throw new Error("GARMIN_USERNAME and GARMIN_PASSWORD environment variables are required");
    }

    // Create new client instance
    this.client = new GarminConnect({
      username: this.config.username,
      password: this.config.password,
    });

    // Attempt authentication with stdout suppression
    // This prevents garmin-connect library from outputting to stdout
    // which breaks MCP's JSON protocol over stdio
    console.error('[GarminClient] Authenticating...');

    try {
      const { captured } = await this.withSuppressedStdout(async () => {
        // client is guaranteed to be non-null here as we just created it above
        await this.client!.login();
      });

      console.error('[GarminClient] ✓ Login successful');

      // Log what was suppressed if anything
      if (captured.length > 0) {
        console.error(`[GarminClient] Suppressed ${captured.length} stdout message(s) during login`);
        // Log first 200 chars of captured output for debugging
        const preview = captured.join('').substring(0, 200);
        console.error(`[GarminClient] Captured output: ${preview}${captured.join('').length > 200 ? '...' : ''}`);
      }

      this.isAuthenticated = true;
    } catch (error) {
      console.error('[GarminClient] ✗ Login failed');

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if we received HTML login page instead of JSON
      if (this.isHtmlLoginPage(errorMessage)) {
        console.error('[GarminClient] ERROR: Received HTML login page instead of JSON');
        console.error('[GarminClient] This usually means:');
        console.error('  - Invalid credentials');
        console.error('  - Account requires 2FA (not supported)');
        console.error('  - Account is locked');
        console.error('  - Garmin API is temporarily down');

        this.isAuthenticated = false;
        throw new Error(
          `Authentication failed: Received HTML login page. ` +
          `Please verify credentials and ensure 2FA is disabled. ` +
          `Original error: ${errorMessage}`
        );
      }

      // Log detailed error information for other errors
      console.error(`[GarminClient] Error details: ${errorMessage}`);
      if (error instanceof Error && error.stack) {
        console.error(`[GarminClient] Stack trace:\n${error.stack}`);
      }

      this.isAuthenticated = false;
      throw new Error(`Failed to authenticate with Garmin Connect: ${errorMessage}`);
    }

    return this.client;
  }

  private async retryWithReauth<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      // Check if the error indicates an authentication issue
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('login page') ||
          errorMessage.includes('not valid JSON') ||
          errorMessage.includes('Unexpected token') ||
          errorMessage.includes('401') ||
          errorMessage.includes('403')) {

        // Authentication expired, attempt re-authentication
        console.error('[GarminClient] Authentication expired, re-authenticating...');

        // Reset authentication state and re-initialize
        this.isAuthenticated = false;
        this.client = null;
        await this.initialize();

        // Retry the operation once
        return await operation();
      }

      // If it's not an auth error, rethrow
      throw error;
    }
  }

  async getSleepData(date: Date) {
    return await this.retryWithReauth(async () => {
      const client = await this.initialize();
      return await client.getSleepData(date);
    });
  }

  async getActivities(start: number = 0, limit: number = 20) {
    return await this.retryWithReauth(async () => {
      const client = await this.initialize();
      return await client.getActivities(start, limit);
    });
  }

  async getActivity(activity: { activityId: number }) {
    return await this.retryWithReauth(async () => {
      const client = await this.initialize();
      return await client.getActivity(activity);
    });
  }

  async getSteps(date: Date) {
    return await this.retryWithReauth(async () => {
      const client = await this.initialize();
      return await client.getSteps(date);
    });
  }

  /**
   * Get detailed daily steps data including goal, distance, and step count.
   * This method calls the Garmin API directly to access the full data structure
   * that the library's getSteps() method doesn't expose.
   */
  async getDailyStepsData(date: Date): Promise<DailyStepsData> {
    return await this.retryWithReauth(async () => {
      const client = await this.initialize();

      // Format date as YYYY-MM-DD
      const dateString = date.toISOString().split('T')[0];

      // Call the API directly using the same endpoint as getSteps()
      // The endpoint returns an array of daily step data
      const response = await (client as unknown as ExtendedGarminClient).client.get(
        `https://connectapi.garmin.com/usersummary-service/stats/steps/daily/${dateString}/${dateString}`
      );

      if (!Array.isArray(response) || response.length === 0) {
        throw new Error(`No steps data available for ${dateString}`);
      }

      // Find the data for the requested date
      const dayData = response.find((day: unknown) => {
        const record = day as Record<string, unknown>;
        return record.calendarDate === dateString;
      });

      if (!dayData) {
        throw new Error(`No steps data found for ${dateString}`);
      }

      const data = dayData as Record<string, unknown>;
      return {
        calendarDate: data.calendarDate as string,
        stepGoal: (data.stepGoal as number) || 0,
        totalDistance: (data.totalDistance as number) || 0,
        totalSteps: (data.totalSteps as number) || 0
      };
    });
  }

  async getHeartRate(date: Date) {
    return await this.retryWithReauth(async () => {
      const client = await this.initialize();
      return await client.getHeartRate(date);
    });
  }

  async getDailyWeightData(date: Date) {
    return await this.retryWithReauth(async () => {
      const client = await this.initialize();
      return await client.getDailyWeightData(date);
    });
  }

  async getDailyHydration(date: Date) {
    return await this.retryWithReauth(async () => {
      const client = await this.initialize();
      return await client.getDailyHydration(date);
    });
  }

  async getUserProfile() {
    return await this.retryWithReauth(async () => {
      const client = await this.initialize();
      return await client.getUserProfile();
    });
  }

  /**
   * Creates a new workout in Garmin Connect
   *
   * @param payload - Complete workout definition in Garmin API format
   * @returns Workout response with ID from Garmin API
   * @throws Error if upload fails or authentication required
   *
   * @example
   * ```typescript
   * const workout = new WorkoutBuilder('5K Run', 'running')
   *   .addWarmup(EndConditionFactory.time(600))
   *   .addInterval(EndConditionFactory.distance(5000, 'm'))
   *   .build();
   *
   * const response = await client.createWorkout(workout);
   * console.log(`Created workout ID: ${response.workoutId}`);
   * ```
   */
  async createWorkout(payload: WorkoutPayload): Promise<WorkoutResponse> {
    return await this.retryWithReauth(async () => {
      const client = await this.initialize();

      try {
        // Use the built-in addWorkout method from garmin-connect library
        // Payload is already in correct Garmin API format from WorkoutBuilder
        const response = await (client as unknown as ExtendedGarminClient).addWorkout(payload);

        // Validate response structure
        if (!response || typeof response !== 'object') {
          throw new Error('Invalid response from Garmin API: response is not an object');
        }

        const resp = response as Record<string, unknown>;
        if (!resp.workoutId) {
          throw new Error('Invalid response from Garmin API: missing workout ID');
        }

        return response as WorkoutResponse;
      } catch (error) {
        // Enhance error messages with more context
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Check for specific HTTP error codes
        if (errorMessage.includes('400')) {
          throw new Error(`Bad request: Invalid workout payload. ${errorMessage}`);
        }
        if (errorMessage.includes('401') || errorMessage.includes('403')) {
          // Let retryWithReauth handle authentication errors
          throw error;
        }
        if (errorMessage.includes('500')) {
          throw new Error(`Garmin server error: ${errorMessage}`);
        }
        if (errorMessage.includes('503')) {
          throw new Error(`Garmin service unavailable: ${errorMessage}`);
        }

        // Re-throw with context for other errors
        throw new Error(`Failed to create workout: ${errorMessage}`);
      }
    });
  }

  /**
   * Schedules a workout to a specific date in Garmin Connect calendar
   *
   * Uses Garmin Connect API to add an existing workout to the calendar.
   * The workout must already exist (created via createWorkout).
   *
   * @param workoutId - ID of the workout to schedule
   * @param date - Date to schedule the workout for
   * @returns Schedule response with confirmation
   * @throws Error if scheduling fails or workout not found
   *
   * @example
   * ```typescript
   * const response = await client.scheduleWorkout(1354294595, new Date('2025-10-13'));
   * console.log(`Scheduled workout on ${response.calendarDate}`);
   * ```
   */
  async scheduleWorkout(workoutId: number, date: Date): Promise<WorkoutScheduleResponse> {
    return await this.retryWithReauth(async () => {
      const client = await this.initialize();

      try {
        // Format date as YYYY-MM-DD
        const calendarDate = date.toISOString().split('T')[0];

        // Use the schedule endpoint (matches library style: connectapi.garmin.com)
        // Discovered through reverse engineering - Garmin API only needs workoutId and date
        const scheduleUrl = `https://connectapi.garmin.com/workout-service/schedule/${workoutId}`;
        const payload = {
          date: calendarDate
        };

        // Send schedule request using client.post (same pattern as addWorkout)
        await (client as unknown as ExtendedGarminClient).post(scheduleUrl, payload);

        // Generate schedule ID for tracking
        const workoutScheduleId = Date.now();

        // Return success response
        return {
          workoutScheduleId,
          calendarDate,
          workoutId,
          success: true,
          message: `Workout scheduled successfully for ${calendarDate}`,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Check for specific HTTP error codes
        if (errorMessage.includes('404')) {
          throw new Error(`Workout not found: ${workoutId}`);
        }
        if (errorMessage.includes('400')) {
          throw new Error(`Bad request: Invalid scheduling data. ${errorMessage}`);
        }
        if (errorMessage.includes('401') || errorMessage.includes('403')) {
          // Let retryWithReauth handle authentication errors
          throw error;
        }
        if (errorMessage.includes('500')) {
          throw new Error(`Garmin server error: ${errorMessage}`);
        }
        if (errorMessage.includes('503')) {
          throw new Error(`Garmin service unavailable: ${errorMessage}`);
        }

        // Re-throw with context for other errors
        throw new Error(`Failed to schedule workout: ${errorMessage}`);
      }
    });
  }

  /**
   * Gets scheduled workouts for a date range from Garmin Connect calendar
   *
   * Uses the calendar-service API to retrieve scheduled workouts.
   * This approach is more robust than workout-service as it handles deleted workouts gracefully.
   *
   * @param startDate - Start date of the range
   * @param endDate - End date of the range
   * @returns Array of scheduled workouts with details
   * @throws Error if retrieval fails
   *
   * @example
   * ```typescript
   * // Get this week's scheduled workouts
   * const monday = new Date('2025-10-13');
   * const sunday = new Date('2025-10-19');
   * const workouts = await client.getScheduledWorkouts(monday, sunday);
   * console.log(`${workouts.length} workouts scheduled this week`);
   * ```
   */
  async getScheduledWorkouts(startDate: Date, endDate: Date): Promise<ScheduledWorkout[]> {
    return await this.retryWithReauth(async () => {
      const client = await this.initialize();

      // Calculate months between startDate and endDate
      const months: { year: number; month: number }[] = [];

      // Get start of month for startDate
      const currentDate = new Date(startDate);
      currentDate.setDate(1); // First day of month
      currentDate.setHours(0, 0, 0, 0);

      // Iterate through months
      while (currentDate <= endDate) {
        months.push({
          year: currentDate.getFullYear(),
          month: currentDate.getMonth()  // JavaScript months are 0-based (0=January, 9=October)
        });

        // Move to next month
        currentDate.setMonth(currentDate.getMonth() + 1);
      }

      // Fetch calendar data for each month
      const allWorkouts: ScheduledWorkout[] = [];
      for (const { year, month } of months) {
        try {
          // Use calendar endpoint
          const calendarData = await (client as unknown as ExtendedGarminClient).client.get(
            `https://connectapi.garmin.com/calendar-service/year/${year}/month/${month}`
          );

          // API returns an object with calendarItems array
          // Intentional any for API response data
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const items: ICalendarItem[] = (calendarData as any)?.calendarItems || [];

          // Filter items with itemType === 'workout'
          const workouts = items.filter(
            (item): item is ICalendarItem =>
              item.itemType === 'workout' && !!item.workoutId
          );

          // Filter by date range
          const filteredWorkouts = workouts.filter((workout) => {
            const workoutDate = new Date(workout.date);
            return workoutDate >= startDate && workoutDate <= endDate;
          });

          // Map to ScheduledWorkout format
          const mappedWorkouts: ScheduledWorkout[] = filteredWorkouts.map((workout) => {
            // Map API sportType to proper SportType with displayOrder
            let sportType: SportType;
            if (workout.workout?.sportType && workout.workout.sportType.sportTypeKey) {
              // Try to match to known sport types
              const key = workout.workout.sportType.sportTypeKey as keyof typeof SPORT_TYPE_MAPPING;
              if (key in SPORT_TYPE_MAPPING) {
                sportType = SPORT_TYPE_MAPPING[key];
              } else {
                // Default to 'other' if unknown
                sportType = SPORT_TYPE_MAPPING.other;
              }
            } else {
              // Default to 'other' if no sportType provided
              sportType = SPORT_TYPE_MAPPING.other;
            }

            return {
              scheduleId: workout.id,
              workoutScheduleId: workout.workoutScheduleId || workout.id || 0,
              workoutId: workout.workout?.workoutId || workout.workoutId || 0,
              workoutName: workout.workout?.workoutName || 'Unnamed Workout',
              calendarDate: workout.date,
              sportType,
              estimatedDurationInSecs: workout.workout?.estimatedDurationInSecs || 0,
              estimatedDistanceInMeters: workout.workout?.estimatedDistanceInMeters || 0,
              description: workout.workout?.description,
            };
          });

          allWorkouts.push(...mappedWorkouts);
        } catch (error) {
          // Log error and continue to next month
          this.debugLogger.logError('GET', `calendar-service/year/${year}/month/${month}`, error);
        }
      }

      return allWorkouts;
    });
  }

  /**
   * Deletes a workout from the Garmin Connect workout library
   *
   * This is a permanent, destructive operation. The workout will be removed
   * from the library AND from all calendar dates where it was scheduled.
   *
   * @param workoutId - The ID of the workout to delete
   * @returns Success confirmation
   * @throws Error if deletion fails or workout not found
   *
   * @example
   * ```typescript
   * await client.deleteWorkout(1354294595);
   * console.log('Workout deleted');
   * ```
   */
  async deleteWorkout(workoutId: number): Promise<DeleteResponse> {
    return await this.retryWithReauth(async () => {
      const client = await this.initialize();

      try {
        // Use the built-in deleteWorkout method from garmin-connect library
        await (client as unknown as ExtendedGarminClient).deleteWorkout({
          workoutId: String(workoutId)
        });

        return {
          success: true,
          message: `Workout ${workoutId} deleted successfully`
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes('404')) {
          throw new Error(`Workout not found: ${workoutId}`);
        }
        if (errorMessage.includes('400')) {
          throw new Error(`Bad request: Invalid workout ID. ${errorMessage}`);
        }
        if (errorMessage.includes('401') || errorMessage.includes('403')) {
          throw error; // Let retryWithReauth handle
        }
        if (errorMessage.includes('500')) {
          throw new Error(`Garmin server error: ${errorMessage}`);
        }

        throw new Error(`Failed to delete workout: ${errorMessage}`);
      }
    });
  }

  /**
   * Removes a scheduled workout from the Garmin Connect calendar
   *
   * This operation only removes the workout from the calendar.
   * The workout itself remains in your library and can be scheduled again.
   *
   * @param scheduleId - The schedule ID (calendar item 'id' from getScheduledWorkouts)
   * @returns Success confirmation
   * @throws Error if unscheduling fails or schedule not found
   *
   * @example
   * ```typescript
   * // Get scheduled workouts first
   * const workouts = await client.getScheduledWorkouts(startDate, endDate);
   * // Use the scheduleId to unschedule
   * await client.unscheduleWorkout(workouts[0].scheduleId);
   * ```
   */
  async unscheduleWorkout(scheduleId: number): Promise<DeleteResponse> {
    return await this.retryWithReauth(async () => {
      const client = await this.initialize();

      try {
        // Use direct API call to delete the schedule
        await (client as unknown as ExtendedGarminClient).client.delete(
          `https://connectapi.garmin.com/workout-service/schedule/${scheduleId}`
        );

        return {
          success: true,
          message: `Schedule ${scheduleId} removed from calendar`
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes('404')) {
          throw new Error(`Schedule not found: ${scheduleId}. It may have already been removed.`);
        }
        if (errorMessage.includes('400')) {
          throw new Error(`Bad request: Invalid schedule ID. ${errorMessage}`);
        }
        if (errorMessage.includes('401') || errorMessage.includes('403')) {
          throw error; // Let retryWithReauth handle
        }
        if (errorMessage.includes('500')) {
          throw new Error(`Garmin server error: ${errorMessage}`);
        }

        throw new Error(`Failed to unschedule workout: ${errorMessage}`);
      }
    });
  }

  /**
   * Gets detailed information for a specific workout from Garmin Connect
   *
   * Retrieves the complete workout structure including all segments and steps.
   *
   * @param workoutId - The ID of the workout to retrieve
   * @returns Workout detail with segments and steps
   * @throws Error if workout not found or retrieval fails
   *
   * @example
   * ```typescript
   * const detail = await client.getWorkoutDetails(1354294595);
   * console.log(`Workout: ${detail.workoutName}`);
   * console.log(`Steps: ${detail.workoutSegments[0].workoutSteps.length}`);
   * ```
   */
  async getWorkoutDetails(workoutId: number): Promise<IWorkoutDetail> {
    return await this.retryWithReauth(async () => {
      const client = await this.initialize();

      try {
        // Use the built-in getWorkoutDetail method from garmin-connect library
        // Library expects workoutId as string
        const response = await (client as unknown as ExtendedGarminClient).getWorkoutDetail({
          workoutId: String(workoutId)
        });

        return response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes('404')) {
          throw new Error(`Workout not found: ${workoutId}`);
        }
        if (errorMessage.includes('400')) {
          throw new Error(`Bad request: Invalid workout ID. ${errorMessage}`);
        }
        if (errorMessage.includes('401') || errorMessage.includes('403')) {
          throw error; // Let retryWithReauth handle
        }
        if (errorMessage.includes('500')) {
          throw new Error(`Garmin server error: ${errorMessage}`);
        }

        throw new Error(`Failed to get workout details: ${errorMessage}`);
      }
    });
  }
}