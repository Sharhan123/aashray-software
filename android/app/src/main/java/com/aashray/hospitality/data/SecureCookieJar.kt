package com.aashray.hospitality.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

interface SessionCookieStore {
    fun clear()
}

/** Persists the backend's short-lived session cookie only as AES-GCM ciphertext. */
class SecureCookieJar(context: Context) : CookieJar, SessionCookieStore {
    private val preferences = context.applicationContext.getSharedPreferences("secure_session", Context.MODE_PRIVATE)
    private val gson = Gson()
    private val cookies = mutableListOf<Cookie>()

    init { cookies += restore() }

    @Synchronized
    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        this.cookies.removeAll { existing -> cookies.any { it.name == existing.name && it.domain == existing.domain && it.path == existing.path } }
        this.cookies += cookies.filterNot { it.expiresAt <= System.currentTimeMillis() }
        persist()
    }

    @Synchronized
    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        cookies.removeAll { it.expiresAt <= System.currentTimeMillis() }
        persist()
        return cookies.filter { it.matches(url) }
    }

    @Synchronized
    override fun clear() {
        cookies.clear()
        preferences.edit().remove(STORAGE_KEY).apply()
    }

    private fun persist() {
        if (cookies.isEmpty()) {
            preferences.edit().remove(STORAGE_KEY).apply()
            return
        }
        val records = cookies.map { CookieRecord(it.name, it.value, it.domain, it.path, it.secure, it.httpOnly, it.persistent, it.expiresAt, it.hostOnly) }
        val encrypted = encrypt(gson.toJson(records).toByteArray(Charsets.UTF_8))
        preferences.edit().putString(STORAGE_KEY, Base64.encodeToString(encrypted, Base64.NO_WRAP)).apply()
    }

    private fun restore(): List<Cookie> = runCatching {
        val stored = preferences.getString(STORAGE_KEY, null) ?: return emptyList()
        val decoded = Base64.decode(stored, Base64.NO_WRAP)
        val json = String(decrypt(decoded), Charsets.UTF_8)
        val type = object : TypeToken<List<CookieRecord>>() {}.type
        gson.fromJson<List<CookieRecord>>(json, type).orEmpty().mapNotNull { record ->
            if (record.persistent && record.expiresAt <= System.currentTimeMillis()) return@mapNotNull null
            val builder = Cookie.Builder().name(record.name).value(record.value)
                .path(record.path)
            if (record.hostOnly) builder.hostOnlyDomain(record.domain) else builder.domain(record.domain)
            if (record.secure) builder.secure()
            if (record.httpOnly) builder.httpOnly()
            if (record.persistent) builder.expiresAt(record.expiresAt)
            builder.build()
        }
    }.getOrElse {
        preferences.edit().remove(STORAGE_KEY).apply()
        emptyList()
    }

    private fun encrypt(plain: ByteArray): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val iv = cipher.iv
        return byteArrayOf(iv.size.toByte()) + iv + cipher.doFinal(plain)
    }

    private fun decrypt(data: ByteArray): ByteArray {
        val ivLength = data.first().toInt() and 0xff
        val iv = data.copyOfRange(1, 1 + ivLength)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(128, iv))
        return cipher.doFinal(data.copyOfRange(1 + ivLength, data.size))
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEY_STORE)
        generator.init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build())
        return generator.generateKey()
    }

    private data class CookieRecord(
        val name: String,
        val value: String,
        val domain: String,
        val path: String,
        val secure: Boolean,
        val httpOnly: Boolean,
        val persistent: Boolean,
        val expiresAt: Long,
        val hostOnly: Boolean,
    )

    companion object {
        private const val STORAGE_KEY = "encrypted_cookies"
        private const val KEY_ALIAS = "aashray.session.cookie.key.v1"
        private const val ANDROID_KEY_STORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
