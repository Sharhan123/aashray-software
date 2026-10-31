package com.aashray.hospitality.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Apartment
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Bed
import androidx.compose.material.icons.filled.ElectricBolt
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Wallet
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aashray.hospitality.data.DashboardMetricsDto
import com.aashray.hospitality.data.DashboardResponse
import com.aashray.hospitality.data.PropertyDto
import com.aashray.hospitality.ui.DashboardViewModel
import com.aashray.hospitality.ui.PropertiesViewModel
import com.aashray.hospitality.ui.EmptyContent
import com.aashray.hospitality.ui.ErrorContent
import com.aashray.hospitality.ui.LoadState
import com.aashray.hospitality.ui.LoadingContent
import com.aashray.hospitality.ui.SectionTitle
import com.aashray.hospitality.ui.dateLabel
import com.aashray.hospitality.ui.money

@Composable
fun DashboardScreen(
    onOpenProperties: () -> Unit,
    onOpenProperty: (String) -> Unit = {},
    onOpenOperations: () -> Unit = {},
    onOpenResident: (String) -> Unit = {},
    onOpenResidents: () -> Unit = {},
    onOpenRentResidents: (String) -> Unit = {},
    onOpenPayments: () -> Unit = {},
    onOpenUtilities: () -> Unit = {},
    onOpenReports: (String) -> Unit = {},
    canRecordPayment: Boolean = false,
    canAddUtility: Boolean = false,
    viewModel: DashboardViewModel = hiltViewModel(),
    propertiesViewModel: PropertiesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val propertiesState by propertiesViewModel.state.collectAsStateWithLifecycle()
    var propertyGender by remember { mutableStateOf("ALL") }
    LazyColumn(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        when (val current = state) {
            LoadState.Loading -> item { LoadingContent() }
            is LoadState.Failed -> item { ErrorContent(current.message, viewModel::refresh) }
            is LoadState.Ready -> {
                val dashboard = current.value
                val metrics = dashboard.metrics
                item { WelcomeCard(dashboard) }
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (canRecordPayment) Button(onClick = onOpenPayments, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.Payments, null, Modifier.size(18.dp)); Text("  Record payment") }
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = { onOpenRentResidents("DUE_GRACE") }, modifier = Modifier.weight(1f)) { Text("Review follow-up", maxLines = 1) }
                            if (canAddUtility) OutlinedButton(onClick = onOpenUtilities, modifier = Modifier.weight(1f)) { Icon(Icons.Default.ElectricBolt, null, Modifier.size(18.dp)); Text(" Utility bill", maxLines = 1) }
                        }
                    }
                }
                metrics?.let { summary -> item { RentSummaryCard(dashboard, summary, true, onOpenReports) } }
                metrics?.let { summary -> item { PortfolioMetrics(summary, true, onOpenResidents, onOpenRentResidents, onOpenProperties, onOpenOperations) } }
                if (propertiesState is LoadState.Ready) {
                    val properties = (propertiesState as LoadState.Ready).value.properties.filter { it.active }
                    val male = properties.filter { it.gender == "MALE" }
                    val female = properties.filter { it.gender == "FEMALE" }
                    item { AccommodationOverview(male, female, onOpenProperties) }
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            SectionTitle("Homes at a glance", "Current occupancy and collections")
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                listOf("ALL", "MALE", "FEMALE").forEach { gender ->
                                    androidx.compose.material3.FilterChip(selected = propertyGender == gender, onClick = { propertyGender = gender }, label = { Text(when (gender) { "MALE" -> "Male"; "FEMALE" -> "Female"; else -> "All" }) })
                                }
                            }
                            val shown = properties.filter { propertyGender == "ALL" || it.gender == propertyGender }.take(4)
                            if (shown.isEmpty()) EmptyContent("No properties in this view", "Choose another accommodation filter or add a property.")
                            shown.forEach { property ->
                                Card(Modifier.fillMaxWidth().clickable { onOpenProperty(property._id) }, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(16.dp)) {
                                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                            Text(property.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                                            Text(if (property.gender == "FEMALE") "FEMALE" else "MALE", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                                        }
                                        Text("${property.activeResidents} residents · ${property.occupiedBeds}/${property.totalBeds} beds occupied", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        LinearProgressIndicator({ if (property.totalBeds == 0) 0f else property.occupiedBeds.toFloat() / property.totalBeds }, Modifier.fillMaxWidth().height(6.dp).clip(CircleShape))
                                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                            Text("Collected ${money(property.financials.rentCollectedPaise)}", style = MaterialTheme.typography.labelSmall)
                                            Text("Overdue ${money(property.financials.overdueRentPaise)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                                        }
                                    }
                                }
                            }
                            OutlinedButton(onClick = onOpenProperties, modifier = Modifier.fillMaxWidth()) { Text("View all properties") }
                        }
                    }
                }
                item { SectionTitle("Due and follow-up", "${dashboard.upcomingDues.size} to review") }
                if (dashboard.upcomingDues.isEmpty()) item { EmptyContent("No upcoming dues", "There are no unpaid charges with a future due date.") }
                else items(dashboard.upcomingDues, key = { it._id ?: "due-${it.dueAt}-${it.description}" }) { due ->
                    Card(
                        modifier = Modifier.fillMaxWidth().clickable(enabled = !due.resident?.id.isNullOrBlank()) { due.resident?.id?.let(onOpenResident) },
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        shape = RoundedCornerShape(18.dp),
                    ) {
                        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.ReceiptLong, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Text(due.resident?.fullName ?: "Resident", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                Text(due.description.orEmpty(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text("Due ${dateLabel(due.dueAt)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text(money((due.amountPaise - due.paidPaise).coerceAtLeast(0)), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
                item { SectionTitle("Recent payments", "${dashboard.recentPayments.size} latest") }
                if (dashboard.recentPayments.isEmpty()) item { EmptyContent("No payments recorded", "Saved payments will appear here after they are recorded in the workspace.") }
                else items(dashboard.recentPayments, key = { it._id ?: "payment-${it.paymentDate}" }) { payment ->
                    Card(
                        modifier = Modifier.fillMaxWidth().clickable(enabled = !payment.resident?.id.isNullOrBlank()) { payment.resident?.id?.let(onOpenResident) },
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        shape = RoundedCornerShape(18.dp),
                    ) {
                        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(payment.resident?.fullName ?: "Resident", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                Text("${dateLabel(payment.paymentDate)} · ${payment.method.orEmpty()}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text(money(payment.amountPaise), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                item {
                    OutlinedButton(onClick = onOpenProperties, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Default.Apartment, contentDescription = null)
                        Text("  View properties")
                        Spacer(Modifier.weight(1f))
                        Icon(Icons.Default.ArrowForward, contentDescription = null)
                    }
                }
                item { OutlinedButton(onClick = onOpenOperations, modifier = Modifier.fillMaxWidth()) { Text("More workspace tools") } }
            }
        }
    }
}

@Composable
private fun WelcomeCard(data: DashboardResponse) {
    val periodLabel = data.period?.let { period ->
        val start = dateLabel(period.start)
        val end = dateLabel(period.end)
        if (start == "—" || end == "—") "Current reporting period" else "$start – $end"
    } ?: "Current reporting period"
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(26.dp),
    ) {
        Column(
            Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(MaterialTheme.colorScheme.primary.copy(alpha = .10f), MaterialTheme.colorScheme.secondary.copy(alpha = .05f), MaterialTheme.colorScheme.surface))).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                Surface(color = MaterialTheme.colorScheme.primary.copy(alpha = .14f), shape = CircleShape) {
                    Spacer(Modifier.size(10.dp).padding(2.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary))
                }
                Text("LIVE OPERATIONS", style = MaterialTheme.typography.labelMedium, letterSpacing = MaterialTheme.typography.labelMedium.letterSpacing, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                Surface(color = MaterialTheme.colorScheme.surface.copy(alpha = .8f), shape = RoundedCornerShape(20.dp)) {
                    Text(periodLabel, Modifier.padding(horizontal = 10.dp, vertical = 7.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Your homes,", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurface)
                Text("in good order.", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.primary)
                Text("A clear view of the people, places and payments that keep things moving.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun AccommodationOverview(male: List<PropertyDto>, female: List<PropertyDto>, onOpenProperties: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionTitle("Accommodation overview", "Occupancy follows each property's assigned gender")
        listOf("Male residents" to male, "Female residents" to female).forEach { (title, group) ->
            val residents = group.sumOf { it.activeResidents }
            val occupied = group.sumOf { it.occupiedBeds }
            val beds = group.sumOf { it.totalBeds }
            val vacant = group.sumOf { it.vacantBeds }
            val progress = if (beds == 0) 0f else occupied.toFloat() / beds
            Card(Modifier.fillMaxWidth().clickable(onClick = onOpenProperties), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(18.dp)) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Column {
                            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                            Text("${group.size} active ${if (group.size == 1) "property" else "properties"} · ${group.sumOf { it.totalRooms }} rooms", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text("$residents residents", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                    }
                    LinearProgressIndicator(progress, Modifier.fillMaxWidth().height(7.dp).clip(CircleShape))
                    Text("$occupied / $beds beds occupied · $vacant vacant · ${(progress * 100).toInt()}% occupancy", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun RentSummaryCard(data: DashboardResponse, metrics: DashboardMetricsDto, amountsVisible: Boolean, onOpenReports: (String) -> Unit) {
    val billed = metrics.rentBilledPaise.coerceAtLeast(0)
    val collected = metrics.rentCollectedPaise.coerceAtLeast(0)
    val outstanding = metrics.outstandingRentPaise.coerceAtLeast(0)
    val percentage = if (billed == 0L) 0f else (collected.toFloat() / billed).coerceIn(0f, 1f)
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = .42f)),
        shape = RoundedCornerShape(24.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("RENT SUMMARY · ${data.period?.start?.take(7) ?: "CURRENT"}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                Text("Reports →", modifier = Modifier.clickable { onOpenReports("rent") }, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
            }
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(if (amountsVisible) money(collected) else "••••••", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.ExtraBold, maxLines = 1, softWrap = false)
                Text("collected this month", modifier = Modifier.padding(bottom = 3.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                SummaryAmount("Rent billed", billed, amountsVisible) { onOpenReports("rent") }
                SummaryAmount("Rent collected", collected, amountsVisible) { onOpenReports("collections") }
                SummaryAmount("Outstanding this month", outstanding, amountsVisible) { onOpenReports("outstanding") }
            }
            LinearProgressIndicator(progress = { percentage }, modifier = Modifier.fillMaxWidth().height(8.dp).clip(CircleShape), color = MaterialTheme.colorScheme.primary, trackColor = MaterialTheme.colorScheme.surfaceVariant)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("${(percentage * 100).toInt()}% collected", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
                Text(if (amountsVisible) "${money(outstanding)} remains" else "•••• remains", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun SummaryAmount(label: String, value: Long, visible: Boolean, onClick: () -> Unit) {
    Surface(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick), color = MaterialTheme.colorScheme.surface.copy(alpha = .82f), shape = RoundedCornerShape(15.dp)) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(if (visible) money(value) else "••••••", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1, softWrap = false)
        }
    }
}

@Composable
private fun PortfolioMetrics(metrics: DashboardMetricsDto, visible: Boolean, onResidents: () -> Unit, onRentResidents: (String) -> Unit, onProperties: () -> Unit, onOperations: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionTitle("At a glance", "Across your properties")
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PortfolioMetric(Icons.Default.Groups, "Active residents", metrics.activeResidents.toString(), "Across all properties", Modifier.weight(1f), onResidents)
            PortfolioMetric(Icons.Default.Bed, "Total beds", metrics.totalBeds.toString(), "${metrics.occupiedBeds} occupied · ${metrics.availableBeds} vacant", Modifier.weight(1f), onProperties)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PortfolioMetric(Icons.Default.Wallet, "Rent outstanding", if (visible) money(metrics.outstandingRentPaise) else "••••", "Across rent charges", Modifier.weight(1f), { onRentResidents("DUE_GRACE") })
            PortfolioMetric(Icons.Default.Groups, "Overdue residents", metrics.overdueRentResidentCount.toString(), "${if (visible) money(metrics.overdueRentPaise) else "••••"} after grace", Modifier.weight(1f), { onRentResidents("OVERDUE") })
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PortfolioMetric(Icons.Default.Payments, "Due in grace", metrics.dueGraceRentResidentCount.toString(), "${if (visible) money(metrics.dueGraceRentPaise) else "••••"} due", Modifier.weight(1f), { onRentResidents("DUE_GRACE") })
            PortfolioMetric(Icons.Default.ReceiptLong, "Utilities due", if (visible) money(metrics.pendingUtilityPaise) else "••••", "Unpaid bills", Modifier.weight(1f), onOperations)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PortfolioMetric(Icons.Default.Wallet, "Security deposits", if (visible) money(metrics.securityDepositsHeldPaise) else "••••", "Net of refunds and offsets", Modifier.weight(1f), onOperations)
            Spacer(Modifier.weight(1f))
        }
    }
}

@Composable
private fun PortfolioMetric(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String,
    detail: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Card(modifier = modifier.clickable(onClick = onClick), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(18.dp)) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(21.dp))
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, minLines = 2)
            Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1, softWrap = false)
            Text(detail, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, minLines = 2, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}
