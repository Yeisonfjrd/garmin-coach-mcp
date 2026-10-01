/**
 * @fileoverview Garmin Connect performance-metric tools
 *
 * Exposes endpoints the underlying garmin-connect library does not type: VO2max
 * history, per-lap activity splits, Garmin's own race predictions, overnight HRV
 * and aggregated training status. All of these are read-only.
 *
 * Tools provided:
 * - getVo2Max: VO2max series with one-decimal precision (the UI rounds to an integer)
 * - getActivityLaps: individual lap/rep splits for one activity
 * - getRacePredictions: predicted 5K / 10K / half / marathon times
 * - getHrv: overnight HRV summary and readings
 * - getTrainingStatus: aggregated training status
 * - getHrZones: the heart rate zones configured on the account, and their basis
 * - getActivityHrZones: time spent in each zone during one activity
 * - getLactateThreshold: threshold HR and pace history
 * - getTrainingReadiness: the device verdict on training hard today
 *
 * @category Tracking
 */

import { GarminClient } from '../../client/garmin-client.js';
import { ToolResult } from '../../types/garmin-types.js';
import { logger } from '../../utils/logger.js';

/** Seconds -> H:MM:SS / M:SS, for race predictions. */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Seconds per km -> M:SS/km. */
function formatPace(secondsPerKm: number): string {
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  // Guard the 59.5 -> "60" rounding case.
  if (s === 60) return `${m + 1}:00/km`;
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

/**
 * Garmin names the zone basis differently depending on the endpoint, so map the
 * variants onto one readable label. Unrecognised values pass through unchanged
 * rather than being guessed at.
 */
function zoneBasisLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const key = raw.toUpperCase();
  if (key.includes('LACTATE') || key.includes('THRESHOLD')) return 'lactate threshold HR';
  if (key.includes('RESERVE') || key === 'HRR') return 'heart rate reserve';
  if (key.includes('MAX')) return 'max HR';
  return raw;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function ok(payload: unknown): ToolResult {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

function fail(action: string, error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Failed to ${action}:`, error);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: message }, null, 2) }],
    isError: true,
  };
}

interface Vo2MaxDay {
  generic?: { calendarDate?: string; vo2MaxPreciseValue?: number; vo2MaxValue?: number } | null;
}

interface LapDTO {
  distance?: number;
  duration?: number;
  averageHR?: number;
  maxHR?: number;
  averageRunCadence?: number;
}

interface ZoneTimeEntry {
  zoneNumber?: number;
  secsInZone?: number;
  zoneLowBoundary?: number;
}

export class PerformanceTools {
  constructor(private garminClient: GarminClient) {}

  /**
   * VO2max series. Returns the precise (one-decimal) values plus first/last/min/max,
   * because the rounded integer Garmin shows can sit still for months while the
   * underlying value moves.
   */
  async getVo2Max(params: { startDate?: string; endDate?: string }): Promise<ToolResult> {
    try {
      const end = params.endDate ? new Date(params.endDate) : new Date();
      const start = params.startDate
        ? new Date(params.startDate)
        : new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);

      const raw = (await this.garminClient.getVo2Max(start, end)) as Vo2MaxDay[];
      const series = (Array.isArray(raw) ? raw : [])
        .filter((d) => d?.generic?.vo2MaxPreciseValue != null)
        .map((d) => ({
          date: d.generic!.calendarDate as string,
          precise: d.generic!.vo2MaxPreciseValue as number,
          displayed: d.generic!.vo2MaxValue as number,
        }));

      if (series.length === 0) {
        return ok({ success: true, count: 0, message: 'No VO2max data in this range' });
      }

      const values = series.map((p) => p.precise);
      const first = series[0];
      const last = series[series.length - 1];

      return ok({
        success: true,
        count: series.length,
        first,
        last,
        min: Math.min(...values),
        max: Math.max(...values),
        changeOverRange: Number((last.precise - first.precise).toFixed(1)),
        series,
      });
    } catch (error) {
      return fail('get VO2max', error);
    }
  }

  /**
   * Per-lap splits for one activity, with pace computed per lap. Short laps
   * (under 300 m) get no pace — they are transitions or recoveries where the
   * figure would be noise.
   */
  async getActivityLaps(params: { activityId: number }): Promise<ToolResult> {
    try {
      if (typeof params.activityId !== 'number') {
        throw new Error('activityId is required and must be a number');
      }

      const raw = (await this.garminClient.getActivityLaps(params.activityId)) as {
        lapDTOs?: LapDTO[];
      };
      const laps = (raw?.lapDTOs ?? []).map((l, i) => {
        const distance = Number(l.distance) || 0;
        const duration = Number(l.duration) || 0;
        const pace = distance > 300 && duration > 0 ? formatPace(duration / (distance / 1000)) : null;
        return {
          lap: i + 1,
          distanceM: Math.round(distance),
          durationSec: Number(duration.toFixed(1)),
          pace,
          avgHR: l.averageHR ?? null,
          maxHR: l.maxHR ?? null,
          avgCadence: l.averageRunCadence != null ? Math.round(l.averageRunCadence) : null,
        };
      });

      return ok({ success: true, activityId: params.activityId, lapCount: laps.length, laps });
    } catch (error) {
      return fail('get activity laps', error);
    }
  }

  /** Garmin's predicted race times, formatted alongside the raw seconds. */
  async getRacePredictions(): Promise<ToolResult> {
    try {
      const raw = (await this.garminClient.getRacePredictions()) as Record<string, number | string | null>;
      const pick = (k: string): number | null => {
        const v = raw?.[k];
        return typeof v === 'number' ? v : null;
      };

      const out: Record<string, unknown> = { success: true, calendarDate: raw?.calendarDate ?? null };
      for (const [key, label] of [
        ['time5K', '5K'],
        ['time10K', '10K'],
        ['timeHalfMarathon', 'halfMarathon'],
        ['timeMarathon', 'marathon'],
      ] as const) {
        const secs = pick(key);
        out[label] = secs == null ? null : { seconds: secs, formatted: formatDuration(secs) };
      }
      return ok(out);
    } catch (error) {
      return fail('get race predictions', error);
    }
  }

  /** Overnight HRV: summary (status, baseline, averages) without the full reading list. */
  async getHrv(params: { date?: string }): Promise<ToolResult> {
    try {
      const date = params.date ? new Date(params.date) : new Date();
      const raw = (await this.garminClient.getHrv(date)) as {
        hrvSummary?: Record<string, unknown>;
        hrvReadings?: unknown[];
      };
      return ok({
        success: true,
        summary: raw?.hrvSummary ?? null,
        readingCount: Array.isArray(raw?.hrvReadings) ? raw.hrvReadings.length : 0,
      });
    } catch (error) {
      return fail('get HRV', error);
    }
  }

  /** Aggregated training status for a date. */
  async getTrainingStatus(params: { date?: string }): Promise<ToolResult> {
    try {
      const date = params.date ? new Date(params.date) : new Date();
      const raw = await this.garminClient.getTrainingStatus(date);
      return ok({ success: true, trainingStatus: raw });
    } catch (error) {
      return fail('get training status', error);
    }
  }

  /**
   * The heart rate zones configured on the account. What matters here is the
   * basis, not the percentages: a 60-70% band means different bpm under max HR,
   * heart rate reserve and lactate threshold, so a plan can be read as
   * "too hard" purely because the basis is wrong.
   *
   * Field names on this endpoint vary between accounts and firmware, so
   * recognised fields are summarised and the untouched payload is returned
   * alongside rather than discarded.
   */
  async getHrZones(): Promise<ToolResult> {
    try {
      const raw = await this.garminClient.getHrZones();
      const entries = (Array.isArray(raw) ? raw : [raw]) as Record<string, unknown>[];

      const zones = entries.filter(Boolean).map((z) => {
        const floors = [1, 2, 3, 4, 5]
          .map((n) => numOrNull(z[`zone${n}Floor`]))
          .filter((v): v is number => v !== null);
        return {
          sport: strOrNull(z.sport),
          basis: zoneBasisLabel(
            z.zoneCalculationMethod ?? z.heartRateZoneCalculationType ?? z.calculationMethod
          ),
          maxHeartRateUsed: numOrNull(z.maxHeartRateUsed),
          restingHeartRateUsed: numOrNull(z.restingHeartRateUsed),
          lactateThresholdHeartRate: numOrNull(z.lactateThresholdHeartRate),
          zoneFloors: floors.length > 0 ? floors : null,
        };
      });

      return ok({ success: true, zoneConfigCount: zones.length, zones, raw });
    } catch (error) {
      return fail('get heart rate zones', error);
    }
  }

  /**
   * Time spent in each heart rate zone during one activity, with each zone's
   * share of the session. Average HR hides distribution: an even aerobic run
   * and one that swung between too hard and too soft can average the same.
   */
  async getActivityHrZones(params: { activityId: number }): Promise<ToolResult> {
    try {
      if (typeof params.activityId !== 'number') {
        throw new Error('activityId is required and must be a number');
      }

      const raw = (await this.garminClient.getActivityHrZones(params.activityId)) as ZoneTimeEntry[];
      const entries = Array.isArray(raw) ? raw : [];
      const total = entries.reduce((sum, e) => sum + (Number(e?.secsInZone) || 0), 0);

      const zones = entries.map((e) => {
        const secs = Number(e?.secsInZone) || 0;
        return {
          zone: numOrNull(e?.zoneNumber),
          fromBpm: numOrNull(e?.zoneLowBoundary),
          seconds: Math.round(secs),
          time: formatDuration(secs),
          percent: total > 0 ? Number(((secs / total) * 100).toFixed(1)) : null,
        };
      });

      return ok({
        success: true,
        activityId: params.activityId,
        totalSeconds: Math.round(total),
        totalTime: formatDuration(total),
        zones,
      });
    } catch (error) {
      return fail('get activity heart rate zones', error);
    }
  }

  /**
   * Lactate threshold history. This is the anchor HR zones should rest on: the
   * watch re-detects it as fitness changes, whereas max HR is fixed, so zones
   * tied to threshold stay correct without being re-entered. Defaults to the
   * last 180 days, since detections are sparse.
   */
  async getLactateThreshold(params: { startDate?: string; endDate?: string }): Promise<ToolResult> {
    try {
      const end = params.endDate ? new Date(params.endDate) : new Date();
      const start = params.startDate
        ? new Date(params.startDate)
        : new Date(end.getTime() - 180 * 24 * 60 * 60 * 1000);

      const raw = await this.garminClient.getLactateThreshold(start, end);
      const entries = Array.isArray(raw) ? raw : [];

      return ok({
        success: true,
        from: start.toISOString().split('T')[0],
        to: end.toISOString().split('T')[0],
        count: entries.length,
        raw,
      });
    } catch (error) {
      return fail('get lactate threshold', error);
    }
  }

  /**
   * Training readiness for a date: the score the device derives from sleep,
   * recovery time, HRV and recent load. Useful as a go / hold check before a
   * hard session.
   */
  async getTrainingReadiness(params: { date?: string }): Promise<ToolResult> {
    try {
      const date = params.date ? new Date(params.date) : new Date();
      const raw = await this.garminClient.getTrainingReadiness(date);
      const first = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | undefined;
      const r = first ?? {};

      return ok({
        success: true,
        date: strOrNull(r.calendarDate),
        score: numOrNull(r.score),
        level: strOrNull(r.level),
        feedback: strOrNull(r.feedbackShort),
        sleepScore: numOrNull(r.sleepScore),
        hrvFactorPercent: numOrNull(r.hrvFactorPercent),
        recoveryTime: numOrNull(r.recoveryTime),
        raw,
      });
    } catch (error) {
      return fail('get training readiness', error);
    }
  }
}
