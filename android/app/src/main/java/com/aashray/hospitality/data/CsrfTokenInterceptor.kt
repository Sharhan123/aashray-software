package com.aashray.hospitality.data

import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.HttpUrl
import okhttp3.Response
import com.google.gson.Gson
import java.io.IOException

/** Fetches a fresh backend CSRF cookie/token pair before unsafe API requests. */
class CsrfTokenInterceptor(
    private val cookieJar: okhttp3.CookieJar,
    private val apiBaseUrl: HttpUrl,
) : Interceptor {
    private val gson = Gson()
    private val csrfClient = OkHttpClient.Builder().cookieJar(cookieJar).build()

    @Synchronized
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (request.method in SAFE_METHODS || !request.url.host.equals(apiBaseUrl.host, ignoreCase = true)) {
            return chain.proceed(request)
        }

        // The Android client should never rely on a token cached across requests. Fetching both
        // the response token and its cookie together avoids stale or mismatched CSRF state.
        val token = fetchToken()
        val protectedRequest = request.newBuilder().header(CSRF_HEADER, token).build()
        return chain.proceed(protectedRequest)
    }

    private fun fetchToken(): String {
        val csrfUrl = apiBaseUrl.resolve("auth/csrf")
            ?: throw IOException("Could not build the request verification URL.")
        val request = Request.Builder().url(csrfUrl).get().build()
        csrfClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IOException("Could not refresh request verification (${response.code}).")
            val body = response.body?.string().orEmpty()
            val token = runCatching { gson.fromJson(body, CsrfResponse::class.java)?.csrfToken }.getOrNull().orEmpty()
            if (token.isBlank()) throw IOException("The server did not provide a request verification token.")
            return token
        }
    }

    companion object {
        private const val CSRF_HEADER = "X-CSRF-Token"
        private val SAFE_METHODS = setOf("GET", "HEAD", "OPTIONS")
    }
}
