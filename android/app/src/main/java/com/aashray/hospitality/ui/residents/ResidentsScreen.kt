package com.aashray.hospitality.ui.residents

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aashray.hospitality.data.ResidentDto
import com.aashray.hospitality.ui.EmptyContent
import com.aashray.hospitality.ui.ErrorContent
import com.aashray.hospitality.ui.LoadState
import com.aashray.hospitality.ui.LoadingContent
import com.aashray.hospitality.ui.PageIntro
import com.aashray.hospitality.ui.ResidentsViewModel
import com.aashray.hospitality.ui.SectionTitle
import com.aashray.hospitality.ui.money
import com.aashray.hospitality.ui.finance.SelectionField

@Composable
fun ResidentsScreen(
    onOpenResident: (String) -> Unit,
    canWrite: Boolean = false,
    canSendReminder: Boolean = false,
    onAddResident: () -> Unit = {},
    viewModel: ResidentsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val search by viewModel.search.collectAsStateWithLifecycle()
    val selectedStatus by viewModel.status.collectAsStateWithLifecycle()
    val selectedRentStatus by viewModel.rentPaymentStatus.collectAsStateWithLifecycle()
    val properties by viewModel.properties.collectAsStateWithLifecycle()
    val rooms by viewModel.rooms.collectAsStateWithLifecycle()
    val selectedProperty by viewModel.selectedPropertyId.collectAsStateWithLifecycle()
    val selectedRoom by viewModel.selectedRoomId.collectAsStateWithLifecycle()
    val selectedRoomType by viewModel.roomType.collectAsStateWithLifecycle()
    val selectedOutstanding by viewModel.outstanding.collectAsStateWithLifecycle()
    val selectedSort by viewModel.sort.collectAsStateWithLifecycle()
    val selectedDirection by viewModel.direction.collectAsStateWithLifecycle()
    val statusCounts by viewModel.statusCounts.collectAsStateWithLifecycle()
    val importState by viewModel.importState.collectAsStateWithLifecycle()
    val loadingMore by viewModel.loadingMore.collectAsStateWithLifecycle()
    val loadMoreError by viewModel.loadMoreError.collectAsStateWithLifecycle()
    val reminders by viewModel.reminders.collectAsStateWithLifecycle()
    var pendingReminderId by remember { mutableStateOf<String?>(null) }
    var showImport by remember { mutableStateOf(false) }
    val reminderLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        pendingReminderId?.let(viewModel::markReminderOpened)
        pendingReminderId = null
    }
    LaunchedEffect(reminders.prepared) {
        val prepared = reminders.prepared ?: return@LaunchedEffect
        val messageId = prepared.message?._id
        val uri = runCatching { Uri.parse(prepared.whatsappUrl) }.getOrNull()
        if (messageId.isNullOrBlank() || uri?.scheme != "https" || uri.host != "wa.me") {
            viewModel.failReminderLaunch("The server did not return a valid WhatsApp reminder link.")
        } else {
            pendingReminderId = messageId
            runCatching { reminderLauncher.launch(Intent(Intent.ACTION_VIEW, uri)) }
                .onFailure {
                    pendingReminderId = null
                    viewModel.failReminderLaunch("Could not open WhatsApp. Check that WhatsApp or a browser is available.")
                }
        }
        viewModel.consumePreparedReminder()
    }
    if (showImport && canWrite) ResidentImportDialog(
        state = importState,
        onDismiss = { if (!importState.busy) { showImport = false; viewModel.clearImport() } },
        onPreview = viewModel::previewImport,
        onCommit = viewModel::commitImport,
        onReset = viewModel::clearImport,
        onImported = { viewModel.refresh(); viewModel.clearImport(); showImport = false },
    )
    LazyColumn(Modifier.fillMaxWidth(), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { PageIntro("Resident records", "Residents", "Search by name, resident ID, or mobile number.") }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ResidentStatusCard("Active", statusCounts.active, selectedStatus == "ACTIVE", Modifier.weight(1f)) { viewModel.setStatus("ACTIVE") }
                ResidentStatusCard("Notice", statusCounts.notice, selectedStatus == "NOTICE", Modifier.weight(1f)) { viewModel.setStatus("NOTICE") }
                ResidentStatusCard("Checked out", statusCounts.checkedOut, selectedStatus == "INACTIVE", Modifier.weight(1f)) { viewModel.setStatus("INACTIVE") }
            }
        }
        reminders.error?.let { item { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) } }
        if (canWrite) item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                androidx.compose.material3.OutlinedButton(onClick = { viewModel.clearImport(); showImport = true }, modifier = Modifier.weight(1f)) { Text("Import CSV", maxLines = 1) }
                Button(onClick = onAddResident, modifier = Modifier.weight(1f)) { Text("Add resident", maxLines = 1) }
            }
        }
        item {
            OutlinedTextField(value = search, onValueChange = viewModel::setSearch, modifier = Modifier.fillMaxWidth(), label = { Text("Search residents") }, singleLine = true, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), shape = RoundedCornerShape(14.dp))
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (properties.size > 1) SelectionField("Property", selectedProperty, listOf("" to "All properties") + properties.map { it._id to it.name }, viewModel::setProperty, "All properties")
                if (rooms.isNotEmpty()) SelectionField("Room", selectedRoom, listOf("" to "All rooms") + rooms.map { it._id to "${it.propertyName ?: "Property"} · Room ${it.roomNumber} · ${it.roomType.replace('_', ' ')}" }, viewModel::setRoom, "All rooms")
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("" to "All room types", "AC" to "AC", "NON_AC" to "Non-AC").forEach { (type, label) ->
                        FilterChip(selected = selectedRoomType == type, onClick = { viewModel.setRoomType(type) }, label = { Text(label) })
                    }
                }
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("" to "Any balance", "true" to "Has outstanding", "false" to "No outstanding").forEach { (value, label) ->
                        FilterChip(selected = selectedOutstanding == value, onClick = { viewModel.setOutstanding(value) }, label = { Text(label) })
                    }
                }
                SelectionField("Sort residents", selectedSort, listOf("createdAt" to "Recently added", "name" to "Name", "admissionDate" to "Admission date", "residentId" to "Resident ID"), viewModel::setSort)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    FilterChip(selected = selectedDirection == "asc", onClick = { viewModel.setDirection(if (selectedDirection == "asc") "desc" else "asc") }, label = { Text(if (selectedDirection == "asc") "A–Z / oldest" else "Z–A / newest") })
                    androidx.compose.material3.OutlinedButton(onClick = viewModel::clearFilters) { Text("Clear filters") }
                }
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Current month rent · ${java.time.YearMonth.now().month.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.ENGLISH)} ${java.time.YearMonth.now().year}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(null to "All rent", "PAID" to "Paid", "DUE_GRACE" to "Due in grace", "OVERDUE" to "Overdue").forEach { (status, label) ->
                        FilterChip(selected = selectedRentStatus == status, onClick = { viewModel.setRentPaymentStatus(status) }, label = { Text(label) })
                    }
                }
            }
        }
        when (val current = state) {
            LoadState.Loading -> item { LoadingContent() }
            is LoadState.Failed -> item { ErrorContent(current.message, viewModel::refresh) }
            is LoadState.Ready -> {
                item { SectionTitle("Resident list", "${current.value.total} records") }
                if (current.value.residents.isEmpty()) item { EmptyContent("No matching residents", "Try a different search or status filter. The server returned no matching resident records.") }
                items(current.value.residents, key = { it._id }) { resident ->
                    ResidentCard(
                        resident = resident,
                        onClick = { onOpenResident(resident._id) },
                        canSendReminder = canSendReminder && resident.outstandingPaise > 0,
                        reminderBusy = reminders.busyResidentId == resident._id,
                        onRentReminder = { viewModel.prepareReminder(resident._id, "OVERDUE") },
                        onUtilityReminder = { viewModel.prepareReminder(resident._id, "UTILITY") },
                    )
                }
                if (current.value.residents.size < current.value.total) {
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (!loadMoreError.isNullOrBlank()) Text(loadMoreError.orEmpty(), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                            androidx.compose.material3.OutlinedButton(onClick = viewModel::loadMore, modifier = Modifier.fillMaxWidth(), enabled = !loadingMore) {
                                if (loadingMore) androidx.compose.material3.CircularProgressIndicator(Modifier.padding(end = 10.dp), strokeWidth = 2.dp)
                                Text(if (loadingMore) "Loading…" else "Load more residents")
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ResidentImportDialog(
    state: com.aashray.hospitality.ui.ResidentImportState,
    onDismiss: () -> Unit,
    onPreview: (String) -> Unit,
    onCommit: () -> Unit,
    onReset: () -> Unit,
    onImported: () -> Unit,
) {
    val context = LocalContext.current
    var csv by remember { mutableStateOf(state.csv) }
    val template = "fullName,gender,mobile,email,emergencyContact,governmentId,admissionDate,billingStartDate,roomNumber,bedId,monthlyRent,dueDay,securityDeposit,depositPaid,depositMethod,notes\r\nExample Resident,MALE,+919876543210,,,,2026-10-01,2026-10-01,101,1,8500,5,10000,0,CASH,"
    val openCsv = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        runCatching { context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() } }
            .onSuccess { content -> csv = content.orEmpty() }
            .onFailure { csv = "" }
    }
    val createTemplate = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        if (uri != null) runCatching { context.contentResolver.openOutputStream(uri)?.bufferedWriter()?.use { it.write(template) } }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
        title = { Text("Import residents") },
        text = {
            Column(Modifier.fillMaxWidth().heightIn(max = 620.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Choose a CSV or paste its contents. Preview checks every row before any resident or charge is created.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    androidx.compose.material3.OutlinedButton(onClick = { createTemplate.launch("aashray-resident-import-template.csv") }, modifier = Modifier.weight(1f)) { Text("Download template") }
                    androidx.compose.material3.OutlinedButton(onClick = { openCsv.launch(arrayOf("text/*", "application/csv", "application/vnd.ms-excel")) }, modifier = Modifier.weight(1f)) { Text("Choose CSV") }
                }
                OutlinedTextField(csv, { csv = it; onReset() }, Modifier.fillMaxWidth(), label = { Text("CSV contents") }, minLines = 5, maxLines = 8)
                if (state.error != null) Text(state.error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                state.result?.let { result ->
                    Text("Import complete · ${result.inserted} added · ${result.skipped} skipped · ${result.failed} failed", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                    result.errors.take(10).forEach { Text("Row ${it.row}: ${it.message}", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
                }
                state.preview?.let { preview ->
                    Text("${preview.validCount} valid · ${preview.errorCount} row errors", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    preview.rows.take(20).forEach { row ->
                        Text("Row ${row.row} · ${row.fullName} · ${row.mobile} · ${row.roomId}/${row.bedId} · ${money((row.monthlyRent * 100).toLong())}", style = MaterialTheme.typography.bodySmall)
                    }
                    preview.errors.take(20).forEach { error -> Text("Row ${error.row}: ${error.message}", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
                    if (preview.rows.size > 20 || preview.errors.size > 20) Text("Showing the first 20 valid rows and errors.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        },
        confirmButton = {
            when {
                state.result != null -> Button(onClick = onImported) { Text("Done") }
                state.preview != null -> Button(onClick = onCommit, enabled = !state.busy && state.preview.validCount > 0) { Text("Import ${state.preview.validCount} rows") }
                else -> Button(onClick = { onPreview(csv) }, enabled = !state.busy && csv.isNotBlank()) {
                    if (state.busy) androidx.compose.material3.CircularProgressIndicator(Modifier.padding(end = 8.dp), strokeWidth = 2.dp)
                    Text("Preview CSV")
                }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !state.busy) { Text("Close") } },
    )
}

@Composable
private fun ResidentStatusCard(label: String, count: Int, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Card(
        modifier = modifier.clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = if (selected) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(14.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            Text(count.toString(), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun ResidentCard(
    resident: ResidentDto,
    onClick: () -> Unit,
    canSendReminder: Boolean,
    reminderBusy: Boolean,
    onRentReminder: () -> Unit,
    onUtilityReminder: () -> Unit,
) {
    Card(Modifier.fillMaxWidth().clickable(onClick = onClick), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(18.dp), elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(resident.fullName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(resident.residentId, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                }
                val statusColor = when (resident.status) {
                    "ACTIVE" -> MaterialTheme.colorScheme.primaryContainer
                    "NOTICE" -> MaterialTheme.colorScheme.tertiaryContainer
                    else -> MaterialTheme.colorScheme.surfaceVariant
                }
                Surface(color = statusColor, shape = RoundedCornerShape(20.dp)) {
                    Text(resident.status, Modifier.padding(horizontal = 10.dp, vertical = 6.dp), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                }
            }
            Text(resident.mobile, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (resident.gender.isNotBlank()) Text("${resident.gender.lowercase().replaceFirstChar { it.uppercase() }} resident", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ResidentStat("Room", resident.currentAllocation?.roomId?.roomNumber ?: resident.currentAllocation?.roomNumber ?: "—", Modifier.weight(1f))
                ResidentStat("Bed", resident.currentAllocation?.bedId ?: "—", Modifier.weight(1f))
                ResidentStat("Rent", money(resident.currentRentPaise), Modifier.weight(1f))
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Outstanding", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(money(resident.outstandingPaise), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
            }
            resident.rentSummary?.let { rent ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Surface(color = when (rent.status) { "OVERDUE" -> MaterialTheme.colorScheme.errorContainer; "DUE_GRACE" -> MaterialTheme.colorScheme.tertiaryContainer; else -> MaterialTheme.colorScheme.primaryContainer }, shape = RoundedCornerShape(18.dp)) {
                        Text(rent.status.replace('_', ' '), Modifier.padding(horizontal = 10.dp, vertical = 6.dp), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    }
                    Text("Due ${rent.dueAt?.take(10) ?: "—"}${if (rent.daysPastDue > 0) " · ${rent.daysPastDue}d past due" else ""}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (canSendReminder) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    androidx.compose.material3.OutlinedButton(onClick = onRentReminder, modifier = Modifier.weight(1f), enabled = !reminderBusy) {
                        Text(if (reminderBusy) "Preparing…" else "Rent overdue")
                    }
                    androidx.compose.material3.OutlinedButton(onClick = onUtilityReminder, modifier = Modifier.weight(1f), enabled = !reminderBusy) {
                        Text("Bill overdue")
                    }
                }
            }
        }
    }
}

@Composable
private fun ResidentStat(label: String, value: String, modifier: Modifier = Modifier) {
    Surface(modifier, color = MaterialTheme.colorScheme.background, shape = RoundedCornerShape(12.dp)) {
        Column(Modifier.padding(10.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        }
    }
}
