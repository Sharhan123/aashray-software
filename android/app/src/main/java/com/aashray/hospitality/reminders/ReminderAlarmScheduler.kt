package com.aashray.hospitality.reminders

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationManagerCompat
import com.aashray.hospitality.data.OwnerReminderDto
import dagger.hilt.android.qualifiers.ApplicationContext
import org.json.JSONObject
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ReminderAlarmScheduler @Inject constructor(@ApplicationContext private val context: Context) {
    private val alarmManager get() = context.getSystemService(AlarmManager::class.java)

    fun sync(reminders: List<OwnerReminderDto>) {
        val currentIds = reminders.filter { it.active }.map { it._id }.toSet()
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val oldIds = prefs.getStringSet(KEY_IDS, emptySet()).orEmpty()
        (oldIds - currentIds).forEach(::cancel)
        val editor = prefs.edit().putStringSet(KEY_IDS, currentIds)
        reminders.forEach { reminder ->
            if (reminder.active) {
                schedule(reminder)
                editor.putString(CACHE_PREFIX + reminder._id, JSONObject().put("title", reminder.title).put("notes", reminder.notes).put("dueAt", reminder.dueAt).toString())
            } else {
                cancel(reminder._id)
                editor.remove(CACHE_PREFIX + reminder._id)
            }
        }
        (oldIds - currentIds).forEach { editor.remove(CACHE_PREFIX + it) }
        editor.apply()
    }

    fun restoreCached() {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.getStringSet(KEY_IDS, emptySet()).orEmpty().forEach { id ->
            val cached = runCatching { JSONObject(prefs.getString(CACHE_PREFIX + id, null).orEmpty()) }.getOrNull() ?: return@forEach
            schedule(OwnerReminderDto(id, cached.optString("title"), cached.optString("notes"), cached.optString("dueAt"), active = true))
        }
    }

    fun schedule(reminder: OwnerReminderDto) {
        if (!reminder.active || reminder._id.isBlank()) return
        val at = runCatching { Instant.parse(reminder.dueAt).toEpochMilli() }.getOrNull() ?: return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (prefs.getString(FIRED_PREFIX + reminder._id, null) == reminder.dueAt) return
        val intent = Intent(context, ReminderAlarmReceiver::class.java)
            .setAction(ACTION_FIRE).putExtra(EXTRA_ID, reminder._id)
            .putExtra(EXTRA_TITLE, reminder.title).putExtra(EXTRA_NOTES, reminder.notes).putExtra(EXTRA_DUE_AT, reminder.dueAt)
        val pending = PendingIntent.getBroadcast(context, requestCode(reminder._id), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
        } else {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
        }
        val ids = prefs.getStringSet(KEY_IDS, emptySet()).orEmpty().toMutableSet().apply { add(reminder._id) }
        prefs.edit().putStringSet(KEY_IDS, ids).putString(CACHE_PREFIX + reminder._id, JSONObject().put("title", reminder.title).put("notes", reminder.notes).put("dueAt", reminder.dueAt).toString()).apply()
    }

    fun markFired(id: String, dueAt: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(FIRED_PREFIX + id, dueAt).apply()
    }

    fun cancel(id: String) {
        if (id.isBlank()) return
        val pending = PendingIntent.getBroadcast(context, requestCode(id), Intent(context, ReminderAlarmReceiver::class.java).setAction(ACTION_FIRE), PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)
        if (pending != null) alarmManager.cancel(pending)
        NotificationManagerCompat.from(context).cancel(requestCode(id))
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .remove(CACHE_PREFIX + id).remove(FIRED_PREFIX + id)
            .putStringSet(KEY_IDS, context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getStringSet(KEY_IDS, emptySet()).orEmpty() - id)
            .apply()
    }

    companion object {
        const val ACTION_FIRE = "com.aashray.hospitality.reminders.FIRE"
        const val ACTION_COMPLETE = "com.aashray.hospitality.reminders.COMPLETE"
        const val ACTION_SNOOZE = "com.aashray.hospitality.reminders.SNOOZE"
        const val EXTRA_ID = "reminder_id"
        const val EXTRA_TITLE = "reminder_title"
        const val EXTRA_NOTES = "reminder_notes"
        const val EXTRA_DUE_AT = "reminder_due_at"
        const val EXTRA_MINUTES = "reminder_minutes"
        const val CHANNEL_ID = "owner_reminders"
        const val PREFS = "owner_reminder_alarms"
        const val KEY_IDS = "scheduled_ids"
        private const val CACHE_PREFIX = "reminder_cache_"
        private const val FIRED_PREFIX = "reminder_fired_"
        fun requestCode(id: String) = id.hashCode()
    }
}
