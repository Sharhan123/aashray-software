package com.aashray.hospitality.reminders

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.aashray.hospitality.MainActivity
import com.aashray.hospitality.data.AashrayRepository
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class ReminderAlarmReceiver : BroadcastReceiver() {
    @Inject lateinit var repository: AashrayRepository
    @Inject lateinit var scheduler: ReminderAlarmScheduler

    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(ReminderAlarmScheduler.EXTRA_ID) ?: return
        when (intent.action) {
            ReminderAlarmScheduler.ACTION_FIRE -> {
                scheduler.markFired(id, intent.getStringExtra(ReminderAlarmScheduler.EXTRA_DUE_AT).orEmpty())
                showAlarm(context, id, intent.getStringExtra(ReminderAlarmScheduler.EXTRA_TITLE).orEmpty(), intent.getStringExtra(ReminderAlarmScheduler.EXTRA_NOTES).orEmpty())
            }
            ReminderAlarmScheduler.ACTION_COMPLETE, ReminderAlarmScheduler.ACTION_SNOOZE -> {
                val pending = goAsync()
                CoroutineScope(Dispatchers.IO).launch {
                    try {
                        val response = if (intent.action == ReminderAlarmScheduler.ACTION_COMPLETE) repository.stopOwnerReminder(id)
                        else repository.snoozeOwnerReminder(id, intent.getIntExtra(ReminderAlarmScheduler.EXTRA_MINUTES, 10))
                        NotificationManagerCompat.from(context).cancel(ReminderAlarmScheduler.requestCode(id))
                        response.reminder?.let { updated -> if (updated.active) scheduler.schedule(updated) else scheduler.cancel(id) } ?: scheduler.cancel(id)
                    } catch (_: Exception) {
                        // Keep the reminder visible if syncing its action failed; opening the app allows a retry.
                    } finally { pending.finish() }
                }
            }
        }
    }

    private fun showAlarm(context: Context, id: String, title: String, notes: String) {
        createChannel(context)
        val open = PendingIntent.getActivity(context, ReminderAlarmScheduler.requestCode(id), Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        fun action(action: String, label: String, minutes: Int = 0): PendingIntent {
            val actionIntent = Intent(context, ReminderAlarmReceiver::class.java).setAction(action).putExtra(ReminderAlarmScheduler.EXTRA_ID, id).putExtra(ReminderAlarmScheduler.EXTRA_MINUTES, minutes)
            return PendingIntent.getBroadcast(context, ReminderAlarmScheduler.requestCode(id) xor action.hashCode(), actionIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        val notification = NotificationCompat.Builder(context, ReminderAlarmScheduler.CHANNEL_ID)
            .setSmallIcon(com.aashray.hospitality.R.drawable.aashray_original)
            .setContentTitle(title.ifBlank { "Aashray reminder" })
            .setContentText(notes.ifBlank { "Your scheduled reminder is due." })
            .setStyle(NotificationCompat.BigTextStyle().bigText(notes.ifBlank { "Your scheduled reminder is due." }))
            .setCategory(NotificationCompat.CATEGORY_ALARM).setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setAutoCancel(true)
            .setContentIntent(open).addAction(0, "Snooze 10 min", action(ReminderAlarmScheduler.ACTION_SNOOZE, "Snooze", 10))
            .addAction(0, "Snooze 30 min", action(ReminderAlarmScheduler.ACTION_SNOOZE, "Snooze", 30))
            .addAction(0, "Complete", action(ReminderAlarmScheduler.ACTION_COMPLETE, "Complete"))
            .build()
        try { NotificationManagerCompat.from(context).notify(ReminderAlarmScheduler.requestCode(id), notification) } catch (_: SecurityException) { }
    }

    private fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
        val channel = NotificationChannel(ReminderAlarmScheduler.CHANNEL_ID, "Owner reminders", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Scheduled owner reminders and alarm alerts"
            setSound(sound, attributes)
            enableVibration(true)
            lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
        }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}

@AndroidEntryPoint
class ReminderBootReceiver : BroadcastReceiver() {
    @Inject lateinit var repository: AashrayRepository
    @Inject lateinit var scheduler: ReminderAlarmScheduler

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, Intent.ACTION_USER_UNLOCKED)) return
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            scheduler.restoreCached()
            try { scheduler.sync(repository.ownerReminders().reminders) } catch (_: Exception) { }
            finally { pending.finish() }
        }
    }
}
