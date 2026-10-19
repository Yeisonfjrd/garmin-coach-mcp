import { describe, it, expect } from 'vitest';
import { WRITE_TOOLS, isReadOnlyMode, annotationsFor, applyToolAccess } from '../../src/utils/tool-access.js';

const tools = [
  { name: 'get_activities', description: 'reads', inputSchema: { type: 'object' } },
  { name: 'create_running_workout', description: 'writes', inputSchema: { type: 'object' } },
  { name: 'schedule_workout', description: 'writes', inputSchema: { type: 'object' } },
  { name: 'unschedule_workout', description: 'writes', inputSchema: { type: 'object' } },
  { name: 'delete_workout', description: 'writes', inputSchema: { type: 'object' } },
];

describe('tool access', () => {
  it('lists the four tools that change the Garmin account', () => {
    expect([...WRITE_TOOLS].sort()).toEqual(['create_running_workout', 'delete_workout', 'schedule_workout', 'unschedule_workout']);
  });

  it('reads GARMIN_READ_ONLY as a boolean flag', () => {
    for (const v of ['1', 'true', 'TRUE', 'yes']) expect(isReadOnlyMode({ GARMIN_READ_ONLY: v })).toBe(true);
    for (const v of [undefined, '', '0', 'false', 'no']) expect(isReadOnlyMode({ GARMIN_READ_ONLY: v })).toBe(false);
  });

  it('marks read tools as read-only and write tools as not read-only', () => {
    expect(annotationsFor('get_activities')).toEqual({ readOnlyHint: true, openWorldHint: true });
    expect(annotationsFor('create_running_workout')).toEqual({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true });
  });

  it('marks deleting and unscheduling as destructive', () => {
    expect(annotationsFor('delete_workout').destructiveHint).toBe(true);
    expect(annotationsFor('unschedule_workout').destructiveHint).toBe(true);
    expect(annotationsFor('schedule_workout').destructiveHint).toBe(false);
  });

  it('adds annotations to every tool and keeps them all by default', () => {
    const out = applyToolAccess(tools, {});
    expect(out.map((t) => t.name)).toEqual(tools.map((t) => t.name));
    expect(out.every((t) => t.annotations)).toBe(true);
    expect(out[0].description).toBe('reads');
  });

  it('hides the write tools in read-only mode', () => {
    const out = applyToolAccess(tools, { GARMIN_READ_ONLY: 'true' });
    expect(out.map((t) => t.name)).toEqual(['get_activities']);
  });
});
