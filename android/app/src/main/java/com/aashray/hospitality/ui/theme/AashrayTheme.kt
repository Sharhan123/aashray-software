package com.aashray.hospitality.ui.theme

import androidx.compose.material3.MaterialTheme
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

@Composable
fun AashrayTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = AashrayColors, content = content)
}
