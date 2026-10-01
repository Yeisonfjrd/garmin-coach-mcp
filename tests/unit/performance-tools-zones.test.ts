/**
 * Unit tests for the zone, threshold and readiness tools on PerformanceTools.
 *
 * These endpoints are not typed by the underlying library and their field names
 * vary between accounts and firmware versions, so the tools are deliberately
 * defensive. The tests lock in that behaviour:
 * - zone basis labels normalise across Garmin's several spellings
 * - a basis Garmin reports but we do not recognise passes through unchanged
 *   rather than being silently mislabelled
 * - per-zone shares are computed from the session total, not assumed
 * - a missing or malformed payload degrades to nulls instead of throwing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerformanceTools } from '../../src/tools/tracking/performance-tools.js';
import { GarminClient } from '../../src/client/garmin-client.js';

vi.mock('../../src/client/garmin-client.js');

/** The tools return their payload as JSON in content[0].text. */
function parse(result: { content: { text: string }[] }): Record<string, unknown> {
  return JSON.parse(result.content[0].text);
}

describe('PerformanceTools - zones, threshold and readiness', () => {
  let tools: PerformanceTools;
  let client: GarminClient;

  beforeEach(() => {
    client = {
      getHrZones: vi.fn(),
      getActivityHrZones: vi.fn(),
      getLactateThreshold: vi.fn(),
      getTrainingReadiness: vi.fn(),
    } as unknown as GarminClient;
    tools = new PerformanceTools(client);
  });

  describe('getHrZones', () => {
    it('normalises the lactate threshold basis and collects zone floors', async () => {
      vi.mocked(client.getHrZones).mockResolvedValue([
        {
          sport: 'RUNNING',
          zoneCalculationMethod: 'LACTATE_THRESHOLD_HEART_RATE',
          lactateThresholdHeartRate: 175,
          zone1Floor: 110,
          zone2Floor: 149,
          zone3Floor: 157,
          zone4Floor: 166,
          zone5Floor: 175,
        },
      ]);

      const out = parse(await tools.getHrZones());
      expect(out.success).toBe(true);
      expect(out.zoneConfigCount).toBe(1);

      const zones = out.zones as Record<string, unknown>[];
      expect(zones[0].sport).toBe('RUNNING');
      expect(zones[0].basis).toBe('lactate threshold HR');
      expect(zones[0].lactateThresholdHeartRate).toBe(175);
      expect(zones[0].zoneFloors).toEqual([110, 149, 157, 166, 175]);
    });

    it('recognises the heart rate reserve and max HR bases', async () => {
      vi.mocked(client.getHrZones).mockResolvedValue([
        { sport: 'RUNNING', zoneCalculationMethod: 'HR_RESERVE' },
        { sport: 'CYCLING', heartRateZoneCalculationType: 'PERCENT_MAX_HR' },
      ]);

      const zones = parse(await tools.getHrZones()).zones as Record<string, unknown>[];
      expect(zones[0].basis).toBe('heart rate reserve');
      expect(zones[1].basis).toBe('max HR');
    });

    it('passes an unrecognised basis through rather than guessing', async () => {
      vi.mocked(client.getHrZones).mockResolvedValue([
        { sport: 'RUNNING', zoneCalculationMethod: 'SOMETHING_NEW' },
      ]);

      const zones = parse(await tools.getHrZones()).zones as Record<string, unknown>[];
      expect(zones[0].basis).toBe('SOMETHING_NEW');
    });

    it('returns nulls, not errors, when the basis and floors are absent', async () => {
      vi.mocked(client.getHrZones).mockResolvedValue([{ sport: 'RUNNING' }]);

      const zones = parse(await tools.getHrZones()).zones as Record<string, unknown>[];
      expect(zones[0].basis).toBeNull();
      expect(zones[0].zoneFloors).toBeNull();
      expect(zones[0].maxHeartRateUsed).toBeNull();
    });

    it('keeps the untouched payload alongside the summary', async () => {
      const raw = [{ sport: 'RUNNING', someUndocumentedField: 42 }];
      vi.mocked(client.getHrZones).mockResolvedValue(raw);

      expect(parse(await tools.getHrZones()).raw).toEqual(raw);
    });

    it('reports failure instead of throwing when the endpoint errors', async () => {
      vi.mocked(client.getHrZones).mockRejectedValue(new Error('404 Not Found'));

      const result = await tools.getHrZones();
      expect(result.isError).toBe(true);
      expect(parse(result).success).toBe(false);
      expect(parse(result).error).toContain('404');
    });
  });

  describe('getActivityHrZones', () => {
    it('computes each zone share from the session total', async () => {
      vi.mocked(client.getActivityHrZones).mockResolvedValue([
        { zoneNumber: 1, secsInZone: 300, zoneLowBoundary: 110 },
        { zoneNumber: 2, secsInZone: 2700, zoneLowBoundary: 149 },
        { zoneNumber: 3, secsInZone: 600, zoneLowBoundary: 157 },
      ]);

      const out = parse(await tools.getActivityHrZones({ activityId: 123 }));
      expect(out.totalSeconds).toBe(3600);
      expect(out.totalTime).toBe('1:00:00');

      const zones = out.zones as Record<string, unknown>[];
      expect(zones[1].zone).toBe(2);
      expect(zones[1].fromBpm).toBe(149);
      expect(zones[1].time).toBe('45:00');
      expect(zones[1].percent).toBe(75);
      expect(zones[0].percent).toBeCloseTo(8.3, 1);
    });

    it('avoids dividing by zero when no time was recorded', async () => {
      vi.mocked(client.getActivityHrZones).mockResolvedValue([
        { zoneNumber: 1, secsInZone: 0, zoneLowBoundary: 110 },
      ]);

      const out = parse(await tools.getActivityHrZones({ activityId: 123 }));
      expect(out.totalSeconds).toBe(0);
      expect((out.zones as Record<string, unknown>[])[0].percent).toBeNull();
    });

    it('requires a numeric activityId', async () => {
      const result = await tools.getActivityHrZones({ activityId: '123' as unknown as number });
      expect(result.isError).toBe(true);
      expect(parse(result).error).toContain('activityId');
      expect(client.getActivityHrZones).not.toHaveBeenCalled();
    });
  });

  describe('getLactateThreshold', () => {
    it('defaults to a 180 day window ending today', async () => {
      vi.mocked(client.getLactateThreshold).mockResolvedValue([]);

      await tools.getLactateThreshold({});

      const [start, end] = vi.mocked(client.getLactateThreshold).mock.calls[0];
      const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
      expect(spanDays).toBe(180);
    });

    it('reports the count and the range it queried', async () => {
      vi.mocked(client.getLactateThreshold).mockResolvedValue([{ calendarDate: '2026-09-16' }]);

      const out = parse(
        await tools.getLactateThreshold({ startDate: '2026-06-01', endDate: '2026-10-01' })
      );
      expect(out.count).toBe(1);
      expect(out.from).toBe('2026-06-01');
      expect(out.to).toBe('2026-10-01');
    });
  });

  describe('getTrainingReadiness', () => {
    it('reads the first entry when the endpoint returns an array', async () => {
      vi.mocked(client.getTrainingReadiness).mockResolvedValue([
        {
          calendarDate: '2026-10-01',
          score: 72,
          level: 'READY',
          feedbackShort: 'READY_3',
          sleepScore: 80,
          hrvFactorPercent: 95,
          recoveryTime: 6,
        },
      ]);

      const out = parse(await tools.getTrainingReadiness({}));
      expect(out.score).toBe(72);
      expect(out.level).toBe('READY');
      expect(out.feedback).toBe('READY_3');
      expect(out.sleepScore).toBe(80);
    });

    it('accepts a bare object as well as an array', async () => {
      vi.mocked(client.getTrainingReadiness).mockResolvedValue({
        calendarDate: '2026-10-01',
        score: 50,
      });

      expect(parse(await tools.getTrainingReadiness({})).score).toBe(50);
    });

    it('degrades to nulls when the payload is empty', async () => {
      vi.mocked(client.getTrainingReadiness).mockResolvedValue([]);

      const out = parse(await tools.getTrainingReadiness({}));
      expect(out.success).toBe(true);
      expect(out.score).toBeNull();
      expect(out.level).toBeNull();
    });
  });
});
