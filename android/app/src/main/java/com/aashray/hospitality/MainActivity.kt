package com.aashray.hospitality

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.aashray.hospitality.ui.AashrayApp
import com.aashray.hospitality.ui.theme.AashrayTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val preferences = getSharedPreferences("aashray_preferences", MODE_PRIVATE)
        setContent {
            var darkTheme by remember { mutableStateOf(preferences.getBoolean("dark_theme", false)) }
            AashrayTheme(darkTheme = darkTheme) {
                AashrayApp(onToggleTheme = {
                    darkTheme = !darkTheme
                    preferences.edit().putBoolean("dark_theme", darkTheme).apply()
                })
            }
        }
    }
}
