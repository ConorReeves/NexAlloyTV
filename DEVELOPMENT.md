# Development Guide

## Project Structure

The primary hook entry point is [MainHook.kt](app/src/main/java/io/github/nexalloy/MainHook.kt).

### Patch Organization and Conventions

Patches adhere to a specific structure:

```text
📦your.patches.app.category
 ├ Fingerprints.kt
 └ SomePatch.kt
```

-   **Project-specific patches:** [app/src/main/java/io/github/nexalloy/morphe](app/src/main/java/io/github/nexalloy/morphe)
-   **Upstream patches:** [revanced-patches/patches/src/main/kotlin/app/revanced/patches](revanced-patches/patches/src/main/kotlin/app/revanced/patches)

Upstream patches are included via Git submodule for reference and to utilize shared extension code. They are not modified within this project.

### Example: Patch Implementation (Contoso App)

#### Add Contoso to module scope

- `app/src/main/AndroidManifest.xml`: Query package for module settings
- `app/src/main/res/values/arrays.xml`: Xposed scope recommendation
- `README.md`

#### `Fingerprints.kt`
```kotlin
package io.github.nexalloy.morphe.contoso.misc.unlock.plus

import io.github.nexalloy.morphe.AccessFlags
import io.github.nexalloy.morphe.fingerprint
import org.luckypray.dexkit.query.enums.StringMatchType

val isPlusUnlockedFingerprint = fingerprint {
    returns("Z")
    strings("genius")
}
```

#### `UnlockPlusPatch.kt`
```kotlin
package io.github.nexalloy.morphe.contoso.misc.unlock.plus

import static de.robv.android.xposed.XC_MethodReplacement.returnConstant
import io.github.nexalloy.morphe.patch

val UnlockPlus = patch(name = "Unlock Plus") {
    ::isPlusUnlockedFingerprint.hookMethod(returnConstant(true))
}
```

#### `ContosoHook.kt`
```kotlin
package io.github.nexalloy.morphe.contoso

import io.github.nexalloy.morphe.contoso.misc.unlock.plus.UnlockPlus

val ContosoPatches = arrayOf(UnlockPlus)
```

#### `AppPatchInfo.kt`
```kotlin
import io.github.nexalloy.morphe.contoso.ContosoPatches

val appPatchConfigurations = listOf(
    // ...
    AppPatchInfo("Contoso", "com.contoso.app", ContosoPatches)
)

```

### Porting Upstream Patches

The [FingerprintCompat.kt](app/src/main/java/io/github/nexalloy/morphe/FingerprintCompat.kt) utility assists in translating ReVanced Patcher API calls to DexKit Matchers. While simple fingerprints can often be directly copied, consider the following translation patterns for complex cases:

1.  **Literal Mapping:**
    If an upstream patch defines a literal within the patch file (e.g., `aLiteral = resourceMappings["id", "aLiteral"]`) for use in a fingerprint, convert it to a getter property in the corresponding `Fingerprints.kt` file.

    *From (Upstream):*
    ```kotlin
    // In ***Patch.kt beside the Fingerprints.kt
    // val aLiteral = resourceMappings["id", "aLiteral"]
    fingerprint { literal { aLiteral } }
    ```

    *To (This Project's Fingerprints.kt):*
    ```kotlin
    val aLiteral get() = resourceMappings["id", "aLiteral"] // Defined in Fingerprints.kt
    fingerprint { literal { aLiteral } }
    ```

2.  **Custom Class and Method Matchers:**

    *From (Upstream):*
    ```kotlin
    fingerprint {
        custom { method, classDef ->
            method.name == "onCreate" && classDef.endsWith("/MusicActivity;")
        }
    }
    ```

    *To (This Project):*
    ```kotlin
    fingerprint {
        methodMatcher { name = "onCreate" }
        classMatcher { className(".MusicActivity", StringMatchType.EndsWith) }
    }
    ```

3.  **Instruction-based Method Reference:**

    *From (Upstream):*
    ```kotlin
    fun indexOfTranslationInstruction(method: Method) =
        method.indexOfFirstInstructionReversed {
            getReference<MethodReference>()?.name == "setTranslationY"
        }

    val motionEventFingerprint = fingerprint {
        custom { method, _ ->
            indexOfTranslationInstruction(method) >= 0
        }
    }
    ```

    *To (This Project):*
    ```kotlin
    val motionEventFingerprint = fingerprint {
        methodMatcher { addInvoke { name = "setTranslationY" } }
    }
    ```

4.  **Matching Specific Class Types or Defining Classes:**
    When an upstream `custom` block primarily checks `classDef.type` (the type of the matched class) or `method.definingClass` (the class defining the matched method), this translates to a `classMatcher` in this project. The `classMatcher` directly specifies the target class descriptor.

    *From (Upstream Example):*
    ```kotlin
    // Upstream: Using custom to check classDef.type
    fingerprint {
        custom { _, classDef ->
            classDef.type == "Lcom/example/SomeClass;"
        }
        // other matchers...
    }

    // Upstream: Using custom to check method.definingClass
    fingerprint {
        custom { method, _ ->
            method.definingClass == "Lcom/example/AnotherClass;"
        }
        // other method matchers...
    }
    ```
    *To (This Project's Fingerprints.kt Example):*
    ```kotlin
    // This Project: Using classMatcher for classDef.type
    fingerprint {
        classMatcher { descriptor = "Lcom/example/SomeClass;" }
        // methodMatcher { ... } // if needed for method properties
    }

    // This Project: Using classMatcher for method.definingClass
    fingerprint {
        // Targets methods within Lcom/example/AnotherClass;
        classMatcher { descriptor = "Lcom/example/AnotherClass;" }
        methodMatcher {
            // specific method properties, e.g., name = "targetMethod"
        }
    }
    ```
5.  **Porting Complex `custom` Logic or Chained Lookups with Direct Finders:**
    For intricate upstream fingerprints with complex `custom` logic or chained lookups not easily mapped to standard matchers, this project uses direct finder functions (e.g., `findMethodDirect`, `findClassDirect`) from `FingerprintCompat.kt`. This approach combines DexKit's efficient initial filtering with the power of Kotlin's collection processing for subsequent, more granular refinement.

    *From (Upstream Example with complex `custom` logic):*
    ```kotlin
    internal val complexCustomFingerprint = fingerprint {
        returns("Lcom/example/ReturnType;")
        custom { method, _ ->
            method.name.startsWith("get") &&
            method.parameterTypes.size == 1 &&
            method.parameterTypes.first() == "Lcom/example/ParameterType;" &&
            method.definingClass == "Lcom/example/HostClass;"
            // ... potentially more complex conditions
        }
    }
    ```
    *To (This Project using `findMethodDirect`):*
    ```kotlin
    val complexCustomFingerprint = findMethodDirect {
        // Initial, broader filtering with DexKit matchers
        findMethod {
            matcher {
                returns("Lcom/example/ReturnType;")
                declaredClass { descriptor = "Lcom/example/HostClass;" }
                // Other simple matchers convertible from the original custom block
            }
        }
        // Refine results using Kotlin's collection functions for complex logic
        .filter { methodData -> methodData.name.startsWith("get") }
        .single { methodData -> // Assuming a unique result after all filters
            methodData.paramTypes.size == 1 &&
            methodData.paramTypes.firstOrNull()?.descriptor == "Lcom/example/ParameterType;"
            // ... other Kotlin-based checks
        }
    }
    ```
    This allows leveraging DexKit for initial efficient filtering, then applying precise Kotlin logic to the narrowed-down candidates.

### YouTube TV

YouTube for Android TV (`com.google.android.youtube.tv`) 7.x runs the YouTube web app in a Chromium shell, so it isn't patched with fingerprints. [YouTubeTVPatches.kt](app/src/main/java/io/github/nexalloy/youtubetv/YouTubeTVPatches.kt) hooks Chromium's `WebContentsObserverProxy` and injects [nexalloy-tv.js](app/src/main/resources/nexalloy-tv/nexalloy-tv.js) into the page through the `evaluateJavaScript` JNI entry point. It only uses names that survive R8: Chromium classes called from native code by name, and the jni_zero `GEN_JNI` bridge.

The features themselves are JavaScript in [tv-script/](tv-script/README.md). Change the source there, run `npm test` and `npm run build`, and commit the rebuilt `nexalloy-tv.js` with the source. Gradle builds use the committed file and don't need Node.

To inspect the TV app, enable the **Remote debugging** patch and follow the steps in [tv-script/README.md](tv-script/README.md#inspecting-the-tv-app).

### Extension Modules

As per ReVanced Patcher documentation:
> Instead of involving many abstract changes in one patch or writing entire methods or classes in a patch, you can write code in extensions.

This project shares extension code with the upstream project, located at `./revanced-patches/extensions`. Upstream organizes extensions into separate modules (e.g., `./revanced-patches/extensions/<appAlias>/src/main/java/app/revanced/extension/<appAlias>`). Modifications to shared extensions and other code under `revanced-patches` are minimized.

## Unit Testing

Refer to [FingerprintsKtTest.kt](app/src/test/java/io/github/nexalloy/morphe/FingerprintsKtTest.kt) for testing examples.

For running tests, place necessary APKs into the `./app/binaries/` directory. APK filenames should be prefixed with their respective package names (e.g., `com.example.app-1.0.0.apk`).
