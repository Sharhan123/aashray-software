import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Resident } from '../models/Resident.js';
import { Payment } from '../models/Payment.js';
import { Property } from '../models/Property.js';
import { scopedResidentIds } from '../middleware/propertyAccess.js';

const router = Router();
router.use(requireAuth);

const intentWords: Record<string, string[]> = {
  resident: ['resident', 'residents', 'tenant', 'tenants', 'user', 'people'],
  payment: ['payment', 'payments', 'receipt', 'receipts', 'recipt', 'reciept', 'paid', 'transaction', 'transactions', 'refund'],
  property: ['property', 'properties', 'building', 'buildings', 'home', 'homes'],
};
const fillerWords = new Set(['find', 'show', 'open', 'get', 'search', 'for', 'me', 'please', 'a', 'the', 'my']);
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/quick-search', asyncHandler(async (req, res) => {
  const raw = String(req.query.q ?? '').trim().slice(0, 120);
  if (raw.length < 2) return res.json({ residents: [], payments: [], properties: [] });

  const lowered = raw.toLocaleLowerCase();
  const tokens = lowered.split(/\s+/).filter(Boolean);
  const intent: 'resident' | 'payment' | 'property' | null =
    tokens.some((token) => intentWords.payment.includes(token)) ? 'payment' :
    tokens.some((token) => intentWords.property.includes(token)) ? 'property' :
    tokens.some((token) => intentWords.resident.includes(token)) ? 'resident' : null;
  const text = tokens.filter((token) => !fillerWords.has(token) && !Object.values(intentWords).some((words) => words.includes(token))).join(' ').trim();
  const queryText = text || (intent ? '' : lowered);
  if (!queryText && !intent) return res.json({ residents: [], payments: [], properties: [] });
  const regex = queryText ? new RegExp(escapeRegex(queryText), 'i') : null;
  const tasks: [Promise<unknown>, Promise<unknown>, Promise<unknown>] = [Promise.resolve([]), Promise.resolve([]), Promise.resolve([])];

  if ((req.user!.permissions.includes('residents:read') || req.user!.role === 'SUPER_ADMIN') && intent !== 'payment' && intent !== 'property') {
    tasks[0] = (async () => {
      const scope = await scopedResidentIds(req);
      const filter: Record<string, unknown> = scope.ids === null ? {} : { _id: { $in: scope.ids } };
      if (regex) filter.$or = [{ fullName: regex }, { residentId: regex }, { mobile: regex }];
      return Resident.find(filter).select('_id fullName residentId mobile status').sort({ fullName: 1 }).limit(6).lean();
    })();
  }

  if ((req.user!.permissions.includes('payments:read') || req.user!.role === 'SUPER_ADMIN') && intent !== 'property' && (queryText || intent === 'payment')) {
    tasks[1] = (async () => {
      const scope = await scopedResidentIds(req);
      const residentFilter = scope.ids === null ? {} : { residentId: { $in: scope.ids } };
      const residentMatches = regex ? await Resident.find({ ...(scope.ids === null ? {} : { _id: { $in: scope.ids } }), $or: [{ fullName: regex }, { residentId: regex }, { mobile: regex }] }).distinct('_id') : [];
      const filter: Record<string, unknown> = { ...residentFilter };
      if (regex) {
        const paymentId = queryText.match(/(?:ASH-\d{4}-)?([a-f\d]{24})$/i)?.[1];
        filter.$or = [
          ...(residentMatches.length ? [{ residentId: { $in: residentMatches } }] : []),
          { reference: regex },
          { notes: regex },
          { method: regex },
          ...(paymentId ? [{ _id: paymentId }] : []),
        ];
      }
      return Payment.find(filter).populate('residentId', 'fullName residentId').sort({ paymentDate: -1 }).limit(6).lean();
    })();
  }

  if ((req.user!.permissions.includes('rooms:read') || req.user!.role === 'SUPER_ADMIN') && intent !== 'payment' && (regex || intent === 'property')) {
    tasks[2] = Property.find({ ...(req.user!.role === 'SUPER_ADMIN' ? {} : { _id: { $in: req.user!.propertyIds ?? [] } }), ...(regex ? { $or: [{ name: regex }, { address: regex }] } : {}) }).select('_id name address gender active').sort({ name: 1 }).limit(5).lean();
  }

  const [residents, payments, properties] = await Promise.all(tasks);
  return res.json({ residents, payments, properties });
}));

export default router;
