/**
 * Unit tests for the optional `sport` parameter on createRunningWorkout.
 *
 * The tool previously hardcoded 'running' when constructing the WorkoutBuilder,
 * even though SPORT_TYPE_MAPPING and WorkoutBuilder already supported other
 * sports. These tests lock in the new behaviour:
 * - omitting `sport` still produces a running workout (backward compatible)
 * - passing a supported sport is forwarded to the built payload
 * - an unsupported sport is rejected with a helpful message
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkoutTools } from '../../src/tools/tracking/workout-tools.js';
import { GarminClient } from '../../src/client/garmin-client.js';
import type { WorkoutResponse } from '../../src/types/workout.js';

vi.mock('../../src/client/garmin-client.js');

describe('WorkoutTools - sport parameter', () => {
  let workoutTools: WorkoutTools;
  let mockGarminClient: GarminClient;

  const mockResponse: WorkoutResponse = {
    workoutId: 999,
    ownerId: 456,
    workoutName: 'Test Workout',
    description: null,
    updatedDate: '2026-08-25T10:00:00Z',
    createdDate: '2026-08-25T10:00:00Z',
    sportType: { sportTypeId: 1, sportTypeKey: 'running', displayOrder: 1 },
  };

  const baseSteps = [
    {
      type: 'interval',
      duration: { type: 'time', value: 1800 },
      target: { type: 'no_target' },
    },
  ];

  beforeEach(() => {
    mockGarminClient = {
      createWorkout: vi.fn(),
      scheduleWorkout: vi.fn(),
      getScheduledWorkouts: vi.fn(),
      deleteWorkout: vi.fn(),
      unscheduleWorkout: vi.fn(),
      getWorkoutDetails: vi.fn(),
    } as unknown as GarminClient;

    workoutTools = new WorkoutTools(mockGarminClient);
    vi.mocked(mockGarminClient.createWorkout).mockResolvedValue(mockResponse);
  });

  it('defaults to running when sport is omitted', async () => {
    const result = await workoutTools.createRunningWorkout({
      name: 'Easy Run',
      steps: baseSteps,
    } as never);

    expect(result.isError).toBeUndefined();

    const payload = vi.mocked(mockGarminClient.createWorkout).mock.calls[0][0] as never as {
      sportType: { sportTypeKey: string; sportTypeId: number };
    };
    expect(payload.sportType.sportTypeKey).toBe('running');
    expect(payload.sportType.sportTypeId).toBe(1);
  });

  it('builds a cycling workout when sport is "cycling"', async () => {
    const result = await workoutTools.createRunningWorkout({
      name: 'Z2 Bike',
      sport: 'cycling',
      steps: baseSteps,
    } as never);

    expect(result.isError).toBeUndefined();

    const payload = vi.mocked(mockGarminClient.createWorkout).mock.calls[0][0] as never as {
      sportType: { sportTypeKey: string; sportTypeId: number };
    };
    expect(payload.sportType.sportTypeKey).toBe('cycling');
    expect(payload.sportType.sportTypeId).toBe(2);
  });

  it('propagates the sport to the workout segment, not just the header', async () => {
    await workoutTools.createRunningWorkout({
      name: 'Z2 Bike',
      sport: 'cycling',
      steps: baseSteps,
    } as never);

    const payload = vi.mocked(mockGarminClient.createWorkout).mock.calls[0][0] as never as {
      workoutSegments: Array<{ sportType: { sportTypeKey: string } }>;
    };
    expect(payload.workoutSegments[0].sportType.sportTypeKey).toBe('cycling');
  });

  it.each(['swimming', 'other'])('accepts supported sport "%s"', async (sport) => {
    const result = await workoutTools.createRunningWorkout({
      name: `Test ${sport}`,
      sport,
      steps: baseSteps,
    } as never);

    expect(result.isError).toBeUndefined();
  });

  it('rejects an unsupported sport with a helpful message', async () => {
    const result = await workoutTools.createRunningWorkout({
      name: 'Bench Press',
      sport: 'strength_training',
      steps: baseSteps,
    } as never);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid sport');
    expect(result.content[0].text).toContain('cycling');
    expect(mockGarminClient.createWorkout).not.toHaveBeenCalled();
  });

  it('rejects a non-string sport', async () => {
    const result = await workoutTools.createRunningWorkout({
      name: 'Broken',
      sport: 42,
      steps: baseSteps,
    } as never);

    expect(result.isError).toBe(true);
    expect(mockGarminClient.createWorkout).not.toHaveBeenCalled();
  });
});
