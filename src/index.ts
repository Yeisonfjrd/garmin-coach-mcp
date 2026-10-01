#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { GarminClient } from './client/garmin-client.js';
import { getPackageVersion } from './utils/version.js';
import { SleepTools } from './tools/basic/sleep-tools.js';
import { OverviewTools } from './tools/basic/overview-tools.js';
import { HealthTools } from './tools/basic/health-tools.js';
import { ActivityTools } from './tools/basic/activity-tools.js';
import { ActivityVolumeTools } from './tools/aggregation/activity-volume-tools.js';
import { TrainingStressTools } from './tools/tracking/training-stress-tools.js';
import { WorkoutTools } from './tools/tracking/workout-tools.js';

class GarminConnectMCPServer {
  private server: Server;
  private garminClient: GarminClient;
  private sleepTools: SleepTools;
  private overviewTools: OverviewTools;
  private healthTools: HealthTools;
  private activityTools: ActivityTools;
  private activityVolumeTools: ActivityVolumeTools;
  private trainingStressTools: TrainingStressTools;
  private workoutTools: WorkoutTools;

  constructor() {
    const version = getPackageVersion();

    this.server = new Server(
      {
        name: "garmin-connect-mcp",
        version: version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize clients and tools
    console.error(`[Garmin MCP] Server v${version} starting...`);

    const username = process.env.GARMIN_USERNAME;
    const password = process.env.GARMIN_PASSWORD;

    if (!username || !password) {
      console.error('[Garmin MCP] ERROR: Missing credentials (GARMIN_USERNAME and GARMIN_PASSWORD required)');
      throw new Error("GARMIN_USERNAME and GARMIN_PASSWORD environment variables are required");
    }

    this.garminClient = new GarminClient({ username, password });
    this.sleepTools = new SleepTools(this.garminClient);
    this.overviewTools = new OverviewTools(this.garminClient);
    this.healthTools = new HealthTools(this.garminClient);
    this.activityTools = new ActivityTools(this.garminClient);
    this.activityVolumeTools = new ActivityVolumeTools(this.garminClient);
    this.trainingStressTools = new TrainingStressTools(this.garminClient);
    this.workoutTools = new WorkoutTools(this.garminClient);

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "get_daily_overview",
            description: "Get a comprehensive daily overview including sleep, activities, and health metrics",
            inputSchema: {
              type: "object",
              properties: {
                date: {
                  type: "string",
                  description: "Date in YYYY-MM-DD format (defaults to today)",
                  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                },
              },
            },
          },
          {
            name: "get_sleep_data",
            description: "Get detailed sleep data for a specific date from Garmin Connect",
            inputSchema: {
              type: "object",
              properties: {
                date: {
                  type: "string",
                  description: "Date in YYYY-MM-DD format (defaults to today)",
                  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                },
                includeSummaryOnly: {
                  type: "boolean",
                  description: "Return only summary data instead of detailed breakdown (default: false)",
                },
                summary: {
                  type: "boolean",
                  description: "[DEPRECATED: Use includeSummaryOnly] Return only summary data instead of detailed breakdown (default: false)",
                },
                fields: {
                  type: "array",
                  items: { type: "string" },
                  description: "Specific fields to include (e.g., ['dailySleepDTO', 'wellnessEpochSummaryDTO'])",
                },
              },
            },
          },
          {
            name: "get_health_metrics",
            description: "Get aggregated health metrics for a specific date",
            inputSchema: {
              type: "object",
              properties: {
                date: {
                  type: "string",
                  description: "Date in YYYY-MM-DD format (defaults to today)",
                  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                },
                metrics: {
                  type: "array",
                  items: {
                    type: "string",
                    enum: ["steps", "weight", "heart_rate", "stress", "body_battery", "hydration"]
                  },
                  description: "Specific metrics to include (defaults to all)",
                },
              },
            },
          },
          {
            name: "get_heart_rate_data",
            description: "Get detailed heart rate data for a specific date",
            inputSchema: {
              type: "object",
              properties: {
                date: {
                  type: "string",
                  description: "Date in YYYY-MM-DD format (defaults to today)",
                  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                },
                includeSummaryOnly: {
                  type: "boolean",
                  description: "Return only summary data instead of detailed breakdown (default: false)",
                },
                summary: {
                  type: "boolean",
                  description: "[DEPRECATED: Use includeSummaryOnly] Return only summary data instead of detailed breakdown (default: false)",
                },
              },
            },
          },
          {
            name: "get_weight_data",
            description: "Get weight and body composition data for a specific date",
            inputSchema: {
              type: "object",
              properties: {
                date: {
                  type: "string",
                  description: "Date in YYYY-MM-DD format (defaults to today)",
                  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                },
              },
            },
          },
          {
            name: "get_hydration_data",
            description: "Get daily hydration (water intake) data for a specific date",
            inputSchema: {
              type: "object",
              properties: {
                date: {
                  type: "string",
                  description: "Date in YYYY-MM-DD format (defaults to today)",
                  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                },
              },
            },
          },
          {
            name: "get_activities",
            description: "Get list of recent activities with optional filtering and pagination",
            inputSchema: {
              type: "object",
              properties: {
                start: {
                  type: "number",
                  description: "Starting index for pagination (default: 0)",
                  minimum: 0,
                },
                limit: {
                  type: "number",
                  description: "Maximum number of activities to return (max 50, default: 20)",
                  minimum: 1,
                  maximum: 50,
                },
                includeSummaryOnly: {
                  type: "boolean",
                  description: "Return compact summary format instead of detailed data (default: false)",
                },
                summary: {
                  type: "boolean",
                  description: "[DEPRECATED: Use includeSummaryOnly] Return compact summary format instead of detailed data (default: false)",
                },
              },
            },
          },
          {
            name: "get_activity_details",
            description: "Get detailed information for a specific activity",
            inputSchema: {
              type: "object",
              properties: {
                activityId: {
                  type: "number",
                  description: "The unique ID of the activity to retrieve",
                },
              },
              required: ["activityId"],
            },
          },
          {
            name: "get_weekly_volume",
            description: "Get weekly training volume aggregation for a specific week",
            inputSchema: {
              type: "object",
              properties: {
                year: {
                  type: "number",
                  description: "Year (defaults to current year)",
                  minimum: 2000,
                  maximum: 2100,
                },
                week: {
                  type: "number",
                  description: "ISO week number (defaults to current week)",
                  minimum: 1,
                  maximum: 53,
                },
                includeActivityBreakdown: {
                  type: "boolean",
                  description: "Include breakdown by activity type (default: true)",
                },
                includeTrends: {
                  type: "boolean",
                  description: "Include comparison with previous week (default: false)",
                },
                maxActivities: {
                  type: "number",
                  description: "Maximum number of activities to process (default: 1000)",
                  minimum: 1,
                  maximum: 2000,
                },
                activityTypes: {
                  type: "array",
                  items: { type: "string" },
                  description: "Filter by specific activity types (e.g., ['running', 'cycling'])",
                },
              },
            },
          },
          {
            name: "get_training_stress_balance",
            description: "Get training stress balance (TSB), chronic training load (CTL), and acute training load (ATL) for a specific date. TSB = CTL - ATL indicates form/freshness. Uses HR-based TSS calculation when available, falls back to duration estimates.",
            inputSchema: {
              type: "object",
              properties: {
                date: {
                  type: "string",
                  description: "Target date in YYYY-MM-DD format (defaults to today)",
                  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                },
                days: {
                  type: "number",
                  description: "Number of days of historical data to analyze (default: 90, min: 7, max: 365)",
                  minimum: 7,
                  maximum: 365,
                },
                includeTimeSeries: {
                  type: "boolean",
                  description: "Include daily time series data showing TSS, CTL, ATL, TSB progression (default: true)",
                },
                includeSummaryOnly: {
                  type: "boolean",
                  description: "Return only summary data without time-series (default: false)",
                },
                summary: {
                  type: "boolean",
                  description: "[DEPRECATED: Use includeSummaryOnly] Return only summary data without time-series (default: false)",
                },
                restingHR: {
                  type: "number",
                  description: "Custom resting heart rate for TSS calculation (default: 50 bpm)",
                  minimum: 30,
                  maximum: 100,
                },
                maxHR: {
                  type: "number",
                  description: "Custom maximum heart rate for TSS calculation (default: 185 bpm)",
                  minimum: 100,
                  maximum: 250,
                },
                thresholdHR: {
                  type: "number",
                  description: "Custom threshold heart rate for TSS calculation (default: 90% of maxHR)",
                  minimum: 100,
                  maximum: 250,
                },
              },
            },
          },
          {
            name: "create_running_workout",
            description: "Create a structured running workout in Garmin Connect. Build workouts with warmup, intervals, recovery, cooldown, and repeat blocks. Supports time-based, distance-based, and lap-button durations. Supports pace, HR zone, and no-target intensity controls.",
            inputSchema: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Workout name (required)",
                  minLength: 1,
                },
                description: {
                  type: "string",
                  description: "Optional workout description",
                },
                steps: {
                  type: "array",
                  description: "Array of workout steps (required, at least one step)",
                  minItems: 1,
                  items: {
                    type: "object",
                    properties: {
                      type: {
                        type: "string",
                        description: "Step type",
                        enum: ["warmup", "interval", "recovery", "cooldown", "rest", "repeat"],
                      },
                      duration: {
                        type: "object",
                        description: "Duration of the step (not required for repeat blocks)",
                        properties: {
                          type: {
                            type: "string",
                            description: "Duration type",
                            enum: ["time", "distance", "lap_button"],
                          },
                          value: {
                            type: "number",
                            description: "Duration value (seconds for time, meters for distance). Not required for lap_button.",
                          },
                          unit: {
                            type: "string",
                            description: "Distance unit (required for distance type)",
                            enum: ["m", "km", "mile"],
                          },
                        },
                        required: ["type"],
                      },
                      target: {
                        type: "object",
                        description: "Intensity target (optional)",
                        properties: {
                          type: {
                            type: "string",
                            description: "Target type",
                            enum: ["pace", "hr_zone", "no_target"],
                          },
                          minValue: {
                            type: "number",
                            description: "Minimum pace in min/km (required for pace target)",
                          },
                          maxValue: {
                            type: "number",
                            description: "Maximum pace in min/km (required for pace target)",
                          },
                          zone: {
                            type: "number",
                            description: "HR zone number 1-5 (required for hr_zone target)",
                          },
                        },
                        required: ["type"],
                      },
                      numberOfRepetitions: {
                        type: "number",
                        description: "Number of repetitions (required for repeat type)",
                        minimum: 1,
                      },
                      childSteps: {
                        type: "array",
                        description: "Child steps to repeat (required for repeat type)",
                        items: {
                          type: "object",
                        },
                      },
                    },
                    required: ["type"],
                  },
                },
              },
              required: ["name", "steps"],
            },
          },
          {
            name: "schedule_workout",
            description: "Schedule a workout to a specific date in Garmin Connect calendar. Use the workoutId from create_running_workout response.",
            inputSchema: {
              type: "object",
              properties: {
                workoutId: {
                  type: "number",
                  description: "ID of the workout to schedule (from create_running_workout response)",
                },
                date: {
                  type: "string",
                  description: "Date to schedule workout in YYYY-MM-DD format (e.g., '2025-10-13')",
                  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                },
              },
              required: ["workoutId", "date"],
            },
          },
          {
            name: "get_scheduled_workouts",
            description: "Get scheduled workouts from Garmin Connect calendar for a date range. Defaults to the current week (Monday to Sunday) if dates not provided. Returns list of scheduled workouts with details including scheduleId for unscheduling.",
            inputSchema: {
              type: "object",
              properties: {
                startDate: {
                  type: "string",
                  description: "Start date in YYYY-MM-DD format (optional, defaults to current week Monday)",
                  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                },
                endDate: {
                  type: "string",
                  description: "End date in YYYY-MM-DD format (optional, defaults to current week Sunday)",
                  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                },
              },
            },
          },
          {
            name: "delete_workout",
            description: "Permanently delete a workout from Garmin Connect library. This also removes the workout from all calendar dates where it was scheduled. This operation cannot be undone.",
            inputSchema: {
              type: "object",
              properties: {
                workoutId: {
                  type: "number",
                  description: "The workout ID to delete (from create_running_workout or get_scheduled_workouts response)",
                },
              },
              required: ["workoutId"],
            },
          },
          {
            name: "unschedule_workout",
            description: "Remove a workout from Garmin Connect calendar. The workout remains in your library for future scheduling. Use the scheduleId from get_scheduled_workouts response.",
            inputSchema: {
              type: "object",
              properties: {
                scheduleId: {
                  type: "number",
                  description: "The schedule ID (from get_scheduled_workouts 'scheduleId' field)",
                },
              },
              required: ["scheduleId"],
            },
          },
          {
            name: "get_workout_details",
            description: "Get detailed information for a specific workout including steps, targets, and duration. Returns the complete workout structure with formatted step information.",
            inputSchema: {
              type: "object",
              properties: {
                workoutId: {
                  type: "number",
                  description: "The workout ID to retrieve details for (from create_running_workout or get_scheduled_workouts response)",
                },
              },
              required: ["workoutId"],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        let result;
        switch (request.params.name) {
          case "get_daily_overview":
            result = await this.overviewTools.getDailyOverview(request.params.arguments || {});
            break;
          case "get_sleep_data":
            result = await this.sleepTools.getSleepData(request.params.arguments || {});
            break;
          case "get_health_metrics":
            result = await this.healthTools.getHealthMetrics(request.params.arguments || {});
            break;
          case "get_heart_rate_data":
            result = await this.healthTools.getHeartRateData(request.params.arguments || {});
            break;
          case "get_weight_data":
            result = await this.healthTools.getWeightData(request.params.arguments || {});
            break;
          case "get_hydration_data":
            result = await this.healthTools.getHydrationData(request.params.arguments || {});
            break;
          case "get_activities":
            result = await this.activityTools.getActivities(request.params.arguments || {});
            break;
          case "get_activity_details":
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            result = await this.activityTools.getActivityDetails(request.params.arguments as any || {});
            break;
          case "get_weekly_volume":
            result = await this.activityVolumeTools.getWeeklyVolume(request.params.arguments || {});
            break;
          case "get_training_stress_balance":
            result = await this.trainingStressTools.getTrainingStressBalance(request.params.arguments || {});
            break;
          case "create_running_workout":
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            result = await this.workoutTools.createRunningWorkout(request.params.arguments as any || {});
            break;
          case "schedule_workout":
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            result = await this.workoutTools.scheduleWorkout(request.params.arguments as any || {});
            break;
          case "get_scheduled_workouts":
            result = await this.workoutTools.getScheduledWorkouts(request.params.arguments || {});
            break;
          case "delete_workout":
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            result = await this.workoutTools.deleteWorkout(request.params.arguments as any || {});
            break;
          case "unschedule_workout":
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            result = await this.workoutTools.unscheduleWorkout(request.params.arguments as any || {});
            break;
          case "get_workout_details":
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            result = await this.workoutTools.getWorkoutDetails(request.params.arguments as any || {});
            break;
          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }

        return result;
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const server = new GarminConnectMCPServer();
server.run().catch(() => {
  // Fatal error - exit process
  // Don't use console.* as it pollutes stdio MCP protocol
  process.exit(1);
});