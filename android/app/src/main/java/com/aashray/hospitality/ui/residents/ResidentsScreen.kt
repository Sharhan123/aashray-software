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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
    val loadingMore by viewModel.loadingMore.collectAsStateWithLifecycle()
    val loadMoreError by viewModel.loadMoreError.collectAsStateWithLifecycle()
    val reminders by viewModel.reminders.collectAsStateWithLifecycle()
    var pendingReminderId by remember { mutableStateOf<String?>(null) }
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
    LazyColumn(Modifier.fillMaxWidth(), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { PageIntro("Resident records", "Residents", "Search by name, resident ID, or mobile number.") }
        reminders.error?.let { item { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) } }
        if (canWrite) item { Button(onClick = onAddResident, modifier = Modifier.fillMaxWidth()) { Text("Add resident") } }
        item {
            OutlinedTextField(value = search, onValueChange = viewModel::setSearch, modifier = Modifier.fillMaxWidth(), label = { Text("Search residents") }, singleLine = true, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), shape = RoundedCornerShape(14.dp))
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(null to "All", "ACTIVE" to "Active", "NOTICE" to "Notice", "INACTIVE" to "Inactive").forEach { (status, label) ->
                    FilterChip(selected = selectedStatus == status, onClick = { viewModel.setStatus(status) }, label = { Text(label) })
                }
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Current month rent · ${java.time.YearMonth.now().month.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.ENGLISH)} ${java.time.YearMonth.now().year}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(null to "All rent", "PAID" to "Paid", "OVERDUE" to "Overdue").forEach { (status, label) ->
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
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ResidentStat("Room", resident.currentAllocation?.roomId?.roomNumber ?: resident.currentAllocation?.roomNumber ?: "—", Modifier.weight(1f))
                ResidentStat("Bed", resident.currentAllocation?.bedId ?: "—", Modifier.weight(1f))
                ResidentStat("Rent", money(resident.currentRentPaise), Modifier.weight(1f))
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Outstanding", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(money(resident.outstandingPaise), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
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
