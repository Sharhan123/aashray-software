package com.aashray.hospitality.ui

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.app.Activity
import android.content.Intent
import android.content.ContentValues
import android.net.Uri
import android.os.Environment
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.graphics.Color as AndroidColor
import android.webkit.JavascriptInterface
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.print.PrintAttributes
import android.print.PrintManager
import android.widget.Toast
import androidx.core.content.FileProvider
import androidx.core.view.WindowInsetsControllerCompat
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.clickable
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.aashray.hospitality.BuildConfig
import java.io.File
import java.io.FileOutputStream
import java.util.Base64
import android.provider.MediaStore

/** Loads the responsive production workspace so Android and web share one UI and one source of truth. */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebWorkspace() {
    val context = LocalContext.current
    var progress by remember { mutableIntStateOf(0) }
    var failed by remember { mutableStateOf(false) }
    var canNavigateBack by remember { mutableStateOf(false) }
    var reloadKey by remember { mutableIntStateOf(0) }
    var pendingFileChooser by remember { mutableStateOf<android.webkit.ValueCallback<Array<Uri>>?>(null) }
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { selected ->
        pendingFileChooser?.onReceiveValue(if (selected == null) null else arrayOf(selected))
        pendingFileChooser = null
    }
    val webView = remember {
        WebView(context).apply {
            CookieManager.getInstance().setAcceptCookie(true)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.javaScriptCanOpenWindowsAutomatically = true
            settings.setSupportMultipleWindows(false)
            settings.allowFileAccess = false
            settings.allowContentAccess = true
            settings.mediaPlaybackRequiresUserGesture = true
            settings.safeBrowsingEnabled = true
            addJavascriptInterface(WebWorkspaceBridge(
                context,
                { this },
                { canNavigateBack = this.canGoBack() },
                { dark -> applySystemTheme(context, dark) },
            ), "AashrayAndroid")
            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView?, newProgress: Int) { progress = newProgress }
                override fun onShowFileChooser(view: WebView?, callback: android.webkit.ValueCallback<Array<Uri>>?, params: FileChooserParams?): Boolean {
                    pendingFileChooser?.onReceiveValue(null)
                    pendingFileChooser = callback
                    val acceptedTypes = params?.acceptTypes.orEmpty()
                        .map(String::trim)
                        .filter { it.isNotEmpty() && it != "*/*" }
                    filePicker.launch(acceptedTypes.firstOrNull() ?: "*/*")
                    return true
                }
            }
            setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
                if (url.startsWith("https://") && Uri.parse(url).host == Uri.parse(BuildConfig.WEB_APP_URL).host) {
                    val request = DownloadManager.Request(Uri.parse(url)).setMimeType(mimeType)
                        .addRequestHeader("User-Agent", userAgent)
                    CookieManager.getInstance().getCookie(url)?.let { request.addRequestHeader("Cookie", it) }
                    request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                        .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, android.webkit.URLUtil.guessFileName(url, contentDisposition, mimeType))
                    (context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
                    Toast.makeText(context, "Download started", Toast.LENGTH_SHORT).show()
                }
            }
            webViewClient = object : WebViewClient() {
                override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                    failed = false
                    canNavigateBack = view?.canGoBack() == true
                }
                override fun onPageFinished(view: WebView?, url: String?) {
                    canNavigateBack = view?.canGoBack() == true
                    view?.evaluateJavascript("""
                        (() => {
                          if (window.__aashrayAndroidReady) return;
                          window.__aashrayAndroidReady = true;
                          const notifyHistory = () => window.AashrayAndroid.historyChanged();
                          const notifyTheme = () => window.AashrayAndroid.setDarkTheme(document.documentElement.dataset.theme === 'dark');
                          notifyTheme();
                          new MutationObserver(notifyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
                          for (const method of ['pushState', 'replaceState']) {
                            const original = history[method].bind(history);
                            history[method] = (...args) => { const result = original(...args); notifyHistory(); return result; };
                          }
                          window.addEventListener('popstate', notifyHistory);
                          const revoke = URL.revokeObjectURL.bind(URL);
                          URL.revokeObjectURL = (url) => url && url.startsWith('blob:') ? setTimeout(() => revoke(url), 30000) : revoke(url);
                          document.addEventListener('click', (event) => {
                            const link = event.target && event.target.closest ? event.target.closest('a[download]') : null;
                            if (!link || !link.href.startsWith('blob:')) return;
                            event.preventDefault(); event.stopImmediatePropagation();
                            fetch(link.href).then(response => response.blob()).then(blob => {
                              const reader = new FileReader();
                              reader.onload = () => {
                                const encoded = String(reader.result).split(',')[1] || '';
                                window.AashrayAndroid.beginDownload(link.download || 'aashray-report', blob.type || 'application/octet-stream');
                                for (let i = 0; i < encoded.length; i += 160000) window.AashrayAndroid.appendDownloadChunk(encoded.slice(i, i + 160000));
                                window.AashrayAndroid.finishDownload();
                              };
                              reader.readAsDataURL(blob);
                            }).catch(() => {});
                          }, true);
                          window.print = () => window.AashrayAndroid.printCurrentPage();
                        })();
                    """.trimIndent(), null)
                }
                override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: android.webkit.WebResourceError?) {
                    if (request?.isForMainFrame == true) failed = true
                }
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val uri = request.url
                    if (uri.scheme == "https" && uri.host == Uri.parse(BuildConfig.WEB_APP_URL).host) return false
                    if (uri.scheme == "http" || uri.scheme == "https" || uri.scheme == "tel" || uri.scheme == "mailto") {
                        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                    }
                    return true
                }
            }
        }
    }
    BackHandler(enabled = canNavigateBack) { if (webView.canGoBack()) webView.goBack() }
    LaunchedEffect(reloadKey) { if (webView.url == null || reloadKey > 0) webView.loadUrl(BuildConfig.WEB_APP_URL) }
    DisposableEffect(webView) { onDispose { webView.stopLoading(); webView.destroy() } }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        AndroidView(factory = { webView }, modifier = Modifier.fillMaxSize())
        if (progress in 1..99 && !failed) CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
        if (failed) Text("Could not load Aashray. Tap to retry.", color = MaterialTheme.colorScheme.error, modifier = Modifier.align(Alignment.Center).clickable { failed = false; reloadKey++ })
    }
}

private class WebWorkspaceBridge(
    private val context: Context,
    private val webView: () -> WebView,
    private val onHistoryChanged: () -> Unit,
    private val onThemeChanged: (Boolean) -> Unit,
) {
    private var output: FileOutputStream? = null
    private var outputFile: File? = null
    private var contentType: String = "application/octet-stream"
    private var downloadFailed = false
    private val mainHandler = Handler(Looper.getMainLooper())

    @JavascriptInterface @Synchronized fun beginDownload(fileName: String, mimeType: String) {
        downloadFailed = false
        runCatching {
            val safeName = fileName.substringAfterLast('/').substringAfterLast('\\').replace(Regex("[^A-Za-z0-9._-]"), "_").take(120).ifBlank { "aashray-download" }
            val directory = File(context.cacheDir, "web-downloads").apply { mkdirs() }
            outputFile = File(directory, safeName)
            output?.close()
            output = FileOutputStream(outputFile!!)
            contentType = mimeType.take(100)
        }.onFailure {
            downloadFailed = true
            mainHandler.post { Toast.makeText(context, "Could not prepare the download", Toast.LENGTH_LONG).show() }
        }
    }

    @JavascriptInterface @Synchronized fun appendDownloadChunk(chunk: String) {
        runCatching {
            require(chunk.length <= 160000) { "Download chunk too large." }
            output?.write(Base64.getDecoder().decode(chunk)) ?: error("Download was not initialized.")
            require((outputFile?.length() ?: 0L) <= 20L * 1024 * 1024) { "Download exceeds 20 MB." }
        }.onFailure {
            downloadFailed = true
            output?.close(); output = null; outputFile?.delete(); outputFile = null
        }
    }

    @JavascriptInterface @Synchronized fun finishDownload() {
        runCatching { output?.flush(); output?.close() }.onFailure { }
        output = null
        val file = outputFile ?: return
        outputFile = null
        if (downloadFailed) {
            downloadFailed = false
            file.delete()
            mainHandler.post { Toast.makeText(context, "The report could not be downloaded", Toast.LENGTH_LONG).show() }
            return
        }
        mainHandler.post {
            runCatching {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = ContentValues().apply {
                        put(MediaStore.MediaColumns.DISPLAY_NAME, file.name)
                        put(MediaStore.MediaColumns.MIME_TYPE, contentType)
                        put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                        put(MediaStore.MediaColumns.IS_PENDING, 1)
                    }
                    val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                        ?: error("Could not create a Downloads entry.")
                    try {
                        context.contentResolver.openOutputStream(uri)?.use { destination ->
                            file.inputStream().use { source -> source.copyTo(destination) }
                        } ?: error("Could not write the downloaded file.")
                        context.contentResolver.update(uri, ContentValues().apply {
                            put(MediaStore.MediaColumns.IS_PENDING, 0)
                        }, null, null)
                        Toast.makeText(context, "Saved ${file.name} to Downloads", Toast.LENGTH_LONG).show()
                    } catch (error: Throwable) {
                        context.contentResolver.delete(uri, null, null)
                        throw error
                    }
                    file.delete()
                } else {
                    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                    val share = Intent(Intent.ACTION_SEND).apply {
                        type = contentType
                        putExtra(Intent.EXTRA_STREAM, uri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        clipData = android.content.ClipData.newUri(context.contentResolver, file.name, uri)
                    }
                    context.startActivity(Intent.createChooser(share, "Save or share ${file.name}"))
                }
            }.onFailure { Toast.makeText(context, "Could not save the downloaded file", Toast.LENGTH_LONG).show() }
        }
    }

    @JavascriptInterface fun historyChanged() {
        mainHandler.post(onHistoryChanged)
    }

    @JavascriptInterface fun setDarkTheme(dark: Boolean) {
        mainHandler.post { onThemeChanged(dark) }
    }

    @JavascriptInterface fun printCurrentPage() {
        mainHandler.post {
            val activity = context as? Activity ?: return@post
            val manager = activity.getSystemService(Context.PRINT_SERVICE) as PrintManager
            runCatching { manager.print("Aashray document", webView().createPrintDocumentAdapter("Aashray document"), PrintAttributes.Builder().build()) }
                .onFailure { Toast.makeText(context, "Could not open Android print options", Toast.LENGTH_LONG).show() }
        }
    }
}

private fun applySystemTheme(context: Context, dark: Boolean) {
    val window = (context as? Activity)?.window ?: return
    val surface = AndroidColor.parseColor(if (dark) "#0b1117" else "#f3f5f6")
    window.statusBarColor = surface
    window.navigationBarColor = surface
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
        window.isStatusBarContrastEnforced = false
        window.isNavigationBarContrastEnforced = false
    }
    WindowInsetsControllerCompat(window, window.decorView).apply {
        isAppearanceLightStatusBars = !dark
        isAppearanceLightNavigationBars = !dark
    }
}
