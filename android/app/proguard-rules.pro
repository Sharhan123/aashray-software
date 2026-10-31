# Gson serializes these backend DTOs by reflection; retain field names and constructors.
-keep class com.aashray.hospitality.data.** { *; }
-keepclassmembers class com.aashray.hospitality.ui.WebWorkspaceBridge { @android.webkit.JavascriptInterface <methods>; }
