import type { Request } from 'express';
import { Types } from 'mongoose';
import { Room } from '../models/Room.js';
import { RoomAllocation } from '../models/RoomAllocation.js';

export type ScopedIds = { forbidden: boolean; ids: Types.ObjectId[] | null };

export async function scopedRoomIds(req: Request, requestedPropertyId?: string): Promise<ScopedIds> {
  if (req.user?.role === 'SUPER_ADMIN') {
    return { forbidden: false, ids: requestedPropertyId ? await Room.distinct('_id', { propertyId: requestedPropertyId }) : null };
  }
  const assigned = req.user?.propertyIds ?? [];
  if (requestedPropertyId && !assigned.includes(requestedPropertyId)) return { forbidden: true, ids: [] };
  const propertyFilter = requestedPropertyId ? requestedPropertyId : { $in: assigned };
  return { forbidden: false, ids: await Room.distinct('_id', { propertyId: propertyFilter }) };
}

export async function scopedResidentIds(req: Request, requestedPropertyId?: string): Promise<ScopedIds> {
  const rooms = await scopedRoomIds(req, requestedPropertyId);
  if (rooms.forbidden) return rooms;
  if (rooms.ids === null) return { forbidden: false, ids: null };
  if (!rooms.ids.length) return { forbidden: false, ids: [] };
  // Preserve read access to historical residents who checked out of an assigned property.
  return { forbidden: false, ids: await RoomAllocation.distinct('residentId', { roomId: { $in: rooms.ids } }) };
}

export async function residentIsInScope(req: Request, residentId: string): Promise<boolean> {
  const scope = await scopedResidentIds(req);
  if (scope.forbidden) return false;
  if (scope.ids === null) return true;
  return scope.ids.some((id) => String(id) === residentId);
}
