import { Schema, model } from 'mongoose';

const auditEventSchema = new Schema({
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  action: { type: String, required: true, maxlength: 100 },
  entityType: { type: String, required: true, maxlength: 80 },
  entityId: { type: String, required: true, maxlength: 100 },
  reason: { type: String, default: '', maxlength: 1000 },
  details: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true, versionKey: false });
export const AuditEvent = model('AuditEvent', auditEventSchema);
