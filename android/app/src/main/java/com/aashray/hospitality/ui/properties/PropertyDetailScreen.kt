package com.aashray.hospitality.ui.properties

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PeopleAlt
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aashray.hospitality.data.RoomDto
import com.aashray.hospitality.ui.EmptyContent
import com.aashray.hospitality.ui.ErrorContent
import com.aashray.hospitality.ui.LoadState
import com.aashray.hospitality.ui.LoadingContent
import com.aashray.hospitality.ui.MetricCard
import com.aashray.hospitality.ui.PageIntro
import com.aashray.hospitality.ui.PropertyDetailViewModel
import com.aashray.hospitality.ui.SectionTitle
import com.aashray.hospitality.ui.dateLabel
import com.aashray.hospitality.ui.money

@Composable
fun PropertyDetailScreen(
    onOpenResidents: (String) -> Unit,
    onOpenResident: (String) -> Unit,
    canAddResident: Boolean,
    canRecordPayment: Boolean,
    canGenerateRent: Boolean,
    canAddUtility: Boolean,
    canSendReminder: Boolean,
    onAddResident: (String) -> Unit,
    onRecordPayment: () -> Unit,
    onGenerateRent: () -> Unit,
    onAddUtility: () -> Unit,
    onSendReminder: () -> Unit,
    viewModel: PropertyDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LazyColumn(Modifier.fillMaxWidth(), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        when (val current = state) {
            LoadState.Loading -> item { LoadingContent() }
            is LoadState.Failed -> item { ErrorContent(current.message, viewModel::refresh) }
            is LoadState.Ready -> {
                val data = current.value
                item { PageIntro("Property overview", data.property.name, data.property.address.ifBlank { "Address not added" }) }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        MetricCard("Rooms", data.property.totalRooms.toString(), "Active and inactive", Modifier.weight(1f))
                        MetricCard("Occupancy", "${data.property.occupiedBeds} / ${data.property.totalBeds}", "${data.property.vacantBeds} beds vacant", Modifier.weight(1f))
                    }
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        MetricCard("Active residents", data.property.activeResidents.toString(), "Current assignments", Modifier.weight(1f))
                        MetricCard("Rent outstanding", money(data.property.financials.rentOutstandingPaise), "Current property balance", Modifier.weight(1f))
                    }
                }
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(18.dp)) {
                        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Current period financials", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                            PropertyAmountRow("Rent billed", money(data.property.financials.rentBilledPaise))
                            PropertyAmountRow("Rent collected", money(data.property.financials.rentCollectedPaise))
                            PropertyAmountRow("Rent outstanding", money(data.property.financials.rentOutstandingPaise))
                            PropertyAmountRow("Utilities outstanding", money(data.property.financials.utilityOutstandingPaise))
                        }
                    }
                }
                item { Button(onClick = { onOpenResidents(data.property._id) }, modifier = Modifier.fillMaxWidth()) { androidx.compose.material3.Icon(Icons.Default.PeopleAlt, contentDescription = null); Text("  View property residents (${data.residents.total})") } }
                if (canAddResident || canRecordPayment || canGenerateRent || canAddUtility || canSendReminder) {
                    item {
                        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(18.dp)) {
                            Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("Quick actions", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                listOfNotNull(
                                    if (canAddResident) "Add resident" to { onAddResident(data.property._id) } else null,
                                    if (canRecordPayment) "Record payment" to onRecordPayment else null,
                                    if (canGenerateRent) "Generate rent" to onGenerateRent else null,
                                    if (canAddUtility) "Add utility charge" to onAddUtility else null,
                                    if (canSendReminder) "Send due reminder" to onSendReminder else null,
                                ).forEach { (title, action) ->
                                    androidx.compose.material3.OutlinedButton(onClick = action, modifier = Modifier.fillMaxWidth()) { Text(title) }
                                }
                            }
                        }
                    }
                }
                item { SectionTitle("Rooms & beds", "${data.rooms.size} rooms") }
                if (data.rooms.isEmpty()) item { EmptyContent("No rooms assigned", "This property does not have any rooms in its records yet.") }
                items(data.rooms, key = { it._id }) { RoomCard(it) }
                item { SectionTitle("Current residents", "${data.residents.total} total") }
                if (data.residents.residents.isEmpty()) item { EmptyContent("No current residents", "No residents are assigned to this property.") }
                items(data.residents.residents, key = { it._id }) { resident ->
                    Card(Modifier.fillMaxWidth().clickable { onOpenResident(resident._id) }, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(16.dp)) {
                        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(resident.fullName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                Text("${resident.currentAllocation?.roomId?.roomNumber ?: "Room —"} · Bed ${resident.currentAllocation?.bedId ?: "—"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text(money(resident.outstandingPaise), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RoomCard(room: RoomDto) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(16.dp)) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Room ${room.roomNumber}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text("${if (room.roomType == "AC") "Air-conditioned" else "Non-AC"} · ${room.capacity} beds", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(20.dp)) {
                Text("${room.occupied} occupied", Modifier.padding(horizontal = 10.dp, vertical = 6.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
            }
        }
    }
}

@Composable
private fun PropertyAmountRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
    }
}
