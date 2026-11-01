package com.aashray.hospitality.ui.operations

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.Intent
import android.net.Uri
import android.media.AudioManager
import android.media.ToneGenerator
import android.Manifest
import android.app.AlarmManager
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import android.content.pm.PackageManager
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.clickable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.aashray.hospitality.data.AppSettingsDto
import com.aashray.hospitality.data.DepositRequest
import com.aashray.hospitality.data.UtilityRequest
import com.aashray.hospitality.data.UserDto
import com.aashray.hospitality.data.StaffCreateRequest
import com.aashray.hospitality.data.StaffDto
import com.aashray.hospitality.data.StaffUpdateRequest
import com.aashray.hospitality.data.RoomDto
import com.aashray.hospitality.data.RoomWriteRequest
import com.aashray.hospitality.ui.OperationsViewModel
import com.aashray.hospitality.ui.finance.SelectionField
import com.aashray.hospitality.ui.finance.SearchableSelectionField
import com.aashray.hospitality.ui.money
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID
import java.util.Locale
import com.aashray.hospitality.ui.finance.StatementPdf
import java.time.Instant
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

data class ToolLink(val title: String, val subtitle: String, val permissions: Set<String>, val route: String)
val toolLinks = listOf(
    ToolLink("Rooms & beds", "Manage room inventory, bed capacity, and availability.", setOf("rooms:read"), "rooms"),
    ToolLink("Staff & permissions", "Manage staff access and property assignments.", setOf("staff:read"), "staff"),
    ToolLink("Rent & billing", "Preview and generate a monthly rent cycle.", setOf("billing:write"), "billing"),
    ToolLink("Utility billing", "Create a utility charge after reviewing its details.", setOf("utilities:write", "residents:read"), "utilities"),
    ToolLink("Due reminders", "Prepare a reminder and open WhatsApp for manual sending.", setOf("messages:send", "residents:read"), "reminders"),
    ToolLink("Security deposits", "Review the deposit ledger and record a receipt or refund.", setOf("payments:write", "residents:read"), "deposits"),
    ToolLink("Reports", "View live reports provided by the Aashray backend.", setOf("reports:read"), "reports"),
    ToolLink("Settings", "Review and update workspace settings.", setOf("settings:read"), "settings"),
    ToolLink("My reminders", "Create scheduled owner reminders with an in-app alarm.", setOf("__owner_only__"), "owner-reminders"),
)

@Composable
fun OwnerReminderAlarmHost(viewModel: OperationsViewModel, enabled: Boolean) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var snoozeMinutes by rememberSaveable { mutableStateOf(10) }
    LaunchedEffect(enabled) {
        if (enabled) while (true) { viewModel.loadOwnerReminders(); delay(30_000) }
    }
    val now = remember { java.time.Clock.systemUTC() }
    val due = if (enabled) state.ownerReminders.firstOrNull { reminder -> reminder.active && runCatching { !Instant.parse(reminder.dueAt).isAfter(now.instant()) }.getOrDefault(false) } else null
    DisposableEffect(due?._id) {
        val tone = if (due != null) ToneGenerator(AudioManager.STREAM_ALARM, 100) else null
        var running = true
        val job = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Main).launch {
            while (running && due != null) { tone?.startTone(ToneGenerator.TONE_PROP_BEEP2, 1000); delay(1800) }
        }
        onDispose { running = false; job.cancel(); tone?.release() }
    }
    due?.let { reminder -> AlertDialog(
        onDismissRequest = {},
        title = { Text("Reminder due · ${reminder.title}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (reminder.notes.isNotBlank()) Text(reminder.notes)
                SelectionField("Snooze", snoozeMinutes.toString(), listOf(5, 10, 15, 30, 60, 120).map { it.toString() to if (it >= 60) "${it / 60} hour${if (it > 60) "s" else ""}" else "$it minutes" }, { snoozeMinutes = it.toInt() })
            }
        },
        confirmButton = { Button(onClick = { viewModel.stopOwnerReminder(reminder._id) }) { Text("Complete") } },
        dismissButton = { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { viewModel.snoozeOwnerReminder(reminder._id, snoozeMinutes) }) { Text("Snooze") }
            if (reminder.repeatEveryHours != null) TextButton(onClick = { viewModel.acknowledgeOwnerReminder(reminder._id) }) { Text("Acknowledge") }
        } },
    ) }
}

@Composable
fun OwnerRemindersScreen(viewModel: OperationsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var title by rememberSaveable { mutableStateOf("") }
    var notes by rememberSaveable { mutableStateOf("") }
    var dueAt by rememberSaveable { mutableStateOf(LocalDateTime.now(ZoneId.of("Asia/Kolkata")).plusHours(1).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"))) }
    var repeatHours by rememberSaveable { mutableStateOf("") }
    var snoozeMinutes by rememberSaveable { mutableStateOf(10) }
    val now = remember { java.time.Clock.systemUTC() }
    val localDateTime = runCatching { LocalDateTime.parse(dueAt, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")) }.getOrNull()
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var permissionRefresh by remember { mutableStateOf(0) }
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { permissionRefresh++ }
    LaunchedEffect(Unit) { viewModel.loadOwnerReminders() }
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                permissionRefresh++
                viewModel.loadOwnerReminders()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    val dueReminder = state.ownerReminders.firstOrNull { it.active && runCatching { Instant.parse(it.dueAt).isBefore(now.instant()) || Instant.parse(it.dueAt) == now.instant() }.getOrDefault(false) }
    ToolPage("My reminders", "Create reminders that alert you at the scheduled time, even when the app is in the background. Snooze, stop, or complete each reminder.", state.error, state.notice) {
        val notificationsAllowed = remember(permissionRefresh) { Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED }
        val exactAlarmsAllowed = remember(permissionRefresh) { Build.VERSION.SDK_INT < 31 || context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms() }
        if (!notificationsAllowed || !exactAlarmsAllowed) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer), shape = RoundedCornerShape(12.dp)) {
                Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Allow reminder alerts", fontWeight = FontWeight.SemiBold)
                    Text("Android needs notification permission to show and ring reminders. Exact alarms make scheduled times more reliable.", style = MaterialTheme.typography.bodySmall)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (!notificationsAllowed && Build.VERSION.SDK_INT >= 33) OutlinedButton(onClick = { notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS) }) { Text("Allow notifications") }
                        if (!exactAlarmsAllowed && Build.VERSION.SDK_INT >= 31) OutlinedButton(onClick = { runCatching { context.startActivity(android.content.Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)) }; permissionRefresh++ }) { Text("Allow exact alarms") }
                    }
                }
            }
        }
        Text("New reminder", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        OutlinedTextField(title, { title = it.take(160) }, Modifier.fillMaxWidth(), label = { Text("Reminder") }, singleLine = true)
        Text("Date and time · Asia/Kolkata", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = {
                val value = localDateTime ?: LocalDateTime.now(ZoneId.of("Asia/Kolkata"))
                DatePickerDialog(context, { _, year, month, day -> dueAt = value.withYear(year).withMonth(month + 1).withDayOfMonth(day).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")) }, value.year, value.monthValue - 1, value.dayOfMonth).show()
            }, modifier = Modifier.weight(1f)) { Text(localDateTime?.toLocalDate()?.toString() ?: "Choose date") }
            OutlinedButton(onClick = {
                val value = localDateTime ?: LocalDateTime.now(ZoneId.of("Asia/Kolkata"))
                TimePickerDialog(context, { _, hour, minute -> dueAt = value.withHour(hour).withMinute(minute).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")) }, value.hour, value.minute, false).show()
            }, modifier = Modifier.weight(1f)) { Text(localDateTime?.format(DateTimeFormatter.ofPattern("hh:mm a")) ?: "Choose time") }
        }
        OutlinedTextField(repeatHours, { repeatHours = it.filter(Char::isDigit).take(4) }, Modifier.fillMaxWidth(), label = { Text("Repeat every hours (optional)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
        OutlinedTextField(notes, { notes = it.take(2000) }, Modifier.fillMaxWidth(), label = { Text("Notes (optional)") }, minLines = 2)
        Button(onClick = {
            val repeat = repeatHours.toIntOrNull()
            val scheduled = localDateTime?.atZone(ZoneId.of("Asia/Kolkata"))?.toInstant()?.toString().orEmpty()
            viewModel.createOwnerReminder(com.aashray.hospitality.data.OwnerReminderRequest(title.trim(), notes.trim(), scheduled, repeat))
            title = ""; notes = ""; repeatHours = ""
        }, enabled = !state.busy && title.isNotBlank() && localDateTime != null && (repeatHours.isBlank() || repeatHours.toIntOrNull()?.let { it in 1..8760 } == true), modifier = Modifier.fillMaxWidth()) { Text("Save reminder") }

        dueReminder?.let { reminder ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer), shape = RoundedCornerShape(14.dp)) {
                Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Reminder due · ${reminder.title}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    if (reminder.notes.isNotBlank()) Text(reminder.notes)
                    SelectionField("Snooze", snoozeMinutes.toString(), listOf(5, 10, 15, 30, 60, 120).map { it.toString() to if (it == 60) "1 hour" else if (it == 120) "2 hours" else "$it minutes" }, { snoozeMinutes = it.toInt() })
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { viewModel.snoozeOwnerReminder(reminder._id, snoozeMinutes) }, enabled = !state.busy) { Text("Snooze") }
                        if (reminder.repeatEveryHours != null) TextButton(onClick = { viewModel.acknowledgeOwnerReminder(reminder._id) }, enabled = !state.busy) { Text("Acknowledge") }
                        Button(onClick = { viewModel.stopOwnerReminder(reminder._id) }, enabled = !state.busy) { Text("Complete") }
                    }
                }
            }
        }
        Text("Scheduled reminders", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        if (state.ownerReminders.isEmpty() && !state.busy) Text("No reminders yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        state.ownerReminders.forEach { reminder ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(12.dp)) {
                Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(reminder.title, fontWeight = FontWeight.SemiBold)
                        Text(runCatching { java.time.ZonedDateTime.parse(reminder.dueAt).toString().replace('T', ' ') }.getOrDefault(reminder.dueAt), style = MaterialTheme.typography.bodySmall)
                        if (reminder.repeatEveryHours != null) Text("Repeats every ${reminder.repeatEveryHours} hours", style = MaterialTheme.typography.labelSmall)
                        if (!reminder.active) Text("Completed or stopped", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (reminder.notes.isNotBlank()) Text(reminder.notes, style = MaterialTheme.typography.bodySmall)
                    }
                    TextButton(onClick = { viewModel.deleteOwnerReminder(reminder._id) }, enabled = !state.busy) { Text("Delete") }
                }
            }
        }
    }
}

@Composable
fun OperationsHomeScreen(user: UserDto, onOpen: (String) -> Unit) {
    LazyColumn(Modifier.fillMaxWidth(), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { com.aashray.hospitality.ui.PageIntro("Workspace", "Operations", "Daily tools for utilities, reminders, deposits, reports, and settings.") }
        val available = toolLinks.filter { link -> if (link.permissions.contains("__owner_only__")) user.role == "SUPER_ADMIN" else link.permissions.all(user::can) }
        if (available.isEmpty()) item { com.aashray.hospitality.ui.EmptyContent("No tools assigned", "Ask your Aashray administrator to grant access to workspace tools.") }
        items(available) { link ->
            Card(modifier = Modifier.fillMaxWidth().clickable { onOpen(link.route) }, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(16.dp)) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(link.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(link.subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
fun RoomsScreen(canWrite: Boolean, viewModel: OperationsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var propertyId by rememberSaveable { mutableStateOf("") }
    var roomNumber by rememberSaveable { mutableStateOf("") }
    var roomType by rememberSaveable { mutableStateOf("NON_AC") }
    var capacity by rememberSaveable { mutableStateOf("1") }
    var bedIds by rememberSaveable { mutableStateOf("") }
    var notes by rememberSaveable { mutableStateOf("") }
    var editing by remember { mutableStateOf<RoomDto?>(null) }
    var deactivateTarget by remember { mutableStateOf<RoomDto?>(null) }
    var editProperty by rememberSaveable { mutableStateOf("") }
    var editNumber by rememberSaveable { mutableStateOf("") }
    var editType by rememberSaveable { mutableStateOf("NON_AC") }
    var editCapacity by rememberSaveable { mutableStateOf("") }
    var editBedIds by rememberSaveable { mutableStateOf("") }
    var editNotes by rememberSaveable { mutableStateOf("") }

    LaunchedEffect(Unit) { viewModel.loadRoomWorkspace() }
    val capacityValue = capacity.toIntOrNull() ?: 0

    editing?.let { room ->
        AlertDialog(
            onDismissRequest = { editing = null },
            title = { Text("Edit room ${room.roomNumber}") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    SelectionField("Property", editProperty, state.properties.filter { it.active }.map { it._id to it.name }, { editProperty = it })
                    OutlinedTextField(editNumber, { editNumber = it.take(40) }, Modifier.fillMaxWidth(), label = { Text("Room number") }, singleLine = true)
                    SelectionField("Room type", editType, listOf("NON_AC" to "Non AC", "AC" to "AC"), { editType = it })
                    OutlinedTextField(editCapacity, { editCapacity = it.filter(Char::isDigit).take(2) }, Modifier.fillMaxWidth(), label = { Text("Bed capacity") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                    OutlinedTextField(editBedIds, { editBedIds = it.take(300) }, Modifier.fillMaxWidth(), label = { Text("Bed IDs, comma separated") }, supportingText = { Text("Keep occupied bed IDs unchanged. Leave blank to use the existing sequence.") })
                    OutlinedTextField(editNotes, { editNotes = it.take(1000) }, Modifier.fillMaxWidth(), label = { Text("Notes") }, minLines = 2)
                }
            },
            confirmButton = { Button(onClick = {
                val cap = editCapacity.toIntOrNull() ?: 0
                val ids = editBedIds.split(',').map(String::trim).filter(String::isNotBlank)
                viewModel.updateRoom(room._id, RoomWriteRequest(editProperty, editNumber.trim(), editType, cap, ids, editNotes.trim()))
                editing = null
            }, enabled = !state.busy && editProperty.isNotBlank() && editNumber.isNotBlank() && (editCapacity.toIntOrNull() ?: 0) in 1..30) { Text("Save room") } },
            dismissButton = { TextButton(onClick = { editing = null }) { Text("Cancel") } },
        )
    }
    deactivateTarget?.let { room ->
        AlertDialog(
            onDismissRequest = { deactivateTarget = null },
            title = { Text("Deactivate room ${room.roomNumber}?") },
            text = { Text("The room will be removed from active inventory. Rooms with current residents cannot be deactivated.") },
            confirmButton = { Button(onClick = { viewModel.deactivateRoom(room._id); deactivateTarget = null }, enabled = !state.busy) { Text("Deactivate") } },
            dismissButton = { TextButton(onClick = { deactivateTarget = null }) { Text("Cancel") } },
        )
    }

    ToolPage("Rooms & beds", "Keep room capacity and bed identifiers aligned with current assignments.", state.error, state.notice) {
        if (canWrite) {
            Text("Add a room", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            SelectionField("Property", propertyId, state.properties.filter { it.active }.map { it._id to it.name }, { propertyId = it }, "Choose property")
            OutlinedTextField(roomNumber, { roomNumber = it.take(40) }, Modifier.fillMaxWidth(), label = { Text("Room number") }, singleLine = true)
            SelectionField("Room type", roomType, listOf("NON_AC" to "Non AC", "AC" to "AC"), { roomType = it })
            OutlinedTextField(capacity, { capacity = it.filter(Char::isDigit).take(2) }, Modifier.fillMaxWidth(), label = { Text("Bed capacity (1–30)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
            OutlinedTextField(bedIds, { bedIds = it.take(300) }, Modifier.fillMaxWidth(), label = { Text("Bed IDs (optional, comma separated)") }, supportingText = { Text("Leave blank to create beds numbered 1 through capacity.") })
            OutlinedTextField(notes, { notes = it.take(1000) }, Modifier.fillMaxWidth(), label = { Text("Notes (optional)") }, minLines = 2)
            Button(onClick = {
                viewModel.createRoom(RoomWriteRequest(propertyId, roomNumber.trim(), roomType, capacityValue, bedIds.split(',').map(String::trim).filter(String::isNotBlank), notes.trim()))
                roomNumber = ""; capacity = "1"; bedIds = ""; notes = ""
            }, modifier = Modifier.fillMaxWidth(), enabled = !state.busy && propertyId.isNotBlank() && roomNumber.isNotBlank() && capacityValue in 1..30) { Text("Create room") }
            androidx.compose.material3.HorizontalDivider()
        }
        Text("Room inventory", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        if (state.rooms.isEmpty() && !state.busy) Text("No active rooms are available.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        state.rooms.forEach { room ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(14.dp)) {
                Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text("Room ${room.roomNumber} · ${room.propertyName.orEmpty()}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Text("${room.roomType.replace('_', ' ')} · ${room.occupied}/${room.capacity} occupied · ${room.available} vacant", style = MaterialTheme.typography.bodySmall)
                    if (room.beds.isNotEmpty()) Text("Beds: ${room.beds.filter { it.active }.joinToString { bed -> bed.bedId + if (bed.bedId in room.occupiedBeds) " (occupied)" else "" }}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (room.notes.isNotBlank()) Text(room.notes, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (canWrite) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = {
                            editProperty = room.propertyId.orEmpty(); editNumber = room.roomNumber; editType = room.roomType
                            editCapacity = room.capacity.toString(); editBedIds = room.beds.filter { it.active }.joinToString(",") { it.bedId }; editNotes = room.notes; editing = room
                        }) { Text("Edit") }
                        TextButton(onClick = { deactivateTarget = room }, enabled = room.occupied == 0 && !state.busy) { Text("Deactivate") }
                    }
                }
            }
        }
    }
}

private val staffPermissionOptions = listOf(
    "dashboard:read", "residents:read", "residents:write", "rooms:read", "rooms:write",
    "billing:read", "billing:write", "payments:read", "payments:write", "utilities:read",
    "utilities:write", "messages:read", "messages:send", "reports:read", "staff:read", "settings:read",
)

@Composable
fun StaffScreen(viewModel: OperationsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var permissions by rememberSaveable { mutableStateOf(emptyList<String>()) }
    var propertyIds by rememberSaveable { mutableStateOf(emptyList<String>()) }
    var editing by remember { mutableStateOf<StaffDto?>(null) }
    var resetTarget by remember { mutableStateOf<StaffDto?>(null) }
    var resetPassword by rememberSaveable { mutableStateOf("") }

    LaunchedEffect(Unit) { viewModel.loadStaff() }

    editing?.let { staff ->
        AlertDialog(
            onDismissRequest = { editing = null },
            title = { Text("Edit ${staff.name}'s access") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Permissions", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    staffPermissionOptions.forEach { permission ->
                        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            Checkbox(checked = permission in permissions, onCheckedChange = { checked -> permissions = if (checked) (permissions + permission).distinct() else permissions - permission })
                            Text(permission, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    Text("Property access", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    if (state.properties.isEmpty()) Text("No properties available.", style = MaterialTheme.typography.bodySmall)
                    state.properties.forEach { property ->
                        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            Checkbox(checked = property._id in propertyIds, onCheckedChange = { checked -> propertyIds = if (checked) (propertyIds + property._id).distinct() else propertyIds - property._id })
                            Text(property.name, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            },
            confirmButton = { Button(onClick = { viewModel.updateStaff(staff.id, StaffUpdateRequest(permissions = permissions, propertyIds = propertyIds)); editing = null }, enabled = !state.busy) { Text("Save access") } },
            dismissButton = { TextButton(onClick = { editing = null }) { Text("Cancel") } },
        )
    }
    resetTarget?.let { staff ->
        AlertDialog(
            onDismissRequest = { resetTarget = null; resetPassword = "" },
            title = { Text("Reset staff password") },
            text = { OutlinedTextField(resetPassword, { resetPassword = it.take(256) }, label = { Text("New password · at least 14 characters") }, singleLine = true, visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation()) },
            confirmButton = { Button(onClick = { viewModel.resetStaffPassword(staff.id, resetPassword); resetTarget = null; resetPassword = "" }, enabled = !state.busy && resetPassword.length >= 14) { Text("Reset password") } },
            dismissButton = { TextButton(onClick = { resetTarget = null; resetPassword = "" }) { Text("Cancel") } },
        )
    }

    ToolPage("Staff & permissions", "Create staff accounts, limit their property access, and control workspace permissions.", state.error, state.notice) {
        Text("Add staff member", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        OutlinedTextField(name, { name = it.take(120) }, Modifier.fillMaxWidth(), label = { Text("Full name") }, singleLine = true)
        OutlinedTextField(email, { email = it.take(254) }, Modifier.fillMaxWidth(), label = { Text("Email") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
        OutlinedTextField(password, { password = it.take(256) }, Modifier.fillMaxWidth(), label = { Text("Temporary password · 14+ characters") }, singleLine = true, visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation())
        Text("Permissions", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        staffPermissionOptions.forEach { permission ->
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Checkbox(checked = permission in permissions, onCheckedChange = { checked -> permissions = if (checked) (permissions + permission).distinct() else permissions - permission })
                Text(permission, style = MaterialTheme.typography.bodySmall)
            }
        }
        Text("Property access", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        if (state.properties.isEmpty()) Text("No properties available to assign.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        state.properties.forEach { property ->
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Checkbox(checked = property._id in propertyIds, onCheckedChange = { checked -> propertyIds = if (checked) (propertyIds + property._id).distinct() else propertyIds - property._id })
                Text(property.name, style = MaterialTheme.typography.bodySmall)
            }
        }
        Button(onClick = {
            viewModel.createStaff(StaffCreateRequest(name.trim(), email.trim(), password, permissions, propertyIds))
            name = ""; email = ""; password = ""; permissions = emptyList(); propertyIds = emptyList()
        }, modifier = Modifier.fillMaxWidth(), enabled = !state.busy && name.trim().length >= 2 && android.util.Patterns.EMAIL_ADDRESS.matcher(email).matches() && password.length >= 14 && permissions.isNotEmpty()) {
            if (state.busy) CircularProgressIndicator(Modifier.padding(end = 8.dp), strokeWidth = 2.dp)
            Text("Create staff account")
        }

        androidx.compose.material3.HorizontalDivider()
        Text("Staff accounts", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        if (state.staff.isEmpty() && !state.busy) Text("No staff accounts yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        state.staff.forEach { staff ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(14.dp)) {
                Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(staff.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Text(staff.email, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(if (staff.active) "Active" else "Inactive", style = MaterialTheme.typography.labelMedium, color = if (staff.active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
                    Text("${staff.permissions.size} permissions · ${staff.propertyIds.size} properties", style = MaterialTheme.typography.bodySmall)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { permissions = staff.permissions; propertyIds = staff.propertyIds; editing = staff }) { Text("Edit access") }
                        OutlinedButton(onClick = { viewModel.updateStaff(staff.id, StaffUpdateRequest(active = !staff.active), if (staff.active) "Staff access deactivated." else "Staff access activated.") }, enabled = !state.busy) { Text(if (staff.active) "Deactivate" else "Activate") }
                        TextButton(onClick = { resetTarget = staff }) { Text("Reset password") }
                    }
                }
            }
        }
    }
}

@Composable
fun UtilitiesScreen(viewModel: OperationsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var residentId by rememberSaveable { mutableStateOf("") }
    var type by rememberSaveable { mutableStateOf("ELECTRICITY") }
    var period by rememberSaveable { mutableStateOf(LocalDate.now(ZoneId.of("Asia/Kolkata")).toString().take(7)) }
    var amount by rememberSaveable { mutableStateOf("") }
    var issuedAt by rememberSaveable { mutableStateOf(LocalDate.now(ZoneId.of("Asia/Kolkata")).toString()) }
    var dueAt by rememberSaveable { mutableStateOf(LocalDate.now(ZoneId.of("Asia/Kolkata")).plusDays(7).toString()) }
    var notes by rememberSaveable { mutableStateOf("") }
    var key by rememberSaveable { mutableStateOf(UUID.randomUUID().toString()) }
    var confirm by remember { mutableStateOf(false) }
    val selected = state.residents.firstOrNull { it._id == residentId }
    val amountValue = amount.toDoubleOrNull() ?: 0.0
    LaunchedEffect(Unit) { viewModel.loadResidents(); viewModel.loadUtilityCharges() }
    LaunchedEffect(state.busy, state.notice) { if (!state.busy && state.notice?.startsWith("Utility charge saved") == true) { key = UUID.randomUUID().toString(); amount = ""; notes = "" } }
    if (confirm) AlertDialog(
        onDismissRequest = { if (!state.busy) confirm = false },
        title = { Text("Create this utility charge?") },
        text = { Text("${selected?.fullName} · $type · $period · ${money((amountValue * 100).toLong())}, due $dueAt. The backend will create the charge.") },
        confirmButton = { Button(onClick = { confirm = false; viewModel.addUtility(UtilityRequest(residentId, utilityType = type, periodKey = period, amount = amountValue, issuedAt = issuedAt, dueAt = dueAt, notes = notes.trim(), idempotencyKey = key)) }, enabled = !state.busy) { Text("Confirm charge") } },
        dismissButton = { TextButton(onClick = { confirm = false }, enabled = !state.busy) { Text("Cancel") } },
    )
    ToolPage("Utility billing", "Create a one-time utility charge in the server ledger.", state.error, state.notice) {
        SearchableSelectionField("Resident", residentId, state.residents.map { it._id to "${it.fullName} · ${it.residentId} · ${it.mobile}" }, { residentId = it })
        OutlinedTextField(type, { type = it.take(60) }, Modifier.fillMaxWidth(), label = { Text("Utility type") }, singleLine = true)
        OutlinedTextField(period, { period = it.take(7) }, Modifier.fillMaxWidth(), label = { Text("Billing period (YYYY-MM)") }, singleLine = true)
        OutlinedTextField(amount, { amount = it.filter { ch -> ch.isDigit() || ch == '.' } }, Modifier.fillMaxWidth(), label = { Text("Amount (₹)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
        OutlinedTextField(issuedAt, { issuedAt = it.take(10) }, Modifier.fillMaxWidth(), label = { Text("Issued date (YYYY-MM-DD)") }, singleLine = true)
        OutlinedTextField(dueAt, { dueAt = it.take(10) }, Modifier.fillMaxWidth(), label = { Text("Due date (YYYY-MM-DD)") }, singleLine = true)
        OutlinedTextField(notes, { notes = it.take(1000) }, Modifier.fillMaxWidth(), label = { Text("Notes (optional)") }, minLines = 2)
        Button(onClick = { confirm = true }, modifier = Modifier.fillMaxWidth(), enabled = !state.busy && selected != null && type.trim().length >= 2 && period.matches(Regex("\\d{4}-(0[1-9]|1[0-2])")) && amountValue > 0 && issuedAt.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) && dueAt.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) { if (state.busy) CircularProgressIndicator(Modifier.padding(end = 8.dp), strokeWidth = 2.dp); Text("Review and create charge") }
        androidx.compose.material3.HorizontalDivider()
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Utility billing history", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            TextButton(onClick = viewModel::loadUtilityCharges) { Text("Refresh") }
        }
        if (state.utilityCharges.isEmpty()) Text("No utility bills are recorded yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        state.utilityCharges.forEach { charge ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(14.dp)) {
                Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(charge.residentId?.fullName ?: "Resident", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        Text(money(charge.amountPaise), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    }
                    Text("${charge.utilityType.ifBlank { charge.description }} · ${charge.periodKey}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("Due ${charge.dueAt?.take(10) ?: "—"} · ${charge.status.replace('_', ' ')} · ${money(charge.balancePaise)} outstanding", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
fun RemindersScreen(viewModel: OperationsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var residentId by rememberSaveable { mutableStateOf("") }
    var kind by rememberSaveable { mutableStateOf("RENT_REMINDER") }
    var custom by rememberSaveable { mutableStateOf("") }
    val resultLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        state.preparedMessage?.message?._id?.let(viewModel::markMessageOpened)
    }
    LaunchedEffect(Unit) { viewModel.loadResidents(); viewModel.loadMessages() }
    ToolPage("Due reminders", "Prepare a resident-specific reminder. WhatsApp opens with the text prefilled; a staff member must review and send it.", state.error, state.notice) {
        SearchableSelectionField("Resident", residentId, state.residents.map { it._id to "${it.fullName} · ${it.residentId} · ${it.mobile}" }, { residentId = it; viewModel.clearPrepared() })
        SelectionField("Reminder type", kind, listOf("RENT_REMINDER" to "Rent reminder", "OVERDUE" to "Overdue rent", "UTILITY" to "Utility due", "CUSTOM" to "Custom message"), { kind = it; viewModel.clearPrepared() })
        if (kind == "CUSTOM") OutlinedTextField(custom, { custom = it.take(4000); viewModel.clearPrepared() }, Modifier.fillMaxWidth(), label = { Text("Message") }, minLines = 4)
        Button(onClick = { viewModel.prepareMessage(residentId, kind, custom) }, enabled = !state.messageBusy && residentId.isNotBlank() && (kind != "CUSTOM" || custom.isNotBlank()), modifier = Modifier.fillMaxWidth()) { if (state.messageBusy) CircularProgressIndicator(Modifier.padding(end = 8.dp), strokeWidth = 2.dp); Text("Prepare preview") }
        state.preparedMessage?.let { prepared ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer), shape = RoundedCornerShape(14.dp)) {
                Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Review message", fontWeight = FontWeight.Bold)
                    Text(prepared.message?.message.orEmpty(), style = MaterialTheme.typography.bodyMedium)
                    Button(onClick = { runCatching { resultLauncher.launch(Intent(Intent.ACTION_VIEW, Uri.parse(prepared.whatsappUrl))) }.onFailure { /* visible platform apps decide whether WhatsApp is available */ } }, enabled = prepared.whatsappUrl.startsWith("https://wa.me/"), modifier = Modifier.fillMaxWidth()) { Text("Open WhatsApp to review") }
                }
            }
        }
        androidx.compose.material3.HorizontalDivider()
        Text("Recent reminders", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        if (state.messages.isEmpty()) Text("No prepared reminders in this workspace yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        state.messages.take(25).forEach { message ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(12.dp)) {
                Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("${message.resident?.fullName ?: message.recipient} · ${message.messageType.replace('_', ' ')}", fontWeight = FontWeight.SemiBold)
                    Text(message.status.replace('_', ' '), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                    Text(message.message, maxLines = 3, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
fun ReportsScreen(initialReport: String = "occupancy", viewModel: OperationsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var name by rememberSaveable(initialReport) { mutableStateOf(initialReport) }
    var from by rememberSaveable { mutableStateOf("") }
    var to by rememberSaveable { mutableStateOf("") }
    val csvLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        val rows = state.report?.rows.orEmpty()
        if (uri != null) runCatching { context.contentResolver.openOutputStream(uri)?.bufferedWriter()?.use { it.write(ReportExport.csv(rows)) } }
    }
    ToolPage("Reports", "Read live operational and financial reports from the backend.", state.error, null) {
        SelectionField("Report", name, listOf("residents", "occupancy", "rent", "overdue", "collections", "outstanding", "utilities", "admissions").map { it to it.replaceFirstChar { char -> char.uppercase() } }, { name = it })
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            androidx.compose.material3.OutlinedButton(onClick = {
                val selected = runCatching { LocalDate.parse(from) }.getOrElse { LocalDate.now() }
                DatePickerDialog(context, { _, year, month, day -> from = LocalDate.of(year, month + 1, day).toString() }, selected.year, selected.monthValue - 1, selected.dayOfMonth).show()
            }, modifier = Modifier.weight(1f)) { Text(if (from.isBlank()) "From date" else "From ${from.take(10)}", maxLines = 1) }
            androidx.compose.material3.OutlinedButton(onClick = {
                val selected = runCatching { LocalDate.parse(to) }.getOrElse { LocalDate.now() }
                DatePickerDialog(context, { _, year, month, day -> to = LocalDate.of(year, month + 1, day).toString() }, selected.year, selected.monthValue - 1, selected.dayOfMonth).show()
            }, modifier = Modifier.weight(1f)) { Text(if (to.isBlank()) "To date" else "To ${to.take(10)}", maxLines = 1) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { viewModel.loadReport(name, from.takeIf(String::isNotBlank), to.takeIf(String::isNotBlank)) }, enabled = !state.busy && (from.isBlank() || from.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) && (to.isBlank() || to.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) && (from.isBlank() || to.isBlank() || from <= to), modifier = Modifier.weight(1f)) { if (state.busy) CircularProgressIndicator(Modifier.padding(end = 8.dp), strokeWidth = 2.dp); Text("Load report") }
            TextButton(onClick = { from = ""; to = "" }) { Text("Clear") }
        }
        state.report?.let { report ->
            Text("${report.rows.size} rows", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = {
                    runCatching { ReportExport.pdf(context, name, from, to, report.rows).also { StatementPdf.share(context, it) } }
                        .onFailure { /* File access and share errors are shown by the Android platform. */ }
                }, modifier = Modifier.weight(1f), enabled = report.rows.isNotEmpty()) { Text("Share PDF") }
                androidx.compose.material3.OutlinedButton(onClick = { csvLauncher.launch("aashray-$name-report.csv") }, modifier = Modifier.weight(1f), enabled = report.rows.isNotEmpty()) { Text("Save CSV") }
            }
            if (report.rows.isEmpty()) Text("No records match this report and date range.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            report.rows.take(200).forEachIndexed { index, row ->
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(12.dp)) {
                    Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text((row["name"] ?: row["resident"] ?: row["roomNumber"] ?: "Record ${index + 1}").toString(), fontWeight = FontWeight.SemiBold)
                        row.filterKeys { it !in setOf("name", "resident", "_id", "__v") }.entries.forEach { (key, value) ->
                            Text("${key.replace('_', ' ').replaceFirstChar(Char::uppercase)}: ${value ?: "—"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun SettingsScreen(canEdit: Boolean, viewModel: OperationsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var name by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var methods by rememberSaveable { mutableStateOf("CASH, BANK_TRANSFER, UPI, OTHER") }
    var utilities by rememberSaveable { mutableStateOf("ELECTRICITY, AC, OTHER") }
    var rentReminderTemplate by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(Unit) { viewModel.loadSettings() }
    LaunchedEffect(state.settings) { state.settings?.let { name = it.businessName; phone = it.contactPhone; email = it.contactEmail; methods = it.paymentMethods.joinToString(", "); utilities = it.utilityTypes.joinToString(", "); rentReminderTemplate = it.rentReminderTemplate } }
    ToolPage("Settings", "Business settings are stored by the existing backend.", state.error, state.notice) {
        state.settings?.let { settings ->
            OutlinedTextField(name, { name = it.take(160) }, Modifier.fillMaxWidth(), label = { Text("Business name") }, singleLine = true, readOnly = !canEdit)
            OutlinedTextField(phone, { phone = it.take(30) }, Modifier.fillMaxWidth(), label = { Text("Contact phone") }, singleLine = true, readOnly = !canEdit)
            OutlinedTextField(email, { email = it.take(254) }, Modifier.fillMaxWidth(), label = { Text("Contact email") }, singleLine = true, readOnly = !canEdit)
            OutlinedTextField(methods, { methods = it.take(200) }, Modifier.fillMaxWidth(), label = { Text("Payment methods (comma separated)") }, minLines = 2, readOnly = !canEdit)
            OutlinedTextField(utilities, { utilities = it.take(300) }, Modifier.fillMaxWidth(), label = { Text("Utility types (comma separated)") }, minLines = 2, readOnly = !canEdit)
            Text("Rent and overdue reminder template", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            OutlinedTextField(rentReminderTemplate, { rentReminderTemplate = it.take(1000) }, Modifier.fillMaxWidth(), label = { Text("WhatsApp message") }, minLines = 4, maxLines = 8, readOnly = !canEdit, supportingText = { Text("Available fields: {residentName}, {amount}, {month}, {dueDate}, {property}") })
            Text("Automatic WhatsApp delivery remains disabled. Reminders are opened for staff review and manual sending.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (canEdit) Button(onClick = {
                val validMethods = methods.split(',').map(String::trim).filter(String::isNotBlank).map(String::uppercase).distinct()
                val validUtilities = utilities.split(',').map(String::trim).filter(String::isNotBlank).distinct()
                viewModel.saveSettings(settings.copy(businessName = name.trim(), contactPhone = phone.trim(), contactEmail = email.trim(), timezone = "Asia/Kolkata", paymentMethods = validMethods, utilityTypes = validUtilities, rentReminderTemplate = rentReminderTemplate.trim(), whatsappAutoRemindersEnabled = false))
            }, enabled = !state.busy && name.trim().length >= 2 && rentReminderTemplate.trim().length >= 20 && (email.isBlank() || android.util.Patterns.EMAIL_ADDRESS.matcher(email).matches()), modifier = Modifier.fillMaxWidth()) { if (state.busy) CircularProgressIndicator(Modifier.padding(end = 8.dp), strokeWidth = 2.dp); Text("Save settings") }
        } ?: if (state.busy) CircularProgressIndicator() else Text("Settings unavailable.")
    }
}

@Composable
fun DepositsScreen(viewModel: OperationsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var residentId by rememberSaveable { mutableStateOf("") }
    var amount by rememberSaveable { mutableStateOf("") }
    var kind by rememberSaveable { mutableStateOf("RECEIVED") }
    var method by rememberSaveable { mutableStateOf("CASH") }
    var reference by rememberSaveable { mutableStateOf("") }
    var reason by rememberSaveable { mutableStateOf("") }
    var key by rememberSaveable { mutableStateOf(UUID.randomUUID().toString()) }
    var confirm by remember { mutableStateOf(false) }
    val profile = state.depositProfile
    val balance = profile?.depositBalancePaise ?: 0L
    val amountValue = amount.toDoubleOrNull() ?: 0.0
    LaunchedEffect(Unit) { viewModel.loadResidents() }
    LaunchedEffect(state.busy, state.notice) { if (!state.busy && state.notice?.startsWith("Deposit ledger updated") == true) { key = UUID.randomUUID().toString(); amount = ""; reference = ""; reason = "" } }
    if (confirm) AlertDialog(
        onDismissRequest = { if (!state.busy) confirm = false },
        title = { Text(if (kind == "RECEIVED") "Record deposit received?" else "Record deposit refund?") },
        text = { Text("${profile?.resident?.fullName} · ${money((amountValue * 100).toLong())} · ${method.replace('_', ' ')}. Current held deposit: ${money(balance)}. Reason: $reason") },
        confirmButton = { Button(onClick = { confirm = false; viewModel.recordDeposit(DepositRequest(residentId, amountValue, kind, method, reference.trim(), reason.trim(), key)) }, enabled = !state.busy) { Text("Confirm ledger entry") } },
        dismissButton = { TextButton(onClick = { confirm = false }, enabled = !state.busy) { Text("Cancel") } },
    )
    ToolPage("Security deposits", "Review the backend deposit ledger. Refunds cannot exceed the held balance.", state.error, state.notice) {
        SearchableSelectionField("Resident", residentId, state.residents.map { it._id to "${it.fullName} · ${it.residentId} · ${it.mobile}" }, { residentId = it; viewModel.loadDepositProfile(it) })
        profile?.let { data ->
            Text("Held deposit: ${money(data.depositBalancePaise)}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            SelectionField("Entry", kind, listOf("RECEIVED" to "Deposit received", "REFUNDED" to "Deposit refunded"), { kind = it })
            OutlinedTextField(amount, { amount = it.filter { c -> c.isDigit() || c == '.' } }, Modifier.fillMaxWidth(), label = { Text("Amount (₹)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
            SelectionField("Method", method, listOf("CASH" to "Cash", "BANK_TRANSFER" to "Bank transfer", "UPI" to "UPI", "OTHER" to "Other"), { method = it })
            OutlinedTextField(reference, { reference = it.take(120) }, Modifier.fillMaxWidth(), label = { Text("Reference (optional)") }, singleLine = true)
            OutlinedTextField(reason, { reason = it.take(1000) }, Modifier.fillMaxWidth(), label = { Text("Reason (required)") }, minLines = 2)
            Button(onClick = { confirm = true }, enabled = !state.busy && amountValue > 0 && reason.trim().length >= 5 && (kind != "REFUNDED" || (amountValue * 100).toLong() <= balance), modifier = Modifier.fillMaxWidth()) { Text("Review deposit entry") }
            Text("Deposit history", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            if (data.deposits.isEmpty()) Text("No deposit transactions are recorded.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            data.deposits.forEach { entry ->
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(12.dp)) {
                    Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column {
                            Text(entry.kind, fontWeight = FontWeight.SemiBold)
                            Text("${entry.createdAt?.take(10).orEmpty()} · ${entry.paymentMethod.replace('_', ' ')}", style = MaterialTheme.typography.bodySmall)
                            Text(entry.reason, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text(money(entry.amountPaise), fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun ToolPage(title: String, description: String, error: String?, notice: String?, content: @Composable ColumnScope.() -> Unit) {
    LazyColumn(Modifier.fillMaxWidth(), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { com.aashray.hospitality.ui.PageIntro("Operations", title, description) }
        error?.let { item { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) } }
        notice?.let { item { Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(12.dp)) { Text(it, Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onPrimaryContainer) } } }
        item { Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(18.dp)) { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content) } }
    }
}
