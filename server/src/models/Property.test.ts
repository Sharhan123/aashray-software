import { describe, expect, it } from 'vitest';
import { Room } from './Room.js';
import { RoomAllocation } from './RoomAllocation.js';

describe('property hierarchy constraints', () => {
  it('enforces unique room numbers within a referenced property', () => {
    const propertyIndex = Room.schema.indexes().find(([, options]) => options.name === 'unique_room_number_per_property');
    expect(propertyIndex).toBeDefined();
    expect(propertyIndex?.[0]).toEqual({ propertyId: 1, roomNumber: 1 });
    expect(propertyIndex?.[1]).toMatchObject({ unique: true, partialFilterExpression: { propertyId: { $type: 'objectId' } } });
  });

  it('keeps one active resident allocation per bed', () => {
    const bedIndex = RoomAllocation.schema.indexes().find(([, options]) => options.name === 'one_active_resident_per_bed');
    expect(bedIndex).toBeDefined();
    expect(bedIndex?.[0]).toEqual({ roomId: 1, bedId: 1 });
    expect(bedIndex?.[1]).toMatchObject({ unique: true, partialFilterExpression: { active: true } });
  });
});
