package com.aashray.hospitality.ui.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Apartment
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Bed
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.WaterDrop
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aashray.hospitality.data.DashboardResponse
import com.aashray.hospitality.ui.DashboardViewModel
import com.aashray.hospitality.ui.EmptyContent
import com.aashray.hospitality.ui.ErrorContent
import com.aashray.hospitality.ui.LoadState
import com.aashray.hospitality.ui.LoadingContent
import com.aashray.hospitality.ui.MetricCard
import com.aashray.hospitality.ui.PageIntro
import com.aashray.hospitality.ui.SectionTitle
import com.aashray.hospitality.ui.dateLabel
import com.aashray.hospitality.ui.money

@Composable
fun DashboardScreen(
    onOpenProperties: () -> Unit,
    onOpenOperations: () -> Unit = {},
    viewModel: DashboardViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LazyColumn(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 22.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { PageIntro("Live operations", "Your workspace", "Current business metrics from your Aashray records.") }
        when (val current = state) {
            LoadState.Loading -> item { LoadingContent() }
            is LoadState.Failed -> item { ErrorContent(current.message, viewModel::refresh) }
            is LoadState.Ready -> {
                val dashboard = current.value
                item { DashboardMetrics(dashboard) }
                item { SectionTitle("Upcoming dues", "${dashboard.upcomingDues.size} shown") }
                if (dashboard.upcomingDues.isEmpty()) item { EmptyContent("No upcoming dues", "There are no unpaid charges with a future due date.") }
                else items(dashboard.upcomingDues, key = { it._id ?: "due-${it.dueAt}-${it.description}" }) { due ->
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = MaterialTheme.shapes.large) {
                        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(due.resident?.fullName ?: "Resident", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                Text(due.description.orEmpty(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text("Due ${dateLabel(due.dueAt)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text(money((due.amountPaise - due.paidPaise).coerceAtLeast(0)), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
                item { SectionTitle("Recent payments", "${dashboard.recentPayments.size} shown") }
                if (dashboard.recentPayments.isEmpty()) item { EmptyContent("No payments recorded", "Saved payments will appear here after they are recorded in the workspace.") }
                else items(dashboard.recentPayments, key = { it._id ?: "payment-${it.paymentDate}" }) { payment ->
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = MaterialTheme.shapes.large) {
                        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(payment.resident?.fullName ?: "Resident", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                Text("${dateLabel(payment.paymentDate)} · ${payment.method.orEmpty()}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text(money(payment.amountPaise), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                item { Button(onClick = onOpenProperties, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.Apartment, contentDescription = null); Text("  View properties") } }
                item { OutlinedButton(onClick = onOpenOperations, modifier = Modifier.fillMaxWidth()) { Text("Open operations tools") } }
            }
        }
    }
}

@Composable
private fun DashboardMetrics(data: DashboardResponse) {
    val metrics = data.metrics
    if (metrics == null) {
        EmptyContent("Dashboard unavailable", "The server response did not include current metrics.")
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MetricCard("Active residents", metrics.activeResidents.toString(), "Resident records", Modifier.weight(1f))
            MetricCard("Occupied beds", "${metrics.occupiedBeds} / ${metrics.totalBeds}", "${metrics.availableBeds} available", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MetricCard("Rent billed", money(metrics.rentBilledPaise), "Current period", Modifier.weight(1f))
            MetricCard("Rent collected", money(metrics.rentCollectedPaise), "Current period", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MetricCard("Outstanding rent", money(metrics.outstandingRentPaise), "Open rent balance", Modifier.weight(1f))
            MetricCard("Overdue rent", money(metrics.overdueRentPaise), "Rent past due", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MetricCard("Pending utilities", money(metrics.pendingUtilityPaise), "Unpaid utility charges", Modifier.weight(1f))
            MetricCard("Billing period", data.period?.start?.take(7) ?: "—", "Server reporting period", Modifier.weight(1f))
        }
    }
}
