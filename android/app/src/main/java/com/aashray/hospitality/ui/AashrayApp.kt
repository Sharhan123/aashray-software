package com.aashray.hospitality.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Apartment
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.PeopleAlt
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.RequestQuote
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.aashray.hospitality.R
import com.aashray.hospitality.data.UserDto
import com.aashray.hospitality.ui.auth.LoginScreen
import com.aashray.hospitality.ui.dashboard.DashboardScreen
import com.aashray.hospitality.ui.properties.PropertiesScreen
import com.aashray.hospitality.ui.properties.PropertyDetailScreen
import com.aashray.hospitality.ui.residents.ResidentProfileScreen
import com.aashray.hospitality.ui.residents.ResidentsScreen
import com.aashray.hospitality.ui.residents.ResidentFormScreen
import com.aashray.hospitality.ui.finance.RentBillingScreen
import com.aashray.hospitality.ui.finance.PaymentsScreen
import com.aashray.hospitality.ui.finance.ReceiptScreen
import com.aashray.hospitality.ui.operations.DepositsScreen
import com.aashray.hospitality.ui.operations.OperationsHomeScreen
import com.aashray.hospitality.ui.operations.ReportsScreen
import com.aashray.hospitality.ui.operations.RemindersScreen
import com.aashray.hospitality.ui.operations.SettingsScreen
import com.aashray.hospitality.ui.operations.UtilitiesScreen
import com.aashray.hospitality.ui.operations.toolLinks

private data class MainTab(val route: String, val title: String, val icon: androidx.compose.ui.graphics.vector.ImageVector, val permission: String)
private val mainTabs = listOf(
    MainTab("dashboard", "Home", Icons.Default.Dashboard, "dashboard:read"),
    MainTab("properties", "Properties", Icons.Default.Apartment, "rooms:read"),
    MainTab("residents", "Residents", Icons.Default.PeopleAlt, "residents:read"),
    MainTab("billing", "Rent", Icons.Default.RequestQuote, "billing:write"),
    MainTab("payments", "Payments", Icons.Default.Payments, "payments:write"),
)

@Composable
fun AashrayApp(sessionViewModel: SessionViewModel = hiltViewModel()) {
    val session by sessionViewModel.state.collectAsStateWithLifecycle()
    when (val state = session) {
        SessionState.Loading -> FullScreenLoading("Connecting to Aashray")
        SessionState.SigningIn -> LoginScreen(isSigningIn = true, message = null, onSignIn = sessionViewModel::login)
        is SessionState.SignedOut -> LoginScreen(isSigningIn = false, message = state.message, onSignIn = sessionViewModel::login)
        is SessionState.SignedIn -> AuthenticatedShell(state.user, sessionViewModel::logout)
    }
}

@Composable
private fun AuthenticatedShell(user: UserDto, onLogout: () -> Unit) {
    val navController = rememberNavController()
    val start = when {
        user.can("dashboard:read") -> "dashboard"
        user.can("rooms:read") -> "properties"
        user.can("residents:read") -> "residents"
        user.can("billing:write") -> "billing"
        user.can("payments:write") -> "payments"
        toolLinks.any { link -> link.permissions.all(user::can) } -> "operations"
        else -> "no-access"
    }
    val tabs = mainTabs.filter { user.can(it.permission) }
    val backStack by navController.currentBackStackEntryAsState()
    val destination = backStack?.destination
    val activeTab = tabs.firstOrNull { tab -> destination?.route?.startsWith(tab.route) == true }
    val showBottomBar = activeTab != null

    Scaffold(
        topBar = { WorkspaceTopBar(user = user, onLogout = onLogout) },
        bottomBar = {
            if (showBottomBar && tabs.isNotEmpty()) {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                    tabs.forEach { tab ->
                        val selected = activeTab?.route == tab.route
                        NavigationBarItem(
                            selected = selected,
                            onClick = { navController.navigate(tab.route) { popUpTo(navController.graph.findStartDestination().id) { saveState = true }; launchSingleTop = true; restoreState = true } },
                            icon = { Icon(tab.icon, contentDescription = null) },
                            label = { Text(tab.title) },
                        )
                    }
                }
            }
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        NavHost(navController = navController, startDestination = start, modifier = Modifier.padding(padding)) {
            composable("dashboard") { DashboardScreen(onOpenProperties = { navController.navigate("properties") }, onOpenOperations = { navController.navigate("operations") }) }
            composable("properties") { PropertiesScreen(onOpenProperty = { navController.navigate("property/$it") }, canCreateProperty = user.role == "SUPER_ADMIN") }
            composable("residents?propertyId={propertyId}", arguments = listOf(navArgument("propertyId") { type = NavType.StringType; nullable = true; defaultValue = null })) {
                ResidentsScreen(
                    onOpenResident = { navController.navigate("resident/$it") },
                    canWrite = user.can("residents:write"),
                    canSendReminder = user.can("messages:send"),
                    onAddResident = { navController.navigate("resident-create") },
                )
            }
            composable("property/{propertyId}", arguments = listOf(navArgument("propertyId") { type = NavType.StringType })) {
                PropertyDetailScreen(
                    onOpenResidents = { navController.navigate("residents?propertyId=$it") },
                    onOpenResident = { navController.navigate("resident/$it") },
                    canAddResident = user.can("residents:write"),
                    canRecordPayment = user.can("payments:write"),
                    canGenerateRent = user.can("billing:write"),
                    canAddUtility = user.can("utilities:write") && user.can("residents:read"),
                    canSendReminder = user.can("messages:send") && user.can("residents:read"),
                    onAddResident = { navController.navigate("resident-create") },
                    onRecordPayment = { navController.navigate("payments") },
                    onGenerateRent = { navController.navigate("billing") },
                    onAddUtility = { navController.navigate("utilities") },
                    onSendReminder = { navController.navigate("reminders") },
                )
            }
            composable("resident/{residentId}", arguments = listOf(navArgument("residentId") { type = NavType.StringType })) {
                ResidentProfileScreen(canEdit = user.can("residents:write"), onEditResident = { navController.navigate("resident-edit/$it") })
            }
            composable("resident-create") {
                ResidentFormScreen(
                    onSaved = { id -> navController.navigate("resident/$id") { popUpTo("resident-create") { inclusive = true } } },
                    onCancel = { navController.popBackStack() },
                )
            }
            composable("resident-edit/{residentId}", arguments = listOf(navArgument("residentId") { type = NavType.StringType })) { ResidentFormScreen(onSaved = { navController.popBackStack() }, onCancel = { navController.popBackStack() }) }
            composable("billing") { RentBillingScreen() }
            composable("payments") { PaymentsScreen(onOpenReceipt = { navController.navigate("receipt/$it") }) }
            composable("receipt/{paymentId}", arguments = listOf(navArgument("paymentId") { type = NavType.StringType })) {
                ReceiptScreen()
            }
            composable("operations") { OperationsHomeScreen(user, onOpen = { navController.navigate(it) }) }
            composable("utilities") { UtilitiesScreen() }
            composable("reminders") { RemindersScreen() }
            composable("deposits") { DepositsScreen() }
            composable("reports") { ReportsScreen() }
            composable("settings") { SettingsScreen(canEdit = user.can("settings:write")) }
            composable("no-access") { EmptyMessage("No modules assigned", "Ask your Aashray administrator to grant access to the workspace modules you need.") }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WorkspaceTopBar(user: UserDto, onLogout: () -> Unit) {
    TopAppBar(
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Image(painterResource(R.drawable.aashray_original), contentDescription = "Aashray Group", contentScale = ContentScale.Crop, modifier = Modifier.width(112.dp).height(38.dp))
                Spacer(Modifier.width(10.dp))
                Column {
                    Text("Hospitality", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                    Text(user.name, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        },
        actions = {
            IconButton(onClick = onLogout) { Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "Sign out") }
        },
        colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface),
    )
}

@Composable
fun FullScreenLoading(message: String) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
            CircularProgressIndicator()
            Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun EmptyMessage(title: String, message: String) {
    Box(Modifier.fillMaxSize().padding(28.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
