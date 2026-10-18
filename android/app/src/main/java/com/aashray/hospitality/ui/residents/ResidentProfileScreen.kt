package com.aashray.hospitality.ui.residents

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aashray.hospitality.data.AllocationDto
import com.aashray.hospitality.ui.EmptyContent
import com.aashray.hospitality.ui.ErrorContent
import com.aashray.hospitality.ui.LoadState
import com.aashray.hospitality.ui.LoadingContent
import com.aashray.hospitality.ui.MetricCard
import com.aashray.hospitality.ui.PageIntro
import com.aashray.hospitality.ui.ResidentProfileViewModel
import com.aashray.hospitality.ui.SectionTitle
import com.aashray.hospitality.ui.dateLabel
import com.aashray.hospitality.ui.money

@Composable
fun ResidentProfileScreen(canEdit: Boolean = false, onEditResident: (String) -> Unit = {}, viewModel: ResidentProfileViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LazyColumn(Modifier.fillMaxWidth(), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        when (val current = state) {
            LoadState.Loading -> item { LoadingContent() }
            is LoadState.Failed -> item { ErrorContent(current.message, viewModel::refresh) }
            is LoadState.Ready -> {
                val profile = current.value
                val resident = profile.resident
                if (resident == null) item { EmptyContent("Resident not found", "This resident record is unavailable.") }
                else {
                    item { PageIntro("Resident record", resident.fullName, "${resident.residentId} · ${resident.status}") }
                    if (canEdit) item { Button(onClick = { onEditResident(resident._id) }, modifier = Modifier.fillMaxWidth()) { Text("Edit resident") } }
                    item {
                        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(18.dp)) {
                            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("Resident details", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                                ProfileRow("Mobile", resident.mobile)
                                if (resident.email.isNotBlank()) ProfileRow("Email", resident.email)
                                ProfileRow("Admitted", dateLabel(resident.admissionDate))
                                ProfileRow("Billing starts", dateLabel(resident.billingStartDate))
                                ProfileRow("Current room", resident.currentAllocation?.roomId?.roomNumber ?: resident.currentAllocation?.roomNumber ?: "—")
                                ProfileRow("Bed", resident.currentAllocation?.bedId ?: "—")
                                ProfileRow("Current monthly rent", money(resident.currentRentPaise))
                            }
                        }
                    }
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            MetricCard("Outstanding", money(profile.outstandingPaise), "Server balance", Modifier.weight(1f))
                            MetricCard("Overdue", money(profile.overduePaise), "Past due rent", Modifier.weight(1f))
                        }
                    }
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            MetricCard("Pending utilities", money(profile.pendingUtilityPaise), "Unpaid charges", Modifier.weight(1f))
                            MetricCard("Security deposit", money(profile.depositBalancePaise), "Ledger balance", Modifier.weight(1f))
                        }
                    }
                    item { SectionTitle("Room allocation history", "${profile.allocations.size} entries") }
                    if (profile.allocations.isEmpty()) item { EmptyContent("No allocation history", "There are no room assignments in this resident record.") }
                    items(profile.allocations) { allocation -> AllocationCard(allocation) }
                }
            }
        }
    }
}

@Composable
private fun ProfileRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun AllocationCard(allocation: AllocationDto) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(16.dp)) {
        Column(Modifier.fillMaxWidth().padding(15.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Room ${allocation.roomId?.roomNumber ?: allocation.roomNumber ?: "—"} · Bed ${allocation.bedId ?: "—"}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text("${dateLabel(allocation.startDate)} to ${allocation.endDate?.let(::dateLabel) ?: "Current"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
