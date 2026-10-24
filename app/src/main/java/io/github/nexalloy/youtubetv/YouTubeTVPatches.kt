package io.github.nexalloy.youtubetv

import android.content.Context
import app.morphe.extension.shared.Logger
import app.morphe.extension.shared.Utils
import de.robv.android.xposed.XposedBridge
import io.github.nexalloy.PatchExecutor
import io.github.nexalloy.hookMethod
import io.github.nexalloy.patch
import java.lang.reflect.Field
import java.lang.reflect.Method
import java.lang.reflect.Modifier
import java.util.Collections
import java.util.WeakHashMap

/*
 * YouTube for Android TV (com.google.android.youtube.tv) 7.x is "Chrobalt":
 * a Chromium content shell (libchrobalt.so) that loads the web app at
 * https://www.youtube.com/tv. Ads, SponsorBlock and the rest of the UI live in
 * JavaScript, so instead of fingerprinting Java code like the phone patches,
 * this patch injects NexAlloy's TV script (built from tv-script/) into the
 * page. Feature settings live inside YouTube TV: Settings > NexAlloy.
 *
 * Only names that survive R8 are used: Chromium classes whose methods are
 * called from native code by name (WebContentsObserverProxy) and the jni_zero
 * GEN_JNI bridge, whose method names are derived from the JNI signature.
 */

private const val PROXY_CLASS =
    "cobalt.org.chromium.content.browser.webcontents.WebContentsObserverProxy"
private const val WEB_CONTENTS_IMPL_CLASS =
    "cobalt.org.chromium.content.browser.webcontents.WebContentsImpl"
private const val GEN_JNI_CLASS = "org.jni_zero.GEN_JNI"
private const val EVALUATE_JS_METHOD =
    "cobalt_org_chromium_content_browser_webcontents_WebContentsImpl_evaluateJavaScript"

private const val USERSCRIPT_RESOURCE = "nexalloy-tv/nexalloy-tv.js"

// Crash guard: if evaluateJavaScript hits a native CHECK the whole process
// dies, so we record an attempt before the first injection and clear it once
// the call returns. A leftover flag on the next start means it crashed.
private const val GUARD_PREFS = "nexalloy_tv"
private const val GUARD_PENDING = "inject_pending"
private const val GUARD_DISABLED = "inject_disabled_after_crash"

val WebAppInjection = patch(
    name = "Web app injection",
    description = "Adds Morphe's features to the YouTube TV web app: ad blocking, SponsorBlock, " +
            "Return YouTube Dislike, player tweaks and feed filters. Configure them in YouTube TV under Settings > NexAlloy.",
) {
    val prefs = appContext.getSharedPreferences(GUARD_PREFS, Context.MODE_PRIVATE)
    if (prefs.getBoolean(GUARD_PENDING, false)) {
        // Previous run died during injection.
        prefs.edit().putBoolean(GUARD_PENDING, false).putBoolean(GUARD_DISABLED, true).commit()
    }
    if (prefs.getBoolean(GUARD_DISABLED, false)) {
        Utils.showToastLong(
            "NexAlloy: YouTube TV crashed during script injection, so injection is off. " +
                    "Clear YouTube TV's data to try again."
        )
        return@patch
    }

    val script = loadUserscript()

    val proxyClass = classLoader.loadClass(PROXY_CLASS)
    val webContentsImplClass = classLoader.loadClass(WEB_CONTENTS_IMPL_CLASS)
    val nativePtrField = findNativePointerField(webContentsImplClass)
    val evaluateJs: Method = classLoader.loadClass(GEN_JNI_CLASS).getDeclaredMethod(
        EVALUATE_JS_METHOD,
        Long::class.javaPrimitiveType,
        Any::class.java,
        Any::class.java,
    ).apply { isAccessible = true }

    // WebContentsObserverProxy doesn't keep a reference to its WebContents,
    // so remember it from the constructor.
    val proxyToWebContents: MutableMap<Any, Any> = Collections.synchronizedMap(WeakHashMap())
    val ctor = proxyClass.declaredConstructors.single {
        it.parameterTypes.size == 1 && it.parameterTypes[0] == webContentsImplClass
    }
    ctor.hookMethod {
        after {
            val proxy = it.thisObject ?: return@after
            val webContents = it.args[0] ?: return@after
            proxyToWebContents[proxy] = webContents
        }
    }

    // Proxies whose current document already got the script. Cleared when a
    // new main-frame navigation starts.
    val injected: MutableSet<Any> = Collections.synchronizedSet(
        Collections.newSetFromMap(WeakHashMap())
    )

    fun inject(proxy: Any, trigger: String) {
        if (proxy in injected) return
        val webContents = proxyToWebContents[proxy] ?: return
        val ptr = nativePtrField.getLong(webContents)
        if (ptr == 0L) return
        injected += proxy
        prefs.edit().putBoolean(GUARD_PENDING, true).commit()
        try {
            evaluateJs.invoke(null, ptr, script, null)
            Logger.printDebug { "YouTube TV: injected userscript ($trigger)" }
        } catch (t: Throwable) {
            XposedBridge.log("NexAlloy: YouTube TV injection failed ($trigger)")
            XposedBridge.log(t)
        } finally {
            prefs.edit().putBoolean(GUARD_PENDING, false).commit()
        }
    }

    // These are called from native code by name, so the names survive R8.
    //  - didStartNavigationInPrimaryMainFrame: a new document is coming; reset.
    //  - primaryMainDocumentElementAvailable: the new document exists. Early
    //    enough to wrap JSON.parse before the app's first API responses.
    //  - documentLoadedInPrimaryMainFrame: fallback if the above never fires.
    val methods = proxyClass.declaredMethods.filter { !Modifier.isStatic(it.modifiers) }

    methods.filter { it.name == "didStartNavigationInPrimaryMainFrame" }.forEach { m ->
        m.hookMethod { before { it.thisObject?.let(injected::remove) } }
    }

    val early = methods.filter {
        it.name == "primaryMainDocumentElementAvailable" && it.parameterTypes.isEmpty()
    }
    early.forEach { m -> m.hookMethod { after { p -> p.thisObject?.let { inject(it, m.name) } } } }

    // Two overloads exist: the private one is the native entry point and
    // forwards to the public one, so hook just the native one (4 params).
    val fallback = methods.filter {
        it.name == "documentLoadedInPrimaryMainFrame" && it.parameterTypes.size == 4
    }
    fallback.forEach { m -> m.hookMethod { after { p -> p.thisObject?.let { inject(it, m.name) } } } }

    check(early.isNotEmpty() || fallback.isNotEmpty()) {
        "No document lifecycle methods found on $PROXY_CLASS"
    }
}

/**
 * The bundle runs once per document, and only on the YouTube TV web app.
 */
private fun loadUserscript(): String {
    val body = PatchExecutor::class.java.classLoader!!
        .getResourceAsStream(USERSCRIPT_RESOURCE)
        ?.use { it.readBytes().toString(Charsets.UTF_8) }
        ?: error("Missing $USERSCRIPT_RESOURCE in module APK")
    return buildString(body.length + 512) {
        append("(function(){")
        append("if(window.__nexalloyTV)return;")
        append("if(location.hostname!=='www.youtube.com'||location.pathname.indexOf('/tv')!==0)return;")
        append("window.__nexalloyTV=true;")
        append("try{\n")
        append(body)
        append("\n}catch(e){console.error('[NexAlloy] userscript error',e);}")
        append("})();")
    }
}

/** WebContentsImpl keeps its native WebContentsAndroid pointer in its only instance long field. */
private fun findNativePointerField(clazz: Class<*>): Field {
    val longs = clazz.declaredFields.filter {
        it.type == Long::class.javaPrimitiveType && !Modifier.isStatic(it.modifiers)
    }
    require(longs.size == 1) {
        "Expected one native pointer field on ${clazz.name}, found ${longs.map { it.name }}"
    }
    return longs.single().apply { isAccessible = true }
}

private const val COMMAND_LINE_INIT = "cobalt_org_chromium_base_CommandLine_init"
private const val COMMAND_LINE_APPEND = "cobalt_org_chromium_base_CommandLine_appendSwitchesAndArguments"
private const val DEVTOOLS_PORT = 9222

/**
 * Starts Chromium's DevTools server on the TV (127.0.0.1:9222), so the web app
 * can be inspected from a computer:
 *
 *   adb forward tcp:9222 tcp:9222
 *   then open chrome://inspect in Chrome, "Configure...", add localhost:9222
 *
 * Chrobalt builds its switches into a list and hands it to native code through
 * one of two JNI calls, depending on whether native CommandLine already exists.
 * Both are hooked; whichever runs first gets the extra switches.
 */
val RemoteDebugging = patch(
    name = "Remote debugging",
    description = "Starts Chrome DevTools on port $DEVTOOLS_PORT for inspecting the YouTube TV web app. " +
            "Use adb forward tcp:$DEVTOOLS_PORT tcp:$DEVTOOLS_PORT, then chrome://inspect on your computer. " +
            "Anyone with adb access to the TV can then control the app, so leave this off when not debugging.",
    use = false,
) {
    val switches = listOf(
        "--remote-debugging-port=$DEVTOOLS_PORT",
        "--remote-allow-origins=*",
    )
    var added = false
    val genJni = classLoader.loadClass(GEN_JNI_CLASS)

    genJni.declaredMethods.single { it.name == COMMAND_LINE_INIT && it.parameterTypes.size == 1 }
        .hookMethod {
            before {
                if (added) return@before
                @Suppress("UNCHECKED_CAST")
                val args = it.args[0] as? MutableList<String> ?: return@before
                args.addAll(switches)
                added = true
                Logger.printDebug { "YouTube TV: DevTools switches added at CommandLine.init" }
            }
        }

    genJni.declaredMethods.single { it.name == COMMAND_LINE_APPEND && it.parameterTypes.size == 1 }
        .hookMethod {
            before {
                if (added) return@before
                val args = it.args[0] as? Array<*> ?: return@before
                it.args[0] = (args.filterIsInstance<String>() + switches).toTypedArray()
                added = true
                Logger.printDebug { "YouTube TV: DevTools switches added at appendSwitchesAndArguments" }
            }
        }
}

val YouTubeTVPatches = arrayOf(
    WebAppInjection,
    RemoteDebugging,
)
