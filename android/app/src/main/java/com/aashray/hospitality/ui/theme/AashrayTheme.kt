package com.aashray.hospitality.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val AashrayColors = lightColorScheme(
    primary = Color(0xFF087CB2),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD9F0FC),
    onPrimaryContainer = Color(0xFF073B58),
    secondary = Color(0xFF365E75),
    background = Color(0xFFF5F8FC),
    surface = Color.White,
    surfaceVariant = Color(0xFFEAF0F6),
    onSurface = Color(0xFF172B3A),
    onSurfaceVariant = Color(0xFF5F7180),
    error = Color(0xFFB42318),
    outline = Color(0xFFD7E1EA),
)

private val AashrayDarkColors = darkColorScheme(
    primary = Color(0xFF63C5EC),
    onPrimary = Color(0xFF003449),
    primaryContainer = Color(0xFF075273),
    onPrimaryContainer = Color(0xFFD3F1FF),
    secondary = Color(0xFFA7CCDF),
    background = Color(0xFF0D151B),
    surface = Color(0xFF14212A),
    surfaceVariant = Color(0xFF24343F),
    onSurface = Color(0xFFE3EDF3),
    onSurfaceVariant = Color(0xFFB0C0CB),
    error = Color(0xFFFFB4AB),
    outline = Color(0xFF526671),
)

@Composable
fun AashrayTheme(darkTheme: Boolean = false, content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (darkTheme) AashrayDarkColors else AashrayColors, content = content)
}
